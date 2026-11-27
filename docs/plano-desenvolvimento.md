# Plano de desenvolvimento — TaskDaily

Este documento diz **como** construir o sistema descrito em `docs/especificacao.md`, dividido em etapas pequenas.
Cada etapa termina com um **teste humano**: a IA para, avisa que terminou e diz exatamente o que você deve fazer para conferir se funcionou.

---

## 1. Como trabalhar (protocolo IA ↔ humano)

### Para o humano (você)
1. Abra a pasta `TaskDaily` no VS Code e inicie o Claude Code.
2. Peça uma etapa por vez, por exemplo:
   > Leia `CLAUDE.md`, `docs/plano-desenvolvimento.md` e `docs/progresso.md`. Execute a **Etapa 0**.
3. Quando a IA disser **"🟢 ETAPA X CONCLUÍDA — SUA VEZ"**, siga o roteiro de teste que ela mostrar.
4. Responda com o resultado:
   - Funcionou → `Etapa X aprovada` (a IA faz o commit e atualiza o progresso).
   - Não funcionou → descreva o que aconteceu e cole a mensagem de erro inteira.
5. Use `/clear` entre etapas para começar cada uma com o contexto limpo. A continuidade fica em `docs/progresso.md`.

### Para a IA (regras obrigatórias)
- Executar **somente a etapa pedida**. Não adiantar funcionalidades de etapas futuras.
- Antes de começar, ler `docs/progresso.md` para saber o que já existe.
- Rodar `npm test` (e o lint, se existir) antes de declarar a etapa concluída. Não entregar etapa com teste falhando.
- Ao terminar, **parar** e responder exatamente neste formato:

```
🟢 ETAPA X CONCLUÍDA — SUA VEZ

O que foi feito:
- ...

Pré-requisitos (o que você precisa providenciar):
- ... (ou "nenhum")

Como testar:
1. Rode: <comando exato>
2. Faça: <ação exata>
3. Resultado esperado: <o que deve aparecer>

Se der errado: copie a saída do terminal e me mande.
```

- Se precisar de algo que só o humano pode fazer no meio da etapa (chave de API, escanear QR Code, mandar mensagem do celular), parar e usar o formato:

```
🟡 PRECISO DE VOCÊ

O que fazer: ...
Por quê: ...
Me avise quando terminar.
```

- Só fazer commit depois que o humano aprovar a etapa. Mensagem: `etapa X: <resumo>`.
- Depois da aprovação, marcar a etapa em `docs/progresso.md` e anotar decisões ou desvios da especificação.
- Nunca commitar `.env`, a pasta de sessão do WhatsApp nem o arquivo `.db`.

---

## 2. Decisões técnicas (ajustes sobre a especificação)

A especificação é a referência. Estes pontos refinam ou corrigem detalhes dela para evitar problemas conhecidos.

| Tema | Decisão | Motivo |
|---|---|---|
| Linguagem | JavaScript com **ES Modules** (`"type": "module"`), JSDoc para tipos | Mais simples que TypeScript com Electron; Baileys recente é ESM |
| Testes | `node:test` (embutido no Node) | Sem dependência extra |
| Empacotamento | **Um único app Electron** que contém o painel e o bot | Um `.exe`, um instalador, uma entrada de inicialização |
| Processo do bot | Roda separado, como `utilityProcess` filho do Electron. Também pode rodar sozinho no terminal para desenvolvimento | Se o bot travar, o painel não cai, e vice-versa |
| Dono do banco | **Só o bot-service escreve no SQLite.** O painel pede tudo ao bot via IPC (mensagens do `utilityProcess`) | Evita conflito de escrita entre dois processos; resolve a comunicação em tempo real nos dois sentidos |
| Fechar a janela | Minimiza para a **bandeja do sistema**; o bot continua rodando | Lembretes funcionam mesmo com o painel fechado |
| SQLite | `better-sqlite3` com `journal_mode = WAL` | Rápido e síncrono. **Atenção:** é módulo nativo; ver "Armadilhas" |
| Validação do JSON da IA | `zod` | Requisito da especificação (validar com schema) |
| Agendamento | `node-cron` ou um "tick" a cada 30 s que verifica o que vence | Simples e resistente a o PC dormir |
| Fuso horário | `America/Sao_Paulo` fixo nas datas calculadas | Evita erro de "amanhã" perto da meia-noite |
| Inicialização com Windows | `app.setLoginItemSettings({ openAtLogin: true })` | Escreve a mesma chave `HKCU\...\Run` da especificação, sem script manual |
| Build | `electron-builder` com instalador NSIS | Gera o `.exe` instalável |
| Modelos Groq | Nomes em variáveis do `.env` (`GROQ_MODELO_TEXTO`, `GROQ_MODELO_AUDIO`) | Os nomes de modelo da Groq mudam; conferir os atuais na documentação da Groq na Etapa 3 |

