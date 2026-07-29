# Operacao da fila de importacao do CifraClub

## Finalidade e limites

A fila importa uma cifra por vez para cada trabalho persistido em
`cifraclub_import_jobs` e `cifraclub_import_items`. O agendador tenta executar
o worker uma vez por minuto; o worker reivindica no maximo um item e agenda a
proxima tentativa entre 30 e 60 segundos. Um `403`, `429`, CAPTCHA ou desafio
equivalente pausa o trabalho. Nao use proxies, rotacao de IP, sessoes falsas ou
solucoes de CAPTCHA.

O worker nunca deve ser usado para importar um catalogo real como teste de
fumaca. Use os testes locais e as consultas de verificacao abaixo; qualquer
importacao de producao requer aprovacao operacional explicita.

## Configuracao

Copie os nomes de variaveis de `.env.example`, mas mantenha valores reais em
arquivos locais ignorados ou nos segredos da plataforma.

| Variavel | Onde configurar | Uso |
| --- | --- | --- |
| `VITE_CIFRA_API_URL` | Ambiente do build Vite | Base publica do navegador, incluindo `/api`. |
| `CIFRA_CATALOG_API_URL` | Segredo da Edge Function | Base da API de catalogo, incluindo `/api`. |
| `CIFRA_DETAIL_API_URL` | Segredo da Edge Function | Base da API de cifras individuais, sem `/api`. |
| `SUPABASE_URL` | Ambiente gerenciado da Edge Function | URL do projeto Supabase. |
| `SUPABASE_SERVICE_ROLE_KEY` | Ambiente gerenciado da Edge Function | Credencial do worker; nunca definir com prefixo `VITE_` ou registrar em logs. |

Antes de publicar o worker, configure apenas as duas bases da API no projeto
alvo. Substitua os exemplos pelos enderecos reais, sem incluir tokens:

```bash
supabase secrets set \
  CIFRA_CATALOG_API_URL=https://api.example.com/api \
  CIFRA_DETAIL_API_URL=https://api.example.com
```

A migracao cria no Vault o segredo interno
`cifraclub_import_worker_secret`. Ele autentica o cron contra a Edge Function;
nao o copie para `.env`, nao o mostre em consultas e nao o envie manualmente em
clientes. O cron usa a URL externa configurada pelo Supabase. Caso a plataforma
nao a disponibilize, o controlador deve cadastrar a URL publica da instancia
no Vault com o nome `cifraclub_import_worker_url` antes de habilitar a fila.

## Handoff de implantacao

Estas acoes precisam de projeto Supabase vinculado, credenciais e aprovacao do
controlador. Execute nesta ordem, fora desta tarefa local:

```bash
supabase db push
supabase functions deploy cifraclub-import-worker --no-verify-jwt
```

Depois do deploy, confirme que o agendamento existe e que o Vault tem somente
os nomes esperados. Nao consulte `vault.decrypted_secrets`:

```sql
select jobname, schedule, command
from cron.job
where jobname = 'cifraclub-import-worker';

select name
from vault.secrets
where name in (
  'cifraclub_import_worker_secret',
  'cifraclub_import_worker_url'
)
order by name;
```

O endpoint aceita somente `POST` com o cabecalho interno `x-worker-secret`.
`--no-verify-jwt` e necessario porque a autenticacao e validada contra o Vault,
nao porque o endpoint deva ficar acessivel a usuarios ou navegadores.

## Acompanhamento da fila

Execute estas consultas no SQL Editor com acesso administrativo. Elas nao
coletam catalogos nem acionam o worker:

```sql
select
  id,
  artist_name,
  artist_slug,
  status,
  total_count,
  imported_count,
  skipped_count,
  failed_count,
  blocked_count,
  next_run_at,
  lease_until,
  last_error,
  created_at,
  updated_at
from public.cifraclub_import_jobs
order by created_at desc;

select
  item.id,
  job.artist_name,
  item.song_name,
  item.song_slug,
  item.status,
  item.attempts,
  item.last_error,
  item.updated_at
from public.cifraclub_import_items as item
join public.cifraclub_import_jobs as job on job.id = item.job_id
where item.status in ('failed', 'processing')
order by item.updated_at desc;
```

