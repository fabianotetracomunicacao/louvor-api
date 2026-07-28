# Importacao de Cifras por Artista Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir que super administradores adicionem artistas a uma fila persistente que importa, deduplica e salva suas cifras automaticamente.

**Architecture:** O React cria e acompanha trabalhos no Supabase. Uma Edge Function acionada por cron reivindica um item por execucao, consulta a API Python existente, converte a cifra e salva a musica; tabelas e RPCs mantem fila, leases, contadores e retomada.

**Tech Stack:** React 19, Vite, Vitest, Flask, Python unittest, Supabase Postgres/RLS/RPC, Supabase Edge Functions/Deno.

## Global Constraints

- Acesso da interface e das operacoes de fila restrito a `super_admin`.
- Processar somente uma musica por vez, com proxima execucao entre 30 e 60 segundos.
- Pausar em `429`, `403`, CAPTCHA ou resposta equivalente; nunca contornar essas protecoes.
- Nunca sobrescrever musica existente.
- Mesmo titulo e mesmo artista devem ser ignorados; mesmo titulo com artista diferente deve ser salvo.
- Titulo e artista canonicos da pagina individual tem prioridade.
- O navegador pode ser fechado sem interromper a fila.
- Nao alterar nem limpar as mudancas locais existentes em `.DS_Store` e `lp-api-main`.

---

## Estrutura de arquivos

- `supabase/migrations/20260728170000_create_cifraclub_import_queue.sql`: tabelas, indices, RLS, RPCs, lease e cron.
- `api.py`: endpoints de sugestao de artistas e catalogo exato.
- `tests/python/test_artist_catalog_api.py`: testes isolados da API Flask.
- `supabase/functions/_shared/cifraImporter.ts`: conversor puro de cifra para o formato interno.
- `supabase/functions/_shared/importQueue.ts`: normalizacao, classificacao de erro e calculo de espera.
- `supabase/functions/cifraclub-import-worker/index.ts`: reivindicacao, coleta, deduplicacao, insercao e progresso.
- `supabase/functions/cifraclub-import-worker/worker.test.ts`: testes Deno das funcoes puras do processador.
- `src/services/cifraclubImportQueue.js`: cliente de pesquisa e RPCs da fila.
- `src/services/__tests__/cifraclubImportQueue.test.js`: contrato do cliente.
- `src/pages/AdminCifraclubImportPage.jsx`: busca, selecao, inclusao e monitoramento da fila.
- `src/pages/__tests__/AdminCifraclubImportPage.test.jsx`: comportamento da pagina.
- `src/App.jsx`: rota protegida.
- `src/components/MainLayout.jsx`: entrada no menu de super admin.
- `src/utils/storage.js`: persistencia correta de `cifraclub_slug` no fluxo manual.
- `src/utils/__tests__/storageCifraclubSlug.test.js`: regressao do salvamento manual.

### Task 1: Banco e contrato duravel da fila

**Files:**
- Create: `supabase/migrations/20260728170000_create_cifraclub_import_queue.sql`

**Interfaces:**
- Produces: RPCs `enqueue_cifraclub_import(text,text,int)`, `cancel_cifraclub_import(uuid)`, `retry_cifraclub_import_failures(uuid)`, `claim_cifraclub_import_work(int)` e `finish_cifraclub_import_item(uuid,text,uuid,text,timestamptz)`.
- Produces: tabelas `cifraclub_import_jobs` e `cifraclub_import_items`.

- [ ] **Step 1: Escrever a migracao com estados, restricoes e indices**

```sql
create table public.cifraclub_import_jobs (
  id uuid primary key default gen_random_uuid(),
  artist_name text not null,
  artist_slug text not null check (artist_slug ~ '^[a-z0-9-]+$'),
  status text not null default 'pending'
    check (status in ('pending','discovering','processing','completed',
      'completed_with_errors','paused','cancelled')),
  total_count integer not null default 0,
  imported_count integer not null default 0,
  skipped_count integer not null default 0,
  failed_count integer not null default 0,
  next_run_at timestamptz not null default now(),
  lease_until timestamptz,
  last_error text,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index cifraclub_import_one_active_artist
  on public.cifraclub_import_jobs (artist_slug)
  where status in ('pending','discovering','processing','paused');
```

