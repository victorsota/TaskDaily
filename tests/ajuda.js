// Utilitários dos testes (não é arquivo de teste: não termina em .test.js).
import { abrirBanco } from '../shared/db/conexao.js';

/** Horário de São Paulo → Date. Ex.: sp('2026-11-27 10:00') (sexta-feira). */
export const sp = (dataHora) => new Date(`${dataHora.replace(' ', 'T')}${dataHora.length === 16 ? ':00' : ''}-03:00`);

export const bancoNovo = () => abrirBanco(':memory:');
