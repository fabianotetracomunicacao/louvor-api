# Selecao de Cifras no Catalogo do Artista Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Exibir o catalogo importavel de um artista com uma versao marcada por titulo e enfileirar somente as cifras selecionadas.

**Architecture:** A API filtra itens sem cifra e preserva os metadados usados para escolher a melhor versao. Um utilitario puro agrupa e seleciona o catalogo no cliente. Uma nova RPC transacional cria o trabalho e seus itens ja selecionados, permitindo que o worker atual pule a descoberta e processe diretamente a selecao.

**Tech Stack:** Flask/Python `unittest`, React 19, Vitest/Testing Library, Supabase PostgreSQL/RLS/RPC, Tailwind CSS, Lucide React.

## Global Constraints

- Nunca sobrescrever musicas existentes.
- Titulo igual do mesmo artista continua sendo ignorado pelo worker.
- Titulo igual de outro artista continua permitido como outra versao.
- Mostrar somente entradas com `provider: cifraclub`.
- Marcar inicialmente uma versao por titulo normalizado.
- Prioridade inicial: verificada, principal, com tom, ordem original e slug.
- Manter a cadencia atual de uma musica por vez.
- Nao alterar trabalhos ou itens que ja estejam na fila.
- Nao adicionar dependencia de interface ou virtualizacao.

---

### Task 1: Contrato elegivel do catalogo

**Files:**
- Modify: `api.py:359-432`
- Test: `tests/python/test_artist_catalog_api.py`

**Interfaces:**
- Consumes: objetos do endpoint CifraClub com `provider`, `version_id`, `version_label`, `version_tone` e `version_verified`.
- Produces: `GET /api/artists/<slug>/catalog` com `songs: CatalogSong[]`, contendo `name`, `song_slug`, `artist`, `artist_slug`, `url`, `provider`, `version_id`, `version_label`, `version_tone` e `version_verified`.

- [ ] **Step 1: Escrever testes que falham para filtro e metadados**

Adicionar ao teste do catalogo uma pagina com um item `provider: letras` e dois
itens `provider: cifraclub`. Verificar que somente os dois importaveis retornam
e que os campos de versao sao preservados:

```python
self.assertEqual(
    response.json["songs"][0],
    {
        "artist": "Diante do Trono",
        "artist_slug": "diante-do-trono",
        "name": "A Cancao",
        "song_slug": "a-cancao",
        "url": "https://www.cifraclub.com.br/diante-do-trono/a-cancao",
        "provider": "cifraclub",
        "version_id": 123,
        "version_label": "principal",
        "version_tone": "G",
        "version_verified": True,
    },
)
```

- [ ] **Step 2: Executar o teste e confirmar a falha**

Run:

```bash
python3 -m unittest tests.python.test_artist_catalog_api.ArtistCatalogApiTestCase.test_catalog_filters_lyrics_only_entries_and_preserves_version_metadata -v
```

Expected: FAIL porque `provider: letras` ainda aparece ou porque os metadados
de versao nao existem no payload.

- [ ] **Step 3: Implementar o filtro e o payload minimo**

No loop paginado de `_catalog_for_selected_artist`, ignorar:

```python
if song.get("provider") != "cifraclub":
    continue
```

Acrescentar ao item retornado:

```python
"provider": "cifraclub",
"version_id": song.get("version_id"),
"version_label": song.get("version_label"),
"version_tone": song.get("version_tone"),
"version_verified": song.get("version_verified") is True,
```

Manter a deduplicacao por `artist_slug + song_slug`.

- [ ] **Step 4: Executar toda a suite Python**

Run:

```bash
python3 -m unittest discover -s tests/python -v
```

Expected: todos os testes passam.

- [ ] **Step 5: Commit**

```bash
git add api.py tests/python/test_artist_catalog_api.py
git commit -m "feat(api): expose importable catalog versions"
```

---

### Task 2: Agrupamento e selecao inicial

**Files:**
- Create: `src/utils/cifraclubCatalog.js`
- Create: `src/utils/__tests__/cifraclubCatalog.test.js`

**Interfaces:**
- Consumes: `CatalogSong[]` produzido pela Task 1.
- Produces:
  - `normalizeCatalogTitle(title: string): string`
  - `rankCatalogVersions(left: CatalogSong, right: CatalogSong): number`
  - `groupCatalogSongs(songs: CatalogSong[]): CatalogGroup[]`
  - `getInitialCatalogSelection(groups: CatalogGroup[]): Set<string>`
