// Datas no fuso de São Paulo, independentes do fuso configurado no Windows.
// Formatos: data "AAAA-MM-DD", hora "HH:MM", data-hora "AAAA-MM-DD HH:MM:SS" (mesmo formato do banco).
// Toda função que depende do "agora" aceita um `Date` para facilitar os testes.

export const FUSO = 'America/Sao_Paulo';

/** Siglas na ordem de `Date#getUTCDay()` (0 = domingo). */
export const SIGLAS_DIAS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sab'];
export const NOMES_DIAS = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];
/** Ordem de exibição (semana começando na segunda). */
export const ORDEM_DIAS = ['seg', 'ter', 'qua', 'qui', 'sex', 'sab', 'dom'];

const formatador = new Intl.DateTimeFormat('en-CA', {
  timeZone: FUSO, year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
});

/** @param {Date} agora */
function partes(agora) {
  /** @type {Record<string, string>} */
  const p = {};
  for (const { type, value } of formatador.formatToParts(agora)) p[type] = value;
  return p;
}

/** Data de hoje em São Paulo. @param {Date} [agora] @returns {string} AAAA-MM-DD */
export function hoje(agora = new Date()) {
  const p = partes(agora);
  return `${p.year}-${p.month}-${p.day}`;
}

/** Hora atual em São Paulo. @param {Date} [agora] @returns {string} HH:MM */
export function horaAgora(agora = new Date()) {
  const p = partes(agora);
  return `${p.hour}:${p.minute}`;
}

/** Data-hora atual em São Paulo. @param {Date} [agora] @returns {string} AAAA-MM-DD HH:MM:SS */
export function agoraSP(agora = new Date()) {
  const p = partes(agora);
  return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}:${p.second}`;
}

/** @param {string} data AAAA-MM-DD */
const comoUTC = (data) => new Date(`${data}T00:00:00Z`);

/** @param {string} data @param {number} dias @returns {string} */
export function somarDias(data, dias) {
  const d = comoUTC(data);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

/** @param {Date} [agora] */
export const amanha = (agora = new Date()) => somarDias(hoje(agora), 1);

/** @param {string} dataHora AAAA-MM-DD HH:MM:SS @param {number} segundos @returns {string} */
export function somarSegundos(dataHora, segundos) {
  const d = new Date(`${dataHora.replace(' ', 'T')}Z`);
  return new Date(d.getTime() + segundos * 1000).toISOString().slice(0, 19).replace('T', ' ');
}

/** @param {string} data @returns {number} 0 = domingo ... 6 = sábado */
export const diaDaSemana = (data) => comoUTC(data).getUTCDay();

/** @param {string} data @returns {string} ex.: "seg" */
export const siglaDoDia = (data) => SIGLAS_DIAS[diaDaSemana(data)];

/** @param {string} data */
export const ehFimDeSemana = (data) => [0, 6].includes(diaDaSemana(data));

/**
 * Converte "Sábado", "sáb", "terça-feira", "qua" em sigla ("sab", "ter", "qua").
 * @param {string} texto @returns {string | null} null se não reconhecer
 */
export function normalizarSiglaDia(texto) {
  const sigla = texto.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase().slice(0, 3);
  return SIGLAS_DIAS.includes(sigla) ? sigla : null;
}

/**
 * Próxima data que cai no dia da semana pedido ("terça-feira" → próxima terça).
 * @param {string} dia sigla ou nome do dia
 * @param {{ agora?: Date, incluirHoje?: boolean }} [opcoes] incluirHoje: se hoje já é o dia, devolve hoje
 * @returns {string}
 */
export function proximoDiaDaSemana(dia, { agora = new Date(), incluirHoje = false } = {}) {
  const alvo = SIGLAS_DIAS.indexOf(normalizarSiglaDia(dia) ?? '');
  if (alvo < 0) throw new Error(`Dia da semana inválido: ${dia}`);
  const base = hoje(agora);
  const distancia = (alvo - diaDaSemana(base) + 7) % 7;
  return somarDias(base, distancia === 0 && !incluirHoje ? 7 : distancia);
}

/** "Semana que vem" = a segunda-feira seguinte. @param {Date} [agora] */
export const semanaQueVem = (agora = new Date()) => proximoDiaDaSemana('seg', { agora });

/**
 * @param {string} data
 * @param {{ comAno?: boolean, comDiaDaSemana?: boolean }} [opcoes]
 * @returns {string} ex.: "sexta-feira, 27/11" ou "27/11/2026"
 */
export function formatarData(data, { comAno = false, comDiaDaSemana = true } = {}) {
  const [a, m, d] = data.split('-');
  const curta = comAno ? `${d}/${m}/${a}` : `${d}/${m}`;
  return comDiaDaSemana ? `${NOMES_DIAS[diaDaSemana(data)]}, ${curta}` : curta;
}

/** @param {unknown} texto */
export function ehDataValida(texto) {
  return typeof texto === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(texto)
    && !Number.isNaN(comoUTC(texto).getTime()) && comoUTC(texto).toISOString().startsWith(texto);
}

/** @param {unknown} texto */
export const ehHoraValida = (texto) => typeof texto === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(texto);
