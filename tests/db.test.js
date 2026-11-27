import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { abrirBanco } from '../shared/db/conexao.js';
import { executarMigracoes, versaoAtual, migracoes } from '../shared/db/migracoes.js';
import { obterConfiguracao, definirConfiguracao, listarConfiguracoes } from '../shared/db/repositorios/configuracoes.js';
import { listarCategorias, adicionarCategoria, removerCategoria } from '../shared/db/repositorios/categorias.js';
import { inserirTarefa, obterTarefa, atualizarTarefa, removerTarefa } from '../shared/db/repositorios/tarefas.js';

const ULTIMA_VERSAO = migracoes.at(-1).versao;
const TABELAS = ['categorias', 'configuracoes', 'estado_conversa', 'lembretes_enviados',
  'mensagens_processadas', 'regras_recorrencia', 'schema_version', 'tarefas'];

/** @param {import('better-sqlite3').Database} db */
const tabelas = (db) => db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
  .all().map((t) => t.name);

describe('banco em arquivo', () => {
  let pasta;
  let caminho;
  beforeEach(() => {
    pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'taskdaily-'));
    caminho = path.join(pasta, 'sub', 'tarefas.db');
  });
  afterEach(() => fs.rmSync(pasta, { recursive: true, force: true }));

  test('cria do zero: pasta, tabelas, WAL e versão do esquema', () => {
    const db = abrirBanco(caminho);
    assert.ok(fs.existsSync(caminho));
    assert.deepEqual(tabelas(db), TABELAS);
    assert.equal(db.pragma('journal_mode', { simple: true }), 'wal');
    assert.equal(db.pragma('foreign_keys', { simple: true }), 1);
    assert.equal(versaoAtual(db), ULTIMA_VERSAO);
    db.close();
  });

  test('reabrir não reaplica migrações nem duplica dados padrão', () => {
    let db = abrirBanco(caminho);
    definirConfiguracao(db, 'resumo_seg_sex_hora', '08:00');
    removerCategoria(db, 'inexistente');
    db.close();

    db = abrirBanco(caminho);
    assert.equal(executarMigracoes(db), ULTIMA_VERSAO);
    assert.equal(db.prepare('SELECT count(*) AS n FROM schema_version').get().n, migracoes.length);
    assert.equal(Object.keys(listarConfiguracoes(db)).length, 5);
    assert.equal(listarCategorias(db).length, 4);
    assert.equal(obterConfiguracao(db, 'resumo_seg_sex_hora'), '08:00', 'valor gravado sobrevive à reabertura');
    db.close();
  });
});

