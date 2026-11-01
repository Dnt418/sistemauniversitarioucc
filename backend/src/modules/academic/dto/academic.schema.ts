import { z } from 'zod';
import { createZodDto } from 'nestjs-zod';

// ==============================================================================
// 1. UNIDADES ORGANICAS E CURSOS (RF-05)
// ==============================================================================

export const createFacultySchema = z.object({
  code: z
    .string({ required_error: 'O codigo da faculdade e obrigatorio' })
    .min(2, 'O codigo deve ter no minimo 2 caracteres')
    .toUpperCase()
    .describe('Sigla da Faculdade (ex.: FE, FCS)'),
  name: z
    .string({ required_error: 'O nome da faculdade e obrigatorio' })
    .min(3, 'O nome deve ter no minimo 3 caracteres')
    .describe('Denominacao oficial da Faculdade'),
  description: z.string().optional().describe('Descricao institucional complementar'),
});

export class CreateFacultyDto extends createZodDto(createFacultySchema) {}
export type CreateFacultyInput = z.infer<typeof createFacultySchema>;

export const createDepartmentSchema = z.object({
  facultyId: z.string().uuid('ID de faculdade invalido'),
  code: z
    .string({ required_error: 'O codigo do departamento e obrigatorio' })
    .min(2, 'O codigo deve ter no minimo 2 caracteres')
    .toUpperCase()
    .describe('Sigla do Departamento (ex.: DETI)'),
  name: z
    .string({ required_error: 'O nome do departamento e obrigatorio' })
    .min(3, 'O nome deve ter no minimo 3 caracteres')
    .describe('Nome oficial do Departamento'),
});

export class CreateDepartmentDto extends createZodDto(createDepartmentSchema) {}
export type CreateDepartmentInput = z.infer<typeof createDepartmentSchema>;

export const createCourseSchema = z.object({
  departmentId: z.string().uuid('ID de departamento invalido'),
  code: z
    .string({ required_error: 'O codigo do curso e obrigatorio' })
    .min(2, 'O codigo deve ter no minimo 2 caracteres')
    .toUpperCase()
    .describe('Sigla do Curso (ex.: LEI)'),
  name: z
    .string({ required_error: 'O nome do curso e obrigatorio' })
    .min(3, 'O nome deve ter no minimo 3 caracteres')
    .describe('Denominacao do Curso'),
  degreeLevel: z
    .enum(['LICENCIATURA', 'MESTRADO', 'DOUTORAMENTO', 'POS_GRADUACAO'])
    .default('LICENCIATURA'),
  regime: z.enum(['SEMESTRAL', 'ANUAL']).default('SEMESTRAL'),
  durationYears: z.coerce.number().int().min(1).max(6).default(5),
  totalCredits: z.coerce.number().int().min(60).max(360).default(300),
});

export class CreateCourseDto extends createZodDto(createCourseSchema) {}
export type CreateCourseInput = z.infer<typeof createCourseSchema>;

// ==============================================================================
// 2. GRELHA CURRICULAR E DISCIPLINAS (RF-06)
// ==============================================================================

export const createCurriculumSchema = z.object({
  courseId: z.string().uuid('ID de curso invalido'),
  version: z
    .string({ required_error: 'A versao da grelha e obrigatoria' })
    .min(2, 'A versao deve ter no minimo 2 caracteres')
    .describe('Versao do plano curricular (ex.: 2024.1, 2026.1)'),
  isActive: z.boolean().default(true),
});

export class CreateCurriculumDto extends createZodDto(createCurriculumSchema) {}
export type CreateCurriculumInput = z.infer<typeof createCurriculumSchema>;

export const createDisciplineSchema = z.object({
  curriculumId: z.string().uuid('ID da grelha curricular invalido'),
  code: z
    .string({ required_error: 'O codigo da disciplina e obrigatorio' })
    .min(2, 'O codigo deve ter no minimo 2 caracteres')
    .toUpperCase()
    .describe('Sigla ou codigo da cadeira (ex.: EDA1, BD2)'),
  name: z
    .string({ required_error: 'O nome da disciplina e obrigatorio' })
    .min(3, 'O nome deve ter no minimo 3 caracteres')
    .describe('Nome oficial da disciplina'),
  curricularYear: z.coerce.number().int().min(1).max(6).describe('Ano curricular (1 ao 5)'),
  semester: z.coerce.number().int().min(1).max(2).describe('Semestre letivo (1 ou 2)'),
  credits: z.coerce.number().int().min(1).max(30).describe('Creditos curriculares (ECTS)'),
  theoreticalHours: z.coerce.number().int().min(0).default(30),
  practicalHours: z.coerce.number().int().min(0).default(30),
  labHours: z.coerce.number().int().min(0).default(0),
  prerequisiteDisciplineIds: z.array(z.string().uuid()).default([]).describe('IDs das disciplinas que constituem precedencia obrigatoria'),
});

