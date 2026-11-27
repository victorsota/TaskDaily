// Recorrência: a regra fica em `regras_recorrencia`; cada ocorrência vira uma linha em `tarefas`
// com `regra_id`. O índice único (regra_id, data_tarefa) impede duplicar a mesma ocorrência.
import { hoje, horaAgora, somarDias, siglaDoDia, normalizarSiglaDia, ehHoraValida, ORDEM_DIAS } from '../datas.js';
import { esquemaNovaRegra } from './esquemas.js';
import { registrarUltimaAcao } from './estado-conversa.js';

/** @typedef {import('better-sqlite3').Database} DB */
/** @typedef {import('../db/repositorios/tarefas.js').Tarefa} Tarefa */

export const DIAS_A_FRENTE = 7;

/**
 * "seg,qua,sex 07:00" → { dias: ['seg','qua','sex'], hora: '07:00' }. Hora é opcional.
 * @param {string} texto @returns {{ dias: string[], hora: string | null }}
 */
export function interpretarRegra(texto) {
  const [diasTexto = '', hora = null, ...resto] = texto.trim().split(/\s+/);
  const dias = diasTexto.split(',').map(normalizarSiglaDia);
  if (resto.length || !diasTexto || dias.includes(null) || (hora !== null && !ehHoraValida(hora))) {
    throw new Error(`Regra de recorrência inválida: "${texto}"`);
  }
  return { dias: ORDEM_DIAS.filter((d) => dias.includes(d)), hora };
}

/** @param {{ dias: string[], hora?: string | null }} regra @returns {string} ex.: "seg,qua,sex 07:00" */
export function formatarRegra({ dias, hora = null }) {
  const ordenados = ORDEM_DIAS.filter((d) => dias.includes(d)).join(',');
  return hora ? `${ordenados} ${hora}` : ordenados;
}

/**
 * Gera as ocorrências que faltam de hoje até hoje + 6 (7 dias), sem duplicar.
 * Ocorrência de hoje cujo horário já passou não é criada.
 * Seguro para rodar várias vezes (o agendador chama uma vez por dia).
 * @param {DB} db @param {{ agora?: Date, regraId?: number }} [opcoes]
 * @returns {Tarefa[]} só as ocorrências novas
 */
export function gerarOcorrencias(db, { agora = new Date(), regraId } = {}) {
  const regras = db.prepare(`SELECT * FROM regras_recorrencia WHERE ativa = 1 ${regraId ? 'AND id = ?' : ''}`)
    .all(...(regraId ? [regraId] : []));
  const inserir = db.prepare(`INSERT OR IGNORE INTO tarefas
      (titulo, descricao, data_tarefa, hora_tarefa, prioridade, categoria, recorrente, regra_recorrencia, regra_id, origem)
    VALUES (@titulo, @descricao, @data, @hora, @prioridade, @categoria, 1, @texto, @id, @origem)`);
  const obter = db.prepare('SELECT * FROM tarefas WHERE id = ?');
  const dia = hoje(agora);
  const agoraHora = horaAgora(agora);

  return db.transaction(() => {
    /** @type {Tarefa[]} */
    const novas = [];
    for (const regra of regras) {
      const dias = regra.dias.split(',');
      const texto = formatarRegra({ dias, hora: regra.hora });
      for (let i = 0; i < DIAS_A_FRENTE; i++) {
        const data = somarDias(dia, i);
        if (!dias.includes(siglaDoDia(data))) continue;
        if (i === 0 && regra.hora && regra.hora < agoraHora) continue;
        const r = inserir.run({ ...regra, data, texto });
        if (r.changes) novas.push(obter.get(r.lastInsertRowid));
      }
    }
    return novas;
  })();
}

/**
 * Salva a regra e já gera as ocorrências dos próximos 7 dias. Desfazer remove regra e ocorrências.
 * @param {DB} db @param {Record<string, unknown>} dados { titulo, dias: ['seg','qua'], hora?, prioridade?, categoria?, origem? }
 * @param {{ agora?: Date }} [opcoes]
 * @returns {{ regra: Record<string, any>, ocorrencias: Tarefa[] }}
 */
export function criarRegraRecorrencia(db, dados, opcoes = {}) {
  const valido = esquemaNovaRegra.parse(dados);
  return db.transaction(() => {
    const { lastInsertRowid } = db.prepare(`INSERT INTO regras_recorrencia
        (titulo, descricao, dias, hora, prioridade, categoria, origem)
      VALUES (@titulo, @descricao, @dias, @hora, @prioridade, @categoria, @origem)`).run({
      descricao: null, hora: null, prioridade: 'normal', categoria: null, origem: 'painel',
      ...Object.fromEntries(Object.entries(valido).filter(([, v]) => v !== undefined)),
      dias: valido.dias.join(','),
    });
    const id = Number(lastInsertRowid);
    const regra = db.prepare('SELECT * FROM regras_recorrencia WHERE id = ?').get(id);
    const ocorrencias = gerarOcorrencias(db, { ...opcoes, regraId: id });
    registrarUltimaAcao(db, {
      descricao: `criou a recorrência "${regra.titulo}" (${formatarRegra({ dias: valido.dias, hora: regra.hora })})`,
      alteracoes: [
        { tabela: 'regras_recorrencia', id, antes: null },
        ...ocorrencias.map((t) => ({ tabela: 'tarefas', id: t.id, antes: null })),
      ],
    }, opcoes);
    return { regra, ocorrencias };
  })();
}
