/** @typedef {import('better-sqlite3').Database} DB */
/** @typedef {{ id: number, nome: string, icone: string | null, padrao: 0 | 1, criada_em: string }} Categoria */

/** @param {DB} db @returns {Categoria[]} */
export function listarCategorias(db) {
  return db.prepare('SELECT * FROM categorias ORDER BY padrao DESC, nome').all();
}

/**
 * Adiciona uma categoria customizada. Se já existir (sem diferenciar maiúsculas), devolve a existente.
 * @param {DB} db @param {string} nome @param {string | null} [icone]
 * @returns {Categoria}
 */
export function adicionarCategoria(db, nome, icone = null) {
  const limpo = nome.trim().toLowerCase();
  db.prepare('INSERT INTO categorias (nome, icone) VALUES (?, ?) ON CONFLICT (nome) DO NOTHING').run(limpo, icone);
  return db.prepare('SELECT * FROM categorias WHERE nome = ?').get(limpo);
}

/**
 * Remove uma categoria customizada. Categorias padrão não são removidas.
 * Tarefas que usavam a categoria continuam com o nome gravado.
 * @param {DB} db @param {string} nome @returns {boolean} true se removeu
 */
export function removerCategoria(db, nome) {
  return db.prepare('DELETE FROM categorias WHERE nome = ? AND padrao = 0').run(nome.trim().toLowerCase()).changes > 0;
}
