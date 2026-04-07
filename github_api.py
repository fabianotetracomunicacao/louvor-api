"""API Module"""

import json
import os
import logging
import math
import re
import unicodedata
import time
import requests
from bs4 import BeautifulSoup
from flask import Flask, send_from_directory, jsonify, request
from flask_cors import CORS
from cifraclub import CifraClub

# Configurar logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

CIFRACLUB_BASE_URL = "https://www.cifraclub.com.br"
CIFRACLUB_SEARCH_URL = f"{CIFRACLUB_BASE_URL}/busca/"
CIFRACLUB_SOLR_SUGGEST_URL = "https://solr.sscdn.co/cc/m1/"
CIFRACLUB_SOLR_ALT_SUGGEST_URL = "https://solr.sscdn.co/cc/c7/"
CIFRACLUB_ARTISTS_SUGGEST_URL = "https://solr.sscdn.co/cifraclub-explore/v1/artists/suggest"
CIFRACLUB_ARTIST_SONGS_URL = "https://solr.sscdn.co/cifraclub-explore/v1/songs"
SEARCH_RESULTS_PER_PAGE = 15
DEFAULT_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/131.0.0.0 Safari/537.36"
    ),
    "Origin": CIFRACLUB_BASE_URL,
    "Referer": f"{CIFRACLUB_BASE_URL}/",
}

# Gospel genre keywords for matching
GOSPEL_KEYWORDS = {"gospel", "religioso", "gospel/religioso", "crist\u00e3", "cristao", "worship"}

# Cache: artist_slug -> (is_gospel: bool, timestamp)
_artist_genre_cache = {}
_CACHE_TTL = 86400  # 24 hours

def _is_gospel_artist(artist_slug: str) -> bool:
    """Check if an artist is classified as Gospel/Religioso on Cifra Club."""
    now = time.time()
    cached = _artist_genre_cache.get(artist_slug)
    if cached and (now - cached[1]) < _CACHE_TTL:
        return cached[0]

    try:
        url = f"{CIFRACLUB_BASE_URL}/{artist_slug}/"
        resp = requests.get(url, headers=DEFAULT_HEADERS, timeout=8)
        resp.raise_for_status()
        soup = BeautifulSoup(resp.text, "html.parser")

        genre_link = soup.select_one('a[href*="/estilos/"]')
        if genre_link:
            genre_text = genre_link.get_text(strip=True).lower()
            genre_href = (genre_link.get("href") or "").lower()
            is_gospel = any(kw in genre_text or kw in genre_href for kw in GOSPEL_KEYWORDS)
        else:
            is_gospel = False

        _artist_genre_cache[artist_slug] = (is_gospel, now)
        logger.info(f"Genre check: {artist_slug} -> {'GOSPEL' if is_gospel else genre_link.get_text(strip=True) if genre_link else 'unknown'}")
        return is_gospel
    except Exception as e:
        logger.warning(f"Genre check failed for {artist_slug}: {e}")
        _artist_genre_cache[artist_slug] = (False, now)
        return False

def _filter_gospel_results(results: list) -> list:
    """Filter search results to only include Gospel/Religioso artists."""
    filtered = []
    for item in results:
        artist_slug = item.get("artist_slug", "")
        if not artist_slug:
            continue
        if _is_gospel_artist(artist_slug):
            filtered.append(item)
    return filtered

app = Flask(__name__, static_folder='static', static_url_path='')
CORS(app) # Enable CORS for all routes

# Rota para servir a p\u00e1gina principal
@app.route('/')
def home():
    """Home route - serves the main HTML page"""
    return send_from_directory('static', 'index.html')

@app.route('/health')
def health():
    """Health check route"""
    return jsonify({'status': 'healthy'})

def _slug_to_name(slug: str) -> str:
    return slug.replace('-', ' ').strip().title()