export class CreateDisciplineDto extends createZodDto(createDisciplineSchema) {}
export type CreateDisciplineInput = z.infer<typeof createDisciplineSchema>;

// ==============================================================================
// 3. PERIODOS LETIVOS E CALENDARIO ACADEMICO (RF-07)
// ==============================================================================

export const createAcademicYearSchema = z.object({
  code: z
    .string({ required_error: 'O codigo do ano academico e obrigatorio' })
    .min(4, 'O codigo deve ter no minimo 4 caracteres')
    .describe('Identificacao do ano academico (ex.: 2025/2026)'),
  startDate: z.coerce.date().describe('Data de inicio do ano letivo'),
  endDate: z.coerce.date().describe('Data de encerramento do ano letivo'),
  isActive: z.boolean().default(false),
});

export class CreateAcademicYearDto extends createZodDto(createAcademicYearSchema) {}
export type CreateAcademicYearInput = z.infer<typeof createAcademicYearSchema>;

export const createAcademicSemesterSchema = z.object({
  academicYearId: z.string().uuid('ID do ano academico invalido'),
  semesterNumber: z.coerce.number().int().min(1).max(2).describe('Numero do semestre (1 ou 2)'),
  startDate: z.coerce.date().describe('Data de inicio do semestre'),
  endDate: z.coerce.date().describe('Data de fim do semestre'),
  isCurrent: z.boolean().default(false),

  // Marcos temporais com travas compulsorias do sistema (RF-07)
  enrollmentStartDate: z.coerce.date().describe('Inicio da janela de matriculas/inscricoes'),
  enrollmentEndDate: z.coerce.date().describe('Limite final da janela de matriculas/inscricoes'),
  classesStartDate: z.coerce.date().describe('Inicio das aulas regulares'),
  classesEndDate: z.coerce.date().describe('Termino das aulas regulares'),
  gradeSubmissionDeadline: z.coerce.date().describe('Prazo limite para lancamento de pautas ordinarias'),
  examRecursoDeadline: z.coerce.date().describe('Prazo limite para pautas de exames de recurso'),
});

export class CreateAcademicSemesterDto extends createZodDto(createAcademicSemesterSchema) {}
export type CreateAcademicSemesterInput = z.infer<typeof createAcademicSemesterSchema>;

// ==============================================================================
// 4. PLANEJAMENTO E ABERTURA DE TURMAS (RF-08)
// ==============================================================================

const scheduleItemSchema = z.object({
  dia: z.enum(['SEGUNDA', 'TERCA', 'QUARTA', 'QUINTA', 'SEXTA', 'SABADO']),
  inicio: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/, 'Horario inicial no formato HH:MM'),
  fim: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/, 'Horario final no formato HH:MM'),
  sala: z.string().min(1, 'Identificacao da sala e obrigatoria'),
});

export const createTurmaSchema = z.object({
  code: z
    .string({ required_error: 'O codigo da turma e obrigatorio' })
    .min(2, 'O codigo deve ter no minimo 2 caracteres')
    .toUpperCase()
    .describe('Codigo da turma (ex.: LEI-T1, EDA-PL2)'),
  disciplineId: z.string().uuid('ID da disciplina invalido'),
  academicSemesterId: z.string().uuid('ID do semestre academico invalido'),
  regenteDocenteId: z.string().uuid('ID do docente regente invalido').optional().nullable(),
  turno: z.enum(['MANHA', 'TARDE', 'POS_LABORAL']).default('MANHA'),
  maxCapacity: z.coerce.number().int().min(5).max(200).default(45).describe('Limite maximo de vagas na turma'),
  schedule: z.array(scheduleItemSchema).default([]).describe('Cronograma semanal de aulas com dias, horarios e salas'),
});

export class CreateTurmaDto extends createZodDto(createTurmaSchema) {}
export type CreateTurmaInput = z.infer<typeof createTurmaSchema>;

