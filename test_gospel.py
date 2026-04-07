
import requests
from bs4 import BeautifulSoup
import time
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

CIFRACLUB_BASE_URL = "https://www.cifraclub.com.br"
DEFAULT_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
}
GOSPEL_KEYWORDS = {"gospel", "religioso", "gospel/religioso", "cristã", "cristao", "worship"}

def _is_gospel_artist(artist_slug: str) -> bool:
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

        logger.info(f"Genre check: {artist_slug} -> {'GOSPEL' if is_gospel else genre_link.get_text(strip=True) if genre_link else 'unknown'}")
        return is_gospel
    except Exception as e:
        logger.warning(f"Genre check failed for {artist_slug}: {e}")
        return False

print("Djavan:", _is_gospel_artist("djavan"))
print("Aline Barros:", _is_gospel_artist("aline-barros"))
