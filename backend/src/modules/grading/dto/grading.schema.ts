import { z } from 'zod';
import { createZodDto } from 'nestjs-zod';
import { AcademicFinalState } from '@prisma/client';

// ==============================================================================
// 1. ASSIDUIDADE E DIARIO DE CLASSE (RF-13)
// ==============================================================================

export const singleAttendanceRecordSchema = z.object({
  enrollmentId: z.string().uuid('ID de inscricao invalido'),
  isPresent: z.boolean({ required_error: 'O indicador de presenca e obrigatorio' }),
  isJustified: z.boolean().default(false),
  justificationReason: z.string().max(255, 'A justificativa nao pode exceder 255 caracteres').optional().nullable(),
});

export const recordAttendanceSchema = z.object({
  lessonDate: z
    .string({ required_error: 'A data da aula lecionada e obrigatoria' })
    .describe('Data da aula no formato ISO (ex.: 2026-03-24T08:00:00Z)'),
  lessonSummary: z
    .string()
    .max(500, 'O sumario da aula nao pode exceder 500 caracteres')
    .optional()
    .nullable()
    .describe('Sumario dos conteudos lecionados'),
  hoursTaught: z
    .number({ invalid_type_error: 'A quantidade de horas lecionadas deve ser numerica' })
    .int('O numero de horas deve ser inteiro')
    .min(1, 'Minimo de 1 hora lecionada')
    .max(6, 'Maximo de 6 horas lecionadas por sessao')
    .default(2)
    .describe('Carga horaria lecionada nesta aula'),
  records: z
    .array(singleAttendanceRecordSchema)
    .min(1, 'E necessario registrar a presenca de pelo menos um estudante'),
});

export class RecordAttendanceDto extends createZodDto(recordAttendanceSchema) {}
export type RecordAttendanceInput = z.infer<typeof recordAttendanceSchema>;

// ==============================================================================
// 2. LANCAMENTO E ATUALIZACAO DE NOTAS (RF-14, RF-15)
// ==============================================================================

export const gradeValueSchema = z
  .number({ invalid_type_error: 'A classificacao deve ser numerica' })
  .min(0, 'A classificacao minima e 0.0 valores')
  .max(20, 'A classificacao maxima e 20.0 valores')
  .optional()
  .nullable();

export const singleStudentGradeSchema = z.object({
  enrollmentId: z.string().uuid('ID de inscricao invalido'),
  frequencia1: gradeValueSchema.describe('Nota da 1ª frequencia/avaliacao (0 a 20)'),
  frequencia2: gradeValueSchema.describe('Nota da 2ª frequencia/avaliacao (0 a 20)'),
  trabalhoPratico: gradeValueSchema.describe('Nota do trabalho pratico/laboratorial (0 a 20)'),
  exameNormal: gradeValueSchema.describe('Nota do exame de 1ª epoca / normal (0 a 20)'),
  exameRecurso: gradeValueSchema.describe('Nota do exame de 2ª epoca / recurso (0 a 20)'),
  exameMelhoria: gradeValueSchema.describe('Nota do exame de melhoria (0 a 20)'),
  observacoes: z.string().max(255).optional().nullable(),
});

export const updateGradesSchema = z.object({
  grades: z
    .array(singleStudentGradeSchema)
    .min(1, 'E necessario submeter a classificacao de pelo menos um estudante'),
});

export class UpdateGradesDto extends createZodDto(updateGradesSchema) {}
export type UpdateGradesInput = z.infer<typeof updateGradesSchema>;

// ==============================================================================
// 3. SUBMISSAO E CONGELAMENTO DE PAUTA (RF-15)
// ==============================================================================

export const submitPautaSchema = z.object({
  observacoes: z
    .string()
    .max(500, 'Observacoes nao podem exceder 500 caracteres')
    .optional()
    .nullable()
    .describe('Observacoes gerais para homologacao da pauta'),
});

export class SubmitPautaDto extends createZodDto(submitPautaSchema) {}
export type SubmitPautaInput = z.infer<typeof submitPautaSchema>;

// ==============================================================================
// 4. RETIFICACAO ADMINISTRATIVA DE PAUTA (RF-26)
// ==============================================================================

export const rectificationItemSchema = z.object({
  enrollmentId: z.string().uuid('ID de inscricao invalido'),
  frequencia1: gradeValueSchema,
  frequencia2: gradeValueSchema,
  trabalhoPratico: gradeValueSchema,
  exameNormal: gradeValueSchema,
  exameRecurso: gradeValueSchema,
  exameMelhoria: gradeValueSchema,
  novaNotaFinal: gradeValueSchema.describe('Nova nota final retificada (0 a 20)'),
  novoEstadoFinal: z
    .nativeEnum(AcademicFinalState, {
      errorMap: () => ({ message: 'Estado final academico invalido' }),
    })
    .optional(),
  motivo: z
    .string({ required_error: 'O motivo especifico da alteracao do estudante e obrigatorio' })
    .min(5, 'O motivo deve ter no minimo 5 caracteres'),
});

export const rectifyPautaSchema = z.object({
  despacho: z
    .string({ required_error: 'O numero do despacho ou protocolo formal e obrigatorio' })
    .min(3, 'O despacho deve ter no minimo 3 caracteres')
    .describe('Numero ou identificador formal do despacho (ex.: Despacho nº 12/CP/2026)'),
  justificativa: z
    .string({ required_error: 'A justificativa institucional e obrigatoria' })
    .min(10, 'A justificativa institucional deve ter no minimo 10 caracteres')
    .describe('Justificativa da decisao do Conselho Pedagogico ou Secretaria'),
  retificacoes: z
    .array(rectificationItemSchema)
    .min(1, 'E necessario informar ao menos uma retificacao de estudante'),
});

export class RectifyPautaDto extends createZodDto(rectifyPautaSchema) {}
export type RectifyPautaInput = z.infer<typeof rectifyPautaSchema>;

