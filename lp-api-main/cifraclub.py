"""CifraClub Module"""

import logging
import re
import requests
from bs4 import BeautifulSoup

CIFRACLUB_URL = "https://www.cifraclub.com.br/"
DEFAULT_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/131.0.0.0 Safari/537.36"
    )
}

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
        response.raise_for_status()

        soup = BeautifulSoup(response.text, "html.parser")

        title_elem = soup.select_one("h1.t1") or soup.find("h1")
        artist_elem = soup.select_one("h2.t3") or soup.find("h2")
        pre_elem = soup.select_one("div.cifra_cnt pre") or soup.find("pre")
        
        # Extrair estilo/gênero do breadcrumb (ex: Gospel/Religioso)
        style_elem = soup.select_one('nav.breadcrumb a[href*="/estilos/"]') or \
                     soup.select_one('div.breadcrumb a[href*="/estilos/"]')
        
        if not pre_elem:
            return False

        result["name"] = title_elem.get_text(strip=True) if title_elem else "Título não encontrado"
        result["artist"] = artist_elem.get_text(strip=True) if artist_elem else "Artista não encontrado"
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

            result['error'] = "Não foi possível extrair a cifra desta página sem o Selenium."
            
        except requests.RequestException as e:
            logger.error(f"Erro de requisição HTTP: {e}")
            result['error'] = f"Erro ao acessar o Cifra Club. Detalhe: {str(e)}"
        except Exception as e:
            logger.error(f"Erro inesperado: {e}")
            result['error'] = f"Erro inesperado: {str(e)}"

        return result
