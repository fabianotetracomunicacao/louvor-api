"""CifraClub Module"""

import logging
import re
from curl_cffi import requests
from curl_cffi.requests.exceptions import RequestException
from bs4 import BeautifulSoup

CIFRACLUB_URL = "https://www.cifraclub.com.br/"
DEFAULT_HEADERS = {
    "User-Agent": "LouvorPlay-CifraImporter/1.0",
    "Accept": "text/html,application/xhtml+xml",
}
BLOCKED_BODY_PATTERN = re.compile(
    r"\b(captcha|challenge|access denied|forbidden|too many requests|cloudflare)\b",
    re.IGNORECASE,
)

# Configurar logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


class CifraClub():
    """CifraClub Class"""
    def __init__(self):
        # No driver needed for shared hosting
        pass

    def _extract_youtube_url(self, soup: BeautifulSoup) -> str:
        """Extrai URL do YouTube da página."""
        img_tag = soup.select_one("div.player-placeholder img[src]")
        if img_tag:
            src = img_tag.get("src", "")
            match = re.search(r"/vi/([^/]+)/", src)
            if match:
                return f"https://www.youtube.com/watch?v={match.group(1)}"

        iframe = soup.select_one('iframe[src*="youtube.com"], iframe[src*="youtu.be"]')
        if iframe:
            src = iframe.get("src", "")
            match = re.search(r"(?:embed/|v=)([A-Za-z0-9_-]{6,})", src)
            if match:
                return f"https://www.youtube.com/watch?v={match.group(1)}"

        return "Link do YouTube não encontrado"

    def _extract_with_requests(self, url: str, result: dict) -> bool:
        """Tentativa de extração rápida sem Selenium."""
        response = requests.get(url, headers=DEFAULT_HEADERS, timeout=20)
        response_body = response.text or ""
        upstream_status = getattr(response, "status_code", None)
        if upstream_status in {403, 429}:
            result["error"] = "Cifra Club blocked the request"
            result["blocked"] = True
            result["upstream_status"] = upstream_status
            result["upstream_body"] = response_body[:500]
            return False
        response.raise_for_status()

        soup = BeautifulSoup(response_body, "html.parser")

        title_elem = soup.select_one("h1.t1") or soup.find("h1")
        artist_elem = soup.select_one("h2.t3") or soup.find("h2")
        pre_elem = soup.select_one("div.cifra_cnt pre") or soup.find("pre")
        
        # --- NOVA LÓGICA DE ESTILO ---
        # Extrair estilo/gênero do breadcrumb (ex: Gospel/Religioso)
        style_elem = soup.select_one('nav.breadcrumb a[href*="/estilos/"]') or \
                     soup.select_one('div.breadcrumb a[href*="/estilos/"]')
        # -----------------------------

        if not pre_elem:
            if BLOCKED_BODY_PATTERN.search(response_body):
                result["error"] = "Cifra Club blocked the request"
                result["blocked"] = True
                result["upstream_status"] = upstream_status
                result["upstream_body"] = response_body[:500]
            return False

        title = title_elem.get_text(strip=True) if title_elem else ""
        artist = artist_elem.get_text(strip=True) if artist_elem else ""
        if not title or not artist:
            result["error"] = "Metadados canônicos ausentes na página da cifra"
            result["error_code"] = "missing_canonical_metadata"
            return False

        result["name"] = title
        result["artist"] = artist
        
        # Adicionando o estilo ao resultado
        result["style"] = style_elem.get_text(strip=True) if style_elem else "Geral"
        
        result["youtube_url"] = self._extract_youtube_url(soup)
        result["cifra"] = pre_elem.get_text().split("\n")
        return True

    def cifra(self, artist: str, song: str) -> dict:
        """Lê a página HTML e extrai a cifra e meta dados da música."""
        result = {}
        url = f"{CIFRACLUB_URL}{artist}/{song}"
        result['cifraclub_url'] = url
        
        try:
            logger.info(f"Acessando URL: {url}")
            if self._extract_with_requests(url, result):
                logger.info("Extração concluída com sucesso!")
                return result

            if result.get("blocked"):
                return result

            result.setdefault(
                'error',
                "Não foi possível extrair a cifra desta página sem o Selenium.",
            )
            
        except RequestException as e:
            logger.error(f"Erro de requisição HTTP: {e}")
            result['error'] = f"Erro ao acessar o Cifra Club. Detalhe: {str(e)}"
            upstream_response = getattr(e, "response", None)
            upstream_status = getattr(upstream_response, "status_code", None)
            upstream_body = (getattr(upstream_response, "text", "") or "")[:500]
            result['upstream_status'] = upstream_status
            result['upstream_body'] = upstream_body
            result['blocked'] = (
                upstream_status in {403, 429}
                or bool(BLOCKED_BODY_PATTERN.search(upstream_body))
            )
        except Exception as e:
            logger.error(f"Erro inesperado: {e}")
            result['error'] = f"Erro inesperado: {str(e)}"

        return result
