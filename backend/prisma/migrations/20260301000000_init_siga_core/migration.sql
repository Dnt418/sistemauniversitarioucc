-- CreateEnum
CREATE TYPE "AccountStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'SUSPENDED', 'PENDING_VERIFICATION');

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('SUPER_ADMIN', 'SECRETARIA', 'COORDENADOR', 'DOCENTE', 'ESTUDANTE', 'FINANCEIRO');

-- CreateEnum
CREATE TYPE "Gender" AS ENUM ('MASCULINO', 'FEMININO', 'OUTRO');

-- CreateEnum
CREATE TYPE "AcademicStatus" AS ENUM ('REGULAR', 'TRANCADO', 'CONCLUIDO', 'DESISTENTE', 'TRANSFERIDO', 'SUSPENSO');

-- CreateEnum
CREATE TYPE "DocenteCategory" AS ENUM ('ASSISTENTE_ESTAGIARIO', 'ASSISTENTE', 'PROFESSOR_AUXILIAR', 'PROFESSOR_ASSOCIADO', 'PROFESSOR_CATEDRATICO');

-- CreateEnum
CREATE TYPE "DocenteRegime" AS ENUM ('INTEGRAL', 'TEMPO_PARCIAL', 'COLABORADOR');

-- CreateEnum
CREATE TYPE "DegreeLevel" AS ENUM ('LICENCIATURA', 'MESTRADO', 'DOUTORAMENTO', 'POS_GRADUACAO');

-- CreateEnum
CREATE TYPE "RegimeAcademico" AS ENUM ('SEMESTRAL', 'ANUAL');

-- CreateEnum
CREATE TYPE "TurmaTurno" AS ENUM ('MANHA', 'TARDE', 'POS_LABORAL');

-- CreateEnum
CREATE TYPE "EnrollmentStatus" AS ENUM ('CONFIRMADA', 'PENDENTE', 'CANCELADA', 'ANULADA');

-- CreateEnum
CREATE TYPE "PautaStatus" AS ENUM ('EM_LANCAMENTO', 'SUBMETIDA', 'HOMOLOGADA', 'CONGELADA');

-- CreateEnum
CREATE TYPE "AcademicFinalState" AS ENUM ('APROVADO', 'ADMITIDO_RECURSO', 'REPROVADO_NOTA', 'REPROVADO_FALTA', 'DISPENSADO_EXAME');

-- CreateEnum
CREATE TYPE "FeeType" AS ENUM ('MATRICULA', 'CONFIRMACAO_MATRICULA', 'PROPINA_MENSAL', 'EXAME_RECURSO', 'DECLARACAO_COM_NOTAS', 'DECLARACAO_SEM_NOTAS', 'CERTIFICADO', 'OUTRO');

-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('PENDENTE', 'EM_ANALISE', 'PAGO', 'VENCIDO', 'CANCELADO');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('DEPOSITO_BANCARIO', 'TRANSFERENCIA_BANCARIA', 'MULTICAIXA_EXPRESS', 'TPA_PRESENCIAL', 'OUTRO');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PENDENTE', 'APROVADO', 'REJEITADO', 'ESTORNADO');

-- CreateEnum
CREATE TYPE "PersonalDocumentType" AS ENUM ('BILHETE_IDENTIDADE', 'CERTIFICADO_ENSINO_MEDIO', 'FOTOGRAFIA_PASSE', 'ATESTADO_MEDICO', 'OUTRO');

-- CreateEnum
CREATE TYPE "DocumentValidationStatus" AS ENUM ('PENDENTE', 'VALIDADO', 'REJEITADO');

-- CreateEnum
CREATE TYPE "StudentCareerEventType" AS ENUM ('TRANCAMENTO_TOTAL', 'TRANCAMENTO_PARCIAL', 'ANULACAO_MATRICULA', 'TRANSFERENCIA_CURSO', 'TRANSFERENCIA_POLO', 'DESISTENCIA', 'REATIVACAO', 'GRADUACAO');

