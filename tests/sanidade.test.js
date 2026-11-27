import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import electron from 'electron';
import Database from 'better-sqlite3';

test('abre um banco SQLite em memória e grava/lê', () => {
  const db = new Database(':memory:');
  db.exec('create table t (id integer primary key, nome text)');
  db.prepare('insert into t (nome) values (?)').run('teste');
  assert.equal(db.prepare('select nome from t').get().nome, 'teste');
  db.close();
});

// Guarda da armadilha 1: o mesmo binário (N-API) precisa carregar também no Electron.
test('better-sqlite3 carrega dentro do Electron', () => {
  const codigo = "const D=require('better-sqlite3');const db=new D(':memory:');" +
    "process.stdout.write(db.prepare('select 1 as x').get().x+'');db.close()";
  const saida = execFileSync(electron, ['-e', codigo], {
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
    encoding: 'utf8',
  });
  assert.equal(saida.trim(), '1');
});
