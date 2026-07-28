# Importacao de cifras por artista

Data: 2026-07-28
Projeto: LouvorPlay
Status: aprovado

## Objetivo

Criar uma area exclusiva para super administradores pesquisarem um artista no
CifraClub, escolherem o resultado correto e adicionarem toda a discografia com
cifras a uma fila persistente. A fila deve continuar sendo processada mesmo
quando o navegador estiver fechado.

As musicas devem ser salvas no mesmo formato interno utilizado pelo editor do
LouvorPlay, preservando corretamente o titulo canonico, o artista canonico e o
identificador de origem.

## Escopo

Esta primeira versao inclui:

- pesquisa e selecao explicita do artista;
- inclusao de varios artistas em uma fila;
- processamento automatico e persistente em lotes pequenos;
- acompanhamento de progresso pelo painel administrativo;
- deduplicacao por origem e por titulo mais artista;
- retomada apos falhas ou reinicio do processador;
- pausa automatica diante de sinais de bloqueio;
- reprocessamento apenas dos itens com falha;
- cancelamento de trabalhos pendentes;
- acesso restrito a `super_admin`.

Nao fazem parte desta versao:

- importacao por genero musical;
- rotacao de IP, proxies ou contorno de CAPTCHA;
- atualizacao automatica de cifras ja existentes;
- importacao de conteudo exclusivo para assinantes;
- processamento paralelo de varias musicas.

## Arquitetura

### Painel administrativo

Uma nova rota de super administrador, `Importar cifras`, permite:

1. pesquisar artistas usando a API existente;
2. escolher explicitamente um resultado;
3. visualizar o nome canonico e a quantidade estimada de musicas;
4. adicionar o artista a fila;
5. acompanhar o trabalho atual e os seguintes;
6. consultar contadores e erros;
7. cancelar trabalhos ainda nao iniciados;
8. solicitar nova tentativa dos itens com falha.

Adicionar um artista nao interrompe o trabalho em andamento. Caso o mesmo
artista ja esteja aguardando ou sendo processado, a interface informa isso e
nao cria outro trabalho concorrente.

### Fila persistente

O Supabase armazena a fila em duas tabelas:

- `cifraclub_import_jobs`: representa um artista e seus totais;
- `cifraclub_import_items`: representa cada musica descoberta.

Estados dos trabalhos:

- `pending`;
- `discovering`;
- `processing`;
- `completed`;
- `completed_with_errors`;
- `paused`;
- `cancelled`.

Estados dos itens:

- `pending`;
- `processing`;
- `imported`;
- `skipped`;
- `failed`.

Cada trabalho registra o usuario que o criou, artista, slug, posicao,
contadores, proxima data permitida para processamento e diagnostico do ultimo
erro. Cada item registra titulo e slug descobertos, tentativas, erro e a musica
do LouvorPlay associada quando houver.

As politicas RLS permitem que apenas `super_admin` consulte e gerencie a fila.
O processador utiliza credenciais de servidor, nunca expostas ao navegador.

### Processador

Um acionador agendado chama um endpoint interno e autenticado da API. Cada
execucao:

1. reivindica atomicamente o proximo trabalho disponivel;
2. descobre o catalogo, caso ainda nao tenha sido descoberto;
3. reivindica um pequeno numero de itens pendentes;
4. processa uma musica por vez;
5. persiste o resultado de cada item imediatamente;
6. agenda a proxima execucao permitida;
7. finaliza o trabalho ou libera a fila para continuar.

O estado fica no banco, portanto reinicios ou encerramento do navegador nao
apagam o progresso. A reivindicacao atomica e um prazo de bloqueio impedem dois
processadores de trabalhar no mesmo item. Um item abandonado volta a ficar
disponivel depois do prazo.

## Coleta conservadora

O processador faz somente uma requisicao de pagina de musica por vez em toda a
fila. Entre musicas ha um intervalo configuravel, inicialmente entre 30 e 60
segundos. A pequena variacao distribui a carga; ela nao deve ser usada para
ocultar a automacao.

Regras obrigatorias:

- reutilizar resultados em cache;
- usar identificacao HTTP estavel e transparente;
- limitar o numero global de requisicoes;
- aplicar espera progressiva em erros temporarios;
- pausar em `429`, `403`, CAPTCHA ou resposta equivalente;
- interromper o trabalho depois de bloqueios repetidos;
- nao usar proxies, rotacao de IP, sessoes falsas ou quebra de CAPTCHA;
- armazenar a URL de origem e manter atribuicao ao CifraClub.

Os limites e intervalos ficam em configuracao de servidor para poderem ser
ajustados sem alterar a interface.

## Descoberta e nomes canonicos

A pesquisa retorna candidatos de artista com nome e slug. O administrador deve
selecionar um candidato; o primeiro resultado nunca e aceito automaticamente.

