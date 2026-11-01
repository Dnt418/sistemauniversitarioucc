import { z } from "zod";
import { createZodDto } from "nestjs-zod";

// ESQUEMA DE LOGIN CENTRALIZADO (RF-01)

export const loginSchema = z.object({
  identifier: z
    .string({ required_error: "O identificador de acesso é obrigatório" })
    .min(3, "O identificador deve conter pelo menos 3 caracteres")
    .describe(
      "Email institucional, Número de Matrícula/Processo ou Bilhete de Identidade (BI)",
    ),
  password: z
    .string({ required_error: "A senha é obrigatória" })
    .min(6, "A senha deve conter pelo menos 6 caracteres")
    .describe("Senha criptografada do utilizador"),
});

export class LoginDto extends createZodDto(loginSchema) {}
export type LoginInput = z.infer<typeof loginSchema>;

// ESQUEMA DE TROCA DINÂMICA DE PERFIL (RF-02)

export const switchProfileSchema = z.object({
  targetRole: z
    .enum(
      [
        "SUPER_ADMIN",
        "SECRETARIA",
        "COORDENADOR",
        "DOCENTE",
        "ESTUDANTE",
        "FINANCEIRO",
      ],
      { required_error: "O papel de destino é obrigatório" },
    )
    .describe(
      "Papel institucional para o qual o utilizador deseja alternar o contexto",
    ),
});

export class SwitchProfileDto extends createZodDto(switchProfileSchema) {}
export type SwitchProfileInput = z.infer<typeof switchProfileSchema>;

// ESQUEMA DE RECUPERAÇÃO DE SENHA (RF-03)

export const forgotPasswordSchema = z.object({
  email: z
    .string({ required_error: "O email é obrigatório" })
    .email("Endereço de email inválido")
    .describe("Email institucional cadastrado"),
});

export class ForgotPasswordDto extends createZodDto(forgotPasswordSchema) {}
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;

export const resetPasswordSchema = z.object({
  token: z
    .string({ required_error: "O token de redefinição é obrigatório" })
    .min(10, "Token inválido ou malformado")
    .describe("Token de uso único recebido para redefinição de senha"),
  newPassword: z
    .string({ required_error: "A nova senha é obrigatória" })
    .min(6, "A nova senha deve ter no mínimo 6 caracteres")
    .describe("Nova senha do utilizador"),
});

export class ResetPasswordDto extends createZodDto(resetPasswordSchema) {}
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;

// ESQUEMA DE ALTERAÇÃO VOLUNTÁRIA DE SENHA

export const changePasswordSchema = z.object({
  currentPassword: z
    .string({ required_error: "A senha atual é obrigatória" })
    .min(6, "Senha atual inválida"),
  newPassword: z
    .string({ required_error: "A nova senha é obrigatória" })
    .min(6, "A nova senha deve ter no mínimo 6 caracteres"),
});

export class ChangePasswordDto extends createZodDto(changePasswordSchema) {}
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