Criar `cifraclub_import_items` com `job_id`, nomes/slugs descobertos, estado,
tentativas, `song_id`, `last_error`, `lease_until` e unicidade
`(job_id, song_slug)`.

- [ ] **Step 2: Adicionar RLS e RPCs de super admin**

```sql
create or replace function public.is_super_admin()
returns boolean language sql stable security definer set search_path = public
as $$ select exists (
  select 1 from public.profiles
  where id = auth.uid() and role = 'super_admin'
) $$;
```

Permitir `select` somente quando `is_super_admin()` e negar escrita direta ao
cliente. As RPCs administrativas validam a funcao antes de inserir, cancelar
ou reabrir falhas. `enqueue_cifraclub_import` usa `auth.uid()` em `created_by`.

- [ ] **Step 3: Implementar reivindicacao atomica e recuperacao de lease**

```sql
select id into selected_item
from public.cifraclub_import_items
where status = 'pending'
   or (status = 'processing' and lease_until < now())
order by created_at
for update skip locked
limit 1;
```

`claim_cifraclub_import_work(120)` deve escolher o trabalho ativo mais antigo,
respeitar `next_run_at`, marcar item como `processing` e devolver job + item.
Quando ainda nao houver itens, deve devolver o job com `needs_discovery=true`.

- [ ] **Step 4: Validar a migracao localmente**

Run: `supabase db reset`

Expected: migracoes aplicadas sem erro; as duas tabelas e cinco RPCs existem.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260728170000_create_cifraclub_import_queue.sql
git commit -m "feat: add durable chord import queue"
```

### Task 2: Pesquisa explicita de artista e catalogo na API

**Files:**
- Modify: `api.py`
- Create: `tests/python/test_artist_catalog_api.py`

**Interfaces:**
- Produces: `GET /api/artists/suggest?q=<texto>` com `{artists:[{id,name,slug}]}`
- Produces: `GET /api/artists/<slug>/catalog` com `{artist,songs,total}`

- [ ] **Step 1: Escrever testes Flask com upstream simulado**

```python
def test_artist_suggest_returns_distinct_candidates(client, mocked_requests):
    mocked_requests.get.return_value.json.return_value = {
        "artists": [
            {"id": 10, "name": "Fernandinho", "slug": "fernandinho"},
            {"id": 11, "name": "Fernando", "slug": "fernando"},
        ]
    }
    response = client.get("/api/artists/suggest?q=fernando")
    assert response.status_code == 200
    assert response.json["artists"][0]["slug"] == "fernandinho"

def test_catalog_requires_exact_selected_slug(client, mocked_requests):
    response = client.get("/api/artists/INVALID/catalog")
    assert response.status_code == 400
```

- [ ] **Step 2: Rodar e confirmar falha**

Run: `python -m unittest tests.python.test_artist_catalog_api -v`

Expected: FAIL com rotas retornando `404`.

- [ ] **Step 3: Extrair helpers e implementar as rotas**

```python
def _suggest_artists(query: str) -> list[dict]:
    response = requests.get(
        CIFRACLUB_ARTISTS_SUGGEST_URL,
        params={"q": query}, headers=DEFAULT_HEADERS,
        impersonate="chrome110", timeout=10,
    )
    response.raise_for_status()
    return _sanitize_artist_candidates(response.json().get("artists", []))

@app.get("/api/artists/<artist_slug>/catalog")
def artist_catalog(artist_slug):
    if not re.fullmatch(r"[a-z0-9-]+", artist_slug):
        return jsonify({"error": "Invalid artist slug"}), 400
    return jsonify(_catalog_for_selected_artist(artist_slug))
```

Resolver o `artist_id` pela sugestao, exigir igualdade do slug escolhido e
retornar todos os itens distintos por `(artist_slug, song_slug)`.

- [ ] **Step 4: Rodar os testes**

Run: `python -m unittest tests.python.test_artist_catalog_api -v`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add api.py tests/python/test_artist_catalog_api.py
git commit -m "feat: expose artist selection and catalog endpoints"
```

### Task 3: Conversor compartilhado e regras puras do worker

