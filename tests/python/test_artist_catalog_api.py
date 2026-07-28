import unittest
from unittest.mock import MagicMock, patch

import api
import cifraclub


class ArtistCatalogApiTestCase(unittest.TestCase):
    def setUp(self):
        api.app.config["TESTING"] = True
        self.client = api.app.test_client()
        self.requests_get = patch("api.requests.get").start()
        self.addCleanup(patch.stopall)

    def test_artist_suggest_returns_distinct_candidates(self):
        self.requests_get.return_value.json.return_value = {
            "artists": [
                {"id": 10, "name": "Fernandinho", "slug": "fernandinho"},
                {"id": 11, "name": "Fernando", "slug": "fernando"},
            ]
        }

        response = self.client.get("/api/artists/suggest?q=fernando")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            response.json,
            {
                "artists": [
                    {"id": 10, "name": "Fernandinho", "slug": "fernandinho"},
                    {"id": 11, "name": "Fernando", "slug": "fernando"},
                ]
            },
        )

    def test_catalog_rejects_invalid_artist_slug(self):
        response = self.client.get("/api/artists/INVALID/catalog")

        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json, {"error": "Invalid artist slug"})
        self.requests_get.assert_not_called()

    def test_catalog_uses_exact_selected_slug_and_deduplicates_songs(self):
        suggest_response = self.requests_get.return_value
        suggest_response.json.side_effect = [
            {
                "artists": [
                    {"id": 10, "name": "Fernandinho", "slug": "fernandinho"},
                    {"id": 11, "name": "Fernando", "slug": "fernando"},
                ]
            },
            {
                "songs": [
                    {
                        "artist_name": "Fernando",
                        "artist_slug": "fernando",
                        "name": "Canção",
                        "slug": "cancao",
                    },
                    {
                        "artist_name": "Fernando",
                        "artist_slug": "fernando",
                        "name": "Canção",
                        "slug": "cancao",
                    },
                    {
                        "artist_name": "Fernando",
                        "artist_slug": "fernando",
                        "name": "Outra",
                        "slug": "outra",
                    },
                ]
            },
        ]

        response = self.client.get("/api/artists/fernando/catalog")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            response.json,
            {
                "artist": {"id": 11, "name": "Fernando", "slug": "fernando"},
                "songs": [
                    {
                        "artist": "Fernando",
                        "name": "Canção",
                        "artist_slug": "fernando",
                        "song_slug": "cancao",
                        "url": "https://www.cifraclub.com.br/fernando/cancao",
                    },
                    {
                        "artist": "Fernando",
                        "name": "Outra",
                        "artist_slug": "fernando",
                        "song_slug": "outra",
                        "url": "https://www.cifraclub.com.br/fernando/outra",
                    },
                ],
                "total": 2,
            },
        )
        self.assertEqual(self.requests_get.call_args_list[0].kwargs["params"], {"q": "fernando"})
        self.assertEqual(
            self.requests_get.call_args_list[1].kwargs["params"],
            {"artist_ids": "11", "_sort": "pt_alphabetical"},
        )
        for call in self.requests_get.call_args_list:
            self.assertNotIn("impersonate", call.kwargs)
            self.assertEqual(
                call.kwargs["headers"]["User-Agent"],
                "LouvorPlay-CifraImporter/1.0",
            )

    def test_catalog_rejects_when_upstream_has_no_exact_slug_match(self):
        self.requests_get.return_value.json.return_value = {
            "artists": [{"id": 10, "name": "Fernandinho", "slug": "fernandinho"}]
        }

        response = self.client.get("/api/artists/fernando/catalog")

        self.assertEqual(response.status_code, 404)
        self.assertEqual(response.json, {"error": "Artist not found"})
        self.assertEqual(self.requests_get.call_count, 1)

    def test_catalog_preserves_upstream_rate_limit(self):
        upstream = MagicMock(status_code=429, text="Too many requests")
        error = api.RequestException("rate limited")
        error.response = upstream
        self.requests_get.side_effect = error

        response = self.client.get("/api/artists/fernando/catalog")

        self.assertEqual(response.status_code, 429)
        self.assertTrue(response.json["blocked"])
        self.assertEqual(response.json["upstream_status"], 429)

    def test_catalog_classifies_http_200_challenge_as_blocked(self):
        upstream = MagicMock(status_code=200, text="<html>captcha challenge</html>")
        self.requests_get.return_value = upstream

        response = self.client.get("/api/artists/fernando/catalog")

        self.assertEqual(response.status_code, 403)
        self.assertTrue(response.json["blocked"])
        self.assertEqual(response.json["upstream_status"], 200)

    @patch("api.CifraClub.cifra")
    def test_detail_preserves_upstream_block_status(self, cifra):
        cifra.return_value = {
            "error": "Forbidden by upstream",
            "upstream_status": 403,
        }

        response = self.client.get("/artists/artista/songs/cancao")

        self.assertEqual(response.status_code, 403)
        self.assertEqual(response.json["upstream_status"], 403)


class CifraClubHttpIdentityTestCase(unittest.TestCase):
    def setUp(self):
        api.app.config["TESTING"] = True
        self.client = api.app.test_client()

    @patch("cifraclub.requests.get")
    def test_detail_fetch_uses_transparent_stable_identity(self, requests_get):
        response = MagicMock()
        response.text = (
            "<h1 class='t1'>Canção</h1>"
            "<h2 class='t3'>Artista</h2>"
            "<div class='cifra_cnt'><pre>G\\nLetra</pre></div>"
        )
        requests_get.return_value = response
        result = {}

        extracted = cifraclub.CifraClub()._extract_with_requests(
            "https://www.cifraclub.com.br/artista/cancao",
            result,
        )

        self.assertTrue(extracted)
        kwargs = requests_get.call_args.kwargs
        self.assertNotIn("impersonate", kwargs)
        self.assertEqual(
            kwargs["headers"]["User-Agent"],
            "LouvorPlay-CifraImporter/1.0",
        )

    @patch("cifraclub.requests.get")
    def test_detail_preserves_upstream_forbidden_and_rate_limit(self, requests_get):
        for status in (403, 429):
            with self.subTest(status=status):
                response = MagicMock(status_code=status, text="blocked upstream")
                requests_get.return_value = response

                result = self.client.get("/artists/artista/songs/cancao")

                self.assertEqual(result.status_code, status)
                self.assertTrue(result.json["blocked"])
                self.assertEqual(result.json["upstream_status"], status)

    @patch("cifraclub.requests.get")
    def test_detail_classifies_http_200_captcha_without_pre_as_blocked(
        self,
        requests_get,
    ):
        for marker in ("captcha", "security challenge"):
            with self.subTest(marker=marker):
                response = MagicMock(
                    status_code=200,
                    text=f"<html><body>{marker}</body></html>",
                )
                requests_get.return_value = response

                result = self.client.get("/artists/artista/songs/cancao")

                self.assertEqual(result.status_code, 403)
                self.assertTrue(result.json["blocked"])
                self.assertEqual(result.json["upstream_status"], 200)
                self.assertIn(marker, result.json["upstream_body"])


if __name__ == "__main__":
    unittest.main()
