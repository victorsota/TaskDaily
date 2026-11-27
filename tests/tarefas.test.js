import { describe, test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { ZodError } from 'zod';
import {
  criarTarefa, editarTarefa, concluirTarefas, restaurarTarefas, cancelarTarefas, excluirTarefas,
  desfazerUltimaAcao, definirConfirmacaoPendente, obterConfirmacaoPendente, limparConfirmacaoPendente,
  listarHoje, ErroTarefa,
} from '../shared/tarefas/index.js';
import { obterTarefa } from '../shared/db/repositorios/tarefas.js';
import { sp, bancoNovo } from './ajuda.js';

/** @type {import('better-sqlite3').Database} */
let db;
beforeEach(() => { db = bancoNovo(); });
afterEach(() => db.close());

const agora = sp('2026-11-27 10:00:00');
const depois = (segundos) => new Date(agora.getTime() + segundos * 1000);

describe('operações', () => {
  test('criar: valida, normaliza e usa hoje quando não há data', () => {
    const t = criarTarefa(db, { titulo: '  Ligar pro irmão ', categoria: ' Família ', origem: 'wpp' }, { agora });
    assert.equal(t.titulo, 'Ligar pro irmão');
    assert.equal(t.categoria, 'família');
    assert.equal(t.data_tarefa, '2026-11-27');
    assert.equal(t.hora_tarefa, null);
    assert.equal(t.prioridade, 'normal');
  });

  test('criar: recusa dados inválidos', () => {
    assert.throws(() => criarTarefa(db, { titulo: '' }), ZodError);
    assert.throws(() => criarTarefa(db, { titulo: 'x', hora_tarefa: '25:00' }), ZodError);
    assert.throws(() => criarTarefa(db, { titulo: 'x', data_tarefa: '2026-02-30' }), ZodError);
    assert.throws(() => criarTarefa(db, { titulo: 'x', prioridade: 'média' }), ZodError);
    assert.throws(() => criarTarefa(db, { titulo: 'x', campo_estranho: 1 }), ZodError);
  });

  test('editar só altera os campos informados', () => {
    const { id } = criarTarefa(db, { titulo: 'Reunião', hora_tarefa: '14:00', prioridade: 'urgente' }, { agora });
    const t = editarTarefa(db, id, { hora_tarefa: '15:00' }, { agora });
    assert.equal(t.hora_tarefa, '15:00');
    assert.equal(t.prioridade, 'urgente');
    assert.throws(() => editarTarefa(db, 999, { titulo: 'x' }), (e) => e instanceof ErroTarefa && e.codigo === 'nao_encontrada');
  });

  test('concluir, restaurar e cancelar (sem apagar)', () => {
    const { id } = criarTarefa(db, { titulo: 'Pagar luz' }, { agora });
    const [concluida] = concluirTarefas(db, id, { agora });
    assert.equal(concluida.concluida, 1);
    assert.equal(concluida.data_conclusao, '2026-11-27 10:00:00');
    assert.equal(listarHoje(db, { agora }).length, 0);

    restaurarTarefas(db, id, { agora });
    assert.equal(listarHoje(db, { agora }).length, 1);

    const [cancelada] = cancelarTarefas(db, [id], { agora });
    assert.equal(cancelada.cancelada, 1);
    assert.ok(obterTarefa(db, id), 'cancelar não apaga do banco');
    assert.equal(listarHoje(db, { agora }).length, 0);
  });

  test('excluir definitivamente exige confirmação explícita', () => {
    const { id } = criarTarefa(db, { titulo: 'Dentista' }, { agora });
    assert.throws(() => excluirTarefas(db, id), (e) => e instanceof ErroTarefa && e.codigo === 'sem_confirmacao');
    assert.ok(obterTarefa(db, id));
    assert.equal(excluirTarefas(db, id, { confirmado: true, agora }), 1);
    assert.equal(obterTarefa(db, id), undefined);
  });
});

describe('desfazer (60 s, só a última ação)', () => {
  test('desfaz criação dentro dos 60 s', () => {
    const { id } = criarTarefa(db, { titulo: 'Academia' }, { agora });
    const r = desfazerUltimaAcao(db, { agora: depois(59) });
    assert.deepEqual(r, { desfeito: true, descricao: 'criou "Academia"' });
    assert.equal(obterTarefa(db, id), undefined);
  });

  test('não desfaz depois dos 60 s', () => {
    const { id } = criarTarefa(db, { titulo: 'Academia' }, { agora });
    assert.deepEqual(desfazerUltimaAcao(db, { agora: depois(61) }), { desfeito: false, motivo: 'expirou' });
    assert.ok(obterTarefa(db, id));
  });

  test('sem ação registrada, ou já desfeita', () => {
    assert.deepEqual(desfazerUltimaAcao(db, { agora }), { desfeito: false, motivo: 'nenhuma' });
    criarTarefa(db, { titulo: 'x' }, { agora });
    desfazerUltimaAcao(db, { agora });
    assert.deepEqual(desfazerUltimaAcao(db, { agora }), { desfeito: false, motivo: 'nenhuma' });
  });

  test('só a última ação: desfazer edição mantém a criação', () => {
    const { id } = criarTarefa(db, { titulo: 'Reunião', hora_tarefa: '14:00' }, { agora });
    editarTarefa(db, id, { hora_tarefa: '16:00', titulo: 'Reunião cliente' }, { agora: depois(10) });
    assert.equal(desfazerUltimaAcao(db, { agora: depois(20) }).desfeito, true);
    const t = obterTarefa(db, id);
    assert.equal(t.hora_tarefa, '14:00');
    assert.equal(t.titulo, 'Reunião');
  });

  test('desfaz cancelamento em lote como uma ação só', () => {
    const a = criarTarefa(db, { titulo: 'A', data_tarefa: '2026-11-28' }, { agora });
    const b = criarTarefa(db, { titulo: 'B', data_tarefa: '2026-11-28' }, { agora });
    cancelarTarefas(db, [a.id, b.id], { agora });
    assert.equal(desfazerUltimaAcao(db, { agora }).descricao, 'cancelou 2 tarefas');
    assert.equal(obterTarefa(db, a.id).cancelada, 0);
    assert.equal(obterTarefa(db, b.id).cancelada, 0);
  });

  test('desfaz conclusão e exclusão', () => {
    const { id } = criarTarefa(db, { titulo: 'Pão', hora_tarefa: '08:00' }, { agora });
    concluirTarefas(db, id, { agora });
    desfazerUltimaAcao(db, { agora });
    assert.equal(obterTarefa(db, id).concluida, 0);
    assert.equal(obterTarefa(db, id).data_conclusao, null);

    excluirTarefas(db, id, { confirmado: true, agora });
    desfazerUltimaAcao(db, { agora });
    assert.equal(obterTarefa(db, id).titulo, 'Pão', 'volta com o mesmo id e dados');
  });
});

describe('confirmação pendente (5 min)', () => {
  test('guarda, lê dentro do prazo e expira depois', () => {
    const acao = { tipo: 'cancelar', ids: [1, 2] };
    definirConfirmacaoPendente(db, acao, { agora });
    assert.deepEqual(obterConfirmacaoPendente(db, { agora: depois(299) }), acao);
    assert.equal(obterConfirmacaoPendente(db, { agora: depois(301) }), null);
    assert.equal(obterConfirmacaoPendente(db, { agora }), null, 'expirada é apagada');
  });

  test('nova confirmação substitui a anterior; limpar remove', () => {
    definirConfirmacaoPendente(db, { tipo: 'a' }, { agora });
    definirConfirmacaoPendente(db, { tipo: 'b' }, { agora });
    assert.deepEqual(obterConfirmacaoPendente(db, { agora }), { tipo: 'b' });
    limparConfirmacaoPendente(db);
    assert.equal(obterConfirmacaoPendente(db, { agora }), null);
  });
});
