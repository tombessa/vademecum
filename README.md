# Vade Mecum Pessoal

Leitor de legislação para estudo de lei seca, com conteúdo jurídico versionado e dados de estudo segregados por usuário.

## Primeiro marco

Esta entrega contém:

- interface responsiva do leitor jurídico;
- busca local nos dispositivos de demonstração;
- destaques coloridos interativos;
- painel de remissões, jurisprudência e notas;
- formulário autenticado de solicitação de inclusão de legislação;
- modelo PostgreSQL para conteúdo global e dados pessoais;
- Row-Level Security para as tabelas pertencentes ao usuário;
- manifesto dos 28 atos do Vade Mecum do Senado, 2ª edição;
- extrator posicional de PDF;
- parser inicial da hierarquia legal;
- interpretação de referências como `Lei 8.429/1992`;
- validação de URLs oficiais do Planalto;
- testes unitários e integração contínua.

A interface de leitura ainda usa dispositivos demonstrativos. Os pedidos de
inclusão já possuem integração PostgreSQL e são vinculados ao usuário
autenticado; a consulta efetiva à REFLEGIS será conectada no próximo marco.

## Arquitetura planejada

```text
Next.js
├── leitor e biblioteca pessoal
├── autenticação e autorização
├── API da aplicação
└── PostgreSQL
    ├── atos e versões compartilhados
    ├── árvore de dispositivos
    ├── pedidos de importação
    └── destaques e notas por usuário

Workers
├── importação do PDF do Senado
├── busca e importação do Planalto
└── verificação semanal de atualizações
```

O texto normativo é compartilhado entre os usuários. Destaques, notas, coleções e progresso de leitura possuem `user_id` e políticas de isolamento no PostgreSQL.

## Desenvolvimento local

Requisitos:

- Node.js 22 ou superior;
- Docker com Compose;
- Python 3.11 ou superior para o extrator de PDF.

```bash
cp .env.example .env
docker compose up -d
npm ci
npm run dev
```

O PostgreSQL executará automaticamente `database/migrations/0001_initial.sql` na primeira criação do volume.

Para usar um PostgreSQL existente, configure `DATABASE_URL`,
`DATABASE_SCHEMA=vademecum` e o modo TLS. Depois valide e aplique a migração:

```bash
npm run db:check
npm run db:migrate
```

O parâmetro `?schema=...` não é usado pelo driver. Senhas com `@` ou outros
caracteres reservados precisam ser codificadas na URL. Em produção, utilize no
mínimo `DATABASE_SSL_MODE=require`; o modo recomendado é `verify-full` com
`DATABASE_CA_CERT`.

## Testes

```bash
npm run test:unit
npm run build
```

## Importação do PDF

O PDF original não é armazenado no repositório. Seu hash e os limites de página dos 28 atos estão em `data/sources/senado-vade-mecum-2ed.json`.

Para gerar um arquivo intermediário com palavras e coordenadas:

```bash
python3 -m pip install pdfplumber
python3 tools/pdf/extract_layout.py /caminho/Vade_mecum_Senado_Federal_2ed.pdf \
  --from-page 100 \
  --to-page 102 \
  --output tmp/lindb-layout.json
```

O extrator preserva página, coluna, fonte e posição. A etapa posterior reconstrói Título, Capítulo, Artigo, Parágrafo, Inciso, Alínea e Item.

## Inclusão de legislação externa

O fluxo previsto é:

1. interpretar a referência informada pelo usuário;
2. verificar se o ato já existe;
3. pesquisar na REFLEGIS;
4. validar que a fonte pertence ao Planalto;
5. baixar e registrar um snapshot imutável;
6. estruturar o texto;
7. apresentar divergências para revisão;
8. publicar uma nova versão;
9. incluir o ato na rotina semanal.

Resultados ambíguos nunca serão publicados automaticamente.

## Segurança

- segredos permanecem apenas em variáveis de ambiente;
- a conexão PostgreSQL de produção exige TLS;
- senhas serão armazenadas com Argon2id;
- sessões guardarão somente o hash do token;
- URLs de importação utilizam uma lista de domínios oficiais;
- tabelas pessoais possuem Row-Level Security;
- versões legais e snapshots são imutáveis;
- ações administrativas serão registradas em `audit_event`.

## Licença

A licença do código ainda será definida. Textos normativos e documentos de fonte oficial devem preservar sua identificação, URL e data de obtenção.
