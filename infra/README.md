# Infraestrutura Local do SIGA Universitário (Fase 0)

Este diretório contém a especificação e orquestração de todos os serviços de apoio necessários para a execução do backend monólito modular do SIGA Universitário, conforme detalhado no [TECH_STACK.md](../TECH_STACK.md) e [ARQUETECTURA.md](../ARQUETECTURA.md).

---

## 1. Serviços Orquestrados

| Serviço | Imagem | Porta Externa | Finalidade no SIGA |
| :--- | :--- | :--- | :--- |
| **PostgreSQL 16** | `postgres:16-alpine` | `5432` | Banco relacional primário para escrita e leitura direta de migrações. |
| **PgBouncer** | `edoburu/pgbouncer:v1.22.1` | `6432` | Connection pooler em modo `transaction` para suportar milhares de conexões simultâneas da API NestJS. |
| **Redis 7** | `redis:7-alpine` | `6379` | Barramento para BullMQ (filas assíncronas), cache de sessões e scripts Lua atômicos para reservas de vagas. |
| **MinIO** | `minio/minio:latest` | `9000` (API)<br>`9001` (Web Console) | Object Storage S3-compatible para borderôs bancários, fotos de alunos e PDFs de declarações/pautas. |
| **MinIO Init** | `minio/mc:latest` | - | Inicializador automático dos buckets padrão (`siga-documents`, `siga-proofs`, `siga-pautas`). |
| **Mailpit** | `axllent/mailpit:latest` | `1025` (SMTP)<br>`8025` (Web UI) | Servidor SMTP mock local para capturar e visualizar emails de recuperação de senha (RF-03) e avisos. |

---

## 2. Como Subir a Infraestrutura com Docker

Certifique-se de ter o Docker Desktop em execução e execute dentro desta pasta:

```bash
# Iniciar todos os serviços em background
docker compose up -d

# Visualizar logs em tempo real
docker compose logs -f

# Parar todos os serviços
docker compose down

# Parar e remover volumes (Atenção: apaga os dados locais)
docker compose down -v
```

---

## 3. URLs de Acesso Rápido nos Navegadores

- **Console Web do MinIO:** [http://localhost:9001](http://localhost:9001)
  - **Usuário:** `minioadmin`
  - **Senha:** `minioadmin_secret_2026`
- **Painel de Emails do Mailpit:** [http://localhost:8025](http://localhost:8025)

---

## 4. Strings de Conexão Recomendadas para o Backend (`.env`)

Ao configurar o arquivo `.env` do backend (`/backend/.env`):

```env
# Conexão direta com PostgreSQL (para o Prisma rodar migrações)
DIRECT_URL="postgresql://siga_admin:siga_secret_password_2026@localhost:5432/siga_universitario?schema=public"

# Conexão otimizada via PgBouncer (para a aplicação em tempo de execução)
DATABASE_URL="postgresql://siga_admin:siga_secret_password_2026@localhost:6432/siga_universitario?schema=public&pgbouncer=true"

# Redis (com senha configurada)
REDIS_URL="redis://:siga_redis_secret_2026@localhost:6379"

# MinIO / S3
S3_ENDPOINT="http://localhost:9000"
S3_REGION="us-east-1"
S3_ACCESS_KEY="minioadmin"
S3_SECRET_KEY="minioadmin_secret_2026"
S3_BUCKET_DOCUMENTS="siga-documents"
S3_BUCKET_PROOFS="siga-proofs"
S3_BUCKET_PAUTAS="siga-pautas"

# SMTP (Mailpit)
SMTP_HOST="localhost"
SMTP_PORT=1025
SMTP_SECURE=false
```

---

## 5. Nota sobre Ambiente sem Docker

Caso o desenvolvedor não tenha o Docker Desktop ativo no Windows:
1. **Redis:** Já se encontra instalado e ativo como serviço nativo do Windows em `localhost:6379`.
2. **PostgreSQL:** Pode ser utilizada uma instância local do PostgreSQL ou uma base na nuvem gratuita para desenvolvimento (ex.: Neon, Supabase, Railway).
3. **MinIO / Storage:** Pode ser utilizado um bucket gratuito no Cloudflare R2 ou AWS S3 configurando as chaves correspondentes.

