from collections import defaultdict
from difflib import SequenceMatcher

from app.services.barangay_normalizer import (
    canonicalize_barangay_name,
    normalize_barangay_key,
)
from app.services.integration_state import (
    build_source_status_summary,
    get_all_integration_sources,
)


NAME_FIELDS = [
    "barangay",
    "barangay_name",
    "barangayName",
    "barangay_raw",
    "brgy",
    "brgy_name",
    "location",
    "area",
    "name",
    "adm4_name",
    "adm4_ref_name",
    "ADM4_NAME",
    "ADM4_EN",
    "NAME_4",
    "name_4",
]

PSGC_FIELDS = [
    "psgc",
    "PSGC",
    "psgc_code",
    "PSGC_CODE",
    "code",
    "barangay_code",
    "brgy_code",
    "adm4_pcode",
    "ADM4_PCODE",
]

PERIOD_FIELDS = [
    "period",
    "date",
    "reporting_date",
    "reportingDate",
    "year",
    "month",
    "week",
]


def _safe_text(value):
    if value is None:
        return ""

    text = str(value).strip()

    if text.lower() in ["", "none", "nan", "nat", "null"]:
        return ""

    return text


def _read_first(mapping, fields):
    if not isinstance(mapping, dict):
        return ""

    for field in fields:
        value = _safe_text(mapping.get(field))

        if value:
            return value

    return ""


def _normalize_psgc(value):
    text = _safe_text(value)

    if not text:
        return ""

    return "".join(character for character in text.upper() if character.isalnum())


def _format_percent(numerator, denominator):
    if not denominator:
        return 0

    return round((numerator / denominator) * 100, 2)


def _similarity(first, second):
    first_key = normalize_barangay_key(first)
    second_key = normalize_barangay_key(second)

    if not first_key or not second_key:
        return 0

    return SequenceMatcher(None, first_key, second_key).ratio()


def _entry_key(entry):
    psgc = entry.get("psgc", "")
    normalized_key = entry.get("normalized_key", "")

    if psgc:
        return f"psgc:{psgc}"

    if normalized_key:
        return f"name:{normalized_key}"

    return f"missing:{entry.get('source')}:{entry.get('index')}"


def _make_entry(source, record, index, record_count=1):
    record = record or {}

    raw_name = (
        _read_first(record, NAME_FIELDS)
        or _read_first(record.get("properties", {}) if isinstance(record.get("properties"), dict) else {}, NAME_FIELDS)
    )

    raw_psgc = (
        _read_first(record, PSGC_FIELDS)
        or _read_first(record.get("properties", {}) if isinstance(record.get("properties"), dict) else {}, PSGC_FIELDS)
    )

    normalized_key = normalize_barangay_key(raw_name)
    canonical_name = canonicalize_barangay_name(raw_name)
    canonical_key = normalize_barangay_key(canonical_name)
    psgc = _normalize_psgc(raw_psgc)

    return {
        "source": source,
        "index": index,
        "raw_name": raw_name,
        "display_name": canonical_name or raw_name,
        "normalized_key": normalized_key,
        "canonical_key": canonical_key,
        "psgc": psgc,
        "record_count": record_count,
        "period": _read_first(record, PERIOD_FIELDS),
    }


def _get_boundary_entries(boundary_source):
    geojson = (boundary_source or {}).get("geojson") or {}
    features = geojson.get("features") if isinstance(geojson, dict) else []

    if not isinstance(features, list):
        return []

    entries = []

    for index, feature in enumerate(features):
        if not isinstance(feature, dict):
            continue

        properties = feature.get("properties") or {}
        entry = _make_entry("boundary", properties, index, record_count=1)

        entry["geometry_id"] = (
            _safe_text(feature.get("id"))
            or _read_first(properties, PSGC_FIELDS)
            or f"boundary-{index}"
        )

        entry["geometry_type"] = (feature.get("geometry") or {}).get("type", "")

        entries.append(entry)

    return entries


