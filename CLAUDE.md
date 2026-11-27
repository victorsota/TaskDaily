# TaskDaily

Sistema pessoal de tarefas: bot de WhatsApp (Baileys + Groq) e painel desktop (Electron), rodando localmente no Windows com SQLite.

## Documentos (ler antes de qualquer trabalho)
- `docs/especificacao.md` — o que o sistema deve fazer (requisitos).
- `docs/plano-desenvolvimento.md` — como construir: decisões técnicas, armadilhas e etapas.
- `docs/progresso.md` — o que já foi feito. Ler no início de toda sessão.

## Regras de trabalho
- Executar **uma etapa por vez**, apenas a que o usuário pedir. Não adiantar etapas futuras.
- Ao terminar uma etapa, **parar** e usar o bloco "🟢 ETAPA X CONCLUÍDA — SUA VEZ" descrito em `docs/plano-desenvolvimento.md`, com o roteiro exato de teste.
- Quando precisar de ação humana no meio (chave de API, QR Code, mensagem do celular), parar e usar o bloco "🟡 PRECISO DE VOCÊ".
- Rodar `npm test` antes de declarar uma etapa concluída.
- Commit só depois que o usuário aprovar a etapa. Mensagem: `etapa X: <resumo>`. Depois, atualizar `docs/progresso.md`.
- Não instalar bibliotecas fora das listadas no plano sem perguntar.
- Nunca colocar chaves, números de telefone reais ou sessão do WhatsApp no código ou no git.
- Responder ao usuário em português do Brasil.

## Stack
Node.js (ES Modules, JavaScript + JSDoc) · Electron · Baileys · Groq API · better-sqlite3 · zod · node:test · electron-builder.

## Comandos
Requer **Node.js ≥ 22.12** (Electron 45 e better-sqlite3 13 exigem; `.npmrc` tem `engine-strict=true`, então `npm install` falha com Node antigo).
- `npm install` — instala dependências
- `npm test` — roda todos os testes (`node --test "tests/**/*.test.js"`)
- `node --test tests/sanidade.test.js` — roda um arquivo de teste só; `--test-name-pattern="<trecho>"` filtra por nome
- `npm run dev` — abre o painel Electron (`electron .`, entrada `painel-electron/main.js`)
- `npm run bot` — roda só o bot no terminal (`bot-service/index.js`)
- `npm run simular` — conversa com o bot pelo terminal, sem WhatsApp (`scripts/simular.js`)
- `npm run db:info` — mostra tabelas e configurações (planejado, Etapa 1)
- `npm run build` — gera o instalador `.exe` (planejado, Etapa 11)

## Módulo nativo (armadilha 1)
- O better-sqlite3 13 usa **N-API** e já vem com o binário `prebuilds/win32-x64.node`. O mesmo binário carrega no Node do sistema e no Electron, então **não precisa** de `@electron/rebuild`, `postinstall` nem `ELECTRON_RUN_AS_NODE`. Os scripts rodam com `node` comum.
- `tests/sanidade.test.js` confere isso: carrega o better-sqlite3 dentro do Electron. Se esse teste falhar depois de uma atualização do better-sqlite3 ou do Electron (por exemplo, uma versão que volte a usar ABI do Node), não adicione rebuild por conta própria; pergunte ao usuário. O Visual Studio desta máquina não tem a carga de trabalho de C++, então compilar não funciona.
- Na Etapa 11, o `electron-builder` precisa empacotar `prebuilds/*.node` fora do asar (`asarUnpack`).

## Padrões
- Datas `AAAA-MM-DD`, horas `HH:MM`, booleanos 0/1, fuso `America/Sao_Paulo`.
- Só o bot-service escreve no banco; o painel fala com ele via IPC.
- Nomes de variáveis, funções e arquivos em português, como na especificação.
