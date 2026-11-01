import {
  Injectable,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { AcademicFinalState } from '@prisma/client';
import { PrismaService } from '@infra/database/prisma.service';
import { StorageService } from '@infra/storage/storage.service';

@Injectable()
export class StudentService {
  private readonly logger = new Logger(StudentService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storageService: StorageService,
  ) {}

  /**
   * RF-16: Dashboard do Estudante
   * Retorna resumo das disciplinas ativas no semestre corrente, horarios, salas, docentes e assiduidade.
   */
  async getDashboard(accountId: string) {
    const student = await this.prisma.studentProfile.findUnique({
      where: { accountId },
      include: {
        course: {
          include: {
            department: {
              include: {
                faculty: true,
              },
            },
          },
        },
      },
    });

    if (!student) {
      throw new NotFoundException('Perfil de estudante nao localizado.');
    }

    const currentSemester = await this.prisma.academicSemester.findFirst({
      where: { isCurrent: true },
      include: {
        academicYear: true,
      },
    });

    if (!currentSemester) {
      return {
        student: {
          id: student.id,
          studentNumber: student.studentNumber,
          fullName: student.fullName,
          identityCardNumber: student.identityCardNumber,
          academicStatus: student.academicStatus,
          currentYear: student.currentYear,
          photoUrl: student.photoUrl,
          course: student.course,
        },
        currentSemester: null,
        enrolledDisciplines: [],
        totalCreditsEnrolled: 0,
      };
    }

    const enrollments = await this.prisma.enrollment.findMany({
      where: {
        studentProfileId: student.id,
        academicSemesterId: currentSemester.id,
        status: 'CONFIRMADA',
      },
      include: {
        turma: {
          include: {
            discipline: true,
            regenteDocente: {
              select: {
                id: true,
                fullName: true,
                academicDegree: true,
              },
            },
            attendanceLessons: {
              include: {
                records: {
                  where: {
                    enrollment: {
                      studentProfileId: student.id,
                    },
                  },
                },
              },
            },
            pauta: {
              select: {
                status: true,
                isFrozen: true,
              },
            },
          },
        },
        gradeItem: true,
      },
      orderBy: {
        turma: {
          discipline: {
            name: 'asc',
          },
        },
      },
    });

    let totalCreditsEnrolled = 0;

    const enrolledDisciplines = enrollments.map((enrollment) => {
      const turma = enrollment.turma;
      totalCreditsEnrolled += turma.discipline.credits;

      // Calculo de Assiduidade
      const totalLessonsTaught = turma.attendanceLessons.length;
      const totalHoursTaught = turma.attendanceLessons.reduce(
        (acc, l) => acc + l.hoursTaught,
        0,
      );

      let missedHours = 0;
      for (const lesson of turma.attendanceLessons) {
        const record = lesson.records[0];
        if (record && !record.isPresent && !record.isJustified) {
          missedHours += lesson.hoursTaught;
        }
      }

      const absencePercentage =
        totalHoursTaught > 0
          ? Number(((missedHours / totalHoursTaught) * 100).toFixed(1))
          : 0;

      return {
        enrollmentId: enrollment.id,
        verificationHash: enrollment.verificationHash,
        turmaId: turma.id,
        turmaCode: turma.code,
        turno: turma.turno,
        schedule: turma.schedule,
        discipline: {
          id: turma.discipline.id,
          code: turma.discipline.code,
          name: turma.discipline.name,
          credits: turma.discipline.credits,
          workloadHours:
            turma.discipline.theoreticalHours +
            turma.discipline.practicalHours +
            turma.discipline.labHours,
          curricularYear: turma.discipline.curricularYear,
        },
        regenteDocente: turma.regenteDocente,
        attendance: {
          totalLessonsTaught,
          totalHoursTaught,
          missedHours,
          absencePercentage,
          isWarning: absencePercentage > 20.0,
          isExceeded: absencePercentage > 25.0,
        },
        grades: {
          frequencia1: enrollment.gradeItem?.frequencia1 ?? null,
          frequencia2: enrollment.gradeItem?.frequencia2 ?? null,
          trabalhoPratico: enrollment.gradeItem?.trabalhoPratico ?? null,
          notaFrequencia: enrollment.gradeItem?.notaFrequencia ?? null,
          exameNormal: enrollment.gradeItem?.exameNormal ?? null,
          exameRecurso: enrollment.gradeItem?.exameRecurso ?? null,
          notaFinal: enrollment.gradeItem?.notaFinal ?? null,
          estadoFinal: enrollment.gradeItem?.estadoFinal ?? null,
          isOfficial: turma.pauta?.isFrozen ?? false,
        },
      };
    });

    return {
      student: {
        id: student.id,
        studentNumber: student.studentNumber,
        fullName: student.fullName,
        identityCardNumber: student.identityCardNumber,
        academicStatus: student.academicStatus,
        currentYear: student.currentYear,
        photoUrl: student.photoUrl,
        course: student.course,
      },
      currentSemester: {
        id: currentSemester.id,
        year: currentSemester.academicYear.code,
        semesterNumber: currentSemester.semesterNumber,
        startDate: currentSemester.startDate,
        endDate: currentSemester.endDate,
      },
      totalCreditsEnrolled,
      disciplinesCount: enrolledDisciplines.length,
      enrolledDisciplines,
    };
  }

  /**
   * RF-17: Consulta de Notas e Pautas Parciais
   * Exibe todas as notas parcelares, exames e pautas oficiais com detalhamento por cadeira.
   */
  async getStudentGrades(accountId: string, semesterId?: string) {
    const student = await this.prisma.studentProfile.findUnique({
      where: { accountId },
    });

    if (!student) {
      throw new NotFoundException('Perfil de estudante nao localizado.');
    }

    const whereClause: any = {
      studentProfileId: student.id,
      status: 'CONFIRMADA',
    };

    if (semesterId) {
      whereClause.academicSemesterId = semesterId;
    }

    const enrollments = await this.prisma.enrollment.findMany({
      where: whereClause,
      include: {
        turma: {
          include: {
            discipline: true,
            regenteDocente: {
              select: {
                id: true,
                fullName: true,
              },
            },
            pauta: {
              select: {
                id: true,
                status: true,
                isFrozen: true,
                submittedAt: true,
                hashHomologacao: true,
              },
            },
          },
        },
        academicSemester: {
          include: {
            academicYear: true,
          },
        },
        gradeItem: true,
        attendanceRecords: {
          include: {
            lesson: true,
          },
        },
      },
      orderBy: [
        {
          academicSemester: {
            startDate: 'desc',
          },
        },
        {
          turma: {
            discipline: {
              name: 'asc',
            },
          },
        },
      ],
    });

    return enrollments.map((enrollment) => {
      const turma = enrollment.turma;
      const isOfficial = turma.pauta?.isFrozen ?? false;

      // Calculo de Faltas
      const missedRecords = enrollment.attendanceRecords.filter(
        (r) => !r.isPresent && !r.isJustified,
      );
      const missedHours = missedRecords.reduce(
        (acc, r) => acc + (r.lesson ? r.lesson.hoursTaught : 2),
        0,
      );

      return {
        enrollmentId: enrollment.id,
        semester: {
          id: enrollment.academicSemester.id,
          academicYear: enrollment.academicSemester.academicYear.code,
          semesterNumber: enrollment.academicSemester.semesterNumber,
        },
        discipline: {
          id: turma.discipline.id,
          code: turma.discipline.code,
          name: turma.discipline.name,
          credits: turma.discipline.credits,
        },
        turmaCode: turma.code,
        regenteDocente: turma.regenteDocente?.fullName ?? 'Docente a Atribuir',
        pauta: {
          isOfficial,
          status: turma.pauta?.status ?? 'EM_LANCAMENTO',
          submittedAt: turma.pauta?.submittedAt ?? null,
          hashHomologacao: isOfficial ? turma.pauta?.hashHomologacao : null,
        },
        grades: {
          frequencia1: enrollment.gradeItem?.frequencia1 ?? null,
          frequencia2: enrollment.gradeItem?.frequencia2 ?? null,
          trabalhoPratico: enrollment.gradeItem?.trabalhoPratico ?? null,
          notaFrequencia: enrollment.gradeItem?.notaFrequencia ?? null,
          exameNormal: enrollment.gradeItem?.exameNormal ?? null,
          exameRecurso: enrollment.gradeItem?.exameRecurso ?? null,
          exameMelhoria: enrollment.gradeItem?.exameMelhoria ?? null,
          notaFinal: enrollment.gradeItem?.notaFinal ?? null,
          estadoFinal: enrollment.gradeItem?.estadoFinal ?? null,
          observacoes: enrollment.gradeItem?.observacoes ?? null,
        },
        missedHours,
      };
    });
  }

  /**
   * RF-18: Acompanhamento da Grelha Curricular & Coeficiente de Rendimento
   * Mapa de disciplinas concluidas, em curso e pendentes com media ponderada acumulada.
   */
  async getCurriculumProgress(accountId: string) {
    const student = await this.prisma.studentProfile.findUnique({
      where: { accountId },
      include: {
        course: {
          include: {
            curriculums: {
              where: { isActive: true },
              include: {
                disciplines: {
                  include: {
                    prerequisites: {
                      include: {
                        prerequisiteDiscipline: {
                          select: { id: true, code: true, name: true },
                        },
                      },
                    },
                  },
                  orderBy: [
                    { curricularYear: 'asc' },
                    { semester: 'asc' },
                    { code: 'asc' },
                  ],
                },
              },
            },
          },
        },
      },
    });

    if (!student) {
      throw new NotFoundException('Perfil de estudante nao localizado.');
    }

    if (!student.course) {
      throw new NotFoundException('O estudante nao possui curso vinculado.');
    }

    const activeCurriculum = student.course.curriculums[0];
    if (!activeCurriculum) {
      throw new NotFoundException(
        'Nenhum plano curricular ativo encontrado para o curso do estudante.',
      );
    }

    // Buscar todo o historico de inscricoes e avaliacoes do estudante
    const allEnrollments = await this.prisma.enrollment.findMany({
      where: {
        studentProfileId: student.id,
        status: 'CONFIRMADA',
      },
      include: {
        turma: {
          select: {
            disciplineId: true,
          },
        },
        academicSemester: {
          include: {
            academicYear: true,
          },
        },
        gradeItem: true,
      },
    });

    // Mapear inscricoes por disciplinaId
    const disciplineEnrollmentsMap = new Map<string, typeof allEnrollments>();
    for (const enr of allEnrollments) {
      const discId = enr.turma.disciplineId;
      const list = disciplineEnrollmentsMap.get(discId) || [];
      list.push(enr);
      disciplineEnrollmentsMap.set(discId, list);
    }

    let totalCourseCredits = 0;
    let completedCredits = 0;
    let sumWeightedGrades = 0;
    let completedDisciplinesCount = 0;

    const mappedDisciplines = activeCurriculum.disciplines.map((discipline) => {
      totalCourseCredits += discipline.credits;
      const enrollments = disciplineEnrollmentsMap.get(discipline.id) || [];

      // Verificar se o estudante concluiu a disciplina com aproveitamento
      const passingEnrollment = enrollments.find(
        (e) =>
          e.gradeItem &&
          (e.gradeItem.estadoFinal === AcademicFinalState.APROVADO ||
            e.gradeItem.estadoFinal === AcademicFinalState.DISPENSADO_EXAME) &&
          e.gradeItem.notaFinal !== null &&
          e.gradeItem.notaFinal >= 10.0,
      );

      // Verificar se esta atualmente em curso
      const currentEnrollment = enrollments.find(
        (e) => e.academicSemester.isCurrent,
      );

      let status: 'CONCLUIDA' | 'EM_CURSO' | 'REPROVADA' | 'PENDENTE' =
        'PENDENTE';
      let finalGrade: number | null = null;
      let completedYear: string | null = null;
      let completedSemester: number | null = null;

      if (passingEnrollment && passingEnrollment.gradeItem?.notaFinal) {
        status = 'CONCLUIDA';
        finalGrade = passingEnrollment.gradeItem.notaFinal;
        completedYear = passingEnrollment.academicSemester.academicYear.code;
        completedSemester = passingEnrollment.academicSemester.semesterNumber;

        completedCredits += discipline.credits;
        completedDisciplinesCount += 1;
        sumWeightedGrades += finalGrade * discipline.credits;
      } else if (currentEnrollment) {
        status = 'EM_CURSO';
      } else if (
        enrollments.some(
          (e) =>
            e.gradeItem?.estadoFinal === AcademicFinalState.REPROVADO_NOTA ||
            e.gradeItem?.estadoFinal === AcademicFinalState.REPROVADO_FALTA,
        )
      ) {
        status = 'REPROVADA';
      }

      return {
        id: discipline.id,
        code: discipline.code,
        name: discipline.name,
        curricularYear: discipline.curricularYear,
        semester: discipline.semester,
        credits: discipline.credits,
        workloadHours:
          discipline.theoreticalHours +
          discipline.practicalHours +
          discipline.labHours,
        status,
        finalGrade,
        completedYear,
        completedSemester,
        prerequisites: discipline.prerequisites.map((p) => ({
          id: p.prerequisiteDiscipline.id,
          code: p.prerequisiteDiscipline.code,
          name: p.prerequisiteDiscipline.name,
        })),
      };
    });

    // Calculo do Coeficiente de Rendimento (Media Ponderada Acumulada)
    const coeficienteRendimento =
      completedCredits > 0
        ? Number((sumWeightedGrades / completedCredits).toFixed(2))
        : 0.0;

    const progressPercentage =
      totalCourseCredits > 0
        ? Number(((completedCredits / totalCourseCredits) * 100).toFixed(1))
        : 0.0;

    return {
      course: {
        id: student.course.id,
        code: student.course.code,
        name: student.course.name,
        degreeLevel: student.course.degreeLevel,
        durationYears: student.course.durationYears,
      },
      curriculum: {
        id: activeCurriculum.id,
        version: activeCurriculum.version,
        name: `Grelha Curricular ${activeCurriculum.version}`,
      },
      summary: {
        totalCourseCredits,
        completedCredits,
        pendingCredits: totalCourseCredits - completedCredits,
        totalDisciplines: activeCurriculum.disciplines.length,
        completedDisciplinesCount,
        progressPercentage,
        coeficienteRendimento, // Media Ponderada Acumulada (0 a 20)
      },
      disciplines: mappedDisciplines,
    };
  }

  /**
   * RF-19: Repositorio de Documentos e Declaracoes
   * Retorna os documentos oficiais disponiveis para download direto com hashes de autenticidade.
   */
  async getStudentDocuments(accountId: string) {
    const student = await this.prisma.studentProfile.findUnique({
      where: { accountId },
      include: {
        course: true,
        enrollments: {
          where: { status: 'CONFIRMADA' },
          include: {
            academicSemester: {
              include: {
                academicYear: true,
              },
            },
          },
          orderBy: {
            enrolledAt: 'desc',
          },
        },
      },
    });

    if (!student) {
      throw new NotFoundException('Perfil de estudante nao localizado.');
    }

    // Gerar relacao de comprovativos oficiais com os respectivos hashes
    const documents = student.enrollments.map((enr) => ({
      documentType: 'COMPROVATIVO_MATRICULA',
      title: `Comprovativo de Matricula - ${enr.academicSemester.academicYear.code} (Semestre ${enr.academicSemester.semesterNumber})`,
      issuedAt: enr.enrolledAt,
      verificationHash: enr.verificationHash,
      verificationUrl: `/api/v1/enrollment/verify/${enr.verificationHash}`,
      semester: `${enr.academicSemester.academicYear.code} - Semestre ${enr.academicSemester.semesterNumber}`,
    }));

    return {
      studentNumber: student.studentNumber,
      fullName: student.fullName,
      totalDocuments: documents.length,
      documents,
    };
  }
}