def _get_tabular_entries(source_name, source):
    records = (source or {}).get("records") or []

    if not isinstance(records, list):
        return []

    entries = []

    for index, record in enumerate(records):
        if not isinstance(record, dict):
            continue

        entries.append(_make_entry(source_name, record, index, record_count=1))

    return entries


def _collapse_entries_to_barangays(entries):
    grouped = {}

    for entry in entries:
        key = _entry_key(entry)

        if key not in grouped:
            grouped[key] = {
                **entry,
                "record_count": 0,
                "raw_name_variants": [],
                "periods": [],
            }

        grouped_entry = grouped[key]
        grouped_entry["record_count"] += int(entry.get("record_count", 1) or 1)

        raw_name = entry.get("raw_name", "")
        period = entry.get("period", "")

        if raw_name and raw_name not in grouped_entry["raw_name_variants"]:
            grouped_entry["raw_name_variants"].append(raw_name)

        if period and period not in grouped_entry["periods"]:
            grouped_entry["periods"].append(period)

    return list(grouped.values())


def _detect_duplicate_barangays(entries):
    by_name = defaultdict(list)
    by_psgc = defaultdict(list)

    for entry in entries:
        normalized_key = entry.get("normalized_key", "")
        psgc = entry.get("psgc", "")

        if normalized_key:
            by_name[normalized_key].append(entry)

        if psgc:
            by_psgc[psgc].append(entry)

    duplicates_by_name = [
        {
            "normalized_key": key,
            "canonical_name": canonicalize_barangay_name(key),
            "count": len(items),
            "items": [
                {
                    "raw_name": item.get("raw_name", ""),
                    "display_name": item.get("display_name", ""),
                    "psgc": item.get("psgc", ""),
                    "record_count": item.get("record_count", 0),
                }
                for item in items
            ],
        }
        for key, items in by_name.items()
        if len(items) > 1
    ]

    duplicates_by_psgc = [
        {
            "psgc": key,
            "count": len(items),
            "items": [
                {
                    "raw_name": item.get("raw_name", ""),
                    "display_name": item.get("display_name", ""),
                    "normalized_key": item.get("normalized_key", ""),
                    "record_count": item.get("record_count", 0),
                }
                for item in items
            ],
        }
        for key, items in by_psgc.items()
        if len(items) > 1
    ]

    return {
        "duplicate_name_group_count": len(duplicates_by_name),
        "duplicate_psgc_group_count": len(duplicates_by_psgc),
        "duplicates_by_name": duplicates_by_name,
        "duplicates_by_psgc": duplicates_by_psgc,
    }


def _build_source_entries():
    sources = get_all_integration_sources()

    dengue_entries = _collapse_entries_to_barangays(
        _get_tabular_entries("dengue", sources.get("dengue"))
    )

    population_entries = _collapse_entries_to_barangays(
        _get_tabular_entries("population", sources.get("population"))
    )

    boundary_entries = _collapse_entries_to_barangays(
        _get_boundary_entries(sources.get("boundary"))
    )

    return {
        "dengue": dengue_entries,
        "population": population_entries,
        "boundary": boundary_entries,
    }


def _build_target_indexes(target_entries):
    by_psgc = {}
    by_name = {}
    by_canonical = {}

    for entry in target_entries:
        psgc = entry.get("psgc", "")
        normalized_key = entry.get("normalized_key", "")
        canonical_key = entry.get("canonical_key", "")

        if psgc and psgc not in by_psgc:
            by_psgc[psgc] = entry

        if normalized_key and normalized_key not in by_name:
            by_name[normalized_key] = entry

        if canonical_key and canonical_key not in by_canonical:
            by_canonical[canonical_key] = entry

    return {
        "by_psgc": by_psgc,
        "by_name": by_name,
        "by_canonical": by_canonical,
    }