- `CatalogGroup` possui `{ key, title, preferred, versions }`.
- A identidade selecionavel de cada versao e `song_slug`.

- [ ] **Step 1: Escrever testes que falham para normalizacao e prioridade**

Cobrir:

```js
expect(normalizeCatalogTitle('  Único, Amor! ')).toBe('unico amor');
expect(groupCatalogSongs([
    { name: 'Único Amor', song_slug: 'unico-amor-a', version_verified: false },
    { name: 'Unico Amor!', song_slug: 'unico-amor-b', version_verified: true },
])).toHaveLength(1);
expect([...getInitialCatalogSelection(groups)]).toEqual(['unico-amor-b']);
```

Adicionar casos de desempate por `version_label === 'principal'`, tom, ordem
original e slug. Confirmar que `Canção` e `Canção (Reprise)` formam grupos
distintos.

- [ ] **Step 2: Executar o teste e confirmar a falha**

Run:

```bash
npm test -- --run src/utils/__tests__/cifraclubCatalog.test.js
```

Expected: FAIL porque o modulo ainda nao existe.

- [ ] **Step 3: Implementar funcoes puras**

Normalizar com `String.prototype.normalize('NFD')`, remover marcas Unicode,
trocar caracteres nao alfanumericos por espaco e reduzir espacos.

O comparador atribui, nessa ordem:

```js
const verified = song.version_verified === true ? 1 : 0;
const principal = song.version_label?.toLowerCase() === 'principal' ? 1 : 0;
const hasTone = song.version_tone?.trim() ? 1 : 0;
```

`groupCatalogSongs` preserva `originalIndex`, ordena as versoes pela prioridade
e usa a primeira como `preferred`. `getInitialCatalogSelection` cria um
`Set` com o `song_slug` preferido de cada grupo.

- [ ] **Step 4: Executar o teste**

Run:

```bash
npm test -- --run src/utils/__tests__/cifraclubCatalog.test.js
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/utils/cifraclubCatalog.js src/utils/__tests__/cifraclubCatalog.test.js
git commit -m "feat: group and rank catalog versions"
```

---

### Task 3: RPC de enfileiramento seletivo

**Files:**
- Create: `supabase/migrations/20260729180000_enqueue_selected_cifraclub_import.sql`
- Modify: `scripts/validate-cifraclub-import-queue.cjs`

**Interfaces:**
- Consumes: `public.enqueue_selected_cifraclub_import(text, text, jsonb)`.
- Produces: um `cifraclub_import_jobs` em `processing` e itens `pending`.
- O JSON aceito contem objetos `{ name: string, song_slug: string }`.

- [ ] **Step 1: Acrescentar validacao estatica que falha**

Exigir no validador:

```js
expectMigration(/create or replace function public\.enqueue_selected_cifraclub_import\(/);
expectMigration(/jsonb_to_recordset\(p_songs\)/);
expectMigration(/grant execute on function public\.enqueue_selected_cifraclub_import\(text, text, jsonb\) to authenticated/);
```

Tambem validar `public.is_super_admin()`, rejeicao de array vazio, insercao dos
itens e atualizacao de `total_count` pela contagem inserida.

- [ ] **Step 2: Executar e confirmar a falha**

Run:

```bash
node scripts/validate-cifraclub-import-queue.cjs
```

Expected: FAIL informando que a RPC seletiva nao existe.

- [ ] **Step 3: Criar a migracao transacional**

A funcao:

```sql
create or replace function public.enqueue_selected_cifraclub_import(
  p_artist_name text,
  p_artist_slug text,
  p_songs jsonb
)
returns public.cifraclub_import_jobs
language plpgsql
security definer
set search_path = public
```

deve:

1. exigir `public.is_super_admin()`;
2. validar artista, slug e `jsonb_typeof(p_songs) = 'array'`;
3. rejeitar arrays vazios ou maiores que 5000;
4. criar o trabalho inicialmente em `processing`;
5. inserir itens validos via `jsonb_to_recordset`, deduplicados por slug;
6. rejeitar a transacao se nenhum item valido for inserido;
7. atualizar `total_count` com a contagem persistida;
8. revogar acesso publico e conceder `execute` somente a `authenticated`.

Todos os passos vivem na mesma funcao, de modo que qualquer excecao reverta o
trabalho e os itens.

- [ ] **Step 4: Executar validacao estatica**

Run:

```bash
node scripts/validate-cifraclub-import-queue.cjs
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260729180000_enqueue_selected_cifraclub_import.sql scripts/validate-cifraclub-import-queue.cjs
git commit -m "feat(db): enqueue selected catalog songs"
```

