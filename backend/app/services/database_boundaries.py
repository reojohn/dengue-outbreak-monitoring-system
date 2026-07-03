import json
from typing import Any

from sqlalchemy import text

from app.database import engine
from app.services.barangay_normalizer import normalize_barangay_key


def _to_json(value: Any) -> str:
    return json.dumps(value or {}, default=str)


def _get_feature_name(feature: dict, index: int) -> str:
    properties = feature.get("properties") or {}

    return (
        properties.get("barangay")
        or properties.get("barangay_name")
        or properties.get("adm4_name")
        or properties.get("adm4_ref_name")
        or properties.get("name")
        or properties.get("BARANGAY")
        or properties.get("ADM4_EN")
        or f"Boundary {index + 1}"
    )


def _get_feature_key(feature: dict, barangay: str) -> str:
    properties = feature.get("properties") or {}

    return (
        properties.get("barangay_key")
        or normalize_barangay_key(barangay)
    )


def _get_psgc(feature: dict) -> str:
    properties = feature.get("properties") or {}

    return (
        properties.get("psgc")
        or properties.get("PSGC")
        or properties.get("psgc_code")
        or properties.get("PSGC_CODE")
        or properties.get("ADM4_PCODE")
        or properties.get("adm4_pcode")
        or ""
    )


def _get_map_area_id(feature: dict, index: int) -> str:
    properties = feature.get("properties") or {}

    return (
        properties.get("map_area_id")
        or properties.get("adm4_pcode")
        or properties.get("ADM4_PCODE")
        or properties.get("id")
        or properties.get("code")
        or properties.get("CODE")
        or f"boundary-{index}"
    )


def save_boundary_geojson(
    *,
    boundary_result: dict,
    upload_id: str,
) -> dict:
    cleaned_geojson = boundary_result.get("cleaned_geojson") or {}
    features = cleaned_geojson.get("features") or []

    source_filename = boundary_result.get("filename", "")

    saved_count = 0
    skipped_count = 0

    with engine.begin() as connection:
        connection.execute(
            text("""
                delete from public.barangay_boundaries
                where upload_id = :upload_id
            """),
            {
                "upload_id": upload_id,
            },
        )

        for index, feature in enumerate(features):
            geometry = feature.get("geometry") or {}
            geometry_type = geometry.get("type")

            if geometry_type not in ["Polygon", "MultiPolygon"]:
                skipped_count += 1
                continue

            barangay = _get_feature_name(feature, index)
            barangay_key = _get_feature_key(feature, barangay)
            psgc = _get_psgc(feature)
            map_area_id = _get_map_area_id(feature, index)
            properties = feature.get("properties") or {}

            connection.execute(
                text("""
                    insert into public.barangay_boundaries (
                        upload_id,
                        barangay,
                        barangay_key,
                        map_area_id,
                        psgc_code,
                        geometry,
                        raw_properties,
                        source_filename
                    )
                    values (
                        :upload_id,
                        :barangay,
                        :barangay_key,
                        :map_area_id,
                        :psgc_code,
                        ST_Multi(
                            ST_SetSRID(
                                ST_GeomFromGeoJSON(:geometry_json),
                                4326
                            )
                        ),
                        cast(:raw_properties as jsonb),
                        :source_filename
                    )
                """),
                {
                    "upload_id": upload_id,
                    "barangay": barangay,
                    "barangay_key": barangay_key,
                    "map_area_id": map_area_id,
                    "psgc_code": psgc,
                    "geometry_json": json.dumps(geometry),
                    "raw_properties": _to_json(properties),
                    "source_filename": source_filename,
                },
            )

            saved_count += 1

    return {
        "upload_id": str(upload_id),
        "saved_boundary_count": saved_count,
        "skipped_boundary_count": skipped_count,
        "source_filename": source_filename,
    }


def get_latest_boundary_geojson() -> dict:
    with engine.connect() as connection:
        upload_result = connection.execute(
            text("""
                select upload_id, original_filename, uploaded_at
                from public.dataset_uploads
                where dataset_type = 'boundary'
                order by uploaded_at desc
                limit 1
            """)
        )

        latest_upload = upload_result.mappings().first()

        if not latest_upload:
            return {
                "message": "No saved boundary upload found.",
                "has_saved_boundary": False,
                "feature_count": 0,
                "boundary_geojson": {
                    "type": "FeatureCollection",
                    "features": [],
                },
            }

        rows_result = connection.execute(
            text("""
                select
                    boundary_id,
                    upload_id,
                    barangay,
                    barangay_key,
                    map_area_id,
                    psgc_code,
                    ST_AsGeoJSON(geometry) as geometry_json,
                    raw_properties,
                    source_filename,
                    created_at
                from public.barangay_boundaries
                where upload_id = :upload_id
                order by barangay
            """),
            {
                "upload_id": latest_upload["upload_id"],
            },
        )

        rows = rows_result.mappings().all()

    features = []

    for row in rows:
        geometry_value = row["geometry_json"]

        try:
            geometry = (
                json.loads(geometry_value)
                if isinstance(geometry_value, str)
                else geometry_value
            )
        except Exception:
            geometry = None

        if not geometry:
            continue

        raw_properties = row["raw_properties"] or {}

        properties = {
            **raw_properties,
            "barangay": row["barangay"],
            "barangay_key": row["barangay_key"],
            "map_area_id": row["map_area_id"],
            "psgc": row["psgc_code"],
            "source_filename": row["source_filename"],
            "database_boundary_id": str(row["boundary_id"]),
            "database_upload_id": str(row["upload_id"]),
        }

        features.append(
            {
                "type": "Feature",
                "properties": properties,
                "geometry": geometry,
            }
        )

    return {
        "message": "Latest saved boundary GeoJSON loaded from Supabase.",
        "has_saved_boundary": True,
        "upload": {
            "upload_id": str(latest_upload["upload_id"]),
            "original_filename": latest_upload["original_filename"],
            "uploaded_at": str(latest_upload["uploaded_at"]),
        },
        "feature_count": len(features),
        "boundary_geojson": {
            "type": "FeatureCollection",
            "features": features,
        },
    }