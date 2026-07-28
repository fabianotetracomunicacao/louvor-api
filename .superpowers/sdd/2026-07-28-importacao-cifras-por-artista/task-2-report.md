# Task 2 - Pesquisa explicita de artista e catalogo na API

## Status

Implementado no worktree `louvorplay-artist-import`.

## Entregas

- `GET /api/artists/suggest?q=<texto>` retorna candidatos sanitizados com `id`, `name` e `slug`.
- `GET /api/artists/<slug>/catalog` valida o slug, exige correspondencia exata na sugestao upstream e retorna o catalogo desduplicado por `(artist_slug, song_slug)`.
- Slugs invalidos retornam `400`; quando nao ha correspondencia exata para o slug solicitado, a API retorna `404` sem consultar o catalogo de outro artista.
- Os testes Flask simulam todas as chamadas upstream com `patch("api.requests.get")`.

## TDD e verificacao

- RED: `python3 -m unittest tests.python.test_artist_catalog_api -v` falhou com quatro respostas `404`, pois as rotas ainda nao existiam.
- GREEN: `python3 -m unittest tests.python.test_artist_catalog_api -v` passou com 4 testes.
- O executavel `python` nao esta instalado neste ambiente; a verificacao final usa `python3 -B` para evitar gerar bytecode.

## Escopo

Foram alterados somente `api.py`, `tests/python/test_artist_catalog_api.py` e este relatorio. Nenhum arquivo em `lp-api-main` foi tocado.
