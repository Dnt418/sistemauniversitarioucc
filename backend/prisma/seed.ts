import {
  PrismaClient,
  UserRole,
  AccountStatus,
  Gender,
  DocenteCategory,
  DocenteRegime,
  AcademicStatus,
  DegreeLevel,
  RegimeAcademico,
  TurmaTurno,
} from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  console.log('[CARGA DE DADOS] Iniciando carga de dados iniciais...');

  const defaultPassword = await bcrypt.hash('Siga@2026!', 10);

  // ============================================================================
  // 1. ESTRUTURA ORGANIZACIONAL (RF-05)
  // ============================================================================
  const faculty = await prisma.faculty.upsert({
    where: { code: 'FE' },
    update: {},
    create: {
      code: 'FE',
      name: 'Faculdade de Engenharia',
      description: 'Unidade Organica dedicada as Ciencias Exatas, Tecnologias e Engenharias.',
    },
  });
  console.log(`[SUCESSO] Faculdade provisionada: ${faculty.name} (${faculty.code})`);

  const department = await prisma.department.upsert({
    where: { code: 'DETI' },
    update: {},
    create: {
      facultyId: faculty.id,
      code: 'DETI',
      name: 'Departamento de Engenharia e Tecnologias de Informacao',
    },
  });
  console.log(`[SUCESSO] Departamento provisionado: ${department.name} (${department.code})`);

  const course = await prisma.course.upsert({
    where: { code: 'LEI' },
    update: {},
    create: {
      departmentId: department.id,
      code: 'LEI',
      name: 'Engenharia Informatica',
      degreeLevel: DegreeLevel.LICENCIATURA,
      regime: RegimeAcademico.SEMESTRAL,
      durationYears: 5,
      totalCredits: 300,
    },
  });
  console.log(`[SUCESSO] Curso provisionado: ${course.name} (${course.code})`);

  // ============================================================================
  // 2. GRELHA CURRICULAR E PRECEDENCIAS (RF-06)
  // ============================================================================
  const curriculum = await prisma.curriculum.upsert({
    where: {
      courseId_version: {
        courseId: course.id,
        version: '2026.1',
      },
    },
    update: {},
    create: {
      courseId: course.id,
      version: '2026.1',
      isActive: true,
    },
  });
  console.log(`[SUCESSO] Plano de Estudos provisionado: Versao ${curriculum.version}`);

  // Disciplinas do 1º Ano, 1º Semestre
  const ap1 = await prisma.discipline.upsert({
    where: {
      curriculumId_code: {
        curriculumId: curriculum.id,
        code: 'AP1',
      },
    },
    update: {},
    create: {
      curriculumId: curriculum.id,
      code: 'AP1',
      name: 'Algoritmos e Programacao I',
      curricularYear: 1,
      semester: 1,
      credits: 6,
      theoreticalHours: 30,
      practicalHours: 30,
      labHours: 15,
    },
  });

  const am1 = await prisma.discipline.upsert({
    where: {
      curriculumId_code: {
        curriculumId: curriculum.id,
        code: 'AM1',
      },
    },
    update: {},
    create: {
      curriculumId: curriculum.id,
      code: 'AM1',
      name: 'Analise Matematica I',
      curricularYear: 1,
      semester: 1,
      credits: 6,
      theoreticalHours: 45,
      practicalHours: 30,
      labHours: 0,
    },
  });

  // Disciplina do 1º Ano, 2º Semestre (com precedencia de AP1)
  const ap2 = await prisma.discipline.upsert({
    where: {
      curriculumId_code: {
        curriculumId: curriculum.id,
        code: 'AP2',
      },
    },
    update: {},
    create: {
      curriculumId: curriculum.id,
      code: 'AP2',
      name: 'Algoritmos e Programacao II',
      curricularYear: 1,
      semester: 2,
      credits: 6,
      theoreticalHours: 30,
      practicalHours: 30,
      labHours: 15,
    },
  });

  await prisma.prerequisite.upsert({
    where: {
      disciplineId_prerequisiteDisciplineId: {
        disciplineId: ap2.id,
        prerequisiteDisciplineId: ap1.id,
      },
    },
    update: {},
    create: {
      disciplineId: ap2.id,
      prerequisiteDisciplineId: ap1.id,
    },
  });
  console.log(`[SUCESSO] Precedencia configurada: AP1 e pre-requisito de AP2`);

  // ============================================================================
  // 3. PERIODOS LETIVOS E CALENDARIO ACADEMICO (RF-07)
  // ============================================================================
  const academicYear = await prisma.academicYear.upsert({
    where: { code: '2025/2026' },
    update: {},
    create: {
      code: '2025/2026',
      startDate: new Date('2025-09-01'),
      endDate: new Date('2026-07-31'),
      isActive: true,
    },
  });

  const currentSemester = await prisma.academicSemester.upsert({
    where: {
      academicYearId_semesterNumber: {
        academicYearId: academicYear.id,
        semesterNumber: 1,
      },
    },
    update: {},
    create: {
      academicYearId: academicYear.id,
      semesterNumber: 1,
      startDate: new Date('2025-09-01'),
      endDate: new Date('2026-02-15'),
      isCurrent: true,
      enrollmentStartDate: new Date('2025-09-01'),
      enrollmentEndDate: new Date('2025-09-30'),
      classesStartDate: new Date('2025-10-01'),
      classesEndDate: new Date('2026-01-20'),
      gradeSubmissionDeadline: new Date('2026-02-05'),
      examRecursoDeadline: new Date('2026-02-15'),
    },
  });
  console.log(`[SUCESSO] Semestre Academico corrente provisionado: 1º Semestre ${academicYear.code}`);

  // ============================================================================
  // 4. IDENTIDADE, CONTAS E PERFIS
  // ============================================================================

  // Super Administrador
  const adminEmail = 'admin@siga.ao';
  const existingAdmin = await prisma.account.findUnique({ where: { email: adminEmail } });
  if (!existingAdmin) {
    const admin = await prisma.account.create({
      data: {
        email: adminEmail,
        passwordHash: defaultPassword,
        status: AccountStatus.ACTIVE,
        roles: [UserRole.SUPER_ADMIN, UserRole.SECRETARIA],
        staffProfile: {
          create: {
            employeeNumber: 'EMP-0001',
            identityCardNumber: '001122334LA042',
            fullName: 'Administrador do Sistema SIGA',
            department: 'Diretoria de Tecnologias de Informação',
            jobTitle: 'Administrador de Sistemas',
            phoneNumber: '+244 923 000 001',
            isActive: true,
          },
        },
      },
    });
    console.log(`[SUCESSO] Super Administrador criado: ${admin.email}`);
  }

  // Docente Regente
  const docenteEmail = 'docente@siga.ao';
  let docenteAccount = await prisma.account.findUnique({
    where: { email: docenteEmail },
    include: { docenteProfile: true },
  });

  if (!docenteAccount) {
    docenteAccount = await prisma.account.create({
      data: {
        email: docenteEmail,
        passwordHash: defaultPassword,
        status: AccountStatus.ACTIVE,
        roles: [UserRole.DOCENTE],
        docenteProfile: {
          create: {
            mechanographicNumber: 'DOC-2026-001',
            identityCardNumber: '002233445LA043',
            fullName: 'Prof. Dr. Manuel Afonso de Almeida',
            category: DocenteCategory.PROFESSOR_AUXILIAR,
            regime: DocenteRegime.INTEGRAL,
            academicDegree: 'Doutoramento em Ciências da Computação',
            specialization: 'Engenharia de Software e Algoritmos',
            departmentId: department.id,
            phoneNumber: '+244 923 000 002',
            isActive: true,
          },
        },
      },
      include: { docenteProfile: true },
    });
    console.log(`[SUCESSO] Docente criado: ${docenteAccount.email}`);
  }

  // Estudante
  const estudanteEmail = 'estudante@siga.ao';
  const existingEstudante = await prisma.account.findUnique({ where: { email: estudanteEmail } });
  if (!existingEstudante) {
    const estudante = await prisma.account.create({
      data: {
        email: estudanteEmail,
        passwordHash: defaultPassword,
        status: AccountStatus.ACTIVE,
        roles: [UserRole.ESTUDANTE],
        studentProfile: {
          create: {
            studentNumber: 'MAT-2026-0001',
            identityCardNumber: '003344556LA044',
            fullName: 'António Kipungo Domingos',
            gender: Gender.MASCULINO,
            birthDate: new Date('2002-05-15'),
            academicStatus: AcademicStatus.REGULAR,
            currentYear: 1,
            courseId: course.id,
            phoneNumber: '+244 923 000 003',
          },
        },
      },
    });
    console.log(`[SUCESSO] Estudante criado: ${estudante.email}`);
  }

  // Oficial Financeiro
  const financeiroEmail = 'financeiro@siga.ao';
  const existingFinanceiro = await prisma.account.findUnique({ where: { email: financeiroEmail } });
  if (!existingFinanceiro) {
    const financeiro = await prisma.account.create({
      data: {
        email: financeiroEmail,
        passwordHash: defaultPassword,
        status: AccountStatus.ACTIVE,
        roles: [UserRole.FINANCEIRO],
        staffProfile: {
          create: {
            employeeNumber: 'FIN-0001',
            identityCardNumber: '004455667LA045',
            fullName: 'Helena Teresa Sebastião',
            department: 'Tesouraria e Gestão de Propinas',
            jobTitle: 'Oficial de Tesouraria',
            phoneNumber: '+244 923 000 004',
            isActive: true,
          },
        },
      },
    });
    console.log(`[SUCESSO] Oficial Financeiro criado: ${financeiro.email}`);
  }

  // ============================================================================
  // 5. TURMA REGULAR PLANEJADA (RF-08)
  // ============================================================================
  if (docenteAccount?.docenteProfile) {
    const turma = await prisma.turma.upsert({
      where: {
        disciplineId_academicSemesterId_code: {
          disciplineId: ap1.id,
          academicSemesterId: currentSemester.id,
          code: 'LEI-M1',
        },
      },
      update: {},
      create: {
        code: 'LEI-M1',
        disciplineId: ap1.id,
        academicSemesterId: currentSemester.id,
        regenteDocenteId: docenteAccount.docenteProfile.id,
        turno: TurmaTurno.MANHA,
        maxCapacity: 45,
        occupiedCapacity: 0,
        schedule: [
          { dia: 'SEGUNDA', inicio: '08:00', fim: '10:00', sala: 'Laboratorio de Informatica 1' },
          { dia: 'QUARTA', inicio: '08:00', fim: '10:00', sala: 'Anfiteatro B' },
        ],
        isActive: true,
      },
    });
    console.log(`[SUCESSO] Turma planejada: ${turma.code} (${ap1.name})`);
  }

  console.log('\n[CONCLUIDO] Carga de dados iniciais e estrutura curricular finalizada com sucesso!');
  console.log('--------------------------------------------------');
  console.log('Credenciais padrao para desenvolvimento:');
  console.log('  Senha comum: Siga@2026!');
  console.log('  Super Admin: admin@siga.ao');
  console.log('  Docente:     docente@siga.ao');
  console.log('  Estudante:   estudante@siga.ao');
  console.log('  Financeiro:  financeiro@siga.ao');
  console.log('--------------------------------------------------');
}

main()
  .catch((e) => {
    console.error('[ERRO] Falha durante a execucao da carga de dados:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
