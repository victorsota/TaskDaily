// Acesso básico à tabela `tarefas`. Regras de negócio e consultas (Hoje, 7 dias...) ficam em shared/tarefas/ (Etapa 2).
import { AGORA_SP } from '../migracoes.js';

/** @typedef {import('better-sqlite3').Database} DB */
/**
 * @typedef {object} Tarefa
 * @property {number} id
 * @property {string} titulo
 * @property {string | null} descricao
 * @property {string | null} data_tarefa  AAAA-MM-DD
 * @property {string | null} hora_tarefa  HH:MM
 * @property {'normal' | 'alta' | 'urgente'} prioridade
 * @property {string | null} categoria
 * @property {0 | 1} recorrente
 * @property {string | null} regra_recorrencia
 * @property {number | null} regra_id
 * @property {0 | 1} concluida
 * @property {string | null} data_conclusao
 * @property {0 | 1} cancelada              cancelada sem apagar (migração 2)
 * @property {string | null} data_cancelamento
 * @property {string} criada_em
 * @property {'wpp' | 'painel'} origem
 */

const EDITAVEIS = new Set(['titulo', 'descricao', 'data_tarefa', 'hora_tarefa', 'prioridade', 'categoria',
  'recorrente', 'regra_recorrencia', 'regra_id', 'concluida', 'data_conclusao', 'cancelada', 'data_cancelamento', 'origem']);
const BOOLEANOS = new Set(['recorrente', 'concluida', 'cancelada']);

/** Converte true/false em 1/0 e descarta campos desconhecidos (o nome vira coluna no SQL). */
function normalizar(campos) {
  /** @type {Record<string, unknown>} */
  const saida = {};
  for (const [chave, valor] of Object.entries(campos)) {
    if (!EDITAVEIS.has(chave) || valor === undefined) continue;
    saida[chave] = BOOLEANOS.has(chave) && typeof valor === 'boolean' ? Number(valor) : valor;
  }
  return saida;
}

/**
 * @param {DB} db
 * @param {{ titulo: string } & Record<string, unknown>} dados campos de `Tarefa`; booleanos podem vir como true/false
 * @returns {Tarefa}
 */
export function inserirTarefa(db, dados) {
  const campos = normalizar(dados);
  const colunas = Object.keys(campos);
  const id = db.prepare(`INSERT INTO tarefas (${colunas.join(', ')}) VALUES (${colunas.map((c) => '@' + c).join(', ')})`)
    .run(campos).lastInsertRowid;
  return obterTarefa(db, Number(id));
}

/** @param {DB} db @param {number} id @returns {Tarefa | undefined} */
export function obterTarefa(db, id) {
  return db.prepare('SELECT * FROM tarefas WHERE id = ?').get(id);
}

/**
 * Atualiza só os campos informados. Ao mudar `concluida`, preenche/limpa `data_conclusao` sozinho.
 * @param {DB} db @param {number} id @param {Record<string, unknown>} alteracoes
 * @returns {Tarefa | undefined}
 */
export function atualizarTarefa(db, id, alteracoes) {
  const campos = normalizar(alteracoes);
  const sets = Object.keys(campos).map((c) => `${c} = @${c}`);
  if ('concluida' in campos && !('data_conclusao' in campos)) {
    sets.push(`data_conclusao = CASE WHEN @concluida = 1 THEN ${AGORA_SP} ELSE NULL END`);
  }
  if (sets.length) db.prepare(`UPDATE tarefas SET ${sets.join(', ')} WHERE id = @id`).run({ ...campos, id });
  return obterTarefa(db, id);
}

/** Apaga definitivamente. Quem chama é responsável por ter pedido confirmação. @param {DB} db @param {number} id */
export function removerTarefa(db, id) {
  return db.prepare('DELETE FROM tarefas WHERE id = ?').run(id).changes > 0;
}
