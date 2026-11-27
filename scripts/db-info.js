// Mostra o banco: versão do esquema, tabelas (com nº de linhas), configurações e categorias.
// Uso: npm run db:info [-- caminho/do/banco.db]
import { abrirBanco, caminhoBancoPadrao } from '../shared/db/conexao.js';
import { versaoAtual } from '../shared/db/migracoes.js';
import { listarConfiguracoes } from '../shared/db/repositorios/configuracoes.js';
import { listarCategorias } from '../shared/db/repositorios/categorias.js';

const caminho = process.argv[2] ?? caminhoBancoPadrao();
const db = abrirBanco(caminho);

console.log(`Banco: ${caminho}`);
console.log(`Versão do esquema: ${versaoAtual(db)} · journal_mode: ${db.pragma('journal_mode', { simple: true })}\n`);

console.log('Tabelas:');
const tabelas = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all();
for (const { name } of tabelas) {
  const { n } = db.prepare(`SELECT count(*) AS n FROM "${name}"`).get();
  console.log(`  ${name.padEnd(24)} ${n} linha(s)`);
}

console.log('\nConfigurações:');
for (const [chave, valor] of Object.entries(listarConfiguracoes(db))) {
  console.log(`  ${chave.padEnd(24)} = ${valor === '' ? '(vazio)' : valor}`);
}

console.log('\nCategorias:');
for (const c of listarCategorias(db)) console.log(`  ${c.icone ?? '·'} ${c.nome}${c.padrao ? '' : ' (customizada)'}`);

db.close();
