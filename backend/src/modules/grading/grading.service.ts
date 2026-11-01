import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import * as crypto from 'crypto';
import {
  AcademicFinalState,
  AuditAction,
  PautaStatus,
  UserRole,
} from '@prisma/client';
import { PrismaService } from '@infra/database/prisma.service';
import {
  RecordAttendanceDto,
  UpdateGradesDto,
  SubmitPautaDto,
  RectifyPautaDto,
} from './dto/grading.schema';

@Injectable()
export class GradingService {
  private readonly logger = new Logger(GradingService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * RF-12: Painel de Turmas do Docente
   * Lista turmas ativas sob responsabilidade do docente ou todas para coordenacao/secretaria.
   */
  async getDocenteTurmas(accountId: string, roles: UserRole[]) {
    const isDocenteOnly =
      roles.includes(UserRole.DOCENTE) &&
      !roles.includes(UserRole.SUPER_ADMIN) &&
      !roles.includes(UserRole.SECRETARIA) &&
      !roles.includes(UserRole.COORDENADOR);

    let whereClause: any = { isActive: true };

    if (isDocenteOnly) {
      const docenteProfile = await this.prisma.docenteProfile.findUnique({
        where: { accountId },
      });

      if (!docenteProfile) {
        throw new ForbiddenException(
          'Perfil docente nao localizado para a conta autenticada.',
        );
      }

      whereClause = {
        ...whereClause,
        regenteDocenteId: docenteProfile.id,
      };
    }

    const turmas = await this.prisma.turma.findMany({
      where: whereClause,
      include: {
        discipline: {
          select: {
            id: true,
            code: true,
            name: true,
            credits: true,
            theoreticalHours: true,
            practicalHours: true,
            labHours: true,
            curricularYear: true,
            curriculum: {
              select: {
                version: true,
                course: {
                  select: {
                    id: true,
                    code: true,
                    name: true,
                  },
                },
              },
            },
          },
        },
        academicSemester: {
          select: {
            id: true,
            semesterNumber: true,
            isCurrent: true,
            gradeSubmissionDeadline: true,
            examRecursoDeadline: true,
            academicYear: {
              select: {
                id: true,
                code: true,
              },
            },
          },
        },
        regenteDocente: {
          select: {
            id: true,
            fullName: true,
            mechanographicNumber: true,
          },
        },
        pauta: {
          select: {
            id: true,
            status: true,
            isFrozen: true,
            submittedAt: true,
            frozenAt: true,
            hashHomologacao: true,
          },
        },
        _count: {
          select: {
            enrollments: true,
            attendanceLessons: true,
          },
        },
      },
      orderBy: {
        code: 'asc',
      },
    });

    return turmas.map((turma) => ({
      id: turma.id,
      code: turma.code,
      turno: turma.turno,
      maxCapacity: turma.maxCapacity,
      occupiedCapacity: turma.occupiedCapacity,
      totalEnrolled: turma._count.enrollments,
      totalLessonsTaught: turma._count.attendanceLessons,
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
        course: turma.discipline.curriculum.course,
      },
      academicSemester: {
        id: turma.academicSemester.id,
        semesterNumber: turma.academicSemester.semesterNumber,
        isCurrent: turma.academicSemester.isCurrent,
        academicYear: turma.academicSemester.academicYear.code,
        gradeSubmissionDeadline: turma.academicSemester.gradeSubmissionDeadline,
        examRecursoDeadline: turma.academicSemester.examRecursoDeadline,
      },
      regenteDocente: turma.regenteDocente,
      pauta: turma.pauta,
    }));
  }

