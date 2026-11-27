# Prompt Técnico — Sistema de Tarefas Pessoal via WhatsApp + Painel Windows

*Arquitetura local — funciona apenas com o PC ligado*

**Data de criação:** 27 de novembro de 2026
**Destinatário:** desenvolvedor ou IA responsável pela implementação do zero
**Stack:** Node.js · Baileys · Groq API · SQLite · Electron

> **Como usar este documento:** o conteúdo a seguir é um prompt técnico completo. Ele pode ser entregue diretamente a um desenvolvedor ou colado em uma IA de programação como especificação para construir o sistema do zero. Todas as seções são requisitos, salvo quando indicado como sugestão.

---

## Sumário

1. [Visão geral](#1-visão-geral)
2. [Arquitetura técnica](#2-arquitetura-técnica)
3. [Banco de dados (SQLite)](#3-banco-de-dados-sqlite)
4. [Módulo 1 — Bot do WhatsApp (bot-service.js)](#4-módulo-1--bot-do-whatsapp-bot-servicejs)
5. [Módulo 2 — Painel desktop (Electron)](#5-módulo-2--painel-desktop-electron)
6. [Features incluídas](#6-features-incluídas)
7. [Fluxo de setup (primeira execução)](#7-fluxo-de-setup-primeira-execução)
8. [Regras de negócio importantes](#8-regras-de-negócio-importantes)
9. [Entregáveis esperados do desenvolvedor](#9-entregáveis-esperados-do-desenvolvedor)

---

## 1. Visão geral

Construir um sistema de gerenciamento de tarefas pessoal composto por dois módulos que rodam localmente no Windows do usuário:

1. **Módulo de Painel (Desktop App)** — interface gráfica que abre automaticamente com o Windows, exibindo as tarefas do dia com animações e visual intuitivo.
2. **Módulo de WhatsApp (Bot Local)** — processo que roda em segundo plano, lê mensagens e áudios enviados pelo usuário em uma conversa do WhatsApp, interpreta os comandos usando IA e gerencia as tarefas.

Tudo roda localmente na máquina do usuário. Não há servidor externo, não há nuvem, não há custo de infraestrutura. O sistema depende do PC estar ligado para funcionar.

> **Premissa central:** uso estritamente pessoal, por um único usuário. Não há multiusuário, autenticação de contas ou necessidade de escalabilidade. Priorize simplicidade, robustez e custo zero.

---

## 2. Arquitetura técnica

### Stack recomendada

| Componente | Tecnologia |
|---|---|
| **Linguagem principal** | Node.js (JavaScript/TypeScript) |
| **Bot do WhatsApp** | Biblioteca Baileys (conexão via QR Code, igual ao WhatsApp Web) |
| **Linguagem natural (texto e áudio)** | Groq API (free tier — llama3 para texto, Whisper para transcrição de áudio) |
| **Banco de dados** | SQLite local (arquivo `.db` na máquina do usuário) |
| **Painel de interface** | Electron (app desktop Windows com HTML/CSS/JS) |
| **Inicialização com Windows** | Entrada no registro: `HKCU\Software\Microsoft\Windows\CurrentVersion\Run` |
| **Comunicação entre processos** | IPC local via socket ou arquivo de sinais |

### Dois processos separados

- `bot-service.js` — roda em segundo plano (background), gerencia o WhatsApp e o banco de dados.
- `painel-app` — processo Electron, abre com o Windows, lê do banco de dados e permite edição.

```
┌──────────────────────┐        IPC local        ┌──────────────────────┐
│   bot-service.js     │ ◄─────────────────────► │   painel-app         │
│  (segundo plano)     │   socket / arq. sinais  │   (Electron)         │
│  • Baileys (WPP)     │                         │  • Hoje / 7 dias     │
│  • Groq (IA/Whisper) │                         │  • Atrasadas         │
│  • Agendador         │                         │  • Histórico/Config  │
└──────────┬───────────┘                         └──────────┬───────────┘
           │                                                │
           └──────────────►  tarefas.db (SQLite)  ◄─────────┘
```

Quando o painel criar, editar ou concluir uma tarefa, ele deve sinalizar o `bot-service` (para reagendar lembretes). Quando o bot alterar dados vindos do WhatsApp, deve sinalizar o painel para atualizar a lista com animação, sem recarregar a janela.

---

## 3. Banco de dados (SQLite)

### Tabela `tarefas`

```
id                 INTEGER PRIMARY KEY AUTOINCREMENT
titulo             TEXT NOT NULL
descricao          TEXT
data_tarefa        DATE
hora_tarefa        TIME   (pode ser NULL se não tiver hora definida)
prioridade         TEXT   (normal | alta | urgente)
categoria          TEXT   (ex: academia, família, trabalho, pessoal)
recorrente         BOOLEAN DEFAULT false
regra_recorrencia  TEXT   (ex: "seg,qua,sex 07:00")
concluida          BOOLEAN DEFAULT false
data_conclusao     DATETIME
criada_em          DATETIME DEFAULT now
origem             TEXT   (wpp | painel)
```

### Tabela `configuracoes`

```
chave   TEXT PRIMARY KEY
valor   TEXT
```

### Configurações padrão a serem inseridas

```
resumo_seg_sex_hora = "09:30"
resumo_sab_dom_hora = "10:00"
numero_meu_wpp      = ""     (preenchido no setup)
numero_bot_wpp      = ""     (preenchido no setup)
lembrete_antes_min  = "30"   (aviso 30 min antes de tarefas com hora)
```

> **Observação:** o SQLite não possui tipo BOOLEAN nativo — use `INTEGER` com 0/1. Datas em formato ISO (`AAAA-MM-DD`) e horas em `HH:MM` facilitam ordenação e comparação.

---

## 4. Módulo 1 — Bot do WhatsApp (bot-service.js)

### Inicialização

- Conectar via Baileys usando QR Code na primeira execução (sessão salva localmente).
- Ao reconectar (PC ligado), ler todas as mensagens não lidas desde a última sessão.
- Processar mensagens pendentes em ordem cronológica.
- Após processar, enviar um resumo no WhatsApp, seguido da lista:

> *"Encontrei X tarefa(s) nova(s) que você enviou. Aqui está o seu dia de hoje:"*

### Filtro de segurança

- Aceitar comandos **APENAS** do número do próprio usuário (configurado no setup).
- Ignorar qualquer mensagem de outros números.

### Interpretação de mensagens (via Groq API)

Enviar para o modelo o seguinte contexto de sistema:

```
Você é um assistente de tarefas pessoais. O usuário vai te mandar comandos
em linguagem natural para criar, editar, consultar ou concluir tarefas.
Hoje é {DATA_ATUAL}. Dia da semana: {DIA_SEMANA}.
Responda SEMPRE em JSON válido com o seguinte formato:
{
  "acao": "criar | editar | concluir | cancelar | consultar | configurar | desconhecido",
  "tarefas": [...],
  "resposta_usuario": "mensagem curta e amigável em português para confirmar
                       o que foi feito"
}
Para tarefas, cada item deve ter: titulo, data_tarefa, hora_tarefa (ou null),
prioridade (normal/alta/urgente), categoria (detectar automaticamente ou null),
recorrente (true/false), regra_recorrencia (ou null).
Detecte palavras como urgente, importante, não esquecer para ajustar a prioridade.
Detecte categorias por palavras-chave: academia/correr/treino = "academia";
irmão/mãe/pai/família = "família"; reunião/trabalho/cliente = "trabalho".
Para datas relativas como "amanhã", "semana que vem", "terça-feira" calcule a
data absoluta com base na data atual fornecida.
Para tarefas sem hora definida, retorne hora_tarefa como null.
```

> **Recomendação de implementação:** ative o modo de resposta JSON da API quando disponível, valide o JSON recebido (ex.: com um schema) e, se a validação falhar, trate como ação `desconhecido` e peça ao usuário que reformule.

### Tipos de ação e comportamento

| Ação | Comportamento esperado |
|---|---|
| **Criar tarefa clara** | Salvar direto e responder: *"✅ Salvo! [descrição]. Desfazer? Responda 'desfazer'"* |
| **Criar tarefa ambígua** | Data ou dado não claro: perguntar antes de salvar. |
| **Editar/Cancelar uma tarefa** | Confirmar antes: *"Quer mesmo cancelar '[tarefa]' de [data]? Responda 'sim' para confirmar"* |
| **Editar/Cancelar em lote** | Ex.: "cancela tudo de amanhã" — listar o que será afetado e pedir confirmação. |
| **Consultar** | Ex.: "o que tenho amanhã?" — responder com a lista, sem salvar nada. |
| **Áudio** | Transcrever via Whisper (Groq), mostrar a transcrição e processar como texto: *"🎤 Entendi: '[transcrição]'. Salvando..."* |
| **Configurar** | Ex.: "muda o resumo pra 8h" — atualizar a tabela `configuracoes` e confirmar. |

### Resumo diário automático

- Verificar diariamente, no horário definido nas configurações (seg–sex 09:30, sáb–dom 10:00).
- Enviar a lista das tarefas do dia pelo número do bot para o número do usuário.

Formato com tarefas:

```
☀️ Bom dia! Suas tarefas de hoje, [DIA DA SEMANA] [DATA]:

[lista]

Tenha um ótimo dia!
```

Formato sem tarefas:

> *"☀️ Bom dia! Você não tem tarefas para hoje. Aproveite o dia!"*

### Lembretes antes de compromissos

- Para cada tarefa com `hora_tarefa` definida, disparar lembrete 30 minutos antes (configurável):

> *"⏰ Lembrete: '[tarefa]' daqui a 30 minutos ([hora])."*

- Se a tarefa passou do horário sem ser marcada como concluída:

> *"⚠️ Você tinha '[tarefa]' às [hora] e não marcou como feito. Concluiu?"*

### Comandos rápidos reconhecidos

Além da linguagem natural, o bot deve reconhecer diretamente:

| Comando | Efeito |
|---|---|
| `"feito"` / `"concluído"` | Perguntar qual tarefa do dia marcar como feita |
| `"o que tenho hoje?"` | Resumo do dia |
| `"o que tenho essa semana?"` | Resumo da semana |
| `"desfazer"` | Desfaz a última ação (janela de 60 segundos) |
| `"sim"` / `"não"` | Resposta a confirmação pendente |

---

## 5. Módulo 2 — Painel desktop (Electron)

### Comportamento de abertura

- Iniciar automaticamente com o Windows via registro.
- Abrir em uma janela posicionada no canto superior direito da tela (ou na última posição salva pelo usuário).
- Exibir o estado atual das tarefas imediatamente, sem precisar de internet.

### Visual e UX

- Tema escuro moderno, com tipografia limpa e boa hierarquia visual.
- Animações suaves ao: carregar a lista, concluir uma tarefa (risco + fade-out) e adicionar uma nova tarefa (slide-in).
- Três colunas ou abas: **Hoje**, **Próximos 7 dias**, **Atrasadas**.
- Se não houver tarefas para hoje: exibir uma mensagem motivacional com ícone (ex.: "Nenhuma tarefa para hoje. Aproveite!").

### Cards de tarefa (exibição)

| Elemento | Especificação |
|---|---|
| **Título** | Em destaque |
| **Hora** | Se houver, mostrada em badge colorido |
| **Categoria** | Ícone ou tag colorida (academia 🏃, família 👨‍👩‍👧, trabalho 💼 etc.) |
| **Prioridade** | Borda lateral colorida: cinza = normal, amarelo = alta, vermelho = urgente |
| **Concluir (✓)** | Botão com animação |
| **Editar (lápis)** | Abre modal inline |
| **Excluir (lixeira)** | Com confirmação |

### Formulário de nova tarefa (no painel)

- **Título** (obrigatório)
- **Data** (date picker)
- **Hora** (opcional)
- **Categoria** (dropdown + opção "outra")
- **Prioridade** (seletor: Normal / Alta / Urgente)
- **Recorrente?** (toggle) → se sim, mostrar seletor de dias da semana e hora

### Modo Foco

- Botão no painel que esconde tudo e exibe apenas a próxima tarefa do dia em tela cheia.
- Clique fora ou tecla ESC sai do modo foco.

### Aba Histórico

- Tarefas concluídas dos últimos 30 dias.
- Exibir data/hora de conclusão.
- Opção de "restaurar" uma tarefa concluída.

### Aba Configurações (dentro do painel)

- Horário do resumo diário: seg–sex e sáb–dom (inputs de hora).
- Tempo de lembrete antes do compromisso (minutos).
- Categorias customizadas (adicionar/remover).
- Botão "Reconectar WhatsApp" (exibe o QR Code novamente).
- Meus números: exibir qual número é o meu e qual é o do bot.

---

## 6. Features incluídas

1. **Resumo diário automático** — toda manhã, no horário configurado, a lista do dia chega no WhatsApp.
2. **Tarefa recorrente** — "toda segunda às 7h academia" vira uma regra salva.
3. **Prioridade automática por IA** — detecta "urgente", "importante", "não esquecer".
4. **Tarefa por áudio** — transcrição via Whisper + confirmação antes de salvar.
5. **Modo Foco** — exibe só a próxima tarefa, sem distração.
6. **Histórico de 30 dias** — aba com tarefas concluídas e opção de restaurar.
7. **Lembrete de atraso** — tarefa passou do horário sem ser concluída → aviso no WhatsApp.
8. **Comando natural no WhatsApp** — sem estrutura rígida; fala como você falaria com alguém.
9. **Configuração pelo WhatsApp** — mudar o horário do resumo sem abrir o PC.
10. **Tag/categoria automática** — detectada pela IA, filtrável no painel.
11. **Desfazer** — janela de 60 s após qualquer criação para desfazer.
12. **Lembrete 30 min antes** — aviso antecipado para tarefas com hora definida.
13. **Leitura de mensagens pendentes** — ao ligar o PC, processa tudo que chegou enquanto estava desligado.
14. **Edição pelo painel** — modal de edição completo, não depende do WhatsApp.
15. **Inicialização automática com Windows** — sem precisar abrir manualmente.

---

## 7. Fluxo de setup (primeira execução)

1. O usuário roda o instalador/executável pela primeira vez.
2. Uma janela de configuração inicial abre pedindo:
   - **Seu número do WhatsApp** (formato: `5511999999999`)
   - **O número do bot** (segundo chip), no mesmo formato
3. O app abre a tela de QR Code do Baileys para o número do bot.
4. O usuário escaneia com o celular onde o chip do bot está instalado.
5. O app confirma a conexão e salva a sessão localmente.
6. O painel principal abre e está pronto para uso.
7. Uma mensagem de boas-vindas é enviada pelo bot para o número do usuário.

---

## 8. Regras de negócio importantes

- Nunca apagar uma tarefa definitivamente sem confirmação explícita do usuário.
- Tarefas sem hora ficam no topo da coluna "Hoje", sem badge de horário.
- Tarefas recorrentes geram uma nova instância no banco a cada ciclo (não editam a regra; criam cópias).
- O bot aceita comandos SOMENTE do número cadastrado como "meu número".
- Máximo de 1 mensagem de lembrete por tarefa por dia (evitar spam).
- O desfazer só funciona para a última ação, e só dentro da janela de 60 segundos.

---

## 9. Entregáveis esperados do desenvolvedor

1. Repositório com estrutura clara separando `bot-service` e `painel-electron`.
2. Script de instalação automática no Windows (incluindo a entrada no registro).
3. Arquivo `.env.example` com as variáveis necessárias (chave da Groq API).
4. README completo com: pré-requisitos, instalação passo a passo, configuração inicial e como atualizar.
5. Build do Electron gerando um `.exe` instalável para Windows.

### Estrutura de repositório sugerida

```
sistema-tarefas/
├── bot-service/
│   ├── bot-service.js
│   ├── ia/          (Groq: interpretação + Whisper)
│   ├── agendador/   (resumo diário, lembretes, atrasos)
│   └── sessao/      (credenciais Baileys — não versionar)
├── painel-electron/
│   ├── main.js
│   └── renderer/    (HTML/CSS/JS do painel)
├── shared/
│   └── db.js        (acesso ao SQLite)
├── scripts/
│   └── instalar-windows.ps1
├── .env.example     (GROQ_API_KEY=)
└── README.md
```
