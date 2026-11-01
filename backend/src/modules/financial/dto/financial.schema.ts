import { z } from 'zod';
import { createZodDto } from 'nestjs-zod';
import { FeeType, PaymentMethod, PaymentStatus, InvoiceStatus } from '@prisma/client';

// ==============================================================================
// 1. TABELA DE EMOLUMENTOS E TAXAS INSTITUCIONAIS (RF-20)
// ==============================================================================

export const createFeeCatalogSchema = z.object({
  code: z
    .string({ required_error: 'O codigo do emolumento e obrigatorio' })
    .min(2, 'O codigo deve ter no minimo 2 caracteres')
    .toUpperCase()
    .describe('Codigo identificador da taxa (ex.: PROP-LEI, MATR-2026)'),
  feeType: z
    .nativeEnum(FeeType, {
      errorMap: () => ({ message: 'Tipo de emolumento ou taxa invalido' }),
    })
    .describe('Categoria do emolumento'),
  name: z
    .string({ required_error: 'A denominacao do emolumento e obrigatoria' })
    .min(3, 'A denominacao deve ter no minimo 3 caracteres')
    .describe('Nome oficial da taxa (ex.: Propina Mensal - Engenharia Informatica)'),
  amount: z
    .number({ required_error: 'O valor do emolumento e obrigatorio' })
    .positive('O valor deve ser positivo')
    .describe('Valor monetario em Kwanzas (AOA)'),
  finePercentage: z
    .number()
    .min(0, 'A multa nao pode ser negativa')
    .max(100, 'A multa nao pode exceder 100%')
    .default(10.0)
    .describe('Percentual de multa por atraso no pagamento'),
  courseId: z.string().uuid('ID de curso invalido').optional().nullable(),
  academicYearId: z.string().uuid('ID de ano academico invalido').optional().nullable(),
});

export class CreateFeeCatalogDto extends createZodDto(createFeeCatalogSchema) {}
export type CreateFeeCatalogInput = z.infer<typeof createFeeCatalogSchema>;

// ==============================================================================
// 2. CONTA CORRENTE E OBRIGACOES FINANCEIRAS (RF-21)
// ==============================================================================

export const createInvoiceSchema = z.object({
  studentProfileId: z.string().uuid('ID de perfil do estudante invalido'),
  feeCatalogId: z.string().uuid('ID de catalogo de emolumento invalido').optional().nullable(),
  academicSemesterId: z.string().uuid('ID de semestre letivo invalido').optional().nullable(),
  title: z
    .string({ required_error: 'O titulo descritivo da cobranca e obrigatorio' })
    .min(3, 'O titulo deve ter no minimo 3 caracteres'),
  baseAmount: z
    .number({ required_error: 'O valor base e obrigatorio' })
    .positive('O valor base deve ser positivo'),
  dueDate: z
    .string({ required_error: 'A data de vencimento e obrigatoria' })
    .describe('Data limite de pagamento no formato ISO (ex.: 2026-03-31T23:59:59Z)'),
  monthReference: z.number().int().min(1).max(12).optional().nullable(),
  yearReference: z.number().int().min(2020).max(2100).optional().nullable(),
});

export class CreateInvoiceDto extends createZodDto(createInvoiceSchema) {}
export type CreateInvoiceInput = z.infer<typeof createInvoiceSchema>;

export const generateMonthlyInvoicesSchema = z.object({
  academicSemesterId: z.string().uuid('ID de semestre letivo invalido'),
  feeCatalogId: z.string().uuid('ID do emolumento de propina a faturar'),
  monthReference: z
    .number({ required_error: 'O mes de referencia e obrigatorio (1 a 12)' })
    .int()
    .min(1)
    .max(12),
  yearReference: z
    .number({ required_error: 'O ano de referencia e obrigatorio' })
    .int()
    .min(2020)
    .max(2100),
  dueDate: z
    .string({ required_error: 'A data de vencimento e obrigatoria' })
    .describe('Data limite para pagamento das propinas geradas'),
  courseId: z.string().uuid('ID de curso').optional().nullable(),
});

export class GenerateMonthlyInvoicesDto extends createZodDto(generateMonthlyInvoicesSchema) {}
export type GenerateMonthlyInvoicesInput = z.infer<typeof generateMonthlyInvoicesSchema>;

// ==============================================================================
// 3. SUBMISSAO DE COMPROVATIVO / BORDERO (RF-22)
// ==============================================================================

export const getPresignedUploadUrlSchema = z.object({
  fileName: z
    .string({ required_error: 'O nome do arquivo e obrigatorio' })
    .min(3, 'Nome de arquivo invalido'),
  contentType: z
    .string({ required_error: 'O tipo MIME do arquivo e obrigatorio' })
    .regex(/^(application\/pdf|image\/jpeg|image\/png|image\/webp)$/, {
      message: 'Apenas documentos PDF ou imagens JPEG/PNG/WEBP sao permitidos',
    }),
});

export class GetPresignedUploadUrlDto extends createZodDto(getPresignedUploadUrlSchema) {}
export type GetPresignedUploadUrlInput = z.infer<typeof getPresignedUploadUrlSchema>;

export const submitPaymentProofSchema = z.object({
  invoiceId: z.string().uuid('ID da fatura/obrigacao invalido'),
  bankName: z
    .string({ required_error: 'A denominacao da instituicao bancaria e obrigatoria' })
    .min(2, 'Nome do banco invalido (ex.: BAI, BFA, BIC, BMA)'),
  transactionReference: z
    .string({ required_error: 'O numero de transacao ou bordero e obrigatorio' })
    .min(3, 'Referencia da transacao deve ter no minimo 3 caracteres'),
  amount: z
    .number({ required_error: 'O valor pago e obrigatorio' })
    .positive('O valor pago deve ser maior que zero'),
  paymentDate: z
    .string({ required_error: 'A data do pagamento e obrigatoria' })
    .describe('Data da realizacao da transferencia/deposito no formato ISO'),
  paymentMethod: z
    .nativeEnum(PaymentMethod, {
      errorMap: () => ({ message: 'Metodo de pagamento invalido' }),
    })
    .default(PaymentMethod.TRANSFERENCIA_BANCARIA),
  receiptFileKey: z
    .string({ required_error: 'A chave do comprovativo no armazenamento MinIO e obrigatoria' })
    .min(5, 'Chave de arquivo invalida'),
  notes: z.string().max(500).optional().nullable(),
});

export class SubmitPaymentProofDto extends createZodDto(submitPaymentProofSchema) {}
export type SubmitPaymentProofInput = z.infer<typeof submitPaymentProofSchema>;

// ==============================================================================
// 4. VALIDACAO E CONFERENCIA DE PAGAMENTO PELA TESOURARIA (RF-22)
// ==============================================================================

export const validatePaymentProofSchema = z.object({
  status: z.enum(['APROVADO', 'REJEITADO'], {
    required_error: 'O status de validacao e obrigatorio (APROVADO ou REJEITADO)',
  }),
  rejectionReason: z
    .string()
    .max(500, 'O motivo da rejeicao nao pode exceder 500 caracteres')
    .optional()
    .nullable(),
  notes: z.string().max(500).optional().nullable(),
});

export class ValidatePaymentProofDto extends createZodDto(validatePaymentProofSchema) {}
export type ValidatePaymentProofInput = z.infer<typeof validatePaymentProofSchema>;