**Files:**
- Create: `supabase/functions/_shared/cifraImporter.ts`
- Create: `supabase/functions/_shared/importQueue.ts`
- Create: `supabase/functions/cifraclub-import-worker/worker.test.ts`

**Interfaces:**
- Produces: `parseCifraClub(lines: string[]): {content:string, originalKey:string|null}`
- Produces: `normalizeIdentity(value:string): string`
- Produces: `classifyUpstream(status:number, body:string): 'blocked'|'temporary'|'permanent'`
- Produces: `nextRunAt(now:Date, random:()=>number): Date`

- [ ] **Step 1: Portar os casos do importador atual para testes Deno**

```ts
Deno.test("converte acordes sobre a letra", () => {
  const result = parseCifraClub(["G       D", "Deus de promessas"]);
  assertEquals(result.content, "[G]Deus de [D]promessas");
});

Deno.test("identidade ignora acento, caixa e pontuacao", () => {
  assertEquals(normalizeIdentity("  Além do Véu! "), "alem do veu");
});

Deno.test("403 e captcha pausam a fila", () => {
  assertEquals(classifyUpstream(403, ""), "blocked");
  assertEquals(classifyUpstream(200, "captcha challenge"), "blocked");
});
```

- [ ] **Step 2: Rodar e confirmar falha**

Run: `deno test supabase/functions/cifraclub-import-worker/worker.test.ts`

Expected: FAIL por modulos ausentes.

- [ ] **Step 3: Implementar as funcoes puras**

Portar a deteccao de acordes e secoes de `src/utils/importer.js`, sem chamadas
de rede. `nextRunAt` deve produzir de 30 a 60 segundos:

```ts
export function nextRunAt(now: Date, random = Math.random): Date {
  const seconds = 30 + Math.floor(random() * 31);
  return new Date(now.getTime() + seconds * 1000);
}
```

- [ ] **Step 4: Rodar os testes**

Run: `deno test supabase/functions/cifraclub-import-worker/worker.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/_shared supabase/functions/cifraclub-import-worker/worker.test.ts
git commit -m "feat: add server chord conversion rules"
```

### Task 4: Edge Function que processa a fila

**Files:**
- Create: `supabase/functions/cifraclub-import-worker/index.ts`
- Modify: `supabase/migrations/20260728170000_create_cifraclub_import_queue.sql`
- Test: `supabase/functions/cifraclub-import-worker/worker.test.ts`

**Interfaces:**
- Consumes: RPCs da Task 1, API da Task 2 e funcoes puras da Task 3.
- Produces: `POST /functions/v1/cifraclub-import-worker`.

- [ ] **Step 1: Adicionar testes do fluxo com dependencias injetadas**

```ts
Deno.test("titulo igual com artista diferente e importado", async () => {
  const result = await processClaim(fixtureClaim, {
    findDuplicate: async () => null,
    fetchCifra: async () => fixtureCifra,
    insertSong: async () => ({ id: "song-1" }),
    finish: async () => undefined,
  });
  assertEquals(result.status, "imported");
});

Deno.test("slug existente e ignorado sem baixar cifra", async () => {
  let fetched = false;
  const result = await processClaim(fixtureClaim, {
    findDuplicate: async () => ({ id: "existing" }),
    fetchCifra: async () => { fetched = true; return fixtureCifra; },
    insertSong: async () => ({ id: "never" }),
    finish: async () => undefined,
  });
  assertEquals(result.status, "skipped");
  assertEquals(fetched, false);
});
```

- [ ] **Step 2: Rodar e confirmar falha**

Run: `deno test supabase/functions/cifraclub-import-worker/worker.test.ts`

Expected: FAIL com `processClaim` ausente.

- [ ] **Step 3: Implementar descoberta, item e pausa**

```ts
export async function processClaim(claim: ImportClaim, deps: WorkerDeps) {
  const duplicate = await deps.findDuplicate(claim);
  if (duplicate) return deps.finish(claim.itemId, "skipped", duplicate.id);

  const response = await deps.fetchCifra(claim.artistSlug, claim.songSlug);
  const classification = classifyUpstream(response.status, response.body);
  if (classification === "blocked") return deps.pause(claim.jobId, response.status);

  const canonical = validateCanonical(response.data);
  const duplicateAfterFetch = await deps.findCanonicalDuplicate(canonical);
  if (duplicateAfterFetch) {
    return deps.finish(claim.itemId, "skipped", duplicateAfterFetch.id);
  }
  const song = await deps.insertSong(buildSongPayload(claim, canonical));
  return deps.finish(claim.itemId, "imported", song.id);
}
```