O catalogo fornece a lista inicial de musicas. Ao processar cada item, a API
abre a pagina individual e usa o titulo e o artista encontrados nessa pagina
como valores canonicos. O resultado da busca e apenas uma referencia inicial.

Antes de salvar:

- remover espacos indevidos nas extremidades;
- preservar acentos e capitalizacao canonicos;
- rejeitar titulo ou artista vazios;
- registrar divergencias relevantes entre catalogo e pagina individual.

## Conversao e salvamento

A cifra extraida e convertida para o mesmo formato interno produzido pelo
`parseImporter` atual. A implementacao de servidor deve ser validada com os
mesmos casos de teste do importador do frontend para evitar diferencas entre
importacao manual e importacao em lote.

A musica salva inclui, quando disponivel:

- `title`;
- `artist`;
- `content`;
- `original_key`;
- `style`;
- `youtube_links`;
- `cifraclub_slug`;
- `is_official` como `false`;
- URL ou identificacao da origem;
- `created_by` do super administrador que adicionou o trabalho.

O fluxo manual existente tambem deve persistir `cifraclub_slug`, pois a coluna
e o indice unico ja existem no banco.

## Deduplicacao e versoes

A verificacao ocorre antes de buscar a pagina completa quando o slug ja e
conhecido e novamente antes da insercao:

1. se o `cifraclub_slug` ja existe, o item vira `skipped`;
2. se nao houver slug correspondente, comparar titulo normalizado e artista
   normalizado;
3. se ambos forem iguais, o item vira `skipped`;
4. se apenas o titulo for igual e o artista for diferente, salvar como outra
   versao;
5. conflitos do indice unico sao tratados como `skipped`, nao como falha.

A normalizacao para comparacao ignora caixa, acentos, espacos repetidos e
pontuacao simples. Os valores canonicos originais continuam sendo armazenados.
Uma musica existente nunca e sobrescrita por esta importacao.

## Falhas e retomada

Falha em uma musica nao bloqueia as seguintes. Cada item guarda quantidade de
tentativas e mensagem sanitizada. Erros temporarios recebem espera progressiva;
erros permanentes encerram apenas o item.

Sinais de bloqueio pausam o trabalho inteiro. O painel explica o motivo e a
data da proxima tentativa. Depois do limite configurado, o trabalho permanece
pausado para inspecao administrativa.

Ao terminar:

- sem falhas: `completed`;
- com pelo menos uma falha: `completed_with_errors`;
- itens existentes contam como `skipped`, nao como erro.

Reprocessar falhas recoloca somente itens `failed` em `pending`.

## Seguranca

- A rota da pagina usa `SuperAdminRoute`.
- Operacoes no banco validam `super_admin` por RLS e funcoes protegidas.
- O endpoint do processador exige um segredo de servidor.
- Chaves de servico nao sao enviadas ao cliente.
- Mensagens de erro nao exibem tokens, cabecalhos ou respostas sensiveis.
- Parametros de artista e musica sao validados como slugs antes de formar URLs.

## Observabilidade

O painel mostra:

- artista e posicao na fila;
- estado atual;
- total descoberto;
- importadas;
- ignoradas;
- falhas;
- horario da ultima atividade;
- proxima tentativa, quando pausado;
- erros por musica.

Logs de servidor incluem identificadores do trabalho e do item, sem armazenar
segredos nem o conteudo integral da cifra.

## Testes

### Unidade

- normalizacao de titulo e artista;
- identidade por slug e por titulo mais artista;
- conversao para o formato interno;
- classificacao de erros e calculo de espera;
- transicoes validas de estados e contadores.

### Integracao

- apenas super administradores criam e consultam trabalhos;
- reivindicacao atomica impede processamento duplicado;
- retomada recupera itens abandonados;
- mesmo titulo e mesmo artista e ignorado;
- mesmo titulo com outro artista e importado;
- conflito do indice unico resulta em `skipped`;
- falha isolada nao interrompe o restante do trabalho;
- bloqueio pausa o trabalho;
- o fluxo manual persiste `cifraclub_slug`.

### Interface

- pesquisa e selecao explicita do artista;
- inclusao de varios artistas;
- atualizacao do progresso;
- cancelamento permitido apenas nos estados previstos;
- nova tentativa somente para falhas;
- estados vazios, carregando e erro.

## Criterios de aceite

1. Um super administrador pode adicionar Fernandinho e, durante o
   processamento, adicionar Oficina G3.
2. A fila continua depois que o navegador e fechado.
3. Os artistas sao processados na ordem em que foram adicionados.
4. Cada musica valida e salva no formato utilizado pelo LouvorPlay.
5. Titulo e artista salvos correspondem aos valores canonicos da pagina.
6. Musica existente do mesmo artista nao e sobrescrita.
7. Musica de mesmo nome e artista diferente e salva como outra versao.
8. O progresso sobrevive a reinicios do processador.
9. Bloqueios causam pausa e espera, sem tentativa de contorno.
10. Falhas individuais podem ser reprocessadas sem repetir os sucessos.

