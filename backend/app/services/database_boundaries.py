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


def get_latest_boundary_geojson(barangay: str | None = None) -> dict:
    with engine.connect() as connection:
        # Serve the boundary that belongs to the latest successfully published
        # forecast. Admin may be staging a newer partial upload cycle, and that
        # draft boundary should not replace the map used by BHW/Supervisor/Viewer
        # until the new forecast is successfully published.
        upload_result = connection.execute(
            text("""
                select uploads.upload_id, uploads.original_filename, uploads.uploaded_at
                from public.forecast_runs forecasts
                join public.integration_runs integration
                  on integration.integration_run_id = forecasts.integration_run_id
                join public.dataset_uploads uploads
                  on uploads.upload_id = integration.boundary_upload_id
                where forecasts.status = 'completed'
                order by
                    forecasts.completed_at desc nulls last,
                    forecasts.started_at desc nulls last,
                    forecasts.forecast_run_id desc
                limit 1
            """)
        )

        latest_upload = upload_result.mappings().first()

        if not latest_upload:
            fallback_result = connection.execute(
                text("""
                    select upload_id, original_filename, uploaded_at
                    from public.dataset_uploads
                    where dataset_type = 'boundary'
                    order by uploaded_at desc
                    limit 1
                """)
            )
            latest_upload = fallback_result.mappings().first()

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

        requested_barangay_key = normalize_barangay_key(barangay or "")

        total_feature_count = connection.execute(
            text("""
                select count(*)
                from public.barangay_boundaries
                where upload_id = :upload_id
            """),
            {"upload_id": latest_upload["upload_id"]},
        ).scalar_one()

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
                  and (:barangay_key = '' or barangay_key = :barangay_key)
                order by barangay
            """),
            {
                "upload_id": latest_upload["upload_id"],
                "barangay_key": requested_barangay_key,
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
        "feature_count": int(total_feature_count or len(features)),
        "returned_feature_count": len(features),
        "scope_barangay": barangay or "",
        "boundary_geojson": {
            "type": "FeatureCollection",
            "features": features,
        },
    }

def get_local_boundary_geojson(
    barangay: str,
    *,
    proximity_meters: float = 25.0,
    fallback_neighbor_count: int = 3,
) -> dict:
    """Return the assigned barangay plus directly adjacent boundary polygons.

    This is intended for the BHW local spatial-awareness view. It keeps the
    response intentionally small: the assigned barangay and its immediate
    neighbors only, rather than all 86 Butuan barangays.
    """
    assigned = str(barangay or "").strip()
    assigned_key = normalize_barangay_key(assigned)

    if not assigned_key:
        return get_latest_boundary_geojson(barangay=assigned)

    base_result = get_latest_boundary_geojson(barangay=assigned)

    if not base_result.get("has_saved_boundary"):
        return base_result

    upload = base_result.get("upload") or {}
    upload_id = upload.get("upload_id")

    if not upload_id:
        return base_result

    sql = text("""
        with target as (
            select geometry
            from public.barangay_boundaries
            where upload_id = cast(:upload_id as uuid)
              and barangay_key = :barangay_key
            limit 1
        )
        select
            boundary.boundary_id,
            boundary.upload_id,
            boundary.barangay,
            boundary.barangay_key,
            boundary.map_area_id,
            boundary.psgc_code,
            ST_AsGeoJSON(boundary.geometry) as geometry_json,
            boundary.raw_properties,
            boundary.source_filename,
            boundary.created_at,
            case
                when boundary.barangay_key = :barangay_key then 'assigned'
                else 'neighbor'
            end as context_role
        from public.barangay_boundaries boundary
        cross join target
        where boundary.upload_id = cast(:upload_id as uuid)
          and (
              boundary.barangay_key = :barangay_key
              or ST_Touches(boundary.geometry, target.geometry)
              or ST_DWithin(
                  boundary.geometry::geography,
                  target.geometry::geography,
                  :proximity_meters
              )
          )
        order by
            case when boundary.barangay_key = :barangay_key then 0 else 1 end,
            boundary.barangay
    """)

    with engine.connect() as connection:
        rows = connection.execute(
            sql,
            {
                "upload_id": upload_id,
                "barangay_key": assigned_key,
                "proximity_meters": float(max(0.0, proximity_meters)),
            },
        ).mappings().all()

        adjacency_method = "touching_or_near_boundary"

        # Some administrative GeoJSON files contain tiny topology gaps. If no
        # neighbor survives the strict adjacency check, return the closest few
        # polygons as clearly labeled fallback context rather than leaving the
        # BHW with an isolated polygon and no spatial reference.
        if len(rows) <= 1:
            fallback_rows = connection.execute(
                text("""
                    with target as (
                        select geometry
                        from public.barangay_boundaries
                        where upload_id = cast(:upload_id as uuid)
                          and barangay_key = :barangay_key
                        limit 1
                    )
                    select
                        boundary.boundary_id,
                        boundary.upload_id,
                        boundary.barangay,
                        boundary.barangay_key,
                        boundary.map_area_id,
                        boundary.psgc_code,
                        ST_AsGeoJSON(boundary.geometry) as geometry_json,
                        boundary.raw_properties,
                        boundary.source_filename,
                        boundary.created_at,
                        case
                            when boundary.barangay_key = :barangay_key then 'assigned'
                            else 'neighbor'
                        end as context_role
                    from public.barangay_boundaries boundary
                    cross join target
                    where boundary.upload_id = cast(:upload_id as uuid)
                    order by
                        case when boundary.barangay_key = :barangay_key then 0 else 1 end,
                        ST_Distance(boundary.geometry::geography, target.geometry::geography),
                        boundary.barangay
                    limit :row_limit
                """),
                {
                    "upload_id": upload_id,
                    "barangay_key": assigned_key,
                    "row_limit": int(max(2, fallback_neighbor_count + 1)),
                },
            ).mappings().all()

            if fallback_rows:
                rows = fallback_rows
                adjacency_method = "nearest_boundary_fallback"

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
            "context_role": row["context_role"],
        }

        features.append(
            {
                "type": "Feature",
                "properties": properties,
                "geometry": geometry,
            }
        )

    neighbor_count = sum(
        1
        for feature in features
        if (feature.get("properties") or {}).get("context_role") == "neighbor"
    )

    return {
        **base_result,
        "message": "Local barangay boundary context loaded from Supabase.",
        "returned_feature_count": len(features),
        "neighbor_count": neighbor_count,
        "adjacency_method": adjacency_method,
        "scope_barangay": assigned,
        "boundary_geojson": {
            "type": "FeatureCollection",
            "features": features,
        },
    }