def _suggest_matches(source_entry, target_entries, limit=3):
    suggestions = []

    for target in target_entries:
        score = max(
            _similarity(source_entry.get("normalized_key", ""), target.get("normalized_key", "")),
            _similarity(source_entry.get("canonical_key", ""), target.get("canonical_key", "")),
            _similarity(source_entry.get("raw_name", ""), target.get("raw_name", "")),
        )

        if score <= 0:
            continue

        suggestions.append({
            "target_name": target.get("display_name") or target.get("raw_name", ""),
            "target_raw_name": target.get("raw_name", ""),
            "target_psgc": target.get("psgc", ""),
            "target_key": target.get("normalized_key", ""),
            "similarity": round(score, 3),
        })

    suggestions.sort(key=lambda item: item["similarity"], reverse=True)

    return suggestions[:limit]


def _find_match(source_entry, target_entries, target_indexes, fuzzy_threshold=0.92):
    psgc = source_entry.get("psgc", "")
    normalized_key = source_entry.get("normalized_key", "")
    canonical_key = source_entry.get("canonical_key", "")

    if psgc and psgc in target_indexes["by_psgc"]:
        target = target_indexes["by_psgc"][psgc]

        return {
            "matched": True,
            "method": "psgc",
            "confidence": 1,
            "target": target,
            "suggestions": [],
        }

    if normalized_key and normalized_key in target_indexes["by_name"]:
        target = target_indexes["by_name"][normalized_key]

        return {
            "matched": True,
            "method": "normalized_name",
            "confidence": 1,
            "target": target,
            "suggestions": [],
        }

    if canonical_key and canonical_key in target_indexes["by_canonical"]:
        target = target_indexes["by_canonical"][canonical_key]

        return {
            "matched": True,
            "method": "canonical_alias",
            "confidence": 1,
            "target": target,
            "suggestions": [],
        }

    suggestions = _suggest_matches(source_entry, target_entries)
    best = suggestions[0] if suggestions else None

    if best and best["similarity"] >= fuzzy_threshold:
        target = next(
            (
                item
                for item in target_entries
                if item.get("normalized_key") == best["target_key"]
            ),
            None,
        )

        if target:
            return {
                "matched": True,
                "method": "fuzzy_name",
                "confidence": best["similarity"],
                "target": target,
                "suggestions": suggestions,
            }

    return {
        "matched": False,
        "method": "unmatched",
        "confidence": 0,
        "target": None,
        "suggestions": suggestions,
    }


def _build_pair_alignment_report(source_label, target_label, source_entries, target_entries):
    target_indexes = _build_target_indexes(target_entries)
    rows = []

    method_counts = defaultdict(int)

    for source_entry in source_entries:
        match = _find_match(source_entry, target_entries, target_indexes)
        target = match.get("target")

        method_counts[match["method"]] += 1

        rows.append({
            "source_name": source_entry.get("display_name") or source_entry.get("raw_name", ""),
            "source_raw_name": source_entry.get("raw_name", ""),
            "source_key": source_entry.get("normalized_key", ""),
            "source_psgc": source_entry.get("psgc", ""),
            "source_record_count": source_entry.get("record_count", 0),
            "matched": match["matched"],
            "match_method": match["method"],
            "match_confidence": match["confidence"],
            "target_name": target.get("display_name") if target else None,
            "target_raw_name": target.get("raw_name") if target else None,
            "target_key": target.get("normalized_key") if target else None,
            "target_psgc": target.get("psgc") if target else None,
            "suggestions": match["suggestions"],
        })

    matched_rows = [row for row in rows if row["matched"]]
    unmatched_rows = [row for row in rows if not row["matched"]]

    return {
        "source": source_label,
        "target": target_label,
        "source_count": len(source_entries),
        "target_count": len(target_entries),
        "matched_count": len(matched_rows),
        "unmatched_count": len(unmatched_rows),
        "match_rate": _format_percent(len(matched_rows), len(source_entries)),
        "method_counts": dict(method_counts),
        "matched": matched_rows,
        "unmatched": unmatched_rows,
        "unmatched_names": [row["source_name"] for row in unmatched_rows],
        "warning": (
            ""
            if not unmatched_rows
            else f"{len(unmatched_rows)} {source_label} barangay name(s) could not be matched with {target_label}."
        ),
    }


