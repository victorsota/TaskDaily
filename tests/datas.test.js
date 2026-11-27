import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  hoje, amanha, horaAgora, agoraSP, somarDias, somarSegundos, siglaDoDia, ehFimDeSemana,
  normalizarSiglaDia, proximoDiaDaSemana, semanaQueVem, formatarData, ehDataValida, ehHoraValida,
} from '../shared/datas.js';
import { sp } from './ajuda.js';

// 2026-11-27 é sexta-feira.

test('virada do dia à meia-noite de São Paulo', () => {
  assert.equal(hoje(sp('2026-11-27 23:59')), '2026-11-27');
  assert.equal(amanha(sp('2026-11-27 23:59')), '2026-11-28');
  assert.equal(hoje(sp('2026-11-28 00:00')), '2026-11-28');
  assert.equal(amanha(sp('2026-11-28 00:00')), '2026-11-29');
});

test('usa o fuso de São Paulo, não UTC', () => {
  // 02:30 UTC do dia 28 ainda é 23:30 do dia 27 em São Paulo.
  const agora = new Date('2026-11-28T02:30:00Z');
  assert.equal(hoje(agora), '2026-11-27');
  assert.equal(horaAgora(agora), '23:30');
  assert.equal(agoraSP(agora), '2026-11-27 23:30:00');
});

test('somar dias e segundos atravessando mês, ano e meia-noite', () => {
  assert.equal(somarDias('2026-11-30', 1), '2026-12-01');
  assert.equal(somarDias('2026-12-31', 1), '2027-01-01');
  assert.equal(somarDias('2026-03-01', -1), '2026-02-28');
  assert.equal(somarSegundos('2026-11-27 23:59:30', 60), '2026-11-28 00:00:30');
});

test('dias da semana', () => {
  assert.equal(siglaDoDia('2026-11-27'), 'sex');
  assert.equal(ehFimDeSemana('2026-11-28'), true);
  assert.equal(ehFimDeSemana('2026-11-27'), false);
  assert.equal(normalizarSiglaDia('Sábado'), 'sab');
  assert.equal(normalizarSiglaDia('terça-feira'), 'ter');
  assert.equal(normalizarSiglaDia('xyz'), null);
});

test('datas relativas: próximo dia da semana e semana que vem', () => {
  const sexta = sp('2026-11-27 10:00');
  assert.equal(proximoDiaDaSemana('terça-feira', { agora: sexta }), '2026-12-01');
  assert.equal(proximoDiaDaSemana('sábado', { agora: sexta }), '2026-11-28');
  assert.equal(proximoDiaDaSemana('sexta', { agora: sexta }), '2026-12-04', 'hoje não conta por padrão');
  assert.equal(proximoDiaDaSemana('sex', { agora: sexta, incluirHoje: true }), '2026-11-27');
  assert.equal(semanaQueVem(sexta), '2026-11-30');
  assert.throws(() => proximoDiaDaSemana('feriado', { agora: sexta }));
});

test('formatação pt-BR', () => {
  assert.equal(formatarData('2026-11-27'), 'sexta-feira, 27/11');
  assert.equal(formatarData('2026-11-28', { comAno: true, comDiaDaSemana: false }), '28/11/2026');
});

test('validação de data e hora', () => {
  assert.equal(ehDataValida('2026-11-27'), true);
  assert.equal(ehDataValida('2026-02-30'), false);
  assert.equal(ehDataValida('27/11/2026'), false);
  assert.equal(ehHoraValida('07:00'), true);
  assert.equal(ehHoraValida('24:00'), false);
  assert.equal(ehHoraValida('7:00'), false);
});
