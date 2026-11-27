// Entrada do bot-service. Roda sozinho (`npm run bot`) ou, a partir da Etapa 7,
// como utilityProcess do Electron. Por enquanto só confirma que o ambiente está ok.
import 'dotenv/config';
import Database from 'better-sqlite3';

const db = new Database(':memory:');
const { versao } = db.prepare('select sqlite_version() as versao').get();
db.close();

console.log(`TaskDaily bot-service — Node ${process.versions.node}, SQLite ${versao}`);
console.log('Ainda sem WhatsApp (Etapa 4). Encerrando.');