def _normalize_search_text(value: str) -> str:
    normalized = unicodedata.normalize("NFD", value or "")
    normalized = normalized.encode("ascii", "ignore").decode("ascii")
    normalized = re.sub(r"[^a-z0-9]+", " ", normalized.lower())
    return re.sub(r"\s+", " ", normalized).strip()

def _build_query_variants(query: str):
    """Gera varia\u00e7\u00f5es de consulta para cobrir formatos como artista-m\u00fasica."""
    normalized = re.sub(r"\s+", " ", query).strip()
    variants = []

    def add_variant(value: str):
        value = re.sub(r"\s+", " ", value).strip()
        if value and value not in variants:
            variants.append(value)

    add_variant(normalized)
    add_variant(re.sub(r"\s*-\s*", " ", normalized))

    parts = [part.strip() for part in re.split(r"\s*-\s*", normalized) if part.strip()]
    if len(parts) >= 2:
        left = parts[0]
        right = " ".join(parts[1:])
        add_variant(f"{left} {right}")
        add_variant(f"{right} {left}")
        add_variant(left)
        add_variant(right)

    return variants

def _search_from_solr(query: str, limit: int | None = None):
    """Busca m\u00fasicas usando o endpoint de sugest\u00f5es do Cifra Club."""
    response = requests.get(
        CIFRACLUB_SOLR_SUGGEST_URL,
        params={"q": query},
        headers=DEFAULT_HEADERS,
        timeout=10,
    )
    response.raise_for_status()

    payload = response.text.strip()
    if payload.startswith("(") and payload.endswith(")"):
        payload = payload[1:-1]

    data = json.loads(payload) if payload else {}
    docs = data.get("response", {}).get("docs", [])

    results = []
    seen = set()

    for doc in docs:
        # t=2 representa item de m\u00fasica
        if str(doc.get("t")) != "2":
            continue

        artist_slug = (doc.get("d") or "").strip("/")
        song_slug = (doc.get("u") or "").strip("/")
        if not artist_slug or not song_slug:
            continue

        key = (artist_slug, song_slug)
        if key in seen:
            continue
        seen.add(key)

        results.append({
            "artist": doc.get("a") or _slug_to_name(artist_slug),
            "name": doc.get("m") or _slug_to_name(song_slug),
            "artist_slug": artist_slug,
            "song_slug": song_slug,
            "url": f"{CIFRACLUB_BASE_URL}/{artist_slug}/{song_slug}",
        })

        if limit is not None and len(results) >= limit:
            break

    return results

def _search_from_solr_alt(query: str, limit: int | None = None):
    """Busca m\u00fasicas usando endpoint alternativo de sugest\u00e3o."""
    response = requests.get(
        CIFRACLUB_SOLR_ALT_SUGGEST_URL,
        params={"q": query},
        headers=DEFAULT_HEADERS,
        timeout=10,
    )
    response.raise_for_status()

    data = response.json() if response.text else {}
    docs = data.get("response", {}).get("docs", [])

    results = []
    seen = set()

    for doc in docs:
        if str(doc.get("tipo")) != "2":
            continue

        artist_slug = (doc.get("dns") or "").strip("/")
        song_slug = (doc.get("url") or "").strip("/")
        if not artist_slug or not song_slug:
            continue

        key = (artist_slug, song_slug)
        if key in seen:
            continue
        seen.add(key)

        results.append({
            "artist": doc.get("art") or _slug_to_name(artist_slug),
            "name": doc.get("txt") or _slug_to_name(song_slug),
            "artist_slug": artist_slug,
            "song_slug": song_slug,
            "url": f"{CIFRACLUB_BASE_URL}/{artist_slug}/{song_slug}",
        })

        if limit is not None and len(results) >= limit:
            break

    return results

