// Validação (zod) dos dados de tarefas e regras de recorrência.
import { z } from 'zod';
import { ehDataValida, ehHoraValida, normalizarSiglaDia, ORDEM_DIAS } from '../datas.js';

const data = z.string().refine(ehDataValida, 'data deve ser AAAA-MM-DD');
const hora = z.string().refine(ehHoraValida, 'hora deve ser HH:MM');
const textoOpcional = z.string().trim().transform((t) => t || null).nullable();
const categoria = z.string().trim().toLowerCase().transform((t) => t || null).nullable();

export const PRIORIDADES = /** @type {const} */ (['normal', 'alta', 'urgente']);
const prioridade = z.enum(PRIORIDADES);
const origem = z.enum(['wpp', 'painel']);

/** Campos que o usuário pode informar (sem valores padrão, para servir também à edição parcial). */
const camposTarefa = {
  titulo: z.string().trim().min(1, 'título obrigatório'),
  descricao: textoOpcional,
  data_tarefa: data.nullable(),
  hora_tarefa: hora.nullable(),
  prioridade,
  categoria,
  origem,
};

export const esquemaNovaTarefa = z.strictObject(camposTarefa).partial().required({ titulo: true });
export const esquemaEdicaoTarefa = z.strictObject(camposTarefa).partial();

const dia = z.string().transform((t, ctx) => {
  const sigla = normalizarSiglaDia(t);
  if (!sigla) ctx.addIssue({ code: 'custom', message: `dia inválido: ${t}` });
  return sigla ?? '';
});

export const esquemaNovaRegra = z.strictObject({
  titulo: camposTarefa.titulo,
  descricao: textoOpcional.optional(),
  dias: z.array(dia).min(1, 'informe ao menos um dia')
    .transform((d) => ORDEM_DIAS.filter((s) => d.includes(s))),
  hora: hora.nullable().optional(),
  prioridade: prioridade.optional(),
  categoria: categoria.optional(),
  origem: origem.optional(),
});
