import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { ZodError } from 'zod';
import {
  criarRegraRecorrencia, gerarOcorrencias, interpretarRegra, formatarRegra, desfazerUltimaAcao, cancelarTarefas,
} from '../shared/tarefas/index.js';
import { sp, bancoNovo } from './ajuda.js';

/** @type {import('better-sqlite3').Database} */
let db;
beforeEach(() => { db = bancoNovo(); });
afterEach(() => db.close());

const agora = sp('2026-11-27 10:00'); // sexta-feira
const contar = () => db.prepare('SELECT count(*) AS n FROM tarefas').get().n;
const datas = (lista) => lista.map((t) => t.data_tarefa);

test('interpretar e formatar a regra em texto', () => {
  assert.deepEqual(interpretarRegra('sex,seg,qua 07:00'), { dias: ['seg', 'qua', 'sex'], hora: '07:00' });
  assert.deepEqual(interpretarRegra('sáb,dom'), { dias: ['sab', 'dom'], hora: null });
  assert.equal(formatarRegra({ dias: ['sex', 'seg'], hora: '06:00' }), 'seg,sex 06:00');
  assert.throws(() => interpretarRegra('seg,feriado 07:00'));
  assert.throws(() => interpretarRegra('seg 7h'));
});

test('criar regra gera as ocorrências dos próximos 7 dias', () => {
  const { regra, ocorrencias } = criarRegraRecorrencia(db,
    { titulo: 'Academia', dias: ['segunda', 'qua', 'sexta'], hora: '18:00', categoria: 'academia' }, { agora });
  assert.equal(regra.dias, 'seg,qua,sex');
  // De sex 27/11 a qui 03/12: sex, seg, qua.
  assert.deepEqual(datas(ocorrencias), ['2026-11-27', '2026-11-30', '2026-12-02']);
  for (const t of ocorrencias) {
    assert.equal(t.recorrente, 1);
    assert.equal(t.regra_id, regra.id);
    assert.equal(t.regra_recorrencia, 'seg,qua,sex 18:00');
    assert.equal(t.hora_tarefa, '18:00');
    assert.equal(t.categoria, 'academia');
  }
});

test('gerar de novo não duplica', () => {
  criarRegraRecorrencia(db, { titulo: 'Correr', dias: ['seg', 'qua'], hora: '06:00' }, { agora });
  const antes = contar();
  assert.deepEqual(gerarOcorrencias(db, { agora }), []);
  assert.deepEqual(gerarOcorrencias(db, { agora }), []);
  assert.equal(contar(), antes);
});

test('dia seguinte gera só a ocorrência nova da janela', () => {
  criarRegraRecorrencia(db, { titulo: 'Inglês', dias: ['sex'] }, { agora });
  assert.equal(contar(), 1);
  // Uma semana depois, a sexta 04/12 entra na janela.
  assert.deepEqual(datas(gerarOcorrencias(db, { agora: sp('2026-11-28 00:05') })), ['2026-12-04']);
  assert.deepEqual(gerarOcorrencias(db, { agora: sp('2026-11-29 00:05') }), []);
});

test('não cria a ocorrência de hoje se o horário já passou', () => {
  const { ocorrencias } = criarRegraRecorrencia(db, { titulo: 'Remédio', dias: ['sex'], hora: '08:00' }, { agora });
  assert.deepEqual(ocorrencias, []);
});

test('ocorrência cancelada não é recriada', () => {
  const { ocorrencias } = criarRegraRecorrencia(db, { titulo: 'Yoga', dias: ['sab'] }, { agora });
  cancelarTarefas(db, ocorrencias[0].id, { agora });
  assert.deepEqual(gerarOcorrencias(db, { agora }), []);
});

test('regra inativa não gera', () => {
  const { regra } = criarRegraRecorrencia(db, { titulo: 'Natação', dias: ['dom'] }, { agora });
  db.prepare('DELETE FROM tarefas').run();
  db.prepare('UPDATE regras_recorrencia SET ativa = 0 WHERE id = ?').run(regra.id);
  assert.deepEqual(gerarOcorrencias(db, { agora }), []);
});

test('desfazer remove a regra e as ocorrências', () => {
  criarRegraRecorrencia(db, { titulo: 'Academia', dias: ['seg', 'qua', 'sex'] }, { agora });
  assert.equal(desfazerUltimaAcao(db, { agora }).desfeito, true);
  assert.equal(contar(), 0);
  assert.equal(db.prepare('SELECT count(*) AS n FROM regras_recorrencia').get().n, 0);
});

test('regra inválida é recusada', () => {
  assert.throws(() => criarRegraRecorrencia(db, { titulo: 'x', dias: [] }), ZodError);
  assert.throws(() => criarRegraRecorrencia(db, { titulo: 'x', dias: ['feriado'] }), ZodError);
  assert.throws(() => criarRegraRecorrencia(db, { titulo: 'x', dias: ['seg'], hora: '7h' }), ZodError);
});