  /**
   * RF-12 & RF-13: Pauta Nominal e Assiduidade da Turma
   * Obtem a relacao de estudantes inscritos, com calculo percentual de assiduidade e notas correntes.
   */
  async getTurmaRoster(turmaId: string, accountId: string, roles: UserRole[]) {
    await this.validateTurmaAccess(turmaId, accountId, roles);

    const turma = await this.prisma.turma.findUnique({
      where: { id: turmaId },
      include: {
        discipline: true,
        academicSemester: {
          include: {
            academicYear: true,
          },
        },
        pauta: {
          include: {
            grades: true,
          },
        },
        attendanceLessons: {
          include: {
            records: true,
          },
          orderBy: {
            lessonDate: 'desc',
          },
        },
        enrollments: {
          where: {
            status: 'CONFIRMADA',
          },
          include: {
            student: {
              select: {
                id: true,
                studentNumber: true,
                identityCardNumber: true,
                fullName: true,
                photoUrl: true,
                academicStatus: true,
                currentYear: true,
              },
            },
            gradeItem: true,
            attendanceRecords: true,
          },
          orderBy: {
            student: {
              fullName: 'asc',
            },
          },
        },
      },
    });

    if (!turma) {
      throw new NotFoundException('Turma nao encontrada.');
    }

    // Calculo do total de horas lecionadas na turma
    const totalHoursTaught = turma.attendanceLessons.reduce(
      (sum, lesson) => sum + lesson.hoursTaught,
      0,
    );

    const studentsRoster = turma.enrollments.map((enrollment) => {
      // Horas de ausencias injustificadas
      const missedHours = enrollment.attendanceRecords.reduce((sum, record) => {
        if (!record.isPresent && !record.isJustified) {
          const lesson = turma.attendanceLessons.find(
            (l) => l.id === record.lessonId,
          );
          return sum + (lesson ? lesson.hoursTaught : 2);
        }
        return sum;
      }, 0);

      const absencePercentage =
        totalHoursTaught > 0
          ? Number(((missedHours / totalHoursTaught) * 100).toFixed(1))
          : 0;

      const isAbsenceExceeded = absencePercentage > 25.0;

      return {
        enrollmentId: enrollment.id,
        student: enrollment.student,
        enrolledAt: enrollment.enrolledAt,
        attendance: {
          totalLessons: turma.attendanceLessons.length,
          totalHoursTaught,
          missedHours,
          absencePercentage,
          isAbsenceExceeded,
        },
        grades: enrollment.gradeItem ?? null,
      };
    });

    return {
      turma: {
        id: turma.id,
        code: turma.code,
        discipline: turma.discipline,
        semester: turma.academicSemester,
        totalEnrolled: turma.enrollments.length,
        totalHoursTaught,
        pauta: turma.pauta
          ? {
              id: turma.pauta.id,
              status: turma.pauta.status,
              isFrozen: turma.pauta.isFrozen,
              submittedAt: turma.pauta.submittedAt,
              frozenAt: turma.pauta.frozenAt,
              hashHomologacao: turma.pauta.hashHomologacao,
              retificationNote: turma.pauta.retificationNote,
            }
          : null,
      },
      students: studentsRoster,
    };
  }

  /**
   * RF-13: Registro do Diario de Turma e Faltas
   * Registra a aula lecionada e a presenca individual de cada estudante.
   */
  async recordAttendance(
    turmaId: string,
    accountId: string,
    roles: UserRole[],
    dto: RecordAttendanceDto,
  ) {
    await this.validateTurmaAccess(turmaId, accountId, roles);

    const turma = await this.prisma.turma.findUnique({
      where: { id: turmaId },
      include: {
        enrollments: {
          where: { status: 'CONFIRMADA' },
          select: { id: true },
        },
      },
    });

    if (!turma) {
      throw new NotFoundException('Turma nao encontrada.');
    }

    const validEnrollmentIds = new Set(turma.enrollments.map((e) => e.id));

    // Validar se todos os enrollmentIds fornecidos pertencem a turma
    for (const record of dto.records) {
      if (!validEnrollmentIds.has(record.enrollmentId)) {
        throw new BadRequestException(
          `A inscricao de ID ${record.enrollmentId} nao pertence a esta turma.`,
        );
      }
    }

    const lessonDate = new Date(dto.lessonDate);
    if (isNaN(lessonDate.getTime())) {
      throw new BadRequestException('Data da aula invalida.');
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const lesson = await tx.attendanceLesson.create({
        data: {
          turmaId,
          lessonDate,
          lessonSummary: dto.lessonSummary,
          hoursTaught: dto.hoursTaught,
          records: {
            createMany: {
              data: dto.records.map((r) => ({
                enrollmentId: r.enrollmentId,
                isPresent: r.isPresent,
                isJustified: r.isJustified ?? false,
                justificationReason: r.justificationReason,
              })),
            },
          },
        },
        include: {
          records: true,
        },
      });

      return lesson;
    });

