import { z } from 'zod';
import { createZodDto } from 'nestjs-zod';
import {
  PersonalDocumentType,
  DocumentValidationStatus,
  StudentCareerEventType,
  IssuedDocumentType,
  AcademicStatus,
} from '@prisma/client';

// ==============================================================================
// 1. PRONTUARIO GERAL E DOCUMENTOS PESSOAIS (RF-24)
// ==============================================================================

export const uploadPersonalDocumentSchema = z.object({
  documentType: z
    .nativeEnum(PersonalDocumentType, {
      errorMap: () => ({ message: 'Tipo de documento pessoal invalido' }),
    })
    .describe('Tipo de documento (BI, Certificado, Foto, Atestado)'),
  documentNumber: z
    .string()
    .max(100, 'O numero do documento nao pode exceder 100 caracteres')
    .optional()
    .nullable(),
  fileKey: z
    .string({ required_error: 'A chave do arquivo no armazenamento seguro e obrigatoria' })
    .min(5, 'Chave de arquivo invalida'),
});

export class UploadPersonalDocumentDto extends createZodDto(uploadPersonalDocumentSchema) {}
export type UploadPersonalDocumentInput = z.infer<typeof uploadPersonalDocumentSchema>;

export const validatePersonalDocumentSchema = z.object({
  status: z.enum(['VALIDADO', 'REJEITADO'], {
    required_error: 'O status deve ser VALIDADO ou REJEITADO',
  }),
  rejectionReason: z
    .string()
    .max(500, 'A justificativa de rejeicao nao pode exceder 500 caracteres')
    .optional()
    .nullable(),
  notes: z.string().max(500).optional().nullable(),
});

export class ValidatePersonalDocumentDto extends createZodDto(validatePersonalDocumentSchema) {}
export type ValidatePersonalDocumentInput = z.infer<typeof validatePersonalDocumentSchema>;

// ==============================================================================
// 2. GESTAO DE EVENTOS DE CARREIRA ACADEMICA (RF-24)
// ==============================================================================

export const registerCareerEventSchema = z.object({
  studentProfileId: z.string().uuid('ID de perfil do estudante invalido'),
  eventType: z
    .nativeEnum(StudentCareerEventType, {
      errorMap: () => ({ message: 'Tipo de evento de carreira academica invalido' }),
    })
    .describe('Evento de carreira (Trancamento, Anulacao, Transferencia, Desistencia)'),
  despachoNumber: z
    .string({ required_error: 'O numero do despacho regulamentar e obrigatorio' })
    .min(3, 'O despacho deve ter no minimo 3 caracteres')
    .describe('Identificador do despacho da Reitoria ou Secretaria Geral (ex.: Despacho nº 08/SG/2026)'),
  reason: z
    .string({ required_error: 'A justificativa formal e obrigatoria' })
    .min(10, 'A justificativa deve ter no minimo 10 caracteres'),
  newStatus: z
    .nativeEnum(AcademicStatus, {
      errorMap: () => ({ message: 'Novo estado academico invalido' }),
    })
    .describe('Novo estado academico a atribuir ao estudante'),
  details: z.record(z.any()).optional().nullable().describe('Informacoes adicionais estruturadas'),
});

export class RegisterCareerEventDto extends createZodDto(registerCareerEventSchema) {}
export type RegisterCareerEventInput = z.infer<typeof registerCareerEventSchema>;

// ==============================================================================
// 3. EMISSAO AUTOMATIZADA DE DOCUMENTOS ACADEMICOS (RF-25)
// ==============================================================================

export const requestDocumentEmissionSchema = z.object({
  documentType: z
    .nativeEnum(IssuedDocumentType, {
      errorMap: () => ({ message: 'Tipo de documento academico para emissao invalido' }),
    })
    .describe('Tipo de certidao ou declaracao'),
  academicSemesterId: z.string().uuid('ID de semestre invalido').optional().nullable(),
  purpose: z.string().max(255).optional().nullable().describe('Finalidade da emissao do documento'),
});

export class RequestDocumentEmissionDto extends createZodDto(requestDocumentEmissionSchema) {}
export type RequestDocumentEmissionInput = z.infer<typeof requestDocumentEmissionSchema>;

