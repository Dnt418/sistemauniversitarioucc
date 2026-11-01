import { z } from 'zod';

export const envSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'production', 'test'])
    .default('development'),
  PORT: z.coerce.number().default(3000),
  API_PREFIX: z.string().default('api/v1'),

  // URLs de Banco de Dados (PostgreSQL + PgBouncer)
  DATABASE_URL: z.string().url().describe('URL do PostgreSQL via PgBouncer para a aplicação'),
  DIRECT_URL: z.string().url().describe('URL direta do PostgreSQL para migrações do Prisma'),

  // Redis (BullMQ, locks atômicos e cache)
  REDIS_URL: z.string().url().default('redis://:siga_redis_secret_2026@localhost:6380'),

  // Autenticação & JWT
  JWT_SECRET: z
    .string()
    .min(32, 'JWT_SECRET deve ter no mínimo 32 caracteres para garantir segurança criptográfica')
    .default('siga_super_secret_jwt_key_universitario_2026_angola_auth'),
  JWT_EXPIRES_IN: z.string().default('15m'),
  REFRESH_TOKEN_EXPIRES_IN: z.string().default('7d'),

  // CORS
  CORS_ORIGIN: z.string().default('http://localhost:5173,http://localhost:3000'),

  // Object Storage (MinIO / S3)
  S3_ENDPOINT: z.string().url().default('http://localhost:9000'),
  S3_REGION: z.string().default('us-east-1'),
  S3_ACCESS_KEY: z.string().default('minioadmin'),
  S3_SECRET_KEY: z.string().default('minioadmin_secret_2026'),
  S3_BUCKET_DOCUMENTS: z.string().default('siga-documents'),
  S3_BUCKET_PROOFS: z.string().default('siga-proofs'),
  S3_BUCKET_PAUTAS: z.string().default('siga-pautas'),

  // Servidor de Email (Mailpit / SMTP)
  SMTP_HOST: z.string().default('localhost'),
  SMTP_PORT: z.coerce.number().default(1025),
  SMTP_SECURE: z
    .enum(['true', 'false'])
    .transform((val) => val === 'true')
    .default('false'),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  SMTP_FROM: z.string().default('SIGA Universitário <nao-responder@siga.ao>'),
  PORTAL_URL: z.string().default('http://localhost:3000'),
});

export type EnvConfig = z.infer<typeof envSchema>;

/**
 * Validador customizado para o ConfigModule do NestJS.
 * Lança erro explícito no boot se faltar qualquer variável obrigatória ou com formato inválido.
 */
export function validateEnv(config: Record<string, unknown>): EnvConfig {
  const result = envSchema.safeParse(config);

  if (!result.success) {
    const formattedErrors = result.error.errors
      .map((err) => `  - [${err.path.join('.')}]: ${err.message}`)
      .join('\n');

    throw new Error(
      `\n[ERRO DE CONFIGURACAO] As variaveis de ambiente sao invalidas ou estao ausentes:\n${formattedErrors}\n`,
    );
  }

  return result.data;
}