`completed_with_errors` pode ser reenviado pela acao administrativa de nova
tentativa; ela recoloca somente itens `failed` em `pending`. Trabalhos
`pending` podem ser cancelados pela interface. Itens `skipped` representam
duplicatas e nao devem ser reenviados.

## Pausa e retomada operacional

Um bloqueio upstream pausa automaticamente o trabalho. Para interromper um
trabalho manualmente, execute o bloco inteiro no SQL Editor como administrador
do banco. Nao o execute pelo cliente da aplicacao: a RLS bloqueia escrita
direta e a transacao precisa manter a ordem abaixo. Registre o motivo no ticket
operacional.

```sql
begin;

-- Invalida primeiro a reivindicacao do item. Um worker que ainda tiver o
-- token antigo falhara na validacao de fencing ao tentar finalizar ou importar.
update public.cifraclub_import_items
set
  status = 'pending',
  lease_until = null,
  claim_token = null,
  updated_at = now()
where job_id = '<job-id>'
  and status = 'processing';

-- So depois de liberar o item, pausa o job e remove seu lease de descoberta.
update public.cifraclub_import_jobs
set
  status = 'paused',
  lease_until = null,
  claim_token = null,
  next_run_at = now(),
  last_error = 'Pausado manualmente: <motivo>',
  updated_at = now()
where id = '<job-id>'
  and status in ('pending', 'discovering', 'processing');

commit;
```

A ordem e parte do procedimento: nao pause somente o job e nao separe essas
atualizacoes em comandos independentes. Se houver um worker obsoleto, o
`claim_token` e o `lease_until` limpos no item fazem as RPCs de finalizacao e
importacao rejeitarem a reivindicacao antiga.

Nao retome automaticamente um trabalho pausado por bloqueio. Primeiro confirme
que a causa foi resolvida e que retomar esta de acordo com os limites do
upstream. A funcao `resume_cifraclub_import` existe para uma retomada
autorizada por super administrador; a interface atual nao expoe esse comando,
portanto o controlador deve executar a retomada somente por um fluxo
autenticado que preserve `auth.uid()`.

## Ajuste de cadencia

A configuracao atual e deliberadamente conservadora:

- cron: uma chamada por minuto;
- lease do worker: 120 segundos;
- intervalo normal: 30 a 60 segundos;
- espera temporaria: progressiva por tentativa;
- processamento: um unico item global por vez.

Esses valores ainda vivem no codigo e na migracao, nao em uma variavel de
ambiente. Para altera-los, abra uma mudanca revisada que ajuste
`supabase/functions/_shared/importQueue.ts`,
`supabase/functions/cifraclub-import-worker/index.ts` ou uma nova migracao de
cron, atualize os testes Deno e publique a funcao novamente. Nunca aumente a
concorrencia para compensar bloqueios upstream.

## Verificacao local

Antes de solicitar implantacao, execute no worktree:

```bash
python -m unittest discover -s tests/python -v
deno test supabase/functions/cifraclub-import-worker/worker.test.ts
npm test -- --run
npm run build
```

Esses comandos usam mocks e testes locais; eles nao devem criar trabalhos na
fila nem buscar catalogos reais. A validacao estatica adicional da migracao e:

```bash
node scripts/validate-cifraclub-import-queue.cjs
```

## Pendencias do controlador

1. Vincular o projeto Supabase correto e configurar as duas URLs da API como
   segredos da Edge Function.
2. Aplicar `supabase db push` e publicar
   `cifraclub-import-worker --no-verify-jwt` com aprovacao de rede.
3. Confirmar cron, Vault e configuracao da URL externa sem revelar segredos.
4. Autorizar separadamente qualquer importacao de teste em ambiente remoto.