---

### Task 4: Cliente da fila seletiva

**Files:**
- Modify: `src/services/cifraclubImportQueue.js`
- Test: `src/services/__tests__/cifraclubImportQueue.test.js`

**Interfaces:**
- Consumes: payload da API da Task 1 e RPC da Task 3.
- Produces:
  - `previewArtistCatalog(artist)` com `songs` e `total`;
  - `enqueueArtistSelection(artist, selectedSongs)`.

- [ ] **Step 1: Escrever testes que falham**

Verificar que a previa preserva `songs` e que:

```js
await enqueueArtistSelection(artist, selectedSongs);
expect(supabase.rpc).toHaveBeenCalledWith(
    'enqueue_selected_cifraclub_import',
    {
        p_artist_name: 'Diante do Trono',
        p_artist_slug: 'diante-do-trono',
        p_songs: [
            { name: 'A Cancao', song_slug: 'a-cancao' },
        ],
    },
);
```

Cobrir rejeicao local de selecao vazia e de item sem nome/slug.

- [ ] **Step 2: Executar e confirmar a falha**

Run:

```bash
npm test -- --run src/services/__tests__/cifraclubImportQueue.test.js
```

Expected: FAIL porque `enqueueArtistSelection` nao existe e a previa descarta
`songs`.

- [ ] **Step 3: Implementar o cliente**

`previewArtistCatalog` valida que `payload.songs` e array e retorna:

```js
return {
    ...artist,
    id: canonicalArtist.id ?? artist.id,
    name: canonicalArtist.name,
    slug: canonicalArtist.slug,
    total: payload.songs.length,
    songs: payload.songs,
};
```

`enqueueArtistSelection` projeta somente `name` e `song_slug` antes de chamar a
RPC, impedindo envio de metadados desnecessarios.

- [ ] **Step 4: Executar testes do cliente**

Run:

```bash
npm test -- --run src/services/__tests__/cifraclubImportQueue.test.js
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/services/cifraclubImportQueue.js src/services/__tests__/cifraclubImportQueue.test.js
git commit -m "feat: enqueue selected catalog songs"
```

---

### Task 5: Componente seletor de catalogo

**Files:**
- Create: `src/components/ArtistCatalogSelector.jsx`
- Create: `src/components/__tests__/ArtistCatalogSelector.test.jsx`

**Interfaces:**
- Props:
  - `artist`
  - `selectedSlugs: Set<string>`
  - `onSelectionChange(next: Set<string>)`
  - `onEnqueue()`
  - `isEnqueueing: boolean`
- Consumes: utilitarios da Task 2.

- [ ] **Step 1: Escrever testes de interacao que falham**

Cobrir:

- uma versao preferida marcada por grupo;
- alternativas recolhidas e expansao por botao;
- checkbox independente por `song_slug`;
- busca por titulo;
- `Selecionar visiveis` marca o preferido de grupos visiveis sem selecao;
- `Limpar selecao` zera o conjunto;
- contador atualizado;
- envio desabilitado com zero selecionadas.

Usar nomes acessiveis:

```js
screen.getByRole('checkbox', { name: /A Cancao.*principal/i });
screen.getByRole('button', { name: 'Mostrar versões de A Cancao' });
screen.getByRole('button', { name: /Adicionar 2 selecionadas à fila/i });
```

- [ ] **Step 2: Executar e confirmar a falha**

Run:

```bash
npm test -- --run src/components/__tests__/ArtistCatalogSelector.test.jsx
```

Expected: FAIL porque o componente nao existe.

- [ ] **Step 3: Implementar o componente**

Usar `Search`, `ChevronDown`, `ChevronUp`, `CheckCircle2` e `ListMusic` do
Lucide. Manter:

- toolbar responsiva sem cards aninhados;
- lista com `max-h-[32rem] overflow-y-auto`;
- grupos como linhas com borda inferior;
- checkbox nativo;
- metadados compactos de tom, principal e verificada;
- botoes de comando com texto claro;
- expansao controlada por `Set` de chaves de grupo.

Nao renderizar alternativas enquanto o grupo estiver recolhido.

- [ ] **Step 4: Executar testes do componente**

Run:

```bash
npm test -- --run src/components/__tests__/ArtistCatalogSelector.test.jsx
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/ArtistCatalogSelector.jsx src/components/__tests__/ArtistCatalogSelector.test.jsx
git commit -m "feat: add selective catalog picker"
```

---

### Task 6: Integracao na pagina administrativa