### Tabelas extras (além das da especificação)
- `regras_recorrencia` — a regra fica aqui; cada ocorrência vira uma linha em `tarefas` com `regra_id`. Atende "criar cópias, não editar a regra".
- `mensagens_processadas` — id da mensagem do WhatsApp e horário. Impede processar a mesma mensagem duas vezes ao reconectar.
- `lembretes_enviados` — tarefa, tipo (`antes` | `atraso`) e data. Garante no máximo 1 lembrete de cada tipo por tarefa por dia.
- `estado_conversa` — confirmação pendente (o que fazer se o usuário disser "sim") e última ação desfazível, com horário de expiração.
- `categorias` — categorias padrão + customizadas.
- `schema_version` — controle de migrações.

### Armadilhas conhecidas (a IA deve tratar)
1. **better-sqlite3 + Electron:** o módulo nativo precisa ser compilado para a versão de Node do Electron. Definir na Etapa 0 uma forma única de rodar tudo (por exemplo, scripts do bot e testes rodando com `ELECTRON_RUN_AS_NODE=1 electron ...`, ou `@electron/rebuild` no `postinstall`), e documentar no `CLAUDE.md`. Se a versão do Electron já tiver `node:sqlite` estável, pode ser usado no lugar.
2. **Identificação do remetente no WhatsApp:** versões novas do WhatsApp/Baileys podem entregar o remetente como `@lid` em vez do número. O filtro "só aceitar meu número" precisa considerar os dois formatos (ver campos alternativos de JID na versão instalada do Baileys). Testar com mensagem de outro número.
3. **Mensagens pendentes:** ao reconectar, o Baileys entrega mensagens antigas em lotes (`messages.upsert` com tipo diferente de `notify`). Processar apenas as do meu número, mais novas que o último horário processado e cujo id não esteja em `mensagens_processadas`, em ordem cronológica.
4. **Risco de banimento:** Baileys não é oficial. Usar um chip dedicado para o bot (como a especificação prevê) e não enviar mensagens em massa.
5. **PC dormindo:** se o PC acordar depois do horário do resumo, enviar o resumo atrasado uma única vez naquele dia.
6. **Chave da Groq:** só no `.env` (em dev) ou na pasta de dados do app (em produção). Nunca no código nem no repositório.

### Estrutura de pastas
```
TaskDaily/
├── CLAUDE.md
├── package.json
├── .env.example
├── docs/
│   ├── especificacao.md
│   ├── plano-desenvolvimento.md
│   └── progresso.md
├── bot-service/
│   ├── index.js            (entrada; roda sozinho ou dentro do Electron)
│   ├── whatsapp/           (Baileys: conexão, QR, filtro, envio)
│   ├── ia/                 (Groq: interpretação + Whisper)
│   ├── comandos/           (comandos rápidos, confirmações, desfazer)
│   ├── agendador/          (resumo, lembretes, atrasos, recorrência)
│   └── ipc/                (mensagens com o painel)
├── shared/
│   ├── db/                 (conexão, migrações, repositórios)
│   ├── tarefas/            (regras de negócio: consultas, recorrência)
│   └── datas.js            (fuso, datas relativas, formatação pt-BR)
├── painel-electron/
│   ├── main.js
│   ├── preload.js
│   └── renderer/           (HTML/CSS/JS)
├── scripts/
│   └── simular.js          (conversa com o bot pelo terminal, sem WhatsApp)
└── tests/
```
Dados do usuário em produção (banco, sessão do WhatsApp, chave): pasta `app.getPath('userData')`. Em desenvolvimento: pasta `dados/` na raiz (no `.gitignore`).

---

## 3. Etapas

Cada etapa lista: **objetivo**, **o que construir**, **pronto quando** (critério da IA) e **teste humano** (o que você faz).

---

### Etapa 0 — Fundação do projeto
**Objetivo:** projeto rodando com scripts, testes e uma janela Electron vazia.