-- CreateEnum
CREATE TYPE "IssuedDocumentType" AS ENUM ('DECLARACAO_MATRICULA_SEM_NOTAS', 'DECLARACAO_MATRICULA_COM_NOTAS', 'HISTORICO_ESCOLAR_PARCIAL', 'CERTIDAO_DE_NOTAS', 'GUIA_TRANSFERENCIA');

-- CreateEnum
CREATE TYPE "IssuedDocumentStatus" AS ENUM ('PROCESSANDO', 'EMITIDO', 'REVOGADO', 'FALHA');

-- CreateEnum
CREATE TYPE "AuditAction" AS ENUM ('CREATE', 'UPDATE', 'DELETE', 'STATUS_CHANGE', 'LOGIN', 'LOGOUT', 'PROFILE_SWITCH');

-- CreateTable
CREATE TABLE "accounts" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "status" "AccountStatus" NOT NULL DEFAULT 'ACTIVE',
    "roles" "UserRole"[] DEFAULT ARRAY['ESTUDANTE']::"UserRole"[],
    "last_login_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "student_profiles" (
    "id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "student_number" TEXT NOT NULL,
    "identity_card_number" TEXT NOT NULL,
    "full_name" TEXT NOT NULL,
    "birth_date" TIMESTAMP(3),
    "gender" "Gender",
    "phone_number" TEXT,
    "photo_url" TEXT,
    "academic_status" "AcademicStatus" NOT NULL DEFAULT 'REGULAR',
    "current_year" INTEGER NOT NULL DEFAULT 1,
    "admission_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "course_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "student_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "docente_profiles" (
    "id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "mechanographic_number" TEXT NOT NULL,
    "identity_card_number" TEXT NOT NULL,
    "full_name" TEXT NOT NULL,
    "category" "DocenteCategory" NOT NULL DEFAULT 'ASSISTENTE',
    "regime" "DocenteRegime" NOT NULL DEFAULT 'INTEGRAL',
    "academic_degree" TEXT NOT NULL,
    "specialization" TEXT,
    "phone_number" TEXT,
    "photo_url" TEXT,
    "department_id" UUID,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "docente_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "staff_profiles" (
    "id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "employee_number" TEXT NOT NULL,
    "identity_card_number" TEXT NOT NULL,
    "full_name" TEXT NOT NULL,
    "department" TEXT NOT NULL,
    "job_title" TEXT NOT NULL,
    "phone_number" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "staff_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "coordinator_profiles" (
    "id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "course_id" UUID,
    "appointment_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "coordinator_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "faculties" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "faculties_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "departments" (
    "id" UUID NOT NULL,
    "faculty_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "departments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "courses" (
    "id" UUID NOT NULL,
    "department_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "degree_level" "DegreeLevel" NOT NULL DEFAULT 'LICENCIATURA',
    "regime" "RegimeAcademico" NOT NULL DEFAULT 'SEMESTRAL',
    "duration_years" INTEGER NOT NULL DEFAULT 5,
    "total_credits" INTEGER NOT NULL DEFAULT 300,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "courses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "curriculums" (
    "id" UUID NOT NULL,
    "course_id" UUID NOT NULL,
    "version" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "curriculums_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "disciplines" (
    "id" UUID NOT NULL,
    "curriculum_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "curricular_year" INTEGER NOT NULL,
    "semester" INTEGER NOT NULL,
    "credits" INTEGER NOT NULL,
    "theoretical_hours" INTEGER NOT NULL DEFAULT 30,
    "practical_hours" INTEGER NOT NULL DEFAULT 30,
    "lab_hours" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "disciplines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "prerequisites" (
    "id" UUID NOT NULL,
    "discipline_id" UUID NOT NULL,
    "prerequisite_discipline_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "prerequisites_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "academic_years" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "start_date" TIMESTAMP(3) NOT NULL,
    "end_date" TIMESTAMP(3) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "academic_years_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "academic_semesters" (
    "id" UUID NOT NULL,
    "academic_year_id" UUID NOT NULL,
    "semester_number" INTEGER NOT NULL,
    "start_date" TIMESTAMP(3) NOT NULL,
    "end_date" TIMESTAMP(3) NOT NULL,
    "is_current" BOOLEAN NOT NULL DEFAULT false,
    "enrollment_start_date" TIMESTAMP(3) NOT NULL,
    "enrollment_end_date" TIMESTAMP(3) NOT NULL,
    "classes_start_date" TIMESTAMP(3) NOT NULL,
    "classes_end_date" TIMESTAMP(3) NOT NULL,
    "grade_submission_deadline" TIMESTAMP(3) NOT NULL,
    "exam_recurso_deadline" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "academic_semesters_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "turmas" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "discipline_id" UUID NOT NULL,
    "academic_semester_id" UUID NOT NULL,
    "regente_docente_id" UUID,
    "turno" "TurmaTurno" NOT NULL DEFAULT 'MANHA',
    "max_capacity" INTEGER NOT NULL DEFAULT 45,
    "occupied_capacity" INTEGER NOT NULL DEFAULT 0,
    "schedule" JSONB,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "turmas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "enrollments" (
    "id" UUID NOT NULL,
    "student_profile_id" UUID NOT NULL,
    "turma_id" UUID NOT NULL,
    "academic_semester_id" UUID NOT NULL,
    "status" "EnrollmentStatus" NOT NULL DEFAULT 'CONFIRMADA',
    "verification_hash" TEXT NOT NULL,
    "enrolled_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "canceled_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "enrollments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attendance_lessons" (
    "id" UUID NOT NULL,
    "turma_id" UUID NOT NULL,
    "lesson_date" TIMESTAMP(3) NOT NULL,
    "lesson_summary" TEXT,
    "hours_taught" INTEGER NOT NULL DEFAULT 2,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "attendance_lessons_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attendance_records" (
    "id" UUID NOT NULL,
    "lesson_id" UUID NOT NULL,
    "enrollment_id" UUID NOT NULL,
    "is_present" BOOLEAN NOT NULL DEFAULT true,
    "is_justified" BOOLEAN NOT NULL DEFAULT false,
    "justification_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "attendance_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pautas" (
    "id" UUID NOT NULL,
    "turma_id" UUID NOT NULL,
    "status" "PautaStatus" NOT NULL DEFAULT 'EM_LANCAMENTO',
    "is_frozen" BOOLEAN NOT NULL DEFAULT false,
    "submitted_at" TIMESTAMP(3),
    "frozen_at" TIMESTAMP(3),
    "hash_homologacao" TEXT,
    "retification_note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pautas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "grade_items" (
    "id" UUID NOT NULL,
    "pauta_id" UUID NOT NULL,
    "enrollment_id" UUID NOT NULL,
    "frequencia_1" DOUBLE PRECISION,
    "frequencia_2" DOUBLE PRECISION,
    "trabalho_pratico" DOUBLE PRECISION,
    "nota_frequencia" DOUBLE PRECISION,
    "exame_normal" DOUBLE PRECISION,
    "exame_recurso" DOUBLE PRECISION,
    "exame_melhoria" DOUBLE PRECISION,
    "nota_final" DOUBLE PRECISION,
    "estado_final" "AcademicFinalState",
    "observacoes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "grade_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fee_catalogs" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "fee_type" "FeeType" NOT NULL,
    "name" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "fine_percentage" DECIMAL(5,2) NOT NULL DEFAULT 10.00,
    "course_id" UUID,
    "academic_year_id" UUID,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fee_catalogs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoices" (
    "id" UUID NOT NULL,
    "invoice_number" TEXT NOT NULL,
    "student_profile_id" UUID NOT NULL,
    "fee_catalog_id" UUID,
    "academic_semester_id" UUID,
    "title" TEXT NOT NULL,
    "base_amount" DECIMAL(12,2) NOT NULL,
    "fine_amount" DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    "discount_amount" DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    "total_amount" DECIMAL(12,2) NOT NULL,
    "paid_amount" DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    "due_date" TIMESTAMP(3) NOT NULL,
    "status" "InvoiceStatus" NOT NULL DEFAULT 'PENDENTE',
    "month_reference" INTEGER,
    "year_reference" INTEGER,
    "paid_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_proofs" (
    "id" UUID NOT NULL,
    "invoice_id" UUID NOT NULL,
    "student_profile_id" UUID NOT NULL,
    "bank_name" TEXT NOT NULL,
    "transaction_reference" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "payment_date" TIMESTAMP(3) NOT NULL,
    "payment_method" "PaymentMethod" NOT NULL DEFAULT 'TRANSFERENCIA_BANCARIA',
    "receipt_file_url" TEXT NOT NULL,
    "receipt_file_key" TEXT NOT NULL,
    "status" "PaymentStatus" NOT NULL DEFAULT 'PENDENTE',
    "verified_by_staff_id" UUID,
    "verified_at" TIMESTAMP(3),
    "rejection_reason" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payment_proofs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "student_personal_documents" (
    "id" UUID NOT NULL,
    "student_profile_id" UUID NOT NULL,
    "document_type" "PersonalDocumentType" NOT NULL,
    "document_number" TEXT,
    "file_url" TEXT NOT NULL,
    "file_key" TEXT NOT NULL,
    "status" "DocumentValidationStatus" NOT NULL DEFAULT 'PENDENTE',
    "verified_by_staff_id" UUID,
    "verified_at" TIMESTAMP(3),
    "rejection_reason" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "student_personal_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "student_career_events" (
    "id" UUID NOT NULL,
    "student_profile_id" UUID NOT NULL,
    "event_type" "StudentCareerEventType" NOT NULL,
    "despacho_number" TEXT NOT NULL,
    "event_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reason" TEXT NOT NULL,
    "registered_by_staff_id" UUID,
    "previous_status" "AcademicStatus" NOT NULL,
    "new_status" "AcademicStatus" NOT NULL,
    "details" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "student_career_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "issued_academic_documents" (
    "id" UUID NOT NULL,
    "document_type" "IssuedDocumentType" NOT NULL,
    "document_number" TEXT NOT NULL,
    "student_profile_id" UUID NOT NULL,
    "academic_semester_id" UUID,
    "verification_hash" TEXT NOT NULL,
    "file_url" TEXT,
    "file_key" TEXT,
    "status" "IssuedDocumentStatus" NOT NULL DEFAULT 'EMITIDO',
    "issued_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3),
    "issued_by_staff_id" UUID,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "issued_academic_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refresh_tokens" (
    "id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "is_revoked" BOOLEAN NOT NULL DEFAULT false,
    "ip_address" TEXT,
    "user_agent" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "password_reset_tokens" (
    "id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "is_used" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "password_reset_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL,
    "account_id" UUID,
    "active_profile" TEXT NOT NULL,
    "action" "AuditAction" NOT NULL,
    "resource" TEXT NOT NULL,
    "resource_id" TEXT,
    "old_data" JSONB,
    "new_data" JSONB,
    "endpoint" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "ip_address" TEXT,
    "user_agent" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "accounts_email_key" ON "accounts"("email");

-- CreateIndex
CREATE UNIQUE INDEX "student_profiles_account_id_key" ON "student_profiles"("account_id");

-- CreateIndex
CREATE UNIQUE INDEX "student_profiles_student_number_key" ON "student_profiles"("student_number");

-- CreateIndex
CREATE UNIQUE INDEX "student_profiles_identity_card_number_key" ON "student_profiles"("identity_card_number");

-- CreateIndex
CREATE INDEX "student_profiles_student_number_idx" ON "student_profiles"("student_number");

-- CreateIndex
CREATE INDEX "student_profiles_identity_card_number_idx" ON "student_profiles"("identity_card_number");

-- CreateIndex
CREATE INDEX "student_profiles_course_id_idx" ON "student_profiles"("course_id");

-- CreateIndex
CREATE UNIQUE INDEX "docente_profiles_account_id_key" ON "docente_profiles"("account_id");

-- CreateIndex
CREATE UNIQUE INDEX "docente_profiles_mechanographic_number_key" ON "docente_profiles"("mechanographic_number");

-- CreateIndex
CREATE UNIQUE INDEX "docente_profiles_identity_card_number_key" ON "docente_profiles"("identity_card_number");

-- CreateIndex
CREATE INDEX "docente_profiles_mechanographic_number_idx" ON "docente_profiles"("mechanographic_number");

-- CreateIndex
CREATE INDEX "docente_profiles_identity_card_number_idx" ON "docente_profiles"("identity_card_number");

-- CreateIndex
CREATE INDEX "docente_profiles_department_id_idx" ON "docente_profiles"("department_id");

-- CreateIndex
CREATE UNIQUE INDEX "staff_profiles_account_id_key" ON "staff_profiles"("account_id");

-- CreateIndex
CREATE UNIQUE INDEX "staff_profiles_employee_number_key" ON "staff_profiles"("employee_number");

-- CreateIndex
CREATE UNIQUE INDEX "staff_profiles_identity_card_number_key" ON "staff_profiles"("identity_card_number");

-- CreateIndex
CREATE INDEX "staff_profiles_employee_number_idx" ON "staff_profiles"("employee_number");

-- CreateIndex
CREATE UNIQUE INDEX "coordinator_profiles_account_id_key" ON "coordinator_profiles"("account_id");

-- CreateIndex
CREATE INDEX "coordinator_profiles_course_id_idx" ON "coordinator_profiles"("course_id");

-- CreateIndex
CREATE UNIQUE INDEX "faculties_code_key" ON "faculties"("code");

-- CreateIndex
CREATE UNIQUE INDEX "departments_code_key" ON "departments"("code");

-- CreateIndex
CREATE INDEX "departments_faculty_id_idx" ON "departments"("faculty_id");

-- CreateIndex
CREATE UNIQUE INDEX "courses_code_key" ON "courses"("code");

-- CreateIndex
CREATE INDEX "courses_department_id_idx" ON "courses"("department_id");

-- CreateIndex
CREATE INDEX "curriculums_course_id_idx" ON "curriculums"("course_id");

-- CreateIndex
CREATE UNIQUE INDEX "curriculums_course_id_version_key" ON "curriculums"("course_id", "version");

-- CreateIndex
CREATE INDEX "disciplines_curriculum_id_idx" ON "disciplines"("curriculum_id");

-- CreateIndex
CREATE UNIQUE INDEX "disciplines_curriculum_id_code_key" ON "disciplines"("curriculum_id", "code");

-- CreateIndex
CREATE INDEX "prerequisites_discipline_id_idx" ON "prerequisites"("discipline_id");

-- CreateIndex
CREATE INDEX "prerequisites_prerequisite_discipline_id_idx" ON "prerequisites"("prerequisite_discipline_id");

-- CreateIndex
CREATE UNIQUE INDEX "prerequisites_discipline_id_prerequisite_discipline_id_key" ON "prerequisites"("discipline_id", "prerequisite_discipline_id");

-- CreateIndex
CREATE UNIQUE INDEX "academic_years_code_key" ON "academic_years"("code");

-- CreateIndex
CREATE INDEX "academic_semesters_academic_year_id_idx" ON "academic_semesters"("academic_year_id");

-- CreateIndex
CREATE UNIQUE INDEX "academic_semesters_academic_year_id_semester_number_key" ON "academic_semesters"("academic_year_id", "semester_number");

-- CreateIndex
CREATE INDEX "turmas_discipline_id_idx" ON "turmas"("discipline_id");

-- CreateIndex
CREATE INDEX "turmas_academic_semester_id_idx" ON "turmas"("academic_semester_id");

-- CreateIndex
CREATE INDEX "turmas_regente_docente_id_idx" ON "turmas"("regente_docente_id");

-- CreateIndex
CREATE UNIQUE INDEX "turmas_discipline_id_academic_semester_id_code_key" ON "turmas"("discipline_id", "academic_semester_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "enrollments_verification_hash_key" ON "enrollments"("verification_hash");

-- CreateIndex
CREATE INDEX "enrollments_student_profile_id_idx" ON "enrollments"("student_profile_id");

-- CreateIndex
CREATE INDEX "enrollments_turma_id_idx" ON "enrollments"("turma_id");

-- CreateIndex
CREATE INDEX "enrollments_academic_semester_id_idx" ON "enrollments"("academic_semester_id");

-- CreateIndex
CREATE INDEX "enrollments_verification_hash_idx" ON "enrollments"("verification_hash");

-- CreateIndex
CREATE UNIQUE INDEX "enrollments_student_profile_id_turma_id_academic_semester_i_key" ON "enrollments"("student_profile_id", "turma_id", "academic_semester_id");

-- CreateIndex
CREATE INDEX "attendance_lessons_turma_id_lesson_date_idx" ON "attendance_lessons"("turma_id", "lesson_date");

-- CreateIndex
CREATE INDEX "attendance_records_enrollment_id_idx" ON "attendance_records"("enrollment_id");

-- CreateIndex
CREATE UNIQUE INDEX "attendance_records_lesson_id_enrollment_id_key" ON "attendance_records"("lesson_id", "enrollment_id");

-- CreateIndex
CREATE UNIQUE INDEX "pautas_turma_id_key" ON "pautas"("turma_id");

-- CreateIndex
CREATE UNIQUE INDEX "grade_items_enrollment_id_key" ON "grade_items"("enrollment_id");

-- CreateIndex
CREATE INDEX "grade_items_pauta_id_idx" ON "grade_items"("pauta_id");

-- CreateIndex
CREATE INDEX "grade_items_enrollment_id_idx" ON "grade_items"("enrollment_id");

-- CreateIndex
CREATE UNIQUE INDEX "fee_catalogs_code_key" ON "fee_catalogs"("code");

-- CreateIndex
CREATE INDEX "fee_catalogs_course_id_idx" ON "fee_catalogs"("course_id");

-- CreateIndex
CREATE INDEX "fee_catalogs_academic_year_id_idx" ON "fee_catalogs"("academic_year_id");

-- CreateIndex
CREATE UNIQUE INDEX "invoices_invoice_number_key" ON "invoices"("invoice_number");

-- CreateIndex
CREATE INDEX "invoices_student_profile_id_idx" ON "invoices"("student_profile_id");

-- CreateIndex
CREATE INDEX "invoices_fee_catalog_id_idx" ON "invoices"("fee_catalog_id");

-- CreateIndex
CREATE INDEX "invoices_academic_semester_id_idx" ON "invoices"("academic_semester_id");

-- CreateIndex
CREATE INDEX "invoices_status_idx" ON "invoices"("status");

-- CreateIndex
CREATE INDEX "invoices_due_date_idx" ON "invoices"("due_date");

-- CreateIndex
CREATE INDEX "payment_proofs_invoice_id_idx" ON "payment_proofs"("invoice_id");

-- CreateIndex
CREATE INDEX "payment_proofs_student_profile_id_idx" ON "payment_proofs"("student_profile_id");

-- CreateIndex
CREATE INDEX "payment_proofs_verified_by_staff_id_idx" ON "payment_proofs"("verified_by_staff_id");

-- CreateIndex
CREATE INDEX "payment_proofs_status_idx" ON "payment_proofs"("status");

-- CreateIndex
CREATE INDEX "student_personal_documents_student_profile_id_idx" ON "student_personal_documents"("student_profile_id");

-- CreateIndex
CREATE INDEX "student_personal_documents_document_type_idx" ON "student_personal_documents"("document_type");

-- CreateIndex
CREATE INDEX "student_personal_documents_status_idx" ON "student_personal_documents"("status");

-- CreateIndex
CREATE INDEX "student_career_events_student_profile_id_idx" ON "student_career_events"("student_profile_id");

-- CreateIndex
CREATE INDEX "student_career_events_event_type_idx" ON "student_career_events"("event_type");

-- CreateIndex
CREATE INDEX "student_career_events_event_date_idx" ON "student_career_events"("event_date");

-- CreateIndex
CREATE UNIQUE INDEX "issued_academic_documents_document_number_key" ON "issued_academic_documents"("document_number");

-- CreateIndex
CREATE UNIQUE INDEX "issued_academic_documents_verification_hash_key" ON "issued_academic_documents"("verification_hash");

-- CreateIndex
CREATE INDEX "issued_academic_documents_student_profile_id_idx" ON "issued_academic_documents"("student_profile_id");

-- CreateIndex
CREATE INDEX "issued_academic_documents_document_type_idx" ON "issued_academic_documents"("document_type");

-- CreateIndex
CREATE INDEX "issued_academic_documents_verification_hash_idx" ON "issued_academic_documents"("verification_hash");

-- CreateIndex
CREATE INDEX "issued_academic_documents_status_idx" ON "issued_academic_documents"("status");

-- CreateIndex
CREATE UNIQUE INDEX "refresh_tokens_token_hash_key" ON "refresh_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "refresh_tokens_account_id_idx" ON "refresh_tokens"("account_id");

-- CreateIndex
CREATE UNIQUE INDEX "password_reset_tokens_token_hash_key" ON "password_reset_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "password_reset_tokens_account_id_idx" ON "password_reset_tokens"("account_id");

-- CreateIndex
CREATE INDEX "audit_logs_account_id_created_at_idx" ON "audit_logs"("account_id", "created_at");

-- CreateIndex
CREATE INDEX "audit_logs_resource_resource_id_idx" ON "audit_logs"("resource", "resource_id");

-- CreateIndex
CREATE INDEX "audit_logs_action_created_at_idx" ON "audit_logs"("action", "created_at");

-- AddForeignKey
ALTER TABLE "student_profiles" ADD CONSTRAINT "student_profiles_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_profiles" ADD CONSTRAINT "student_profiles_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "docente_profiles" ADD CONSTRAINT "docente_profiles_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "docente_profiles" ADD CONSTRAINT "docente_profiles_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_profiles" ADD CONSTRAINT "staff_profiles_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coordinator_profiles" ADD CONSTRAINT "coordinator_profiles_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coordinator_profiles" ADD CONSTRAINT "coordinator_profiles_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "departments" ADD CONSTRAINT "departments_faculty_id_fkey" FOREIGN KEY ("faculty_id") REFERENCES "faculties"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "courses" ADD CONSTRAINT "courses_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "curriculums" ADD CONSTRAINT "curriculums_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "disciplines" ADD CONSTRAINT "disciplines_curriculum_id_fkey" FOREIGN KEY ("curriculum_id") REFERENCES "curriculums"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prerequisites" ADD CONSTRAINT "prerequisites_discipline_id_fkey" FOREIGN KEY ("discipline_id") REFERENCES "disciplines"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prerequisites" ADD CONSTRAINT "prerequisites_prerequisite_discipline_id_fkey" FOREIGN KEY ("prerequisite_discipline_id") REFERENCES "disciplines"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "academic_semesters" ADD CONSTRAINT "academic_semesters_academic_year_id_fkey" FOREIGN KEY ("academic_year_id") REFERENCES "academic_years"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "turmas" ADD CONSTRAINT "turmas_discipline_id_fkey" FOREIGN KEY ("discipline_id") REFERENCES "disciplines"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "turmas" ADD CONSTRAINT "turmas_academic_semester_id_fkey" FOREIGN KEY ("academic_semester_id") REFERENCES "academic_semesters"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "turmas" ADD CONSTRAINT "turmas_regente_docente_id_fkey" FOREIGN KEY ("regente_docente_id") REFERENCES "docente_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_student_profile_id_fkey" FOREIGN KEY ("student_profile_id") REFERENCES "student_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_turma_id_fkey" FOREIGN KEY ("turma_id") REFERENCES "turmas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_academic_semester_id_fkey" FOREIGN KEY ("academic_semester_id") REFERENCES "academic_semesters"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_lessons" ADD CONSTRAINT "attendance_lessons_turma_id_fkey" FOREIGN KEY ("turma_id") REFERENCES "turmas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_lesson_id_fkey" FOREIGN KEY ("lesson_id") REFERENCES "attendance_lessons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_enrollment_id_fkey" FOREIGN KEY ("enrollment_id") REFERENCES "enrollments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pautas" ADD CONSTRAINT "pautas_turma_id_fkey" FOREIGN KEY ("turma_id") REFERENCES "turmas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grade_items" ADD CONSTRAINT "grade_items_pauta_id_fkey" FOREIGN KEY ("pauta_id") REFERENCES "pautas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grade_items" ADD CONSTRAINT "grade_items_enrollment_id_fkey" FOREIGN KEY ("enrollment_id") REFERENCES "enrollments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fee_catalogs" ADD CONSTRAINT "fee_catalogs_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fee_catalogs" ADD CONSTRAINT "fee_catalogs_academic_year_id_fkey" FOREIGN KEY ("academic_year_id") REFERENCES "academic_years"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_student_profile_id_fkey" FOREIGN KEY ("student_profile_id") REFERENCES "student_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_fee_catalog_id_fkey" FOREIGN KEY ("fee_catalog_id") REFERENCES "fee_catalogs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_academic_semester_id_fkey" FOREIGN KEY ("academic_semester_id") REFERENCES "academic_semesters"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_proofs" ADD CONSTRAINT "payment_proofs_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_proofs" ADD CONSTRAINT "payment_proofs_student_profile_id_fkey" FOREIGN KEY ("student_profile_id") REFERENCES "student_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_proofs" ADD CONSTRAINT "payment_proofs_verified_by_staff_id_fkey" FOREIGN KEY ("verified_by_staff_id") REFERENCES "staff_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_personal_documents" ADD CONSTRAINT "student_personal_documents_student_profile_id_fkey" FOREIGN KEY ("student_profile_id") REFERENCES "student_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_personal_documents" ADD CONSTRAINT "student_personal_documents_verified_by_staff_id_fkey" FOREIGN KEY ("verified_by_staff_id") REFERENCES "staff_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_career_events" ADD CONSTRAINT "student_career_events_student_profile_id_fkey" FOREIGN KEY ("student_profile_id") REFERENCES "student_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_career_events" ADD CONSTRAINT "student_career_events_registered_by_staff_id_fkey" FOREIGN KEY ("registered_by_staff_id") REFERENCES "staff_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "issued_academic_documents" ADD CONSTRAINT "issued_academic_documents_student_profile_id_fkey" FOREIGN KEY ("student_profile_id") REFERENCES "student_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "issued_academic_documents" ADD CONSTRAINT "issued_academic_documents_issued_by_staff_id_fkey" FOREIGN KEY ("issued_by_staff_id") REFERENCES "staff_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "issued_academic_documents" ADD CONSTRAINT "issued_academic_documents_academic_semester_id_fkey" FOREIGN KEY ("academic_semester_id") REFERENCES "academic_semesters"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "password_reset_tokens" ADD CONSTRAINT "password_reset_tokens_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

