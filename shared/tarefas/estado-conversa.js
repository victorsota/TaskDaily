// Estado curto da conversa: confirmação pendente (5 min) e última ação desfazível (60 s).
// Fica na tabela `estado_conversa` para sobreviver a um reinício do bot.
import { agoraSP, somarSegundos } from '../datas.js';

export const PRAZO_DESFAZER_S = 60;
export const PRAZO_CONFIRMACAO_S = 5 * 60;

const CONFIRMACAO = 'confirmacao_pendente';
const ULTIMA_ACAO = 'ultima_acao';
const TABELAS_DESFAZIVEIS = new Set(['tarefas', 'regras_recorrencia']);

/** @typedef {import('better-sqlite3').Database} DB */
/** @typedef {{ agora?: Date }} Opcoes */
/**
 * Uma linha alterada: `antes` é a linha como estava (null = a linha não existia, foi criada).
 * @typedef {{ tabela: 'tarefas' | 'regras_recorrencia', id: number, antes: Record<string, unknown> | null }} Alteracao
 */

/** @param {DB} db @param {string} chave @param {unknown} dados @param {number} segundos @param {Opcoes} opcoes */
function salvar(db, chave, dados, segundos, { agora = new Date() }) {
  db.prepare(`INSERT INTO estado_conversa (chave, dados, expira_em) VALUES (?, ?, ?)
              ON CONFLICT (chave) DO UPDATE SET dados = excluded.dados, expira_em = excluded.expira_em`)
    .run(chave, JSON.stringify(dados), somarSegundos(agoraSP(agora), segundos));
}

/** @returns {{ dados: any, expirado: boolean } | null} */
function ler(db, chave, { agora = new Date() }) {
  const linha = db.prepare('SELECT dados, expira_em FROM estado_conversa WHERE chave = ?').get(chave);
  if (!linha) return null;
  return { dados: JSON.parse(linha.dados), expirado: linha.expira_em <= agoraSP(agora) };
}

const apagar = (db, chave) => db.prepare('DELETE FROM estado_conversa WHERE chave = ?').run(chave);

// ---------- confirmação pendente ----------

/**
 * Guarda o que fazer se o usuário responder "sim". Substitui a anterior.
 * @param {DB} db @param {unknown} acao qualquer valor serializável em JSON @param {Opcoes} [opcoes]
 */
export function definirConfirmacaoPendente(db, acao, opcoes = {}) {
  salvar(db, CONFIRMACAO, acao, PRAZO_CONFIRMACAO_S, opcoes);
}

/** @param {DB} db @param {Opcoes} [opcoes] @returns {any | null} null se não houver ou se expirou */
export function obterConfirmacaoPendente(db, opcoes = {}) {
  const estado = ler(db, CONFIRMACAO, opcoes);
  if (estado?.expirado) apagar(db, CONFIRMACAO);
  return estado && !estado.expirado ? estado.dados : null;
}

/** @param {DB} db */
export const limparConfirmacaoPendente = (db) => { apagar(db, CONFIRMACAO); };

// ---------- desfazer ----------

/** Foto atual de uma linha (ou null). @param {DB} db @param {Alteracao['tabela']} tabela @param {number} id */
export function fotografar(db, tabela, id) {
  if (!TABELAS_DESFAZIVEIS.has(tabela)) throw new Error(`tabela não desfazível: ${tabela}`);
  return db.prepare(`SELECT * FROM ${tabela} WHERE id = ?`).get(id) ?? null;
}

/**
 * Registra a última ação (substitui a anterior). Só ela pode ser desfeita, por 60 s.
 * @param {DB} db @param {{ descricao: string, alteracoes: Alteracao[] }} acao @param {Opcoes} [opcoes]
 */
export function registrarUltimaAcao(db, acao, opcoes = {}) {
  salvar(db, ULTIMA_ACAO, acao, PRAZO_DESFAZER_S, opcoes);
}

/** Volta uma linha ao estado da foto: apaga se não existia; senão atualiza ou recria. */
function restaurarLinha(db, { tabela, id, antes }) {
  if (!TABELAS_DESFAZIVEIS.has(tabela)) throw new Error(`tabela não desfazível: ${tabela}`);
  if (antes === null) {
    db.prepare(`DELETE FROM ${tabela} WHERE id = ?`).run(id);
    return;
  }
  const colunasValidas = new Set(db.prepare(`PRAGMA table_info(${tabela})`).all().map((c) => c.name));
  const colunas = Object.keys(antes).filter((c) => colunasValidas.has(c));
  const existe = db.prepare(`SELECT 1 FROM ${tabela} WHERE id = ?`).get(id);
  if (existe) {
    const sets = colunas.filter((c) => c !== 'id').map((c) => `${c} = @${c}`);
    db.prepare(`UPDATE ${tabela} SET ${sets.join(', ')} WHERE id = @id`).run(antes);
  } else {
    db.prepare(`INSERT INTO ${tabela} (${colunas.join(', ')}) VALUES (${colunas.map((c) => '@' + c).join(', ')})`).run(antes);
  }
}

/**
 * Desfaz a última ação, se ainda estiver dentro dos 60 s.
 * @param {DB} db @param {Opcoes} [opcoes]
 * @returns {{ desfeito: true, descricao: string } | { desfeito: false, motivo: 'nenhuma' | 'expirou' }}
 */
export function desfazerUltimaAcao(db, opcoes = {}) {
  const estado = ler(db, ULTIMA_ACAO, opcoes);
  if (!estado) return { desfeito: false, motivo: 'nenhuma' };
  apagar(db, ULTIMA_ACAO);
  if (estado.expirado) return { desfeito: false, motivo: 'expirou' };
  db.transaction(() => {
    // Ordem inversa: ocorrências antes da regra que as gerou.
    for (const alteracao of [...estado.dados.alteracoes].reverse()) restaurarLinha(db, alteracao);
  })();
  return { desfeito: true, descricao: estado.dados.descricao };
}
