# Arquitetura do domínio

## Separação principal

O sistema separa dois conjuntos de dados:

### Corpus jurídico compartilhado

- coleções editoriais;
- atos normativos;
- snapshots das fontes;
- versões imutáveis;
- dispositivos hierárquicos;
- notas editoriais;
- remissões legais;
- jurisprudência.

### Espaço pessoal

- coleções do usuário;
- destaques;
- notas;
- favoritos;
- progresso de leitura;
- solicitações de importação.

Uma lei é armazenada uma única vez. A presença dela na biblioteca de uma pessoa é representada por `user_collection_item`.

## Identidade entre versões

Cada unidade jurídica recebe uma chave lógica independente da versão:

```text
BR/CF/1988/ART/37/PAR/6
BR/LEI/10406/2002/ART/421/PAR/UNICO
BR/LEI/13105/2015/ART/1036/PAR/1/INC/I
```

O identificador físico da linha muda em cada versão. A chave lógica permite comparar redações e reposicionar anotações.

## Âncoras de destaque

Um destaque não depende apenas de posições numéricas. Ele registra:

- chave lógica do dispositivo;
- versão na qual foi criado;
- texto exato selecionado;
- prefixo e sufixo de contexto;
- posição aproximada;
- estado da âncora.

Quando uma lei muda, o atualizador tenta localizar o mesmo trecho na nova versão. Âncoras duvidosas recebem `REVIEW_REQUIRED`.

## Pipeline de importação

```text
Fonte oficial
  -> snapshot e hash
  -> extração posicional
  -> normalização
  -> parser jurídico
  -> validações
  -> revisão
  -> publicação transacional
```

As validações incluem:

- identificação do ato;
- continuidade dos dispositivos;
- duplicidade de chaves lógicas;
- integridade da árvore;
- referências não resolvidas;
- distinção entre texto legal e nota editorial;
- comparação com a versão anterior.

## Busca

O PostgreSQL utiliza:

- configuração textual em português com `unaccent`;
- `tsvector` e índice GIN;
- `pg_trgm` para similaridade;
- `ltree` para navegação hierárquica.

Isso cobre busca por ato, dispositivo, expressão e tolerância a pequenas variações sem adicionar um mecanismo externo no primeiro estágio.

## Execução com pool de conexões

Cada transação que manipula conteúdo pessoal deve configurar:

```sql
SET LOCAL app.current_user_id = '<uuid>';
SET LOCAL app.current_user_role = 'USER';
```

As políticas RLS usam esses valores. Em ambiente com pool, `SET LOCAL` deve ocorrer dentro da mesma transação das consultas protegidas.

## PostgreSQL externo

O corpus e os dados pessoais ficam no schema `vademecum`. A aplicação recebe a
conexão exclusivamente por variáveis de ambiente:

- `DATABASE_URL`: conexão sem o parâmetro `schema`;
- `DATABASE_SCHEMA`: `vademecum`;
- `DATABASE_SSL_MODE`: `require` ou, preferencialmente, `verify-full`;
- `DATABASE_CA_CERT`: certificado da autoridade, obrigatório em `verify-full`.

Senhas com caracteres reservados devem ser codificadas na URL. O schema é
configurado explicitamente em cada conexão, sem depender de parâmetros
específicos de ORM.
