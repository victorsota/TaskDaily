/** @typedef {import('better-sqlite3').Database} DB */

/** @param {DB} db @param {string} chave @returns {string | undefined} */
export function obterConfiguracao(db, chave) {
  return db.prepare('SELECT valor FROM configuracoes WHERE chave = ?').get(chave)?.valor;
}

/** Cria ou atualiza. @param {DB} db @param {string} chave @param {string | number} valor */
export function definirConfiguracao(db, chave, valor) {
  db.prepare(`INSERT INTO configuracoes (chave, valor) VALUES (?, ?)
              ON CONFLICT (chave) DO UPDATE SET valor = excluded.valor`).run(chave, String(valor));
}

/** @param {DB} db @returns {Record<string, string>} */
export function listarConfiguracoes(db) {
  const linhas = db.prepare('SELECT chave, valor FROM configuracoes ORDER BY chave').all();
  return Object.fromEntries(linhas.map((l) => [l.chave, l.valor]));
}