    this.logger.log(
      `Diario de turma registrado: Turma ${turma.code}, Aula ${result.id}, Data: ${dto.lessonDate}`,
    );

    return {
      message: 'Presencas e sumario registrados com sucesso.',
      lesson: result,
    };
  }

  /**
   * RF-13: Historico de Aulas e Faltas da Turma
   */
  async getTurmaAttendanceHistory(
    turmaId: string,
    accountId: string,
    roles: UserRole[],
  ) {
    await this.validateTurmaAccess(turmaId, accountId, roles);

    const lessons = await this.prisma.attendanceLesson.findMany({
      where: { turmaId },
      include: {
        records: {
          include: {
            enrollment: {
              include: {
                student: {
                  select: {
                    id: true,
                    studentNumber: true,
                    fullName: true,
                  },
                },
              },
            },
          },
        },
      },
      orderBy: {
        lessonDate: 'desc',
      },
    });

    return lessons;
  }

  /**
   * RF-14 & RF-15: Lancamento e Calculo Automatico de Avaliacoes
   * Aplica formula institucional, avalia faltas e calcula estado final de 0 a 20 valores.
   */
  async updateGrades(
    turmaId: string,
    accountId: string,
    roles: UserRole[],
    dto: UpdateGradesDto,
  ) {
    await this.validateTurmaAccess(turmaId, accountId, roles);

    const turma = await this.prisma.turma.findUnique({
      where: { id: turmaId },
      include: {
        academicSemester: true,
        pauta: true,
        attendanceLessons: {
          include: {
            records: true,
          },
        },
        enrollments: {
          where: { status: 'CONFIRMADA' },
          include: {
            attendanceRecords: true,
            gradeItem: true,
          },
        },
      },
    });

    if (!turma) {
      throw new NotFoundException('Turma nao encontrada.');
    }

    // 1. Verificacao de Congelamento de Pauta
    if (turma.pauta && turma.pauta.isFrozen) {
      throw new BadRequestException(
        'A pauta desta turma encontra-se congelada e homologada. Qualquer alteracao requer processo formal de retificacao junto a Secretaria Geral.',
      );
    }

    // 2. Verificacao de Prazos do Calendario Academico
    const isPrivileged =
      roles.includes(UserRole.SUPER_ADMIN) ||
      roles.includes(UserRole.SECRETARIA) ||
      roles.includes(UserRole.COORDENADOR);

    if (!isPrivileged) {
      const now = new Date();
      const semester = turma.academicSemester;

      // Verificar prazo de lancamento de notas normais
      if (now > semester.gradeSubmissionDeadline) {
        // Se ultrapassou o prazo normal, verificar se ainda esta no prazo de recurso
        if (now > semester.examRecursoDeadline) {
          throw new ForbiddenException(
            'O prazo regulamentar para submissao de classificacoes encerrou no calendario academico.',
          );
        }
      }
    }

    // Garantir que a Pauta existe
    let pautaId = turma.pauta?.id;
    if (!pautaId) {
      const newPauta = await this.prisma.pauta.create({
        data: {
          turmaId,
          status: PautaStatus.EM_LANCAMENTO,
          isFrozen: false,
        },
      });
      pautaId = newPauta.id;
    }

    // Calculo do total de horas lecionadas para verificacao de faltas
    const totalHoursTaught = turma.attendanceLessons.reduce(
      (sum, l) => sum + l.hoursTaught,
      0,
    );

    // Mapeamento de enrollments validos
    const enrollmentsMap = new Map(turma.enrollments.map((e) => [e.id, e]));

    const gradeUpdates: any[] = [];

    for (const item of dto.grades) {
      const enrollment = enrollmentsMap.get(item.enrollmentId);
      if (!enrollment) {
        throw new BadRequestException(
          `Inscricao ${item.enrollmentId} nao pertence a esta turma.`,
        );
      }

      // Calculo de assiduidade do estudante
      const missedHours = enrollment.attendanceRecords.reduce((sum, r) => {
        if (!r.isPresent && !r.isJustified) {
          const lesson = turma.attendanceLessons.find(
            (l) => l.id === r.lessonId,
          );
          return sum + (lesson ? lesson.hoursTaught : 2);
        }
        return sum;
      }, 0);

      const absencePercentage =
        totalHoursTaught > 0 ? (missedHours / totalHoursTaught) * 100 : 0;
      const isReprovadoFalta = absencePercentage > 25.0;

      // Unir dados atuais com novos dados fornecidos
      const currentGrade = enrollment.gradeItem;
      const f1 = item.frequencia1 !== undefined ? item.frequencia1 : currentGrade?.frequencia1 ?? null;
      const f2 = item.frequencia2 !== undefined ? item.frequencia2 : currentGrade?.frequencia2 ?? null;
      const tp = item.trabalhoPratico !== undefined ? item.trabalhoPratico : currentGrade?.trabalhoPratico ?? null;
      const exNormal = item.exameNormal !== undefined ? item.exameNormal : currentGrade?.exameNormal ?? null;
      const exRecurso = item.exameRecurso !== undefined ? item.exameRecurso : currentGrade?.exameRecurso ?? null;
      const exMelhoria = item.exameMelhoria !== undefined ? item.exameMelhoria : currentGrade?.exameMelhoria ?? null;

      // Calculo da Media de Frequencia (NF)
      let notaFrequencia: number | null = null;
      if (f1 !== null && f2 !== null && tp !== null) {
        notaFrequencia = Number(
          (f1 * 0.4 + f2 * 0.4 + tp * 0.2).toFixed(2),
        );
      } else if (f1 !== null && f2 !== null) {
        notaFrequencia = Number(((f1 + f2) / 2).toFixed(2));
      } else if (f1 !== null) {
        notaFrequencia = f1;
      }

      // Determinacao da Nota Final e Estado Academico
      let notaFinal: number | null = null;
      let estadoFinal: AcademicFinalState | null = null;

      if (isReprovadoFalta) {
        // Excesso de faltas injustificadas (>25%) tem precedencia compulsória
        estadoFinal = AcademicFinalState.REPROVADO_FALTA;
        notaFinal = exRecurso ?? exNormal ?? notaFrequencia ?? 0;
      } else {
        if (exMelhoria !== null) {
          // Exame de melhoria de nota
          notaFinal = exMelhoria;
          estadoFinal = AcademicFinalState.APROVADO;
        } else if (exRecurso !== null) {
          // Exame de 2ª Epoca / Recurso
          notaFinal = exRecurso;
          estadoFinal =
            exRecurso >= 10.0
              ? AcademicFinalState.APROVADO
              : AcademicFinalState.REPROVADO_NOTA;
        } else if (exNormal !== null) {
          // Exame de 1ª Epoca / Normal
          if (notaFrequencia !== null) {
            notaFinal = Number(
              (notaFrequencia * 0.4 + exNormal * 0.6).toFixed(2),
            );
          } else {
            notaFinal = exNormal;
          }

          if (notaFinal >= 10.0) {
            estadoFinal = AcademicFinalState.APROVADO;
          } else {
            estadoFinal = AcademicFinalState.ADMITIDO_RECURSO;
          }
        } else if (notaFrequencia !== null) {
          // Apenas nota de frequencia disponivel
          if (notaFrequencia >= 14.0) {
            notaFinal = notaFrequencia;
            estadoFinal = AcademicFinalState.DISPENSADO_EXAME;
          } else if (notaFrequencia >= 7.0) {
            notaFinal = notaFrequencia;
            estadoFinal = AcademicFinalState.ADMITIDO_RECURSO;
          } else {
            notaFinal = notaFrequencia;
            estadoFinal = AcademicFinalState.ADMITIDO_RECURSO;
          }
        }
      }

      gradeUpdates.push({
        enrollmentId: item.enrollmentId,
        pautaId,
        frequencia1: f1,
        frequencia2: f2,
        trabalhoPratico: tp,
        notaFrequencia,
        exameNormal: exNormal,
        exameRecurso: exRecurso,
        exameMelhoria: exMelhoria,
        notaFinal,
        estadoFinal,
        observacoes: item.observacoes ?? currentGrade?.observacoes ?? null,
      });
    }

    // Persistir notas atualizadas no banco de dados em transacao
    await this.prisma.$transaction(async (tx) => {
      for (const grade of gradeUpdates) {
        await tx.gradeItem.upsert({
          where: { enrollmentId: grade.enrollmentId },
          create: {
            enrollmentId: grade.enrollmentId,
            pautaId: grade.pautaId,
            frequencia1: grade.frequencia1,
            frequencia2: grade.frequencia2,
            trabalhoPratico: grade.trabalhoPratico,
            notaFrequencia: grade.notaFrequencia,
            exameNormal: grade.exameNormal,
            exameRecurso: grade.exameRecurso,
            exameMelhoria: grade.exameMelhoria,
            notaFinal: grade.notaFinal,
            estadoFinal: grade.estadoFinal,
            observacoes: grade.observacoes,
          },
          update: {
            frequencia1: grade.frequencia1,
            frequencia2: grade.frequencia2,
            trabalhoPratico: grade.trabalhoPratico,
            notaFrequencia: grade.notaFrequencia,
            exameNormal: grade.exameNormal,
            exameRecurso: grade.exameRecurso,
            exameMelhoria: grade.exameMelhoria,
            notaFinal: grade.notaFinal,
            estadoFinal: grade.estadoFinal,
            observacoes: grade.observacoes,
          },
        });
      }

      // Atualizar status da pauta se estava vazia
      await tx.pauta.update({
        where: { id: pautaId },
        data: {
          status: PautaStatus.EM_LANCAMENTO,
        },
      });
    });

    this.logger.log(
      `Notas atualizadas com sucesso para a Turma ${turma.code} (${gradeUpdates.length} estudantes).`,
    );

    return {
      message: 'Classificacoes atualizadas e calculadas com sucesso.',
      updatedCount: gradeUpdates.length,
      pautaId,
    };
  }

  /**
   * RF-15: Submissao e Fechamento/Congelamento de Pauta
   * Aplica assinatura digital SHA-256 e congela a pauta para impedir ulteriores modificacoes.
   */
  async submitAndFreezePauta(
    turmaId: string,
    accountId: string,
    roles: UserRole[],
    dto: SubmitPautaDto,
  ) {
    await this.validateTurmaAccess(turmaId, accountId, roles);

    const turma = await this.prisma.turma.findUnique({
      where: { id: turmaId },
      include: {
        discipline: true,
        academicSemester: true,
        pauta: {
          include: {
            grades: {
              include: {
                enrollment: {
                  include: {
                    student: {
                      select: {
                        studentNumber: true,
                        fullName: true,
                      },
                    },
                  },
                },
              },
            },
          },
        },
        enrollments: {
          where: { status: 'CONFIRMADA' },
        },
      },
    });

    if (!turma) {
      throw new NotFoundException('Turma nao encontrada.');
    }

    if (!turma.pauta) {
      throw new BadRequestException(
        'Nenhuma pauta ou nota foi registrada ainda para esta turma.',
      );
    }

    if (turma.pauta.isFrozen) {
      throw new BadRequestException(
        'A pauta desta turma ja se encontra congelada e homologada.',
      );
    }

    // Verificar se todos os estudantes matriculados possuem notas/estado final
    const registeredGrades = turma.pauta.grades;
    if (registeredGrades.length < turma.enrollments.length) {
      throw new BadRequestException(
        `Nao e possivel homologar a pauta: ha estudantes inscritos (${turma.enrollments.length}) sem classificacao registrada (${registeredGrades.length}).`,
      );
    }

    // Gerar Hash SHA-256 de Homologacao da Pauta (Assinatura Digital Imutavel)
    const sortedGrades = [...registeredGrades].sort((a, b) =>
      a.enrollmentId.localeCompare(b.enrollmentId),
    );

    const payloadToHash = {
      turmaId: turma.id,
      turmaCode: turma.code,
      disciplineId: turma.disciplineId,
      academicSemesterId: turma.academicSemesterId,
      submittedByAccountId: accountId,
      timestamp: new Date().toISOString(),
      gradesSummary: sortedGrades.map((g) => ({
        enrollmentId: g.enrollmentId,
        studentNumber: g.enrollment.student.studentNumber,
        notaFinal: g.notaFinal,
        estadoFinal: g.estadoFinal,
      })),
    };

    const hashHomologacao = crypto
      .createHash('sha256')
      .update(JSON.stringify(payloadToHash))
      .digest('hex');

    const updatedPauta = await this.prisma.pauta.update({
      where: { id: turma.pauta.id },
      data: {
        status: PautaStatus.SUBMETIDA,
        isFrozen: true,
        submittedAt: new Date(),
        frozenAt: new Date(),
        hashHomologacao,
        retificationNote: dto.observacoes,
      },
    });

    this.logger.log(
      `Pauta homologada e congelada: Turma ${turma.code}, Hash: ${hashHomologacao}`,
    );

    return {
      message: 'Pauta submetida, homologada e congelada com sucesso.',
      pautaId: updatedPauta.id,
      status: updatedPauta.status,
      isFrozen: updatedPauta.isFrozen,
      hashHomologacao: updatedPauta.hashHomologacao,
      frozenAt: updatedPauta.frozenAt,
    };
  }

  /**
   * RF-26: Retificacao Administrativa de Pautas pela Secretaria Geral
   * Exige despacho institucional, justificativa textual e registra auditoria completa.
   */
  async rectifyPautaBySecretaria(
    pautaId: string,
    staffAccountId: string,
    dto: RectifyPautaDto,
    ipAddress?: string,
    userAgent?: string,
  ) {
    const pauta = await this.prisma.pauta.findUnique({
      where: { id: pautaId },
      include: {
        turma: {
          include: {
            discipline: true,
            academicSemester: true,
          },
        },
        grades: true,
      },
    });

    if (!pauta) {
      throw new NotFoundException('Pauta nao encontrada.');
    }

    const previousGradesSnapshot = JSON.parse(JSON.stringify(pauta.grades));

    const rectifiedData = await this.prisma.$transaction(async (tx) => {
      // 1. Atualizar notas dos estudantes indicados na retificacao
      for (const item of dto.retificacoes) {
        const updateData: any = {};
        if (item.frequencia1 !== undefined) updateData.frequencia1 = item.frequencia1;
        if (item.frequencia2 !== undefined) updateData.frequencia2 = item.frequencia2;
        if (item.trabalhoPratico !== undefined) updateData.trabalhoPratico = item.trabalhoPratico;
        if (item.exameNormal !== undefined) updateData.exameNormal = item.exameNormal;
        if (item.exameRecurso !== undefined) updateData.exameRecurso = item.exameRecurso;
        if (item.exameMelhoria !== undefined) updateData.exameMelhoria = item.exameMelhoria;
        if (item.novaNotaFinal !== undefined) updateData.notaFinal = item.novaNotaFinal;
        if (item.novoEstadoFinal !== undefined) updateData.estadoFinal = item.novoEstadoFinal;

        await tx.gradeItem.update({
          where: { enrollmentId: item.enrollmentId },
          data: updateData,
        });
      }

      // 2. Novo Hash de Homologacao apos retificacao
      const newHashPayload = {
        pautaId: pauta.id,
        turmaId: pauta.turmaId,
        despacho: dto.despacho,
        rectifiedByAccountId: staffAccountId,
        rectifiedAt: new Date().toISOString(),
        rectifications: dto.retificacoes,
      };

      const newHash = crypto
        .createHash('sha256')
        .update(JSON.stringify(newHashPayload))
        .digest('hex');

      const historicalNote = `[Retificacao em ${new Date().toISOString()}] Despacho: ${dto.despacho} | Justificativa: ${dto.justificativa}`;
      const updatedNote = pauta.retificationNote
        ? `${pauta.retificationNote}\n${historicalNote}`
        : historicalNote;

      const updatedPauta = await tx.pauta.update({
        where: { id: pautaId },
        data: {
          hashHomologacao: newHash,
          retificationNote: updatedNote,
        },
      });

      // 3. Registro Imutavel de Auditoria Transacional (RF-04 & RF-26)
      await tx.auditLog.create({
        data: {
          accountId: staffAccountId,
          activeProfile: 'SECRETARIA',
          action: AuditAction.UPDATE,
          resource: 'pautas/retificacao',
          resourceId: pautaId,
          oldData: previousGradesSnapshot,
          newData: {
            despacho: dto.despacho,
            justificativa: dto.justificativa,
            retificacoes: dto.retificacoes,
            novoHash: newHash,
          },
          endpoint: `/api/v1/grading/pautas/${pautaId}/rectify`,
          method: 'POST',
          ipAddress: ipAddress ?? null,
          userAgent: userAgent ?? null,
        },
      });

      return updatedPauta;
    });

    this.logger.log(
      `Pauta ${pautaId} retificada administrativamente pela Secretaria sob Despacho '${dto.despacho}'.`,
    );

    return {
      message: 'Pauta retificada com sucesso e registrada na trilha de auditoria institucional.',
      pautaId: rectifiedData.id,
      despacho: dto.despacho,
      novoHashHomologacao: rectifiedData.hashHomologacao,
    };
  }

  /**
   * Validador de Acesso a Turma
   */
  private async validateTurmaAccess(
    turmaId: string,
    accountId: string,
    roles: UserRole[],
  ) {
    const isDocenteOnly =
      roles.includes(UserRole.DOCENTE) &&
      !roles.includes(UserRole.SUPER_ADMIN) &&
      !roles.includes(UserRole.SECRETARIA) &&
      !roles.includes(UserRole.COORDENADOR);

    if (!isDocenteOnly) {
      return;
    }

    const docenteProfile = await this.prisma.docenteProfile.findUnique({
      where: { accountId },
    });

    if (!docenteProfile) {
      throw new ForbiddenException(
        'Perfil docente nao localizado para a conta autenticada.',
      );
    }

    const turma = await this.prisma.turma.findUnique({
      where: { id: turmaId },
      select: { regenteDocenteId: true },
    });

    if (!turma) {
      throw new NotFoundException('Turma nao encontrada.');
    }

    if (turma.regenteDocenteId !== docenteProfile.id) {
      throw new ForbiddenException(
        'Acesso negado: voce nao e o docente regente desta turma.',
      );
    }
  }
}