**Files:**
- Modify: `src/pages/AdminCifraclubImportPage.jsx`
- Test: `src/pages/__tests__/AdminCifraclubImportPage.test.jsx`

**Interfaces:**
- Consumes: `ArtistCatalogSelector`, `getInitialCatalogSelection` e `enqueueArtistSelection`.
- Produces: fluxo busca -> previa -> revisao -> fila.

- [ ] **Step 1: Atualizar mocks e escrever testes que falham**

Ao concluir a previa:

```js
expect(screen.getByRole('region', { name: 'Selecionar cifras de Diante do Trono' })).toBeInTheDocument();
expect(screen.getByText(/1 de 2 selecionadas/)).toBeInTheDocument();
```

Ao enviar, verificar que somente os itens marcados chegam a
`enqueueArtistSelection`. Cobrir tambem:

- troca de artista limpa selecao anterior;
- resposta atrasada nao substitui catalogo atual;
- falha de enqueue preserva o seletor e checkboxes;
- sucesso limpa o seletor e atualiza a fila.

- [ ] **Step 2: Executar e confirmar a falha**

Run:

```bash
npm test -- --run src/pages/__tests__/AdminCifraclubImportPage.test.jsx
```

Expected: FAIL porque a pagina ainda enfileira o artista inteiro.

- [ ] **Step 3: Integrar estado e componente**

Adicionar:

```js
const [selectedSongSlugs, setSelectedSongSlugs] = useState(new Set());
```

Depois da previa, gerar os grupos e a selecao inicial. `handleEnqueue` filtra
`selectedArtist.songs` pelo conjunto e chama `enqueueArtistSelection`.

Remover o botao superior `Adicionar a fila`; o comando vive no seletor para
que o contador e a selecao estejam visiveis no momento da acao.

- [ ] **Step 4: Executar testes da pagina e suite Vitest**

Run:

```bash
npm test -- --run src/pages/__tests__/AdminCifraclubImportPage.test.jsx
npm test -- --run
```

Expected: todos os testes passam.

- [ ] **Step 5: Commit**

```bash
git add src/pages/AdminCifraclubImportPage.jsx src/pages/__tests__/AdminCifraclubImportPage.test.jsx
git commit -m "feat: select artist songs before enqueue"
```

---

### Task 7: Verificacao e implantacao

**Files:**
- Verify only: all changed files.

**Interfaces:**
- Produces: API, frontend e RPC ativos no projeto de producao.

- [ ] **Step 1: Executar verificacao local completa**

Run:

```bash
python3 -m unittest discover -s tests/python -v
node scripts/validate-cifraclub-import-queue.cjs
deno test supabase/functions/cifraclub-import-worker/worker.test.ts
npm test -- --run
npm run build
git diff --check
```

Expected: zero falhas; apenas avisos de bundle ja conhecidos sao aceitaveis.

- [ ] **Step 2: Enviar os commits**

```bash
git push origin main
git push app-origin main
```

- [ ] **Step 3: Aplicar somente a nova migracao**

Nao usar `supabase db push`, pois o historico remoto anterior a fila nao esta
registrado. Executar:

```bash
supabase db query --linked --file supabase/migrations/20260729180000_enqueue_selected_cifraclub_import.sql
supabase migration repair 20260729180000 --status applied --linked
```

- [ ] **Step 4: Verificar a RPC sem criar trabalho**

Consultar `to_regprocedure` e privilegios, sem chamar a RPC:

```sql
select
  to_regprocedure(
    'public.enqueue_selected_cifraclub_import(text,text,jsonb)'
  ) as selective_rpc,
  has_function_privilege(
    'authenticated',
    'public.enqueue_selected_cifraclub_import(text,text,jsonb)',
    'EXECUTE'
  ) as authenticated_can_execute;
```

- [ ] **Step 5: Acompanhar os deploys publicos**

Confirmar que o endpoint de catalogo de `diante-do-trono` retorna somente
`provider: cifraclub`, metadados de versao e status 200. Confirmar que o novo
bundle do frontend foi publicado antes de orientar recarga.

- [ ] **Step 6: Teste visual sem efeitos colaterais**

Abrir `/admin/cifraclub-imports`, buscar `Diante do Trono`, abrir o catalogo,
verificar desktop e mobile, busca local, expansao e contador. Nao clicar no
botao final de enfileiramento durante o teste de producao.

- [ ] **Step 7: Registrar resultado**

Informar contagem elegivel, selecao inicial, testes executados, commit final e
confirmar explicitamente que nenhum trabalho ou musica de teste foi criado.