**Construir**
- `package.json` (ESM), dependências base (`electron`, `better-sqlite3`, `dotenv`, `zod`), `.gitignore` (`node_modules`, `.env`, `dados/`, `dist/`), `.env.example`.
- Scripts: `npm test`, `npm run dev` (abre o Electron), `npm run bot` (bot sozinho no terminal), `npm run simular`.
- Resolver a armadilha 1 (módulo nativo) e documentar a solução no `CLAUDE.md`.
- `tests/sanidade.test.js` que abre um banco SQLite em memória.
- Atualizar `CLAUDE.md` com os comandos reais.

**Pronto quando:** `npm install`, `npm test` e `npm run dev` funcionam sem erro.

**Teste humano**
- Pré-requisito: Node.js LTS instalado (`node -v` no terminal).
1. `npm install` → termina sem erros vermelhos.
2. `npm test` → mostra os testes passando.
3. `npm run dev` → abre uma janela escrito "TaskDaily".

---

### Etapa 1 — Banco de dados
**Objetivo:** todas as tabelas criadas, com configurações e categorias padrão.

**Construir**
- `shared/db/`: conexão (WAL), sistema de migrações com `schema_version`, tabelas da especificação + tabelas extras.
- Inserção das configurações padrão (`resumo_seg_sex_hora`, `resumo_sab_dom_hora`, `lembrete_antes_min`, números vazios) e categorias padrão.
- Repositórios: tarefas, configurações, categorias.
- Booleanos como 0/1, datas `AAAA-MM-DD`, horas `HH:MM`.
- Script `npm run db:info` que mostra as tabelas e as configurações.

**Pronto quando:** testes cobrem criar banco do zero, rodar migração duas vezes sem erro e ler/gravar configurações.

**Teste humano**
1. `npm test` → tudo passando.
2. `npm run db:info` → lista as tabelas e mostra `resumo_seg_sex_hora = 09:30`.
3. Confira que apareceu `dados/tarefas.db` e que ele **não** aparece no `git status`.

---

### Etapa 2 — Regras de negócio das tarefas
**Objetivo:** toda a lógica funcionando sem WhatsApp e sem tela.

**Construir**
- `shared/datas.js`: hoje, amanhã, dia da semana, "semana que vem", formatação pt-BR, fuso de São Paulo.
- `shared/tarefas/`: criar, editar, concluir, restaurar, cancelar (sem apagar definitivamente sem confirmação), consultas **Hoje** (sem hora no topo), **Próximos 7 dias**, **Atrasadas**, **Histórico 30 dias**.
- Recorrência: salvar regra (`seg,qua,sex 07:00`) e gerar ocorrências dos próximos 7 dias sem duplicar.
- Desfazer: guarda a última ação; expira em 60 s.
- Confirmação pendente: guarda a ação a executar se vier "sim"; expira em 5 min.

**Pronto quando:** testes cobrem ordenação do "Hoje", atrasadas, geração de recorrência sem duplicar, desfazer dentro e fora dos 60 s, virada de dia à meia-noite.

**Teste humano**
1. `npm test` → tudo passando. Peça à IA para mostrar a lista de testes se quiser conferir o que foi coberto.

---

### Etapa 3 — Interpretação com IA (Groq) + simulador no terminal
**Objetivo:** conversar com o bot pelo terminal como se fosse o WhatsApp.

**Construir**
- `bot-service/ia/interpretador.js`: prompt de sistema da especificação com data e dia da semana atuais, modo JSON, validação com `zod`. Falha de validação vira `desconhecido` e pede para reformular.
- `bot-service/comandos/`: comandos rápidos (`feito`, `o que tenho hoje?`, `essa semana`, `desfazer`, `sim`, `não`) tratados **sem** chamar a IA.
- Fluxos da tabela "Tipos de ação": criar clara (salva + oferece desfazer), criar ambígua (pergunta), editar/cancelar (confirma), lote (lista e confirma), consultar, configurar.
- `npm run simular`: loop no terminal; você digita, o bot responde.
- Testes com a IA simulada (mock), sem gastar chamadas reais.

**Pré-requisito humano:** criar conta na Groq, gerar uma chave de API e colocar no `.env` como `GROQ_API_KEY=...`. A IA deve pedir isso com o bloco 🟡 e indicar os nomes de modelo atuais para `GROQ_MODELO_TEXTO`.

**Teste humano** — rode `npm run simular` e digite, nesta ordem:
1. `academia amanhã às 7h` → "✅ Salvo!" com a data de amanhã correta.
2. `desfazer` → confirma que desfez.
3. `reunião urgente com cliente sexta 14h` → prioridade urgente, categoria trabalho.
4. `ligar pro meu irmão` → tarefa sem hora (ou pergunta a data, se ambíguo).
5. `toda segunda e quarta às 6h correr` → cria recorrente.
6. `o que tenho essa semana?` → lista correta.
7. `cancela a reunião` → pede confirmação; responda `sim`.
8. `muda o resumo pra 8h` → confirma; `npm run db:info` mostra `08:00`.
9. `asdfgh` → pede para reformular, sem travar.

