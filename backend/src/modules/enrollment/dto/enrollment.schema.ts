import { z } from 'zod';
import { createZodDto } from 'nestjs-zod';

// ==============================================================================
// ESQUEMAS DE INSCRICAO / MATRICULA ONLINE (RF-09, RF-10)
// ==============================================================================

export const enrollStudentSchema = z.object({
  academicSemesterId: z.string().uuid('ID do semestre academico invalido'),
  turmaIds: z
    .array(z.string().uuid('ID de turma invalido'))
    .min(1, 'Selecione pelo menos uma turma para efetuar a inscricao')
    .max(8, 'O limite maximo de cadeiras por periodo e de 8 turmas')
    .describe('Lista de turmas selecionadas pelo estudante'),
});

export class EnrollStudentDto extends createZodDto(enrollStudentSchema) {}
export type EnrollStudentInput = z.infer<typeof enrollStudentSchema>;

export const cancelEnrollmentSchema = z.object({
  enrollmentId: z.string().uuid('ID da matricula invalido'),
  justificativa: z
    .string()
    .min(5, 'A justificativa de cancelamento deve ter pelo menos 5 caracteres')
    .optional(),
});

export class CancelEnrollmentDto extends createZodDto(cancelEnrollmentSchema) {}
export type CancelEnrollmentInput = z.infer<typeof cancelEnrollmentSchema>;

