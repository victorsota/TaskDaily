import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { executarMigracoes } from './migracoes.js';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

/** Caminho do banco em desenvolvimento: `dados/tarefas.db` na raiz do projeto. */
export function caminhoBancoPadrao() {
  return path.join(raiz, 'dados', 'tarefas.db');
}

/**
 * Abre (ou cria) o banco, liga WAL e chaves estrangeiras e aplica as migrações.
 * @param {string} [caminho] arquivo `.db` ou ':memory:'
 * @returns {import('better-sqlite3').Database}
 */
export function abrirBanco(caminho = caminhoBancoPadrao()) {
  if (caminho !== ':memory:') fs.mkdirSync(path.dirname(caminho), { recursive: true });
  const db = new Database(caminho);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');
  executarMigracoes(db);
  return db;
}