def _search_from_artist_catalog(query: str, limit: int | None = None):
    """Busca cat\u00e1logo do artista quando a query representa claramente um artista."""
    response = requests.get(
        CIFRACLUB_ARTISTS_SUGGEST_URL,
        params={"q": query},
        headers=DEFAULT_HEADERS,
        timeout=10,
    )
    response.raise_for_status()

    artists = response.json().get("artists", [])
    if not artists:
        return []

    best_artist = artists[0]
    query_norm = _normalize_search_text(query)
    artist_name_norm = _normalize_search_text(best_artist.get("name", ""))
    artist_slug_norm = _normalize_search_text((best_artist.get("slug") or "").replace("-", " "))

    # S\u00f3 usa cat\u00e1logo quando a busca for claramente o artista.
    if query_norm not in {artist_name_norm, artist_slug_norm}:
        return []

    artist_id = best_artist.get("id")
    if not artist_id:
        return []

    songs_response = requests.get(
        CIFRACLUB_ARTIST_SONGS_URL,
        params={"artist_ids": str(artist_id), "_sort": "pt_alphabetical"},
        headers=DEFAULT_HEADERS,
        timeout=10,
    )
    songs_response.raise_for_status()

    songs = songs_response.json().get("songs", [])
    results = []
    seen = set()

    for song in songs:
        artist_slug = (song.get("artist_slug") or "").strip("/")
        song_slug = (song.get("slug") or "").strip("/")
        if not artist_slug or not song_slug:
            continue

        key = (artist_slug, song_slug)
        if key in seen:
            continue
        seen.add(key)

        results.append({
            "artist": song.get("artist_name") or _slug_to_name(artist_slug),
            "name": song.get("name") or _slug_to_name(song_slug),
            "artist_slug": artist_slug,
            "song_slug": song_slug,
            "url": f"{CIFRACLUB_BASE_URL}/{artist_slug}/{song_slug}",
        })

        if limit is not None and len(results) >= limit:
            break

    return results

def _search_from_html(query: str, limit: int = 20):
    """Fallback usando parsing de HTML para quando o endpoint de sugest\u00f5es falhar."""
    response = requests.get(
        CIFRACLUB_SEARCH_URL,
        params={"q": query},
        headers=DEFAULT_HEADERS,
        timeout=10,
    )
    response.raise_for_status()

    soup = BeautifulSoup(response.text, "html.parser")
    query_tokens = set(re.findall(r"[a-z0-9]+", query.lower()))

    results = []
    seen = set()
    for item in soup.select("a[href]"):
        href = item.get("href", "")
        if not href.startswith("/"):
            continue

        clean_path = href.split("?", 1)[0].split("#", 1)[0].strip("/")
        parts = clean_path.split("/")
        if len(parts) < 2:
            continue

        artist_slug, song_slug = parts[0], parts[1]
        if not re.fullmatch(r"[a-z0-9-]+", artist_slug):
            continue
        if not re.fullmatch(r"[a-z0-9-]+", song_slug):
            continue

        link_text = item.get_text(" ", strip=True).lower()
        haystack = f"{artist_slug} {song_slug} {link_text}"
        if query_tokens and not any(token in haystack for token in query_tokens):
            continue

        key = (artist_slug, song_slug)
        if key in seen:
            continue
        seen.add(key)

        title = item.get_text(strip=True)
        results.append({
            "artist": _slug_to_name(artist_slug),
            "name": title or _slug_to_name(song_slug),
            "artist_slug": artist_slug,
            "song_slug": song_slug,
            "url": f"{CIFRACLUB_BASE_URL}/{artist_slug}/{song_slug}",
        })

        if len(results) >= limit:
            break

    return results

def _merge_unique_results(target: list, seen: set, incoming: list):
    for item in incoming:
        artist_slug = item.get("artist_slug") or ""
        song_slug = item.get("song_slug") or ""
        key = (artist_slug, song_slug)
        if not artist_slug or not song_slug or key in seen:
            continue
        seen.add(key)
        target.append(item)

