import re
import unicodedata
from difflib import SequenceMatcher, get_close_matches


COMMON_BARANGAY_ALIASES = {
    "agusan pequeno": "Agusan Pequeño",
    "agusan pequenio": "Agusan Pequeño",
    "agusan pequino": "Agusan Pequeño",
    "baan km 3": "Baan Km. 3",
    "baan km3": "Baan Km. 3",
    "baan kilometer 3": "Baan Km. 3",
    "brgy baan km 3": "Baan Km. 3",
    "barangay baan km 3": "Baan Km. 3",
    "santo nino": "Santo Niño",
    "sto nino": "Santo Niño",
    "sto niño": "Santo Niño",
    "st nino": "Santo Niño",
    "new society village": "New Society Village",
    "nsv": "New Society Village",
    "port poyohon": "Port Poyohon",
    "ong yiu": "Ong Yiu",
    "diego silang": "Diego Silang",
    "jose rizal": "Jose Rizal",
    "rajah soliman": "Rajah Soliman",
    "tandang sora": "Tandang Sora",
    "villa kananga": "Villa Kananga",
}


TITLE_CASE_SMALL_WORDS = {"de", "del", "da", "of", "and", "the"}
TITLE_CASE_UPPER_WORDS = {"km"}


def remove_accents(value: str) -> str:
    normalized = unicodedata.normalize("NFKD", value)
    return "".join(character for character in normalized if not unicodedata.combining(character))


def normalize_barangay_key(value) -> str:
    if value is None:
        return ""

    text = str(value).strip()

    if not text:
        return ""

    text = remove_accents(text).lower()
    text = re.sub(r"\bbarangay\b", " ", text)
    text = re.sub(r"\bbrgy\.?\b", " ", text)
    text = re.sub(r"\bbrg\.?\b", " ", text)
    text = re.sub(r"\bsto\.?\b", "santo", text)
    text = re.sub(r"\bst\.?\b", "santo", text)
    text = re.sub(r"\bkilometer\b", "km", text)
    text = re.sub(r"\bkm\.?(\d+)\b", r"km \1", text)
    text = re.sub(r"[^a-z0-9]+", " ", text)
    text = re.sub(r"\s+", " ", text).strip()

    return text


def title_case_barangay(normalized_key: str) -> str:
    if not normalized_key:
        return ""

    words = normalized_key.split()
    formatted_words = []

    for index, word in enumerate(words):
        if word in TITLE_CASE_UPPER_WORDS:
            formatted_words.append(word.title())
        elif index > 0 and word in TITLE_CASE_SMALL_WORDS:
            formatted_words.append(word)
        else:
            formatted_words.append(word.capitalize())

    display_name = " ".join(formatted_words)
    display_name = re.sub(r"\bKm\s+(\d+)\b", r"Km. \1", display_name)

    return display_name


def canonicalize_barangay_name(value) -> str:
    normalized_key = normalize_barangay_key(value)

    if not normalized_key:
        return ""

    if normalized_key in COMMON_BARANGAY_ALIASES:
        return COMMON_BARANGAY_ALIASES[normalized_key]

    return title_case_barangay(normalized_key)


def build_candidate_lookup(candidates=None):
    if not candidates:
        return {}

    lookup = {}

    for candidate in candidates:
        candidate_key = normalize_barangay_key(candidate)

        if candidate_key:
            lookup[candidate_key] = str(candidate).strip()

    return lookup


def match_barangay_name(value, candidates=None, minimum_score: float = 0.86):
    raw_name = "" if value is None else str(value).strip()
    normalized_key = normalize_barangay_key(raw_name)
    fallback_name = canonicalize_barangay_name(raw_name)
    candidate_lookup = build_candidate_lookup(candidates)

    if not normalized_key:
        return {
            "raw_name": raw_name,
            "normalized_key": "",
            "display_name": "",
            "matched_name": None,
            "match_status": "missing",
            "match_confidence": 0,
        }

    if normalized_key in candidate_lookup:
        matched_name = candidate_lookup[normalized_key]
        return {
            "raw_name": raw_name,
            "normalized_key": normalized_key,
            "display_name": matched_name,
            "matched_name": matched_name,
            "match_status": "exact",
            "match_confidence": 1,
        }

    alias_name = COMMON_BARANGAY_ALIASES.get(normalized_key)

    if alias_name:
        alias_key = normalize_barangay_key(alias_name)

        if alias_key in candidate_lookup:
            matched_name = candidate_lookup[alias_key]
            return {
                "raw_name": raw_name,
                "normalized_key": normalized_key,
                "display_name": matched_name,
                "matched_name": matched_name,
                "match_status": "alias",
                "match_confidence": 1,
            }

    if candidate_lookup:
        candidate_keys = list(candidate_lookup.keys())
        close_matches = get_close_matches(
            normalized_key,
            candidate_keys,
            n=1,
            cutoff=minimum_score,
        )

        if close_matches:
            matched_key = close_matches[0]
            confidence = SequenceMatcher(None, normalized_key, matched_key).ratio()
            matched_name = candidate_lookup[matched_key]

            return {
                "raw_name": raw_name,
                "normalized_key": normalized_key,
                "display_name": matched_name,
                "matched_name": matched_name,
                "match_status": "fuzzy",
                "match_confidence": round(confidence, 3),
            }

        return {
            "raw_name": raw_name,
            "normalized_key": normalized_key,
            "display_name": fallback_name,
            "matched_name": None,
            "match_status": "unmatched",
            "match_confidence": 0,
        }

    return {
        "raw_name": raw_name,
        "normalized_key": normalized_key,
        "display_name": fallback_name,
        "matched_name": fallback_name,
        "match_status": "normalized_only",
        "match_confidence": 1,
    }