from difflib import SequenceMatcher

from app.services.barangay_normalizer import normalize_barangay_key


HIGH_CONFIDENCE_THRESHOLD = 0.88
MIN_CONFIDENCE_MARGIN = 0.04


BOUNDARY_NAME_FIELDS = [
    "barangay",
    "barangay_raw",
    "barangay_name",
    "adm4_name",
    "ADM4_NAME",
    "adm4_ref_name",
    "ADM4_REF_NAME",
    "name",
    "NAME",
    "NAME_4",
    "ADM4_EN",
    "BARANGAY",
]

PSGC_FIELDS = [
    "psgc",
    "PSGC",
    "adm4_pcode",
    "ADM4_PCODE",
    "pcode",
    "PCODE",
]


STOP_TOKENS = {
    "barangay",
    "brgy",
    "bgy",
    "pob",
    "poblacion",
    "district",
    "dist",
}


def _safe_text(value):
    if value is None:
        return ""

    text = str(value).strip()

    if text.lower() in ["", "none", "nan", "null", "nat"]:
        return ""

    return text


def _first_text(source, fields):
    source = source or {}

    for field in fields:
        value = _safe_text(source.get(field))

        if value:
            return value

    return ""


def get_record_barangay_name(record):
    return _first_text(
        record,
        [
            "barangay",
            "barangay_raw",
            "barangay_name",
            "name",
            "adm4_name",
            "adm4_ref_name",
            "BARANGAY",
            "ADM4_NAME",
            "ADM4_EN",
        ],
    )


def get_record_psgc(record):
    return _first_text(record, PSGC_FIELDS)


def get_boundary_barangay_name(properties):
    return _first_text(properties, BOUNDARY_NAME_FIELDS)


def get_boundary_psgc(properties):
    return _first_text(properties, PSGC_FIELDS)


def _tokens(value):
    key = normalize_barangay_key(value)
    return [token for token in key.split() if token and token not in STOP_TOKENS]


def _compact(value):
    return normalize_barangay_key(value).replace(" ", "")


def _score_name(query_name, candidate_name):
    query_key = normalize_barangay_key(query_name)
    candidate_key = normalize_barangay_key(candidate_name)

    if not query_key or not candidate_key:
        return 0

    if query_key == candidate_key:
        return 1.0

    if _compact(query_key) == _compact(candidate_key):
        return 0.99

    query_tokens = set(_tokens(query_key))
    candidate_tokens = set(_tokens(candidate_key))

    if len(query_tokens) >= 2 and query_tokens.issubset(candidate_tokens):
        return 0.96

    if len(candidate_tokens) >= 2 and candidate_tokens.issubset(query_tokens):
        return 0.94

    if query_key in candidate_key and len(query_key) >= 6:
        return 0.92

    if candidate_key in query_key and len(candidate_key) >= 6:
        return 0.90

    ratio = SequenceMatcher(None, query_key, candidate_key).ratio()
    token_overlap = 0

    if query_tokens and candidate_tokens:
        token_overlap = len(query_tokens & candidate_tokens) / max(len(query_tokens), len(candidate_tokens))

    return max(ratio, token_overlap * 0.90)


def build_barangay_reference(boundary_geojson=None, population_records=None):
    """Builds the official barangay reference list from boundary first, then population.

    Boundary names are treated as the master names because they are the names that can be mapped.
    Population names are added only when a boundary reference does not already exist.
    """
    references_by_key = {}
    references_by_psgc = {}

    features = []

    if isinstance(boundary_geojson, dict):
        features = boundary_geojson.get("features") or []

    for index, feature in enumerate(features):
        if not isinstance(feature, dict):
            continue

        properties = feature.get("properties") or {}
        official_name = get_boundary_barangay_name(properties)
        barangay_key = normalize_barangay_key(properties.get("barangay_key") or official_name)

        if not barangay_key:
            continue

        psgc = get_boundary_psgc(properties)
        reference = {
            "source": "boundary",
            "official_name": official_name or barangay_key,
            "barangay_key": barangay_key,
            "psgc": psgc,
            "feature_index": index,
        }

        references_by_key[barangay_key] = reference

        if psgc:
            references_by_psgc[psgc] = reference

    for index, record in enumerate(population_records or []):
        if not isinstance(record, dict):
            continue

        official_name = get_record_barangay_name(record)
        barangay_key = normalize_barangay_key(record.get("barangay_key") or official_name)

        if not barangay_key or barangay_key in references_by_key:
            continue

        psgc = get_record_psgc(record)
        reference = {
            "source": "population",
            "official_name": official_name or barangay_key,
            "barangay_key": barangay_key,
            "psgc": psgc,
            "feature_index": None,
            "population_index": index,
        }

        references_by_key[barangay_key] = reference

        if psgc and psgc not in references_by_psgc:
            references_by_psgc[psgc] = reference

    return {
        "items": list(references_by_key.values()),
        "by_key": references_by_key,
        "by_psgc": references_by_psgc,
    }