@app.route('/search')
@app.route('/api/search')
def search():
    """Search for songs on Cifra Club"""
    query = request.args.get('q', '').strip()
    if not query:
        return jsonify({'error': 'Query parameter "q" is required'}), 400

    page_raw = request.args.get('page', '1').strip()
    try:
        page = int(page_raw)
    except ValueError:
        return jsonify({'error': 'Query parameter "page" must be an integer >= 1'}), 400

    if page < 1:
        return jsonify({'error': 'Query parameter "page" must be >= 1'}), 400

    try:
        all_results = []
        seen = set()
        query_variants = _build_query_variants(query)

        for query_variant in query_variants:
            try:
                _merge_unique_results(all_results, seen, _search_from_solr(query_variant))
            except Exception as e:
                logger.warning(f"Primary search source failed for query '{query_variant}': {e}")

        for query_variant in query_variants:
            try:
                _merge_unique_results(all_results, seen, _search_from_solr_alt(query_variant))
            except Exception as e:
                logger.warning(f"Alt search source failed for query '{query_variant}': {e}")

        try:
            _merge_unique_results(all_results, seen, _search_from_artist_catalog(query))
        except Exception as e:
            logger.warning(f"Artist catalog search failed for query '{query}': {e}")

        if not all_results:
            logger.warning("SOLR search returned no results, using HTML fallback")
            for query_variant in query_variants:
                _merge_unique_results(all_results, seen, _search_from_html(query_variant, limit=150))
                if all_results:
                    break

        # Filter: only Gospel/Religioso artists
        gospel_filter = request.args.get('gospel', '1').strip()
        if gospel_filter == '1':
            all_results = _filter_gospel_results(all_results)

        all_results.sort(
            key=lambda item: (
                _normalize_search_text(item.get("artist", "")),
                _normalize_search_text(item.get("name", "")),
                item.get("artist_slug", ""),
                item.get("song_slug", ""),
            )
        )

        total = len(all_results)
        per_page = SEARCH_RESULTS_PER_PAGE
        total_pages = max(1, math.ceil(total / per_page)) if total > 0 else 0

        start = (page - 1) * per_page
        end = start + per_page
        paginated_results = all_results[start:end] if start < total else []

        return jsonify({
            'results': paginated_results,
            'pagination': {
                'page': page,
                'per_page': per_page,
                'total': total,
                'total_pages': total_pages,
                'has_prev': page > 1 and total > 0,
                'has_next': end < total,
            }
        })

    except json.JSONDecodeError as e:
        logger.error(f"Error decoding SOLR response: {e}")
        return jsonify({'error': 'Search failed: invalid upstream response'}), 502
    except requests.RequestException as e:
        logger.error(f"Error searching upstream service: {e}")
        return jsonify({'error': f'Search failed: upstream request error ({str(e)})'}), 502
    except Exception as e:
        logger.error(f"Error searching: {e}")
        return jsonify({'error': f'Search failed: {str(e)}'}), 500

@app.route('/artists/<artist>/songs/<song>')
def get_cifra(artist, song):
    """Get cifra by artist and song"""
    logger.info(f"Requisi\u00e7\u00e3o recebida: artist={artist}, song={song}")
    try:
        cifraclub = CifraClub()
        result = cifraclub.cifra(artist, song)
        
        if 'error' in result:
            logger.error(f"Erro ao obter cifra: {result['error']}")
            return jsonify(result), 500
        
        logger.info(f"Cifra obtida com sucesso: {result.get('name', 'Unknown')}")
        return jsonify(result)
    except Exception as e:
        logger.error(f"Erro inesperado: {e}")
        return jsonify({'error': f'Erro interno do servidor: {str(e)}'}), 500

if __name__ == "__main__":
    port = int(os.getenv('PORT', '3000'))
    debug_mode = os.getenv('FLASK_DEBUG', '0').lower() in {'1', 'true', 'yes'}
    logger.info(f"Iniciando servidor na porta {port}")
    app.run(host='0.0.0.0', port=port, debug=debug_mode)