def _get_psgc_coverage(entries):
    count = len(entries)
    with_psgc = len([entry for entry in entries if entry.get("psgc")])

    return {
        "count": count,
        "with_psgc": with_psgc,
        "without_psgc": count - with_psgc,
        "coverage_percent": _format_percent(with_psgc, count),
    }


def _build_warnings(report):
    warnings = []
    status = report["integration_status"]

    if status.get("missing_sources"):
        warnings.append(
            "Some source datasets are missing: "
            + ", ".join(status.get("missing_sources", []))
        )

    for source_name, duplicate_report in report["duplicates"].items():
        if duplicate_report["duplicate_name_group_count"] > 0:
            warnings.append(
                f"{source_name.title()} data has {duplicate_report['duplicate_name_group_count']} duplicate normalized barangay name group(s)."
            )

        if duplicate_report["duplicate_psgc_group_count"] > 0:
            warnings.append(
                f"{source_name.title()} data has {duplicate_report['duplicate_psgc_group_count']} duplicate PSGC group(s)."
            )

    for pair_key, pair_report in report["pair_reports"].items():
        if pair_report["unmatched_count"] > 0:
            warnings.append(pair_report["warning"])

    for source_name, coverage in report["psgc_coverage"].items():
        if coverage["count"] > 0 and coverage["coverage_percent"] == 0:
            warnings.append(
                f"{source_name.title()} data has no PSGC values. Matching is using barangay names only."
            )

    return [warning for warning in warnings if warning]


def build_alignment_report():
    source_entries = _build_source_entries()

    dengue_entries = source_entries["dengue"]
    population_entries = source_entries["population"]
    boundary_entries = source_entries["boundary"]

    dengue_to_population = _build_pair_alignment_report(
        "dengue",
        "population",
        dengue_entries,
        population_entries,
    )

    dengue_to_boundary = _build_pair_alignment_report(
        "dengue",
        "boundary",
        dengue_entries,
        boundary_entries,
    )

    population_to_boundary = _build_pair_alignment_report(
        "population",
        "boundary",
        population_entries,
        boundary_entries,
    )

    duplicates = {
        "dengue": _detect_duplicate_barangays(dengue_entries),
        "population": _detect_duplicate_barangays(population_entries),
        "boundary": _detect_duplicate_barangays(boundary_entries),
    }

    psgc_coverage = {
        "dengue": _get_psgc_coverage(dengue_entries),
        "population": _get_psgc_coverage(population_entries),
        "boundary": _get_psgc_coverage(boundary_entries),
    }

    pair_reports = {
        "dengue_to_population": dengue_to_population,
        "dengue_to_boundary": dengue_to_boundary,
        "population_to_boundary": population_to_boundary,
    }

    pair_scores = [
        pair_report["match_rate"]
        for pair_report in pair_reports.values()
        if pair_report["source_count"] > 0
    ]

    alignment_score = round(sum(pair_scores) / len(pair_scores), 2) if pair_scores else 0

    report = {
        "message": "Barangay alignment report generated successfully.",
        "integration_status": build_source_status_summary(),
        "alignment_score": alignment_score,
        "source_counts": {
            "dengue_barangays": len(dengue_entries),
            "population_barangays": len(population_entries),
            "boundary_barangays": len(boundary_entries),
        },
        "psgc_coverage": psgc_coverage,
        "duplicates": duplicates,
        "pair_reports": pair_reports,
    }

    report["warnings"] = _build_warnings(report)

    return report
