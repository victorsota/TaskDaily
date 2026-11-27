// Migrações do banco. Cada item roda uma única vez, em ordem, dentro de uma transação.
// Para mudar o esquema: adicionar um novo item no fim da lista. Nunca editar um já existente.

/** Horário atual de São Paulo (UTC-3 fixo; o Brasil não tem horário de verão desde 2019). */
export const AGORA_SP = "datetime('now', '-3 hours')";

const DATA = "GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]'";
const HORA = "GLOB '[0-2][0-9]:[0-5][0-9]'";

/** @type {{ versao: number, nome: string, sql: string }[]} */
export const migracoes = [
  {
    versao: 1,
    nome: 'esquema inicial',
    sql: `
      CREATE TABLE regras_recorrencia (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        titulo      TEXT NOT NULL CHECK (length(trim(titulo)) > 0),
        descricao   TEXT,
        dias        TEXT NOT NULL,                -- ex.: "seg,qua,sex"
        hora        TEXT CHECK (hora IS NULL OR hora ${HORA}),
        prioridade  TEXT NOT NULL DEFAULT 'normal' CHECK (prioridade IN ('normal', 'alta', 'urgente')),
        categoria   TEXT,
        ativa       INTEGER NOT NULL DEFAULT 1 CHECK (ativa IN (0, 1)),
        criada_em   TEXT NOT NULL DEFAULT (${AGORA_SP}),
        origem      TEXT NOT NULL DEFAULT 'painel' CHECK (origem IN ('wpp', 'painel'))
      );

      CREATE TABLE tarefas (
        id                INTEGER PRIMARY KEY AUTOINCREMENT,
        titulo            TEXT NOT NULL CHECK (length(trim(titulo)) > 0),
        descricao         TEXT,
        data_tarefa       TEXT CHECK (data_tarefa IS NULL OR data_tarefa ${DATA}),
        hora_tarefa       TEXT CHECK (hora_tarefa IS NULL OR hora_tarefa ${HORA}),
        prioridade        TEXT NOT NULL DEFAULT 'normal' CHECK (prioridade IN ('normal', 'alta', 'urgente')),
        categoria         TEXT,
        recorrente        INTEGER NOT NULL DEFAULT 0 CHECK (recorrente IN (0, 1)),
        regra_recorrencia TEXT,                   -- texto da regra, ex.: "seg,qua,sex 07:00"
        regra_id          INTEGER REFERENCES regras_recorrencia(id) ON DELETE SET NULL,
        concluida         INTEGER NOT NULL DEFAULT 0 CHECK (concluida IN (0, 1)),
        data_conclusao    TEXT,
        criada_em         TEXT NOT NULL DEFAULT (${AGORA_SP}),
        origem            TEXT NOT NULL DEFAULT 'painel' CHECK (origem IN ('wpp', 'painel'))
      );
      CREATE INDEX idx_tarefas_data ON tarefas (data_tarefa, hora_tarefa);
      -- Uma ocorrência por regra por dia (evita duplicar recorrência).
      CREATE UNIQUE INDEX idx_tarefas_regra_data ON tarefas (regra_id, data_tarefa) WHERE regra_id IS NOT NULL;

      CREATE TABLE configuracoes (
        chave TEXT PRIMARY KEY,
        valor TEXT
      );

      CREATE TABLE categorias (
        id        INTEGER PRIMARY KEY AUTOINCREMENT,
        nome      TEXT NOT NULL UNIQUE COLLATE NOCASE CHECK (length(trim(nome)) > 0),
        icone     TEXT,
        padrao    INTEGER NOT NULL DEFAULT 0 CHECK (padrao IN (0, 1)),
        criada_em TEXT NOT NULL DEFAULT (${AGORA_SP})
      );

      CREATE TABLE mensagens_processadas (
        id            TEXT PRIMARY KEY,          -- id da mensagem no WhatsApp
        recebida_em   TEXT,                      -- horário da mensagem
        processada_em TEXT NOT NULL DEFAULT (${AGORA_SP})
      );

      CREATE TABLE lembretes_enviados (
        tarefa_id  INTEGER NOT NULL REFERENCES tarefas(id) ON DELETE CASCADE,
        tipo       TEXT NOT NULL CHECK (tipo IN ('antes', 'atraso')),
        data       TEXT NOT NULL CHECK (data ${DATA}),
        enviado_em TEXT NOT NULL DEFAULT (${AGORA_SP}),
        PRIMARY KEY (tarefa_id, tipo, data)
      );

      CREATE TABLE estado_conversa (
        chave     TEXT PRIMARY KEY,              -- 'confirmacao_pendente' | 'ultima_acao'
        dados     TEXT NOT NULL,                 -- JSON
        expira_em TEXT NOT NULL
      );

      INSERT INTO configuracoes (chave, valor) VALUES
        ('resumo_seg_sex_hora', '09:30'),
        ('resumo_sab_dom_hora', '10:00'),
        ('numero_meu_wpp', ''),
        ('numero_bot_wpp', ''),
        ('lembrete_antes_min', '30');

      INSERT INTO categorias (nome, icone, padrao) VALUES
        ('academia', '🏃', 1),
        ('família', '👨‍👩‍👧', 1),
        ('trabalho', '💼', 1),
        ('pessoal', '🙂', 1);
    `,
  },
];

/**
 * Aplica as migrações pendentes. Pode ser chamada quantas vezes quiser.
 * @param {import('better-sqlite3').Database} db
 * @returns {number} versão final do esquema
 */
export function executarMigracoes(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS schema_version (
    versao      INTEGER PRIMARY KEY,
    nome        TEXT NOT NULL,
    aplicada_em TEXT NOT NULL DEFAULT (${AGORA_SP})
  )`);
  const atual = versaoAtual(db);
  const registrar = db.prepare('INSERT INTO schema_version (versao, nome) VALUES (?, ?)');
  for (const m of migracoes) {
    if (m.versao <= atual) continue;
    db.transaction(() => {
      db.exec(m.sql);
      registrar.run(m.versao, m.nome);
    })();
  }
  return versaoAtual(db);
}

/** @param {import('better-sqlite3').Database} db */
export function versaoAtual(db) {
  return db.prepare('SELECT coalesce(max(versao), 0) AS v FROM schema_version').get().v;
}
