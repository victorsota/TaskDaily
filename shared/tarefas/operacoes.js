// Operações que alteram tarefas. Cada uma valida a entrada, roda numa transação e
// registra a "última ação" para o desfazer (60 s).
import { hoje, agoraSP } from '../datas.js';
import { inserirTarefa, obterTarefa, atualizarTarefa, removerTarefa } from '../db/repositorios/tarefas.js';
import { esquemaNovaTarefa, esquemaEdicaoTarefa } from './esquemas.js';
import { registrarUltimaAcao } from './estado-conversa.js';

/** @typedef {import('better-sqlite3').Database} DB */
/** @typedef {import('../db/repositorios/tarefas.js').Tarefa} Tarefa */
/** @typedef {{ agora?: Date }} Opcoes */

export class ErroTarefa extends Error {
  /** @param {string} mensagem @param {'nao_encontrada' | 'sem_confirmacao'} codigo */
  constructor(mensagem, codigo) {
    super(mensagem);
    this.name = 'ErroTarefa';
    this.codigo = codigo;
  }
}

/** @param {DB} db @param {number} id */
function exigirTarefa(db, id) {
  const tarefa = obterTarefa(db, id);
  if (!tarefa) throw new ErroTarefa(`Tarefa ${id} não encontrada`, 'nao_encontrada');
  return tarefa;
}

/** @param {Tarefa[]} tarefas */
const nomear = (tarefas) => (tarefas.length === 1 ? `"${tarefas[0].titulo}"` : `${tarefas.length} tarefas`);

/**
 * Cria uma tarefa. Sem data, vale para hoje.
 * @param {DB} db @param {Record<string, unknown>} dados @param {Opcoes} [opcoes] @returns {Tarefa}
 */
export function criarTarefa(db, dados, opcoes = {}) {
  const valido = esquemaNovaTarefa.parse(dados);
  return db.transaction(() => {
    const tarefa = inserirTarefa(db, { ...valido, data_tarefa: valido.data_tarefa ?? hoje(opcoes.agora) });
    registrarUltimaAcao(db, {
      descricao: `criou "${tarefa.titulo}"`,
      alteracoes: [{ tabela: 'tarefas', id: tarefa.id, antes: null }],
    }, opcoes);
    return tarefa;
  })();
}

/**
 * Aplica a mesma alteração a uma ou várias tarefas, como uma única ação desfazível.
 * @param {DB} db @param {number | number[]} ids @param {Record<string, unknown>} alteracao
 * @param {string} verbo @param {Opcoes} opcoes @returns {Tarefa[]}
 */
function alterar(db, ids, alteracao, verbo, opcoes) {
  const lista = [ids].flat();
  return db.transaction(() => {
    const antes = lista.map((id) => exigirTarefa(db, id));
    const depois = lista.map((id) => atualizarTarefa(db, id, alteracao));
    registrarUltimaAcao(db, {
      descricao: `${verbo} ${nomear(antes)}`,
      alteracoes: antes.map((t) => ({ tabela: 'tarefas', id: t.id, antes: t })),
    }, opcoes);
    return depois;
  })();
}

/**
 * Edita só os campos informados.
 * @param {DB} db @param {number} id @param {Record<string, unknown>} alteracoes @param {Opcoes} [opcoes]
 * @returns {Tarefa}
 */
export function editarTarefa(db, id, alteracoes, opcoes = {}) {
  return alterar(db, id, esquemaEdicaoTarefa.parse(alteracoes), 'editou', opcoes)[0];
}

/** @param {DB} db @param {number | number[]} ids @param {Opcoes} [opcoes] @returns {Tarefa[]} */
export function concluirTarefas(db, ids, opcoes = {}) {
  return alterar(db, ids, { concluida: 1, data_conclusao: agoraSP(opcoes.agora) }, 'concluiu', opcoes);
}

/** Desfaz conclusão ou cancelamento (ex.: botão "restaurar" do histórico). */
export function restaurarTarefas(db, ids, opcoes = {}) {
  return alterar(db, ids, { concluida: 0, data_conclusao: null, cancelada: 0, data_cancelamento: null }, 'restaurou', opcoes);
}

/** Cancela sem apagar: a tarefa some das listas, mas continua no banco. */
export function cancelarTarefas(db, ids, opcoes = {}) {
  return alterar(db, ids, { cancelada: 1, data_cancelamento: agoraSP(opcoes.agora) }, 'cancelou', opcoes);
}

/**
 * Apaga definitivamente. Exige `confirmado: true` (regra: nunca apagar sem confirmação explícita).
 * @param {DB} db @param {number | number[]} ids @param {Opcoes & { confirmado?: boolean }} [opcoes]
 * @returns {number} quantas foram apagadas
 */
export function excluirTarefas(db, ids, opcoes = {}) {
  if (opcoes.confirmado !== true) {
    throw new ErroTarefa('Exclusão definitiva precisa de confirmação explícita', 'sem_confirmacao');
  }
  const lista = [ids].flat();
  return db.transaction(() => {
    const antes = lista.map((id) => exigirTarefa(db, id));
    for (const { id } of antes) removerTarefa(db, id);
    registrarUltimaAcao(db, {
      descricao: `excluiu ${nomear(antes)}`,
      alteracoes: antes.map((t) => ({ tabela: 'tarefas', id: t.id, antes: t })),
    }, opcoes);
    return antes.length;
  })();
}
