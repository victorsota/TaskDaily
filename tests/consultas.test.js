import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { inserirTarefa } from '../shared/db/repositorios/tarefas.js';
import { listarHoje, listarProximos7Dias, listarAtrasadas, listarHistorico30Dias, listarPorPeriodo } from '../shared/tarefas/index.js';
import { sp, bancoNovo } from './ajuda.js';

/** @type {import('better-sqlite3').Database} */
let db;
beforeEach(() => { db = bancoNovo(); });
afterEach(() => db.close());

const agora = sp('2026-11-27 10:00'); // sexta-feira
const nova = (titulo, dados = {}) => inserirTarefa(db, { titulo, data_tarefa: '2026-11-27', ...dados });
const titulos = (lista) => lista.map((t) => t.titulo);

test('Hoje: sem hora no topo, depois por hora; empate por prioridade', () => {
  nova('14h normal', { hora_tarefa: '14:00' });
  nova('sem hora normal');
  nova('08h', { hora_tarefa: '08:00' });
  nova('14h urgente', { hora_tarefa: '14:00', prioridade: 'urgente' });
  nova('sem hora alta', { prioridade: 'alta' });
  nova('amanhã', { data_tarefa: '2026-11-28' });
  nova('concluída', { concluida: 1, data_conclusao: '2026-11-27 09:00:00' });
  nova('cancelada', { cancelada: 1 });

  assert.deepEqual(titulos(listarHoje(db, { agora })),
    ['sem hora alta', 'sem hora normal', '08h', '14h urgente', '14h normal']);
});

test('Hoje muda à meia-noite', () => {
  nova('sexta');
  nova('sábado', { data_tarefa: '2026-11-28' });
  assert.deepEqual(titulos(listarHoje(db, { agora: sp('2026-11-27 23:59') })), ['sexta']);
  assert.deepEqual(titulos(listarHoje(db, { agora: sp('2026-11-28 00:00') })), ['sábado']);
});

test('Atrasadas: dias anteriores e hoje com hora já passada', () => {
  nova('ontem sem hora', { data_tarefa: '2026-11-26' });
  nova('semana passada', { data_tarefa: '2026-11-20', hora_tarefa: '09:00' });
  nova('hoje 09:00', { hora_tarefa: '09:00' });
  nova('hoje 10:00 (é agora, ainda não atrasou)', { hora_tarefa: '10:00' });
  nova('hoje sem hora');
  nova('ontem concluída', { data_tarefa: '2026-11-26', concluida: 1, data_conclusao: '2026-11-26 20:00:00' });
  nova('ontem cancelada', { data_tarefa: '2026-11-26', cancelada: 1 });

  assert.deepEqual(titulos(listarAtrasadas(db, { agora })), ['semana passada', 'ontem sem hora', 'hoje 09:00']);
});

test('Atrasadas: tarefa de hoje vira atrasada depois da meia-noite', () => {
  nova('sexta 20h', { hora_tarefa: '20:00' });
  nova('sexta sem hora');
  assert.deepEqual(titulos(listarAtrasadas(db, { agora: sp('2026-11-27 19:00') })), []);
  assert.deepEqual(titulos(listarAtrasadas(db, { agora: sp('2026-11-28 00:01') })), ['sexta sem hora', 'sexta 20h']);
});

test('Próximos 7 dias: de amanhã até hoje + 7, em ordem', () => {
  nova('hoje');
  nova('dia 4 10h', { data_tarefa: '2026-12-04', hora_tarefa: '10:00' });
  nova('amanhã', { data_tarefa: '2026-11-28' });
  nova('dia 4 sem hora', { data_tarefa: '2026-12-04' });
  nova('dia 5 (fora)', { data_tarefa: '2026-12-05' });
  assert.deepEqual(titulos(listarProximos7Dias(db, { agora })), ['amanhã', 'dia 4 sem hora', 'dia 4 10h']);
});

test('Histórico: concluídas nos últimos 30 dias, mais recentes primeiro', () => {
  nova('antiga', { concluida: 1, data_conclusao: '2026-10-27 23:59:59' });
  nova('há 30 dias', { concluida: 1, data_conclusao: '2026-10-28 08:00:00' });
  nova('ontem', { concluida: 1, data_conclusao: '2026-11-26 18:00:00' });
  nova('hoje', { concluida: 1, data_conclusao: '2026-11-27 09:00:00' });
  nova('pendente');
  assert.deepEqual(titulos(listarHistorico30Dias(db, { agora })), ['hoje', 'ontem', 'há 30 dias']);
});

test('Período: só ativas, entre as datas', () => {
  nova('sex');
  nova('sab', { data_tarefa: '2026-11-28' });
  nova('dom cancelada', { data_tarefa: '2026-11-29', cancelada: 1 });
  nova('seg', { data_tarefa: '2026-11-30' });
  assert.deepEqual(titulos(listarPorPeriodo(db, '2026-11-28', '2026-11-29')), ['sab']);
});
