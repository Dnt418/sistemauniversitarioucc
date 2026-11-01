import {
  Injectable,
  ConflictException,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import * as crypto from 'crypto';
import { EnrollmentStatus, AcademicStatus } from '@prisma/client';
import { PrismaService } from '@infra/database/prisma.service';
import { RedisService } from '@infra/redis/redis.service';
import { QueueService } from '@infra/queue/queue.service';
import { EnrollStudentInput, CancelEnrollmentInput } from './dto/enrollment.schema';

interface ScheduleSlot {
  dia: string;
  inicio: string;
  fim: string;
  sala: string;
}

@Injectable()
export class EnrollmentService {
  private readonly logger = new Logger(EnrollmentService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redisService: RedisService,
    private readonly queueService: QueueService,
  ) {}

  /**
   * RF-09: Painel de Selecao de Turmas e Disciplinas Elegiveis
   * Valida ano curricular, precedencias cumpridas e vagas em tempo real via Redis.
   */
  async getEligibleDisciplines(accountId: string) {
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
                },
              },
            },
          },
        },
      },
    });

    if (!student) {
      throw new NotFoundException('Perfil de estudante nao encontrado para esta conta');
    }

    if (!student.course || student.course.curriculums.length === 0) {
      throw new NotFoundException('Nenhum plano de estudos ativo encontrado para o curso do estudante');
    }

    const currentSemester = await this.prisma.academicSemester.findFirst({
      where: { isCurrent: true },
    });

    if (!currentSemester) {
      throw new BadRequestException('Nenhum semestre letivo corrente configurado no sistema');
    }

    // Disciplinas em que o aluno ja esta matriculado no semestre corrente
    const currentEnrollments = await this.prisma.enrollment.findMany({
      where: {
        studentProfileId: student.id,
        academicSemesterId: currentSemester.id,
        status: EnrollmentStatus.CONFIRMADA,
      },
      select: { turma: { select: { disciplineId: true } } },
    });
    const enrolledDisciplineIds = new Set(currentEnrollments.map((e) => e.turma.disciplineId));

    // Todas as disciplinas do plano curricular ativo
    const activeCurriculum = student.course.curriculums[0];
    const result = [];

    for (const discipline of activeCurriculum.disciplines) {
      // 1. Verificacao de precedencias (RF-06)
      const missingPrerequisites: string[] = [];
      for (const prereq of discipline.prerequisites) {
        // Para o MVP: verifica se ha registro de aprovacao previa
        // Caso a cadeira de precedencia nao conste como concluida, adiciona a lista
        const hasPassed = false; // Em fases futuras sera consultado na tabela de pautas/historico
        if (!hasPassed && prereq.prerequisiteDiscipline) {
          missingPrerequisites.push(prereq.prerequisiteDiscipline.name);
        }
      }

      const isPrerequisitesMet = missingPrerequisites.length === 0;
      const isAlreadyEnrolled = enrolledDisciplineIds.has(discipline.id);

      // 2. Turmas abertas para esta cadeira no semestre corrente (RF-08)
      const turmas = await this.prisma.turma.findMany({
        where: {
          disciplineId: discipline.id,
          academicSemesterId: currentSemester.id,
          isActive: true,
        },
        include: {
          regenteDocente: {
            select: { id: true, fullName: true, category: true },
          },
        },
      });

      // Consulta vagas restantes em tempo real com contador atômico no Redis
      const turmasComVagas = await Promise.all(
        turmas.map(async (t) => {
          const vagasDisponiveis = await this.redisService.getAvailableSeats(
            t.id,
            t.maxCapacity - t.occupiedCapacity,
          );
          return {
            id: t.id,
            code: t.code,
            turno: t.turno,
            maxCapacity: t.maxCapacity,
            occupiedCapacity: t.occupiedCapacity,
            vagasRestantes: vagasDisponiveis,
            schedule: t.schedule,
            regenteDocente: t.regenteDocente?.fullName || 'A atribuir',
          };
        }),
      );

      result.push({
        disciplinaId: discipline.id,
        code: discipline.code,
        name: discipline.name,
        curricularYear: discipline.curricularYear,
        semester: discipline.semester,
        credits: discipline.credits,
        jaMatriculado: isAlreadyEnrolled,
        elegivel: isPrerequisitesMet && !isAlreadyEnrolled,
        bloqueadaPorPrecedencia: !isPrerequisitesMet,
        precedenciasFaltantes: missingPrerequisites,
        turmasAbertas: turmasComVagas,
      });
    }

    return {
      estudante: {
        id: student.id,
        studentNumber: student.studentNumber,
        fullName: student.fullName,
        curso: student.course.name,
        anoCurricular: student.currentYear,
      },
      semestre: {
        id: currentSemester.id,
        numero: currentSemester.semesterNumber,
        inicioMatricula: currentSemester.enrollmentStartDate,
        fimMatricula: currentSemester.enrollmentEndDate,
      },
      disciplinas: result,
    };
  }

  /**
   * RF-10: Motor de Reserva Atomica de Vagas e Confirmacao de Inscricao
   */
  async enrollStudent(accountId: string, input: EnrollStudentInput) {
    const student = await this.prisma.studentProfile.findUnique({
      where: { accountId },
    });

    if (!student) {
      throw new NotFoundException('Perfil de estudante nao encontrado');
    }

    if (student.academicStatus !== AcademicStatus.REGULAR) {
      throw new ForbiddenException(
        `Matricula bloqueada: o estudante encontra-se em situacao academica [${student.academicStatus}].`,
      );
    }

    // Trava Financeira Academica (RF-23): Bloqueio compulsório se houver propinas vencidas
    const overdueInvoices = await this.prisma.invoice.findMany({
      where: {
        studentProfileId: student.id,
        dueDate: { lt: new Date() },
        status: { in: ['PENDENTE', 'VENCIDO'] },
      },
    });

    if (overdueInvoices.length > 0) {
      const totalDebt = overdueInvoices.reduce(
        (sum, inv) => sum + (Number(inv.totalAmount) - Number(inv.paidAmount)),
        0,
      );
      throw new ForbiddenException(
        `Matricula bloqueada por trava financeira regulamentar (RF-23): o estudante possui ${overdueInvoices.length} fatura(s) em atraso perfazendo o montante pendente de ${totalDebt.toFixed(2)} AOA. Regularize a situacao na Tesouraria antes de prosseguir com a inscricao.`,
      );
    }

    // 1. Valida janela de matriculas (RF-07)
    const semester = await this.prisma.academicSemester.findUnique({
      where: { id: input.academicSemesterId },
      include: { academicYear: true },
    });

    if (!semester) {
      throw new NotFoundException('Semestre academico nao encontrado');
    }

    const now = new Date();
    if (now < semester.enrollmentStartDate || now > semester.enrollmentEndDate) {
      throw new ForbiddenException(
        'A janela de matricula e inscricao em turmas para este semestre encontra-se encerrada.',
      );
    }

    // 2. Busca todas as turmas solicitadas com suas disciplinas
    const turmas = await this.prisma.turma.findMany({
      where: {
        id: { in: input.turmaIds },
        academicSemesterId: semester.id,
        isActive: true,
      },
      include: { discipline: true },
    });

    if (turmas.length !== input.turmaIds.length) {
      throw new BadRequestException('Uma ou mais turmas selecionadas sao invalidas ou estao inativas.');
    }

    // 3. Verifica duplicidade de disciplinas no mesmo pedido
    const disciplineIds = turmas.map((t) => t.disciplineId);
    if (new Set(disciplineIds).size !== disciplineIds.length) {
      throw new BadRequestException('Nao e permitido selecionar multiplas turmas da mesma disciplina.');
    }

    // 4. Verifica se o estudante ja esta matriculado em alguma destas turmas ou disciplinas
    const existingEnrollments = await this.prisma.enrollment.findMany({
      where: {
        studentProfileId: student.id,
        academicSemesterId: semester.id,
        status: EnrollmentStatus.CONFIRMADA,
      },
      include: { turma: { include: { discipline: true } } },
    });

    for (const turma of turmas) {
      const alreadyInDiscipline = existingEnrollments.some(
        (e) => e.turma.disciplineId === turma.disciplineId,
      );
      if (alreadyInDiscipline) {
        throw new ConflictException(
          `O estudante ja se encontra matriculado na disciplina [${turma.discipline.name}] neste semestre.`,
        );
      }
    }

    // 5. Valida limite maximo de creditos (RF-09: maximo de 36 ECTS)
    const existingCredits = existingEnrollments.reduce((acc, e) => acc + e.turma.discipline.credits, 0);
    const newCredits = turmas.reduce((acc, t) => acc + t.discipline.credits, 0);
    const totalCredits = existingCredits + newCredits;

    if (totalCredits > 36) {
      throw new BadRequestException(
        `Limite semestral de 36 creditos ECTS excedido. Creditos atuais: ${existingCredits}, solicitados: ${newCredits} (Total: ${totalCredits} ECTS).`,
      );
    }

    // 6. Verificacao de Choque de Horarios (RF-09)
    this.checkScheduleConflicts([...existingEnrollments.map((e) => e.turma), ...turmas]);

    // 7. Motor de Concorrencia: Reserva Atomica de Vagas via Lua no Redis (RF-10)
    const successfullyReservedTurmaIds: string[] = [];

    for (const turma of turmas) {
      const hasSeat = await this.redisService.reserveSeat(
        turma.id,
        student.id,
        turma.maxCapacity,
      );

      if (!hasSeat) {
        // Rollback imediato de quaisquer vagas obtidas no Redis neste pedido
        for (const prevId of successfullyReservedTurmaIds) {
          await this.redisService.releaseSeat(prevId, student.id);
        }

        this.logger.warn(
          `Tentativa de overbooking rejeitada: Turma [${turma.code}] esgotada para o Estudante: ${student.studentNumber}`,
        );

        throw new ConflictException(
          `Vagas esgotadas na turma [${turma.code}] da disciplina [${turma.discipline.name}].`,
        );
      }

      successfullyReservedTurmaIds.push(turma.id);
    }

    // 8. Persistencia relacional segura das inscricoes no PostgreSQL
    const createdEnrollments = await this.prisma.$transaction(async (tx) => {
      const enrollments = [];

      for (const turma of turmas) {
        // Geracao de Hash SHA-256 para validacao publica de autenticidade (RF-11)
        const verificationHash = this.generateVerificationHash(
          student.studentNumber,
          turma.code,
          semester.id,
          now,
        );

        const enrollment = await tx.enrollment.create({
          data: {
            studentProfileId: student.id,
            turmaId: turma.id,
            academicSemesterId: semester.id,
            status: EnrollmentStatus.CONFIRMADA,
            verificationHash,
            enrolledAt: now,
          },
          include: {
            turma: {
              include: { discipline: true },
            },
          },
        });

        // Incrementa contador persistido de vagas ocupadas
        await tx.turma.update({
          where: { id: turma.id },
          data: { occupiedCapacity: { increment: 1 } },
        });

        enrollments.push(enrollment);
      }

      return enrollments;
    });

    // 9. Disparo assincrono para fila BullMQ para geracao de Comprovativo PDF (RF-11)
    await this.queueService.addDocumentJob({
      tipo: 'COMPROVATIVO_INSCRICAO',
      solicitanteId: student.id,
      referenciaId: semester.id,
      metadata: {
        studentNumber: student.studentNumber,
        studentName: student.fullName,
        anoAcademico: semester.academicYear.code,
        semestreNumero: semester.semesterNumber,
        dataConfirmacao: now.toISOString(),
        turmas: turmas.map((t) => ({
          codigo: t.code,
          disciplina: t.discipline.name,
          creditos: t.discipline.credits,
          turno: t.turno,
        })),
        hashes: createdEnrollments.map((e) => e.verificationHash),
      },
    });

    return {
      sucesso: true,
      mensagem: 'Inscricao confirmada com sucesso com reserva atomica de vagas.',
      totalTurmasInscritas: createdEnrollments.length,
      totalCreditosInscritos: newCredits,
      matriculas: createdEnrollments.map((e) => ({
        id: e.id,
        turmaCodigo: e.turma.code,
        disciplina: e.turma.discipline.name,
        creditos: e.turma.discipline.credits,
        codigoAutenticidade: e.verificationHash,
        dataConfirmacao: e.enrolledAt,
      })),
    };
  }

  /**
   * RF-11: Consulta de comprovativo e inscricoes confirmadas do estudante
   */
  async getStudentEnrollments(accountId: string, semesterId?: string) {
    const student = await this.prisma.studentProfile.findUnique({
      where: { accountId },
    });

    if (!student) {
      throw new NotFoundException('Perfil de estudante nao encontrado');
    }

    return this.prisma.enrollment.findMany({
      where: {
        studentProfileId: student.id,
        academicSemesterId: semesterId,
      },
      include: {
        turma: {
          include: {
            discipline: true,
            regenteDocente: {
              select: { fullName: true, mechanographicNumber: true },
            },
          },
        },
        academicSemester: {
          include: { academicYear: true },
        },
      },
      orderBy: { enrolledAt: 'desc' },
    });
  }

  /**
   * RF-11: Validacao publica de autenticidade via QR Code / Hash SHA-256
   */
  async verifyEnrollmentAuthenticity(verificationHash: string) {
    const enrollment = await this.prisma.enrollment.findUnique({
      where: { verificationHash },
      include: {
        student: {
          select: { fullName: true, studentNumber: true },
        },
        turma: {
          include: {
            discipline: { select: { code: true, name: true, credits: true } },
          },
        },
        academicSemester: {
          include: { academicYear: true },
        },
      },
    });

    if (!enrollment) {
      throw new NotFoundException('Comprovativo de inscricao nao autentico ou inexistente no sistema institucional.');
    }

    return {
      autentico: true,
      hash: enrollment.verificationHash,
      dataEmissao: enrollment.enrolledAt,
      situacao: enrollment.status,
      estudante: {
        nome: enrollment.student.fullName,
        numeroMatricula: enrollment.student.studentNumber,
      },
      disciplina: {
        codigo: enrollment.turma.discipline.code,
        nome: enrollment.turma.discipline.name,
        creditos: enrollment.turma.discipline.credits,
        turma: enrollment.turma.code,
      },
      anoAcademico: enrollment.academicSemester.academicYear.code,
      semestre: `${enrollment.academicSemester.semesterNumber}º Semestre`,
    };
  }

  /**
   * Cancelamento formal de inscricao com liberacao de vaga no Redis
   */
  async cancelEnrollment(accountId: string, input: CancelEnrollmentInput) {
    const student = await this.prisma.studentProfile.findUnique({
      where: { accountId },
    });

    if (!student) {
      throw new NotFoundException('Perfil de estudante nao encontrado');
    }

    const enrollment = await this.prisma.enrollment.findUnique({
      where: { id: input.enrollmentId },
      include: { turma: true },
    });

    if (!enrollment || enrollment.studentProfileId !== student.id) {
      throw new NotFoundException('Matricula nao encontrada para este estudante');
    }

    if (enrollment.status === EnrollmentStatus.CANCELADA) {
      throw new BadRequestException('Esta inscricao ja se encontra cancelada');
    }

    // 1. Libera vaga atomica no Redis
    await this.redisService.releaseSeat(enrollment.turmaId, student.id);

    // 2. Atualiza status no PostgreSQL e decrementa contagem
    await this.prisma.$transaction([
      this.prisma.enrollment.update({
        where: { id: enrollment.id },
        data: {
          status: EnrollmentStatus.CANCELADA,
          canceledAt: new Date(),
        },
      }),
      this.prisma.turma.update({
        where: { id: enrollment.turmaId },
        data: { occupiedCapacity: { decrement: 1 } },
      }),
    ]);

    return {
      sucesso: true,
      mensagem: 'Inscricao cancelada com sucesso e vaga disponibilizada para outros estudantes.',
    };
  }

  // ============================================================================
  // METODOS AUXILIARES PRIVADOS
  // ============================================================================

  private checkScheduleConflicts(turmas: Array<{ code: string; schedule: any }>) {
    const allSlots: Array<{ turmaCode: string; slot: ScheduleSlot }> = [];

    for (const turma of turmas) {
      if (Array.isArray(turma.schedule)) {
        for (const slot of turma.schedule as ScheduleSlot[]) {
          allSlots.push({ turmaCode: turma.code, slot });
        }
      }
    }

    for (let i = 0; i < allSlots.length; i++) {
      for (let j = i + 1; j < allSlots.length; j++) {
        const a = allSlots[i];
        const b = allSlots[j];

        if (a.turmaCode !== b.turmaCode && this.isTimeOverlap(a.slot, b.slot)) {
          throw new ConflictException(
            `Choque de horario detectado entre a turma [${a.turmaCode}] e a turma [${b.turmaCode}] no dia [${a.slot.dia}] entre ${a.slot.inicio}-${a.slot.fim} e ${b.slot.inicio}-${b.slot.fim}.`,
          );
        }
      }
    }
  }

  private isTimeOverlap(slotA: ScheduleSlot, slotB: ScheduleSlot): boolean {
    if (slotA.dia !== slotB.dia) return false;

    const toMinutes = (timeStr: string) => {
      const [h, m] = timeStr.split(':').map(Number);
      return h * 60 + m;
    };

    const startA = toMinutes(slotA.inicio);
    const endA = toMinutes(slotA.fim);
    const startB = toMinutes(slotB.inicio);
    const endB = toMinutes(slotB.fim);

    return startA < endB && endA > startB;
  }

  private generateVerificationHash(
    studentNumber: string,
    turmaCode: string,
    semesterId: string,
    timestamp: Date,
  ): string {
    const data = `${studentNumber}_${turmaCode}_${semesterId}_${timestamp.toISOString()}_siga_seguro_2026`;
    return crypto.createHash('sha256').update(data).digest('hex');
  }
}