Quando `needs_discovery=true`, buscar o catalogo e inserir itens por upsert.
Conflito do indice `cifraclub_slug` vira `skipped`. A musica recebe
`created_by` do trabalho, `is_official=false`, URL de origem e o conteudo
convertido.

- [ ] **Step 4: Configurar cron autenticado**

Na migracao, criar um segredo aleatorio no Vault, uma funcao SQL que o valida
e um `cron.schedule('* * * * *', ...)` que chama a Edge Function via
`net.http_post`. A funcao deve rejeitar requisicoes sem `x-worker-secret`.

- [ ] **Step 5: Rodar testes e checagem**

Run: `deno test supabase/functions/cifraclub-import-worker/worker.test.ts`

Run: `deno check supabase/functions/cifraclub-import-worker/index.ts`

Expected: PASS e nenhum erro de tipos.

- [ ] **Step 6: Commit**

```bash
git add supabase/functions supabase/migrations/20260728170000_create_cifraclub_import_queue.sql
git commit -m "feat: process chord imports in scheduled worker"
```

### Task 5: Cliente de fila e regressao do slug manual

**Files:**
- Create: `src/services/cifraclubImportQueue.js`
- Create: `src/services/__tests__/cifraclubImportQueue.test.js`
- Modify: `src/utils/storage.js`
- Create: `src/utils/__tests__/storageCifraclubSlug.test.js`

**Interfaces:**
- Produces: `searchArtists(query)`, `enqueueArtist(artist)`, `listImportJobs()`,
  `cancelImportJob(id)`, `retryImportFailures(id)` e `subscribeToImportJobs(cb)`.

- [ ] **Step 1: Escrever testes de contrato**

```js
it('envia o artista selecionado para a RPC', async () => {
  await enqueueArtist({ name: 'Oficina G3', slug: 'oficina-g3', total: 80 });
  expect(supabase.rpc).toHaveBeenCalledWith('enqueue_cifraclub_import', {
    p_artist_name: 'Oficina G3',
    p_artist_slug: 'oficina-g3',
    p_estimated_total: 80,
  });
});

it('inclui cifraclub_slug no salvamento manual', async () => {
  await saveSong({ title: 'Galileu', artist: 'Fernandinho',
    content: '[G]Galileu', cifraclub_slug: 'fernandinho/galileu' });
  expect(insertPayload.cifraclub_slug).toBe('fernandinho/galileu');
});
```

- [ ] **Step 2: Rodar e confirmar falha**

Run: `npm test -- --run src/services/__tests__/cifraclubImportQueue.test.js src/utils/__tests__/storageCifraclubSlug.test.js`

Expected: FAIL por servico ausente e slug omitido.

- [ ] **Step 3: Implementar servico e corrigir payload**

```js
const dbPayload = {
  // campos existentes
  cifraclub_slug: songData.cifraclub_slug || songData.cifraclubSlug || null,
  is_official: songData.is_official ?? songData.isOfficial ?? false,
};
```

O servico usa `VITE_CIFRA_API_URL`, RPCs do Supabase e Realtime nas duas
tabelas, retornando unsubscribe para limpeza do componente.

- [ ] **Step 4: Rodar testes**