---

### Etapa 4 — Conexão com o WhatsApp
**Objetivo:** o bot recebe e responde mensagens reais do seu número.

**Construir**
- `bot-service/whatsapp/`: Baileys com QR Code no terminal (por enquanto), sessão salva em `dados/sessao/`, reconexão automática.
- Filtro de segurança (armadilha 2): só aceitar o número salvo em `numero_meu_wpp`; ignorar o resto **sem responder**.
- Ligar o fluxo da Etapa 3 às mensagens de texto.
- Registrar ids em `mensagens_processadas`.
- Enquanto não existir a tela de setup, ler os números do `.env` (`NUMERO_MEU`, `NUMERO_BOT`) na primeira execução.

**Pré-requisito humano:** segundo chip com WhatsApp instalado num celular (o número do bot). Colocar os dois números no `.env` no formato `5511999999999`.

**Teste humano**
1. `npm run bot` → aparece um QR Code no terminal.
2. No celular do **bot**: WhatsApp → Aparelhos conectados → Conectar aparelho → escaneie.
3. Do **seu** número, mande para o bot: `o que tenho hoje?` → ele responde.
4. Mande `dentista amanhã 10h` → "✅ Salvo!".
5. Peça para outra pessoa (ou um terceiro número) mandar mensagem ao bot → **nenhuma** resposta.
6. Feche o terminal (Ctrl+C) e rode `npm run bot` de novo → conecta **sem** pedir QR.

---

### Etapa 5 — Áudio
**Objetivo:** criar tarefas por mensagem de voz.

**Construir**
- Baixar o áudio recebido, enviar ao Whisper da Groq, responder "🎤 Entendi: '...'" e processar como texto.
- Seguindo a feature 4 da especificação, **pedir confirmação antes de salvar** tarefas vindas de áudio.
- Tratar erro de transcrição com mensagem amigável.

**Teste humano**
1. Mande um áudio: "lembrar de pagar a conta de luz depois de amanhã às nove da manhã".
2. Esperado: transcrição + pedido de confirmação. Responda `sim` → salvo com a data certa.
3. Mande um áudio só com barulho → resposta pedindo para repetir, sem travar.

---

### Etapa 6 — Agendador: resumo, lembretes, atrasos e mensagens pendentes
**Objetivo:** o bot trabalha sozinho no horário certo.

**Construir**
- Resumo diário (seg–sex e sáb–dom com horários das configurações), formatos com e sem tarefas da especificação.
- Lembrete X min antes (`lembrete_antes_min`) e aviso de atraso; máximo 1 de cada por tarefa por dia (`lembretes_enviados`).
- Geração diária das ocorrências recorrentes.
- Resumo atrasado se o PC acordou depois do horário (armadilha 5).
- Mensagens pendentes ao reconectar (armadilha 3) + mensagem "Encontrei X tarefa(s) nova(s)...".
- Reagendar quando configurações ou tarefas mudam.

**Teste humano**
1. Pelo WhatsApp: `muda o resumo pra <hora atual + 2 min>` → em 2 min chega o resumo.
2. Crie `teste lembrete às <hora atual + 32 min>` → em ~2 min chega "⏰ Lembrete".
3. Não marque como feita; depois do horário chega "⚠️ Você tinha...". Só **uma** vez.
4. Pare o bot (Ctrl+C). Do seu número, mande 2 tarefas. Rode `npm run bot` de novo → ele processa as duas e manda "Encontrei 2 tarefa(s) nova(s)...".
5. Volte o horário do resumo para o que você quer usar.

---

### Etapa 7 — Painel: estrutura e visualização
**Objetivo:** ver as tarefas no painel, atualizadas em tempo real.

**Construir**
- Electron inicia o bot como `utilityProcess`; comunicação painel ↔ bot por IPC (`preload.js` com API mínima e `contextIsolation` ligado).
- Janela no canto superior direito, lembrando a última posição e tamanho.
- Tema escuro, abas **Hoje / Próximos 7 dias / Atrasadas**, cards conforme a especificação (badge de hora, tag de categoria, borda de prioridade).
- Mensagem motivacional quando não houver tarefas hoje.
- Quando o bot altera algo vindo do WhatsApp, o painel atualiza com animação **sem recarregar a janela**.
- Fechar a janela → vai para a bandeja; menu da bandeja: Abrir / Sair.

