import unittest
from unittest.mock import patch

import api


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

    def test_catalog_rejects_when_upstream_has_no_exact_slug_match(self):
        self.requests_get.return_value.json.return_value = {
            "artists": [{"id": 10, "name": "Fernandinho", "slug": "fernandinho"}]
        }

        response = self.client.get("/api/artists/fernando/catalog")

        self.assertEqual(response.status_code, 404)
        self.assertEqual(response.json, {"error": "Artist not found"})
        self.assertEqual(self.requests_get.call_count, 1)


if __name__ == "__main__":
    unittest.main()