describe('repositórios', () => {
  /** @type {import('better-sqlite3').Database} */
  let db;
  beforeEach(() => { db = abrirBanco(':memory:'); });
  afterEach(() => db.close());

  test('migração rodada duas vezes na mesma conexão não dá erro', () => {
    assert.equal(executarMigracoes(db), ULTIMA_VERSAO);
    assert.equal(executarMigracoes(db), ULTIMA_VERSAO);
  });

  test('configurações padrão', () => {
    assert.deepEqual(listarConfiguracoes(db), {
      lembrete_antes_min: '30',
      numero_bot_wpp: '',
      numero_meu_wpp: '',
      resumo_sab_dom_hora: '10:00',
      resumo_seg_sex_hora: '09:30',
    });
  });

  test('lê e grava configurações', () => {
    definirConfiguracao(db, 'lembrete_antes_min', 15);
    definirConfiguracao(db, 'chave_nova', 'x');
    assert.equal(obterConfiguracao(db, 'lembrete_antes_min'), '15');
    assert.equal(obterConfiguracao(db, 'chave_nova'), 'x');
    assert.equal(obterConfiguracao(db, 'nao_existe'), undefined);
  });

  test('categorias: padrão, adicionar, não duplicar e remover só customizada', () => {
    assert.deepEqual(listarCategorias(db).map((c) => c.nome).sort(), ['academia', 'família', 'pessoal', 'trabalho']);
    const estudos = adicionarCategoria(db, '  Estudos ', '📚');
    assert.equal(estudos.nome, 'estudos');
    assert.equal(adicionarCategoria(db, 'ESTUDOS').id, estudos.id);
    assert.equal(listarCategorias(db).length, 5);
    assert.equal(removerCategoria(db, 'trabalho'), false, 'padrão não é removida');
    assert.equal(removerCategoria(db, 'Estudos'), true);
    assert.equal(listarCategorias(db).length, 4);
  });

  test('tarefas: inserir com padrões e booleanos como 0/1', () => {
    const t = inserirTarefa(db, { titulo: 'Academia', data_tarefa: '2026-11-28', hora_tarefa: '07:00', recorrente: true });
    assert.equal(t.recorrente, 1);
    assert.equal(t.concluida, 0);
    assert.equal(t.prioridade, 'normal');
    assert.equal(t.origem, 'painel');
    assert.match(t.criada_em, /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);

    const semHora = inserirTarefa(db, { titulo: 'Ligar pro irmão', data_tarefa: '2026-11-28', origem: 'wpp' });
    assert.equal(semHora.hora_tarefa, null);
  });

  test('tarefas: concluir preenche data_conclusao e restaurar limpa', () => {
    const { id } = inserirTarefa(db, { titulo: 'Pagar luz' });
    assert.ok(atualizarTarefa(db, id, { concluida: true }).data_conclusao);
    const restaurada = atualizarTarefa(db, id, { concluida: false });
    assert.equal(restaurada.concluida, 0);
    assert.equal(restaurada.data_conclusao, null);
    assert.equal(atualizarTarefa(db, id, { titulo: 'Pagar conta de luz', campo_estranho: 1 }).titulo, 'Pagar conta de luz');
  });

  test('tarefas: banco recusa formatos e valores inválidos', () => {
    assert.throws(() => inserirTarefa(db, { titulo: 'x', data_tarefa: '28/11/2026' }), /CHECK/);
    assert.throws(() => inserirTarefa(db, { titulo: 'x', hora_tarefa: '7h' }), /CHECK/);
    assert.throws(() => inserirTarefa(db, { titulo: 'x', prioridade: 'média' }), /CHECK/);
    assert.throws(() => inserirTarefa(db, { titulo: '   ' }), /CHECK/);
    assert.throws(() => inserirTarefa(db, { titulo: 'x', concluida: 2 }), /CHECK/);
  });

  test('tarefas: remover apaga também os lembretes enviados', () => {
    const { id } = inserirTarefa(db, { titulo: 'Dentista', data_tarefa: '2026-11-28', hora_tarefa: '10:00' });
    db.prepare("INSERT INTO lembretes_enviados (tarefa_id, tipo, data) VALUES (?, 'antes', '2026-11-28')").run(id);
    assert.throws(() => db.prepare("INSERT INTO lembretes_enviados (tarefa_id, tipo, data) VALUES (?, 'antes', '2026-11-28')").run(id),
      /UNIQUE|PRIMARY/, 'no máximo 1 lembrete de cada tipo por dia');
    assert.equal(removerTarefa(db, id), true);
    assert.equal(obterTarefa(db, id), undefined);
    assert.equal(db.prepare('SELECT count(*) AS n FROM lembretes_enviados').get().n, 0);
  });

  test('recorrência: uma ocorrência por regra por dia', () => {
    const regra = db.prepare("INSERT INTO regras_recorrencia (titulo, dias, hora) VALUES ('Correr', 'seg,qua', '06:00')").run();
    const ocorrencia = { titulo: 'Correr', data_tarefa: '2026-11-30', regra_id: Number(regra.lastInsertRowid), recorrente: true };
    inserirTarefa(db, ocorrencia);
    assert.throws(() => inserirTarefa(db, ocorrencia), /UNIQUE/);
  });
});