**Teste humano**
1. `npm run dev` → a janela abre no canto superior direito com suas tarefas.
2. Mova a janela, feche pela bandeja (Sair) e abra de novo → abre na nova posição.
3. Com o painel aberto, mande pelo WhatsApp `comprar pão hoje` → o card aparece com animação, sem piscar a tela.
4. Feche a janela no X → o ícone continua na bandeja e o bot continua respondendo no WhatsApp.

---

### Etapa 8 — Painel: criar, editar, concluir, excluir
**Objetivo:** usar o sistema sem o WhatsApp.

**Construir**
- Formulário de nova tarefa completo (incluindo recorrência com dias da semana e hora).
- Modal de edição; excluir com confirmação; concluir com animação (risco + fade-out); nova tarefa com slide-in.
- Toda alteração no painel passa pelo bot (que reagenda os lembretes).

**Teste humano**
1. Crie pelo painel uma tarefa para daqui 35 min → recebe o lembrete no WhatsApp ~5 min depois.
2. Edite o horário dela → o lembrete segue o novo horário.
3. Conclua uma tarefa → animação de risco e ela some.
4. Exclua uma tarefa → aparece confirmação antes.
5. Crie uma recorrente (seg/qua/sex 7h) → aparece em "Próximos 7 dias" nos dias certos.
6. Mande `o que tenho hoje?` no WhatsApp → a lista bate com o painel.

---

### Etapa 9 — Modo Foco, Histórico e Configurações
**Objetivo:** completar as telas restantes.

**Construir**
- Modo Foco: só a próxima tarefa do dia em tela cheia; ESC ou clique fora sai.
- Histórico: concluídas dos últimos 30 dias com data/hora; botão "restaurar".
- Configurações: horários do resumo, minutos do lembrete, categorias (adicionar/remover), números, "Reconectar WhatsApp" mostrando o QR **dentro do painel**.

**Teste humano**
1. Clique em Modo Foco → só a próxima tarefa; aperte ESC → volta.
2. Histórico → aparece o que você concluiu; restaure uma → ela volta para "Hoje".
3. Nas Configurações, mude o resumo para daqui 2 minutos → o resumo chega no WhatsApp nesse horário. Depois volte ao horário normal.
4. Crie a categoria "estudos" → aparece no formulário de nova tarefa.
5. Reconectar WhatsApp → o QR aparece no painel; escaneie de novo e o bot volta a responder.

---

### Etapa 10 — Primeira execução (setup) e inicialização com o Windows
**Objetivo:** experiência de quem instala pela primeira vez.

**Construir**
- Se não houver números configurados: janela de setup (meu número, número do bot, chave da Groq) → QR no painel → confirma conexão → abre o painel → bot manda boas-vindas.
- Validação do formato `55DDDNÚMERO`.
- `openAtLogin` ligado (com opção de desligar nas Configurações).
- Em produção, dados em `userData`, não na pasta do projeto.

**Teste humano**
1. Peça à IA o comando para rodar com uma pasta de dados vazia (simula primeira instalação).
2. Preencha o setup, escaneie o QR → painel abre e chega a mensagem de boas-vindas.
3. Reinicie o Windows → o painel abre sozinho e o bot responde no WhatsApp.

---

### Etapa 11 — Build do instalador e README
**Objetivo:** um `.exe` que instala e funciona sem o VS Code.

**Construir**
- `electron-builder` + NSIS gerando `dist/TaskDaily-Setup-x.y.z.exe`, com ícone.
- Módulos nativos empacotados corretamente.
- `README.md`: pré-requisitos, instalação, configuração inicial, como atualizar, backup do `tarefas.db`, onde ficam os dados.
- `scripts/instalar-windows.ps1` só se ainda for necessário (o instalador já cuida do registro).

**Teste humano**
1. `npm run build` → gera o `.exe` em `dist/`.
2. Feche o modo dev, instale pelo `.exe` (o Windows pode mostrar o aviso SmartScreen por não ser assinado: "Mais informações" → "Executar assim mesmo").
3. Faça o setup, reinicie o PC → tudo abre sozinho.
4. Use por um dia normal: resumo da manhã, uma tarefa por áudio, um lembrete, uma conclusão pelo painel.

---

## 4. Depois de pronto (ideias, fora do escopo atual)
- Backup automático diário do `tarefas.db`.
- Atualização automática do app.
- Estatísticas semanais de tarefas concluídas.
