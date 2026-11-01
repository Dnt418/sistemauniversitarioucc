import { Test, TestingModule } from '@nestjs/testing';
import { StudentService } from '../student.service';
import { PrismaService } from '@infra/database/prisma.service';
import { StorageService } from '@infra/storage/storage.service';
import { AcademicFinalState } from '@prisma/client';

describe('StudentService - RF-18 Acompanhamento Curricular e Coeficiente de Rendimento', () => {
  let service: StudentService;
  let prisma: PrismaService;

  const mockPrismaService = {
    studentProfile: {
      findUnique: jest.fn(),
    },
    enrollment: {
      findMany: jest.fn(),
    },
  };

  const mockStorageService = {
    getPresignedUploadUrl: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StudentService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
        {
          provide: StorageService,
          useValue: mockStorageService,
        },
      ],
    }).compile();

    service = module.get<StudentService>(StudentService);
    prisma = module.get<PrismaService>(PrismaService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('deve calcular corretamente o Coeficiente de Rendimento e a percentagem de conclusao do curso', async () => {
    const accountId = 'acc-123';
    const studentId = 'student-456';

    const mockDisciplines = [
      {
        id: 'disc-1',
        code: 'ENG101',
        name: 'Analise Matematica I',
        curricularYear: 1,
        semester: 1,
        credits: 6,
        theoreticalHours: 30,
        practicalHours: 30,
        labHours: 0,
        prerequisites: [],
      },
      {
        id: 'disc-2',
        code: 'ENG102',
        name: 'Algoritmos e Estruturas de Dados',
        curricularYear: 1,
        semester: 1,
        credits: 4,
        theoreticalHours: 30,
        practicalHours: 30,
        labHours: 15,
        prerequisites: [],
      },
      {
        id: 'disc-3',
        code: 'ENG103',
        name: 'Fisica Geral',
        curricularYear: 1,
        semester: 1,
        credits: 5,
        theoreticalHours: 30,
        practicalHours: 30,
        labHours: 15,
        prerequisites: [],
      },
      {
        id: 'disc-4',
        code: 'ENG201',
        name: 'Sistemas Operativos',
        curricularYear: 2,
        semester: 1,
        credits: 5,
        theoreticalHours: 30,
        practicalHours: 30,
        labHours: 0,
        prerequisites: [],
      },
    ];

    mockPrismaService.studentProfile.findUnique.mockResolvedValue({
      id: studentId,
      accountId,
      course: {
        id: 'course-1',
        code: 'LEI',
        name: 'Engenharia Informatica',
        degreeLevel: 'LICENCIATURA',
        durationYears: 4,
        curriculums: [
          {
            id: 'curr-1',
            version: '2025.1',
            isActive: true,
            disciplines: mockDisciplines,
          },
        ],
      },
    });

    // Simulacao de inscricoes:
    // disc-1: Aprovado com 16 (6 ECTS) -> 16 * 6 = 96
    // disc-2: Aprovado com 14 (4 ECTS) -> 14 * 4 = 56
    // disc-3: Aprovado com 12 (5 ECTS) -> 12 * 5 = 60
    // disc-4: Pendente (nao cursada)
    // Total creditos concluidos = 6 + 4 + 5 = 15 ECTS de um total de 20 ECTS.
    // Soma ponderada = 96 + 56 + 60 = 212.
    // Coeficiente esperado = 212 / 15 = 14.1333... -> 14.13
    // Percentual de progresso = (15 / 20) * 100 = 75.0%
    mockPrismaService.enrollment.findMany.mockResolvedValue([
      {
        id: 'enr-1',
        turma: { disciplineId: 'disc-1' },
        academicSemester: {
          isCurrent: false,
          semesterNumber: 1,
          academicYear: { code: '2024/2025' },
        },
        gradeItem: {
          estadoFinal: AcademicFinalState.APROVADO,
          notaFinal: 16.0,
        },
      },
      {
        id: 'enr-2',
        turma: { disciplineId: 'disc-2' },
        academicSemester: {
          isCurrent: false,
          semesterNumber: 1,
          academicYear: { code: '2024/2025' },
        },
        gradeItem: {
          estadoFinal: AcademicFinalState.DISPENSADO_EXAME,
          notaFinal: 14.0,
        },
      },
      {
        id: 'enr-3',
        turma: { disciplineId: 'disc-3' },
        academicSemester: {
          isCurrent: false,
          semesterNumber: 1,
          academicYear: { code: '2024/2025' },
        },
        gradeItem: {
          estadoFinal: AcademicFinalState.APROVADO,
          notaFinal: 12.0,
        },
      },
    ]);

    const result = await service.getCurriculumProgress(accountId);

    expect(result.summary.totalCourseCredits).toBe(20);
    expect(result.summary.completedCredits).toBe(15);
    expect(result.summary.pendingCredits).toBe(5);
    expect(result.summary.completedDisciplinesCount).toBe(3);
    expect(result.summary.progressPercentage).toBe(75.0);
    expect(result.summary.coeficienteRendimento).toBe(14.13);

    const disc1 = result.disciplines.find((d) => d.id === 'disc-1');
    expect(disc1?.status).toBe('CONCLUIDA');
    expect(disc1?.finalGrade).toBe(16.0);

    const disc4 = result.disciplines.find((d) => d.id === 'disc-4');
    expect(disc4?.status).toBe('PENDENTE');
    expect(disc4?.finalGrade).toBeNull();
  });

  it('deve classificar disciplinas em curso e reprovadas de forma consistente', async () => {
    const accountId = 'acc-student-2';
    const studentId = 'student-789';

    mockPrismaService.studentProfile.findUnique.mockResolvedValue({
      id: studentId,
      accountId,
      course: {
        id: 'course-1',
        code: 'LEI',
        name: 'Engenharia Informatica',
        degreeLevel: 'LICENCIATURA',
        durationYears: 4,
        curriculums: [
          {
            id: 'curr-1',
            version: '2025.1',
            isActive: true,
            disciplines: [
              {
                id: 'disc-current',
                code: 'ENG202',
                name: 'Redes de Computadores',
                curricularYear: 2,
                semester: 1,
                credits: 6,
                theoreticalHours: 30,
                practicalHours: 30,
                labHours: 0,
                prerequisites: [],
              },
              {
                id: 'disc-failed',
                code: 'ENG203',
                name: 'Base de Dados II',
                curricularYear: 2,
                semester: 1,
                credits: 6,
                theoreticalHours: 30,
                practicalHours: 30,
                labHours: 0,
                prerequisites: [],
              },
            ],
          },
        ],
      },
    });

    mockPrismaService.enrollment.findMany.mockResolvedValue([
      {
        id: 'enr-current',
        turma: { disciplineId: 'disc-current' },
        academicSemester: {
          isCurrent: true,
          semesterNumber: 1,
          academicYear: { code: '2025/2026' },
        },
        gradeItem: null,
      },
      {
        id: 'enr-failed',
        turma: { disciplineId: 'disc-failed' },
        academicSemester: {
          isCurrent: false,
          semesterNumber: 2,
          academicYear: { code: '2024/2025' },
        },
        gradeItem: {
          estadoFinal: AcademicFinalState.REPROVADO_NOTA,
          notaFinal: 7.5,
        },
      },
    ]);

    const result = await service.getCurriculumProgress(accountId);

    expect(result.summary.completedCredits).toBe(0);
    expect(result.summary.coeficienteRendimento).toBe(0.0);

    const discCurrent = result.disciplines.find((d) => d.id === 'disc-current');
    expect(discCurrent?.status).toBe('EM_CURSO');

    const discFailed = result.disciplines.find((d) => d.id === 'disc-failed');
    expect(discFailed?.status).toBe('REPROVADA');
  });
});

