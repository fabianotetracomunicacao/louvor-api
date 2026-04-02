# LP-API

API em Python/Flask para buscar cifras e metadados de músicas a partir do Cifra Club.

O projeto expõe endpoints HTTP para:

- pesquisar músicas por nome, artista ou combinação artista + música
- obter a cifra completa de uma música específica
- verificar saúde da aplicação

A aplicação prioriza uma extração rápida usando `requests` + `BeautifulSoup`. Quando isso não é suficiente, faz fallback para **Selenium com Firefox** para ler a página e extrair os dados.

## Stack atual

- Python 3.11
- Flask
- requests
- BeautifulSoup
- Selenium
- Firefox via container `selenium/standalone-firefox`
- Docker / Docker Compose

## Como a aplicação funciona hoje

O `docker-compose.yml` sobe **2 serviços**:

- `app`: API Flask
- `selenium`: navegador Firefox remoto usado pelo Selenium

Fluxo resumido da busca de cifra:

1. a API monta a URL da música no Cifra Club
2. tenta extrair título, artista, YouTube e cifra via `requests`
3. se não conseguir obter a cifra pelo HTML simples, usa Selenium
4. devolve o resultado em JSON

Além disso, a rota de busca `/api/search` tenta múltiplas fontes:

- endpoint principal de sugestões do Cifra Club
- endpoint alternativo de sugestões
- catálogo de músicas do artista
- fallback por parsing de HTML da busca pública

## Estrutura do projeto

```text
.
├── app/
│   ├── __init__.py
│   ├── api.py
│   ├── cifraclub.py
│   └── requirements.txt
├── cli/
│   ├── cifra.py
│   └── requirements.txt
├── Dockerfile
├── docker-compose.yml
├── Makefile
└── README.md
```

## Endpoints disponíveis

### `GET /health`

Healthcheck simples da API.

Exemplo:

```bash
curl http://localhost:3000/health
```

Resposta esperada:

```json
{
  "status": "healthy"
}
```

---

### `GET /api/search?q=<consulta>&page=<n>`

Pesquisa músicas no Cifra Club.

Parâmetros:

- `q` obrigatório
- `page` opcional, padrão `1`

Exemplos:

```bash
curl "http://localhost:3000/api/search?q=coldplay"
```

```bash
curl "http://localhost:3000/api/search?q=coldplay%20the%20scientist&page=1"
```

```bash
curl "http://localhost:3000/api/search?q=oficina-g3-indefinido"
```

Exemplo de resposta:

```json
{
  "results": [
    {
      "artist": "Coldplay",
      "name": "The Scientist",
      "artist_slug": "coldplay",
      "song_slug": "the-scientist",
      "url": "https://www.cifraclub.com.br/coldplay/the-scientist"
    }
  ],
  "pagination": {
    "page": 1,
    "per_page": 15,
    "total": 1,
    "total_pages": 1,
    "has_prev": false,
    "has_next": false
  }
}
```

Possíveis erros:

- `400` quando `q` não é informado
- `400` quando `page` é inválido
- `502` quando a consulta ao upstream falha
- `500` em erro interno

---

### `GET /artists/<artist>/songs/<song>`

Obtém a cifra e os metadados de uma música específica.

Exemplo:

```bash
curl http://localhost:3000/artists/coldplay/songs/the-scientist
```

Exemplo de resposta:

```json
{
  "artist": "Coldplay",
  "name": "The Scientist",
  "youtube_url": "https://www.youtube.com/watch?v=RB-RcX5DS5A",
  "cifraclub_url": "https://www.cifraclub.com.br/coldplay/the-scientist",
  "cifra": [
    "[Intro]  C#m7  A9  E  E9",
    "",
    "[Primeira Parte]"
  ]
}
```

Observações:

- `artist` e `song` devem ser informados em formato slug
- exemplo: `coldplay` e `the-scientist`
- a API retorna `500` se houver falha na extração

## Como rodar localmente

### Pré-requisitos

- Docker
- Docker Compose

### Subindo com Docker Compose

```bash
docker compose build
docker compose up
```

Ou, dependendo da sua instalação:

```bash
docker-compose build
docker-compose up
```

A aplicação ficará disponível em:

- API: `http://localhost:3000`
- Selenium: `http://localhost:4444`

### Usando Makefile

Se o `Makefile` do projeto estiver configurado no seu ambiente:

```bash
make up
```

## Como testar rapidamente

### Healthcheck

```bash
curl http://localhost:3000/health
```

### Buscar músicas

```bash
curl "http://localhost:3000/api/search?q=the%20scientist"
```

### Buscar cifra diretamente

```bash
curl http://localhost:3000/artists/coldplay/songs/the-scientist
```

## Como funciona o Selenium neste projeto

A API não usa um navegador embutido no container principal.

Hoje o projeto está preparado para usar um serviço separado no Compose:

```yaml
selenium:
  image: selenium/standalone-firefox:latest
  ports:
    - "4444:4444"
  shm_size: 2g
```

No código, o WebDriver é inicializado com:

```python
webdriver.Remote(
    command_executor="http://selenium:4444/wd/hub",
    options=firefox_options
)
```

Ou seja:

- sem o container `selenium`, o fallback com Selenium não funciona
- a extração por `requests` pode funcionar mesmo sem Selenium, mas não cobre todos os casos

## Variáveis e comportamento de runtime

A aplicação usa principalmente:

- `PORT` → porta da API, padrão `3000`
- `FLASK_DEBUG` → ativa modo debug quando definido como `1`, `true` ou `yes`
- `PYTHONUNBUFFERED=1` → usado no Compose para logs sem buffer

## Dependências Python atuais

Arquivo `app/requirements.txt`:

- Flask==3.0.0
- beautifulsoup4==4.12.2
- selenium==4.15.2
- Werkzeug==3.0.1
- requests==2.31.0

## CLI incluída no projeto

O diretório `cli/` contém um utilitário simples para consumir a API localmente.

Exemplo conceitual:

```bash
python cifra.py get coldplay the-scientist
```

Ele usa por padrão:

- `CIFRACLUB_API_URL=http://localhost:3000`

## Limitações atuais

Pontos importantes do estado atual da aplicação:

- depende da estrutura HTML atual do Cifra Club
- mudanças no site podem quebrar a extração
- a rota principal de cifra ainda responde com erro `500` em falhas de scraping
- o frontend está referenciado via pasta `static`, mas essa pasta não faz parte desta cópia atual do repositório enviada no ZIP
- o Selenium depende de um segundo serviço no Compose
- ainda não há cache nativo no projeto original

## Quando usar este projeto

Este projeto é útil quando você precisa:

- consultar cifras por API
- integrar cifras em outro sistema
- automatizar busca de músicas e metadados
- usar uma camada de scraping controlada por HTTP

## Resumo do estado atual

Hoje o repositório está estruturado como uma **API Flask com suporte a busca e scraping**, rodando localmente via Docker Compose com Selenium remoto.

Os endpoints efetivamente disponíveis no código atual são:

- `GET /health`
- `GET /api/search?q=...&page=...`
- `GET /artists/<artist>/songs/<song>`

Se a intenção for publicar isso em PaaS ou integrar em portal, o ideal é evoluir para:

- container único com Firefox local, ou
- API com cache externo, como Supabase

Mas este README descreve **o comportamento atual do repositório como ele está hoje**.
