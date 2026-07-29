# Selecao de cifras no catalogo do artista

## Objetivo

Permitir que um super administrador revise o catalogo encontrado para um
artista e envie para a fila somente as cifras escolhidas. A tela deve reduzir
o trabalho manual marcando inicialmente uma unica versao por titulo e deixando
as demais versoes desmarcadas.

O fluxo continua preservando as regras existentes:

- nenhuma musica existente e sobrescrita;
- titulo igual do mesmo artista e ignorado como duplicata;
- titulo igual de outro artista pode ser salvo como outra versao;
- a fila processa uma musica por vez, com os intervalos e bloqueios atuais.

## Catalogo elegivel

A API percorre todas as paginas do catalogo do artista, mas devolve para o
seletor somente entradas cujo `provider` seja `cifraclub`. Entradas com
`provider: letras` nao possuem cifra importavel e ficam fora da contagem e da
interface.

Cada item elegivel inclui:

- nome e slug da musica;
- nome e slug canonicos do artista;
- identificador da versao, quando fornecido;
- rotulo da versao;
- tom;
- indicador de versao verificada;
- URL canonica.

A API continua deduplicando entradas pelo par `artist_slug + song_slug`.

## Agrupamento e escolha inicial

Os itens sao agrupados por titulo normalizado. A normalizacao:

1. remove acentos;
2. converte para minusculas;
3. troca pontuacao por espaco;
4. reduz espacos consecutivos.

Parenteses e palavras nao sao removidos. Assim, `Preciso de Ti` e
`Preciso de Ti (Reprise)` continuam sendo musicas distintas, enquanto
diferencas apenas de caixa, acento ou pontuacao formam o mesmo grupo.

Em cada grupo, uma versao fica marcada inicialmente. A prioridade e:

1. `version_verified: true`;
2. `version_label: principal`;
3. versao com tom informado;
4. ordem original do catalogo;
5. slug como desempate estavel.

Todas as outras versoes do grupo ficam desmarcadas. O administrador pode
marcar mais de uma versao do mesmo titulo ou desmarcar todas.

## Interface

Depois que o administrador escolhe um artista, a pagina exibe um painel de
selecao abaixo dos resultados de artistas e antes da fila.

O painel contem:

- nome do artista e total de cifras elegiveis;
- campo de busca por titulo;
- contador `selecionadas de elegiveis`;
- acao `Selecionar visiveis`;
- acao `Limpar selecao`;
- lista agrupada por titulo;
- botao `Adicionar selecionadas a fila`.

Cada grupo mostra a versao inicialmente preferida, tom, rotulo, verificacao e
quantidade de alternativas. Grupos com alternativas podem ser expandidos. Cada
versao usa um checkbox real e permanece selecionavel de forma independente.

A lista tem altura limitada e rolagem propria para manter a pagina utilizavel
com catalogos grandes. A busca filtra os grupos no cliente sem nova requisicao.
`Selecionar visiveis` marca uma versao preferida em cada grupo visivel que
ainda nao tenha nenhuma selecao. `Limpar selecao` desmarca todo o catalogo.

O botao de envio fica desabilitado quando nenhuma cifra estiver marcada ou
enquanto a requisicao estiver em andamento.

## Persistencia e fila

Uma nova RPC transacional recebe:

- artista canonico;
- slug canonico;
- array JSON das musicas selecionadas.

A RPC valida que o usuario e super administrador, valida todos os nomes e
slugs, rejeita uma selecao vazia e cria:

1. um registro em `cifraclub_import_jobs`, com `total_count` igual ao numero de
   itens selecionados e status `processing`;
2. um registro em `cifraclub_import_items` para cada slug selecionado.

A restricao atual de um trabalho ativo por artista continua valendo. O
`on conflict` interno deduplica slugs repetidos antes de calcular o total.

Como o trabalho ja nasce com itens, o worker existente nao executa a etapa de
descoberta do catalogo. Ele reivindica diretamente a primeira musica
selecionada e continua com a cadencia atual.

A RPC antiga de importacao integral permanece disponivel para compatibilidade,
mas a pagina administrativa passa a usar somente a nova RPC seletiva.

## Concorrencia e erros

Trocar a busca ou selecionar outro artista invalida a previa anterior. Uma
resposta atrasada nao pode substituir o catalogo atual.

Falhas ao carregar o catalogo preservam os resultados de artistas e exibem uma
mensagem localizada. Falhas ao enfileirar preservam a selecao para nova
tentativa. Depois de enfileirar com sucesso, o painel e limpo e a fila e
atualizada.

Se uma cifra selecionada ja existir, o worker registra o item como `skipped`;
ela nunca e atualizada ou sobrescrita. Falhas em uma versao nao impedem as
demais e continuam disponiveis na acao de nova tentativa.

## Compatibilidade e implantacao

A mudanca requer:

- ampliacao do payload do endpoint de catalogo;
- nova migracao Supabase com a RPC seletiva;
- atualizacao do cliente da fila;
- novo painel de selecao na pagina administrativa.

Trabalhos existentes, itens existentes e o contrato do worker permanecem
inalterados. A migracao sera aplicada diretamente ao projeto
`jthvbixdlkrbeztqqqkx` e registrada no historico remoto sem reaplicar as
migracoes antigas.

## Testes

### API Python

- filtra entradas `provider: letras`;
- preserva metadados de versao;
- pagina e deduplica o catalogo elegivel.

### Banco

- rejeita usuarios que nao sejam super administradores;
- rejeita selecao vazia e slugs invalidos;
- cria trabalho e itens atomicamente;
- deduplica slugs repetidos;
- define `total_count` pela quantidade realmente inserida;
- preserva a restricao de um trabalho ativo por artista.

### Cliente e pagina

- agrupa titulos normalizados;
- escolhe a melhor versao pela prioridade definida;
- marca uma versao por grupo inicialmente;
- permite selecionar alternativas e limpar a selecao;
- filtra grupos por busca;
- envia somente os itens marcados;
- preserva a selecao quando o envio falha;
- ignora respostas atrasadas de catalogo.

### Regressao

- fila, cancelamento, retomada e nova tentativa continuam funcionando;
- testes Python, Deno, Vitest e build de producao permanecem verdes.