Run: `npm test -- --run src/services/__tests__/cifraclubImportQueue.test.js src/utils/__tests__/storageCifraclubSlug.test.js`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/services/cifraclubImportQueue.js src/services/__tests__ src/utils/storage.js src/utils/__tests__/storageCifraclubSlug.test.js
git commit -m "feat: add chord import queue client"
```

### Task 6: Pagina administrativa e navegacao

**Files:**
- Create: `src/pages/AdminCifraclubImportPage.jsx`
- Create: `src/pages/__tests__/AdminCifraclubImportPage.test.jsx`
- Modify: `src/App.jsx`
- Modify: `src/components/MainLayout.jsx`

**Interfaces:**
- Consumes: servico da Task 5 e `useAuth().isSuperAdmin`.
- Produces: rota `/admin/cifraclub-imports`.

- [ ] **Step 1: Escrever testes da experiencia**

```jsx
it('exige selecao antes de adicionar e mantem a busca liberada', async () => {
  render(<AdminCifraclubImportPage />);
  await user.type(screen.getByRole('searchbox'), 'Fernandinho');
  await user.click(screen.getByRole('button', { name: /buscar/i }));
  await user.click(screen.getByRole('option', { name: /fernandinho/i }));
  await user.click(screen.getByRole('button', { name: /adicionar à fila/i }));
  expect(enqueueArtist).toHaveBeenCalledWith(expect.objectContaining({
    slug: 'fernandinho',
  }));
  expect(screen.getByRole('searchbox')).toBeEnabled();
});
```

Adicionar casos para progresso, estado pausado, erros, cancelamento permitido
e tentativa apenas em `completed_with_errors`.

- [ ] **Step 2: Rodar e confirmar falha**

Run: `npm test -- --run src/pages/__tests__/AdminCifraclubImportPage.test.jsx`

Expected: FAIL por pagina ausente.

- [ ] **Step 3: Implementar a pagina**

Usar controles compactos e os icones Lucide `Search`, `ListMusic`,
`CirclePause`, `RotateCcw`, `XCircle` e `CheckCircle2`. A pagina deve conter:

```jsx
<form role="search" onSubmit={handleSearch}>...</form>
<section aria-label="Resultados de artistas">...</section>
<section aria-label="Fila de importação">...</section>
```

Exibir artista atual, ordem, barra de progresso e contadores. Nao bloquear a
busca durante a importacao. Atualizar por Realtime e fazer polling de seguranca
a cada 30 segundos.

- [ ] **Step 4: Adicionar rota e menu**

```jsx
<Route path="/admin/cifraclub-imports"
  element={<SuperAdminRoute><AdminCifraclubImportPage /></SuperAdminRoute>} />
```

Adicionar `Importar cifras` ao grupo de super admin do `MainLayout`.

- [ ] **Step 5: Rodar testes e build**

Run: `npm test -- --run src/pages/__tests__/AdminCifraclubImportPage.test.jsx`

Run: `npm run build`

Expected: testes PASS e build concluido.

- [ ] **Step 6: Commit**

```bash
git add src/pages/AdminCifraclubImportPage.jsx src/pages/__tests__/AdminCifraclubImportPage.test.jsx src/App.jsx src/components/MainLayout.jsx
git commit -m "feat: add admin artist import queue"
```

### Task 7: Implantacao e verificacao integrada

**Files:**
- Modify: `.env.example`
- Create: `docs/cifraclub-import-operations.md`

**Interfaces:**
- Consumes: migracao, Edge Function, API e painel concluídos.

- [ ] **Step 1: Documentar configuracao operacional**

Registrar `VITE_CIFRA_API_URL`, implantacao da funcao, aplicacao da migracao,
consulta da fila, pausa manual e ajuste dos limites. Nao registrar segredos.

- [ ] **Step 2: Aplicar banco e publicar worker**

Run: `supabase db push`

Run: `supabase functions deploy cifraclub-import-worker --no-verify-jwt`

Expected: migracao aplicada e funcao publicada.

- [ ] **Step 3: Executar a bateria completa**

Run: `python -m unittest discover -s tests/python -v`

Run: `deno test supabase/functions/cifraclub-import-worker/worker.test.ts`

Run: `npm test -- --run`

Run: `npm run build`

Expected: todos os comandos concluem sem falhas.

- [ ] **Step 4: Teste de fumaca sem importar catalogo inteiro**

Adicionar um artista de teste pelo painel, confirmar criacao do trabalho e
execucao de um unico item. Verificar no Supabase que `created_by`, `title`,
`artist`, `content` e `cifraclub_slug` foram gravados; cancelar o restante do
trabalho de teste pela interface.

- [ ] **Step 5: Commit**

```bash
git add .env.example docs/cifraclub-import-operations.md
git commit -m "docs: add chord import operations guide"
```