def resolve_barangay_name(record, reference, *, minimum_confidence=HIGH_CONFIDENCE_THRESHOLD):
    """Resolve one uploaded barangay record to the official master barangay list.

    Returns a dictionary with a resolved key and a status. The system only auto-resolves
    high-confidence matches. Unclear matches remain marked for review.
    """
    record = record or {}
    reference = reference or {"items": [], "by_key": {}, "by_psgc": {}}

    original_name = get_record_barangay_name(record)
    original_key = normalize_barangay_key(record.get("barangay_key") or original_name)
    psgc = get_record_psgc(record)

    if psgc and psgc in reference.get("by_psgc", {}):
        matched = reference["by_psgc"][psgc]
        return {
            "original_barangay": original_name,
            "original_barangay_key": original_key,
            "barangay": matched["official_name"],
            "barangay_key": matched["barangay_key"],
            "matched_barangay": matched["official_name"],
            "match_status": "psgc_matched",
            "match_confidence": 1.0,
            "match_source": matched.get("source") or "reference",
            "match_note": "Matched using PSGC/barangay code.",
            "possible_matches": [],
        }

    if original_key and original_key in reference.get("by_key", {}):
        matched = reference["by_key"][original_key]
        return {
            "original_barangay": original_name,
            "original_barangay_key": original_key,
            "barangay": matched["official_name"],
            "barangay_key": matched["barangay_key"],
            "matched_barangay": matched["official_name"],
            "match_status": "exact_matched",
            "match_confidence": 1.0,
            "match_source": matched.get("source") or "reference",
            "match_note": "Matched using normalized barangay name.",
            "possible_matches": [],
        }

    candidates = []

    for item in reference.get("items", []):
        score = _score_name(original_name or original_key, item.get("official_name") or item.get("barangay_key"))

        if score <= 0:
            continue

        candidates.append({
            "barangay": item.get("official_name"),
            "barangay_key": item.get("barangay_key"),
            "score": round(score, 3),
            "source": item.get("source") or "reference",
        })

    candidates.sort(key=lambda row: row["score"], reverse=True)
    top = candidates[0] if candidates else None
    second = candidates[1] if len(candidates) > 1 else None

    if top:
        margin = top["score"] - (second["score"] if second else 0)

        if top["score"] >= minimum_confidence and margin >= MIN_CONFIDENCE_MARGIN:
            return {
                "original_barangay": original_name,
                "original_barangay_key": original_key,
                "barangay": top["barangay"],
                "barangay_key": top["barangay_key"],
                "matched_barangay": top["barangay"],
                "match_status": "auto_matched",
                "match_confidence": top["score"],
                "match_source": top.get("source") or "reference",
                "match_note": f"Automatically matched to official barangay name with {round(top['score'] * 100)}% confidence.",
                "possible_matches": candidates[:5],
            }

    return {
        "original_barangay": original_name,
        "original_barangay_key": original_key,
        "barangay": original_name,
        "barangay_key": original_key,
        "matched_barangay": top.get("barangay") if top else "",
        "match_status": "needs_review" if top else "unmatched",
        "match_confidence": top.get("score") if top else 0,
        "match_source": top.get("source") if top else "",
        "match_note": "Could not safely auto-match this barangay name. Please review the suggested match." if top else "No possible official barangay match found.",
        "possible_matches": candidates[:5],
    }
