// Consultas das abas e do resumo. Só tarefas ativas (não concluídas, não canceladas), exceto o histórico.
import { hoje, horaAgora, somarDias } from '../datas.js';

/** @typedef {import('better-sqlite3').Database} DB */
/** @typedef {import('../db/repositorios/tarefas.js').Tarefa} Tarefa */
/** @typedef {{ agora?: Date }} Opcoes */

const ATIVA = 'concluida = 0 AND cancelada = 0';
/** Sem hora primeiro; depois por hora; empate: urgente > alta > normal; depois ordem de criação. */
const ORDEM_DO_DIA = `hora_tarefa IS NOT NULL, hora_tarefa,
  CASE prioridade WHEN 'urgente' THEN 0 WHEN 'alta' THEN 1 ELSE 2 END, id`;

/** Aba "Hoje". @param {DB} db @param {Opcoes} [opcoes] @returns {Tarefa[]} */
export function listarHoje(db, { agora = new Date() } = {}) {
  return db.prepare(`SELECT * FROM tarefas WHERE data_tarefa = ? AND ${ATIVA} ORDER BY ${ORDEM_DO_DIA}`)
    .all(hoje(agora));
}

/** Tarefas ativas entre duas datas (inclusive). @param {DB} db @param {string} inicio @param {string} fim */
export function listarPorPeriodo(db, inicio, fim) {
  return db.prepare(`SELECT * FROM tarefas WHERE data_tarefa BETWEEN ? AND ? AND ${ATIVA}
                     ORDER BY data_tarefa, ${ORDEM_DO_DIA}`).all(inicio, fim);
}

/** Aba "Próximos 7 dias": de amanhã até hoje + 7. @param {DB} db @param {Opcoes} [opcoes] @returns {Tarefa[]} */
export function listarProximos7Dias(db, { agora = new Date() } = {}) {
  const dia = hoje(agora);
  return listarPorPeriodo(db, somarDias(dia, 1), somarDias(dia, 7));
}

/**
 * Aba "Atrasadas": dias anteriores, ou hoje com hora já passada. Da mais antiga para a mais nova.
 * @param {DB} db @param {Opcoes} [opcoes] @returns {Tarefa[]}
 */
export function listarAtrasadas(db, { agora = new Date() } = {}) {
  return db.prepare(`SELECT * FROM tarefas WHERE ${ATIVA}
      AND (data_tarefa < @dia OR (data_tarefa = @dia AND hora_tarefa IS NOT NULL AND hora_tarefa < @hora))
    ORDER BY data_tarefa, ${ORDEM_DO_DIA}`).all({ dia: hoje(agora), hora: horaAgora(agora) });
}

/** Aba "Histórico": concluídas nos últimos 30 dias, mais recentes primeiro. @param {DB} db @param {Opcoes} [opcoes] */
export function listarHistorico30Dias(db, { agora = new Date() } = {}) {
  return db.prepare(`SELECT * FROM tarefas WHERE concluida = 1 AND data_conclusao >= ?
                     ORDER BY data_conclusao DESC, id DESC`).all(`${somarDias(hoje(agora), -30)} 00:00:00`);
}
