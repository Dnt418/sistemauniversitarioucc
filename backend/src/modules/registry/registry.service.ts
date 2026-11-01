import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import * as crypto from 'crypto';
import {
  PersonalDocumentType,
  DocumentValidationStatus,
  StudentCareerEventType,
  IssuedDocumentType,
  IssuedDocumentStatus,
  AcademicStatus,
  AuditAction,
  UserRole,
} from '@prisma/client';
import { PrismaService } from '@infra/database/prisma.service';
import { StorageService } from '@infra/storage/storage.service';
import { QueueService } from '@infra/queue/queue.service';
import {
  UploadPersonalDocumentDto,
  ValidatePersonalDocumentDto,
  RegisterCareerEventDto,
  RequestDocumentEmissionDto,
} from './dto/registry.schema';

@Injectable()
export class RegistryService {
  private readonly logger = new Logger(RegistryService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storageService: StorageService,
    private readonly queueService: QueueService,
  ) {}

  /**
   * RF-24: Prontuario Geral - Upload de Documento Pessoal
   */
  async uploadPersonalDocument(
    studentAccountId: string,
    dto: UploadPersonalDocumentDto,
  ) {
    const studentProfile = await this.prisma.studentProfile.findUnique({
      where: { accountId: studentAccountId },
    });

    if (!studentProfile) {
      throw new NotFoundException('Perfil de estudante nao localizado.');
    }

    const document = await this.prisma.studentPersonalDocument.create({
      data: {
        studentProfileId: studentProfile.id,
        documentType: dto.documentType,
        documentNumber: dto.documentNumber ?? null,
        fileUrl: `/siga-documents/${dto.fileKey}`,
        fileKey: dto.fileKey,
        status: DocumentValidationStatus.PENDENTE,
      },
    });

    this.logger.log(
      `Documento pessoal submetido para prontuario: Aluno ${studentProfile.studentNumber}, Tipo: ${dto.documentType}`,
    );

    return {
      message: 'Documento enviado com sucesso para o prontuario. Aguardando validacao da Secretaria Geral.',
      documentId: document.id,
      documentType: document.documentType,
      status: document.status,
    };
  }

  /**
   * RF-24: Consulta do Prontuario Geral de Documentos Pessoais
   */
  async listStudentPersonalDocuments(accountIdOrStudentId: string) {
    let studentProfile = await this.prisma.studentProfile.findUnique({
      where: { accountId: accountIdOrStudentId },
    });

    if (!studentProfile) {
      studentProfile = await this.prisma.studentProfile.findUnique({
        where: { id: accountIdOrStudentId },
      });
    }

    if (!studentProfile) {
      throw new NotFoundException('Perfil de estudante nao localizado.');
    }

    const documents = await this.prisma.studentPersonalDocument.findMany({
      where: { studentProfileId: studentProfile.id },
      include: {
        verifiedByStaff: {
          select: {
            fullName: true,
            jobTitle: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    const careerEvents = await this.prisma.studentCareerEvent.findMany({
      where: { studentProfileId: studentProfile.id },
      include: {
        registeredByStaff: {
          select: {
            fullName: true,
            jobTitle: true,
          },
        },
      },
      orderBy: { eventDate: 'desc' },
    });

    return {
      student: {
        id: studentProfile.id,
        studentNumber: studentProfile.studentNumber,
        fullName: studentProfile.fullName,
        academicStatus: studentProfile.academicStatus,
        admissionDate: studentProfile.admissionDate,
      },
      personalDocuments: documents.map((doc) => ({
        id: doc.id,
        documentType: doc.documentType,
        documentNumber: doc.documentNumber,
        fileKey: doc.fileKey,
        status: doc.status,
        verifiedBy: doc.verifiedByStaff?.fullName ?? null,
        verifiedAt: doc.verifiedAt,
        rejectionReason: doc.rejectionReason,
        createdAt: doc.createdAt,
      })),
      careerEvents: careerEvents.map((ev) => ({
        id: ev.id,
        eventType: ev.eventType,
        despachoNumber: ev.despachoNumber,
        eventDate: ev.eventDate,
        reason: ev.reason,
        previousStatus: ev.previousStatus,
        newStatus: ev.newStatus,
        registeredBy: ev.registeredByStaff?.fullName ?? null,
      })),
    };
  }

  /**
   * RF-24: Validacao de Documento Pessoal pela Secretaria Geral
   */
  async validatePersonalDocument(
    staffAccountId: string,
    documentId: string,
    dto: ValidatePersonalDocumentDto,
    ipAddress?: string,
    userAgent?: string,
  ) {
    const staffProfile = await this.prisma.staffProfile.findUnique({
      where: { accountId: staffAccountId },
    });

    if (!staffProfile) {
      throw new ForbiddenException(
        'Perfil institucional de funcionario da secretaria nao localizado.',
      );
    }

    const doc = await this.prisma.studentPersonalDocument.findUnique({
      where: { id: documentId },
      include: { student: true },
    });

    if (!doc) {
      throw new NotFoundException('Documento nao localizado.');
    }

    const isApproval = dto.status === 'VALIDADO';
    const newStatus = isApproval
      ? DocumentValidationStatus.VALIDADO
      : DocumentValidationStatus.REJEITADO;

    const updatedDoc = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.studentPersonalDocument.update({
        where: { id: documentId },
        data: {
          status: newStatus,
          verifiedByStaffId: staffProfile.id,
          verifiedAt: new Date(),
          rejectionReason: isApproval ? null : dto.rejectionReason,
          notes: dto.notes,
        },
      });

      await tx.auditLog.create({
        data: {
          accountId: staffAccountId,
          activeProfile: 'SECRETARIA',
          action: AuditAction.STATUS_CHANGE,
          resource: 'registry/personal-documents',
          resourceId: documentId,
          oldData: { status: doc.status },
          newData: {
            status: updated.status,
            rejectionReason: dto.rejectionReason ?? null,
          },
          endpoint: `/api/v1/registry/documents/${documentId}/validate`,
          method: 'POST',
          ipAddress: ipAddress ?? null,
          userAgent: userAgent ?? null,
        },
      });

      return updated;
    });

    this.logger.log(
      `Documento ${documentId} validado: Status '${newStatus}' pelo funcionario ${staffProfile.fullName}.`,
    );

    return {
      message: `Documento ${isApproval ? 'validado' : 'rejeitado'} com sucesso.`,
      documentId: updatedDoc.id,
      status: updatedDoc.status,
    };
  }

  /**
   * RF-24: Gestao de Eventos de Carreira Academica
   * Trancamento, anulacao, transferencia, reativacao ou desistencia.
   */
  async registerCareerEvent(
    staffAccountId: string,
    dto: RegisterCareerEventDto,
    ipAddress?: string,
    userAgent?: string,
  ) {
    const staffProfile = await this.prisma.staffProfile.findUnique({
      where: { accountId: staffAccountId },
    });

    if (!staffProfile) {
      throw new ForbiddenException(
        'Perfil institucional da secretaria nao localizado.',
      );
    }

    const studentProfile = await this.prisma.studentProfile.findUnique({
      where: { id: dto.studentProfileId },
    });

    if (!studentProfile) {
      throw new NotFoundException('Estudante nao localizado.');
    }

    const previousStatus = studentProfile.academicStatus;

    const result = await this.prisma.$transaction(async (tx) => {
      const careerEvent = await tx.studentCareerEvent.create({
        data: {
          studentProfileId: studentProfile.id,
          eventType: dto.eventType,
          despachoNumber: dto.despachoNumber,
          reason: dto.reason,
          registeredByStaffId: staffProfile.id,
          previousStatus,
          newStatus: dto.newStatus,
          details: dto.details ?? undefined,
        },
      });

      // Atualizar o status academico do estudante
      await tx.studentProfile.update({
        where: { id: studentProfile.id },
        data: {
          academicStatus: dto.newStatus,
        },
      });

      // Se status for TRANCADO, ANULADO ou DESISTENTE, cancelar inscricoes ativas do semestre vigente
      if (
        dto.newStatus === AcademicStatus.TRANCADO ||
        dto.newStatus === AcademicStatus.DESISTENTE
      ) {
        await tx.enrollment.updateMany({
          where: {
            studentProfileId: studentProfile.id,
            status: 'CONFIRMADA',
            academicSemester: { isCurrent: true },
          },
          data: {
            status: 'ANULADA',
            canceledAt: new Date(),
          },
        });
      }

      // Trilha de Auditoria Transacional Imutavel (RF-04)
      await tx.auditLog.create({
        data: {
          accountId: staffAccountId,
          activeProfile: 'SECRETARIA',
          action: AuditAction.STATUS_CHANGE,
          resource: 'registry/career-events',
          resourceId: careerEvent.id,
          oldData: { academicStatus: previousStatus },
          newData: {
            eventType: dto.eventType,
            despacho: dto.despachoNumber,
            academicStatus: dto.newStatus,
            reason: dto.reason,
          },
          endpoint: '/api/v1/registry/career-events',
          method: 'POST',
          ipAddress: ipAddress ?? null,
          userAgent: userAgent ?? null,
        },
      });

      return careerEvent;
    });

    this.logger.log(
      `Evento de carreira registrado: Aluno ${studentProfile.studentNumber}, Evento: ${dto.eventType}, Despacho: ${dto.despachoNumber}`,
    );

    return {
      message: 'Evento de carreira academica registrado com sucesso e situacao atualizada.',
      eventId: result.id,
      previousStatus,
      newStatus: dto.newStatus,
      despachoNumber: dto.despachoNumber,
    };
  }

  /**
   * RF-25: Emissao Automatizada de Documentos Academicos
   * Processamento assincrono de declaracoes e certidoes com hash SHA-256 e QR code.
   */
  async issueAcademicDocument(
    accountId: string,
    roles: UserRole[],
    dto: RequestDocumentEmissionDto,
    targetStudentId?: string,
  ) {
    const isStudentSelfService = roles.includes(UserRole.ESTUDANTE) && !roles.includes(UserRole.SECRETARIA);

    let studentProfile = null;
    if (isStudentSelfService) {
      studentProfile = await this.prisma.studentProfile.findUnique({
        where: { accountId },
        include: { course: true },
      });
    } else {
      if (!targetStudentId) {
        throw new BadRequestException('ID do estudante e obrigatorio para emissao administrativa.');
      }
      studentProfile = await this.prisma.studentProfile.findUnique({
        where: { id: targetStudentId },
        include: { course: true },
      });
    }

    if (!studentProfile) {
      throw new NotFoundException('Perfil de estudante nao localizado.');
    }

    // Trava Financeira Academica (RF-23): Estudante em divida nao pode emitir declaracoes no autoatendimento
    if (isStudentSelfService) {
      const overdueInvoices = await this.prisma.invoice.findMany({
        where: {
          studentProfileId: studentProfile.id,
          dueDate: { lt: new Date() },
          status: { in: ['PENDENTE', 'VENCIDO'] },
        },
      });

      if (overdueInvoices.length > 0) {
        throw new ForbiddenException(
          'Emissao documental bloqueada por trava financeira (RF-23): constam faturas em atraso no portal da Tesouraria.',
        );
      }
    }

    // Identificar semestre letivo de referencia
    const semester = dto.academicSemesterId
      ? await this.prisma.academicSemester.findUnique({
          where: { id: dto.academicSemesterId },
          include: { academicYear: true },
        })
      : await this.prisma.academicSemester.findFirst({
          where: { isCurrent: true },
          include: { academicYear: true },
        });

    // Buscar dados academicos consolidados para composicao do documento
    const enrollments = await this.prisma.enrollment.findMany({
      where: {
        studentProfileId: studentProfile.id,
        status: 'CONFIRMADA',
      },
      include: {
        turma: { include: { discipline: true } },
        academicSemester: { include: { academicYear: true } },
        gradeItem: true,
      },
    });

    // Calculo do Coeficiente de Rendimento
    let totalCredits = 0;
    let sumWeighted = 0;
    const completedGrades = [];

    for (const enr of enrollments) {
      if (enr.gradeItem && enr.gradeItem.notaFinal !== null && enr.gradeItem.notaFinal >= 10.0) {
        totalCredits += enr.turma.discipline.credits;
        sumWeighted += enr.gradeItem.notaFinal * enr.turma.discipline.credits;
        completedGrades.push({
          disciplina: enr.turma.discipline.name,
          codigo: enr.turma.discipline.code,
          creditos: enr.turma.discipline.credits,
          notaFinal: enr.gradeItem.notaFinal,
          estado: enr.gradeItem.estadoFinal,
          ano: enr.academicSemester.academicYear.code,
          semestre: enr.academicSemester.semesterNumber,
        });
      }
    }

    const coeficienteRendimento = totalCredits > 0 ? Number((sumWeighted / totalCredits).toFixed(2)) : 0.0;

    // Gerar Numero Oficial de Registro
    const randomSeq = crypto.randomBytes(3).toString('hex').toUpperCase();
    const currentYear = new Date().getFullYear();
    const docPrefixMap: Record<IssuedDocumentType, string> = {
      DECLARACAO_MATRICULA_SEM_NOTAS: 'DEC-MATR',
      DECLARACAO_MATRICULA_COM_NOTAS: 'DEC-NOTAS',
      HISTORICO_ESCOLAR_PARCIAL: 'HIST-PARC',
      CERTIDAO_DE_NOTAS: 'CERT-NOTAS',
      GUIA_TRANSFERENCIA: 'GUIA-TRANSF',
    };
    const documentNumber = `${docPrefixMap[dto.documentType]}-${currentYear}-${randomSeq}`;

    // Gerar Assinatura Digital / Hash SHA-256 de Autenticidade Publica (RF-25)
    const hashPayload = {
      documentNumber,
      documentType: dto.documentType,
      studentNumber: studentProfile.studentNumber,
      identityCardNumber: studentProfile.identityCardNumber,
      fullName: studentProfile.fullName,
      course: studentProfile.course?.name,
      coeficienteRendimento,
      issuedAt: new Date().toISOString(),
      institution: 'Universidade - SIGA Universitário Angola',
    };

    const verificationHash = crypto
      .createHash('sha256')
      .update(JSON.stringify(hashPayload))
      .digest('hex');

    // Chave de arquivo no MinIO
    const fileKey = `documents/${studentProfile.studentNumber}/${documentNumber}.pdf`;

    const issuedDocument = await this.prisma.issuedAcademicDocument.create({
      data: {
        documentType: dto.documentType,
        documentNumber,
        studentProfileId: studentProfile.id,
        academicSemesterId: semester?.id ?? null,
        verificationHash,
        fileUrl: `/siga-documents/${fileKey}`,
        fileKey,
        status: IssuedDocumentStatus.EMITIDO,
        metadata: {
          purpose: dto.purpose,
          coeficienteRendimento,
          totalCreditsCompleted: totalCredits,
          studentName: studentProfile.fullName,
          studentNumber: studentProfile.studentNumber,
          courseName: studentProfile.course?.name,
          gradesSnapshot: completedGrades,
        },
      },
    });

    // Enviar job assincrono na fila BullMQ para geracao e gravacao do PDF (RF-25)
    await this.queueService.addDocumentJob({
      tipo: 'DECLARACAO_MATRICULA',
      solicitanteId: studentProfile.id,
      referenciaId: issuedDocument.id,
      metadata: {
        documentNumber,
        documentType: dto.documentType,
        verificationHash,
        fileKey,
      },
    });

    this.logger.log(
      `Documento emitido: ${documentNumber} (${dto.documentType}), Hash: ${verificationHash}`,
    );

    return {
      message: 'Documento academico emitido e registrado com sucesso.',
      documentId: issuedDocument.id,
      documentNumber: issuedDocument.documentNumber,
      documentType: issuedDocument.documentType,
      verificationHash: issuedDocument.verificationHash,
      verificationUrl: `/api/v1/registry/verify/${issuedDocument.verificationHash}`,
      issuedAt: issuedDocument.issuedAt,
    };
  }

  /**
   * RF-25: Validacao Publica Instantanea de Autenticidade Documental
   * Endpoint sem necessidade de autenticacao para confirmacao por entidades externas.
   */
  async verifyPublicDocument(hash: string) {
    // 1. Pesquisa na tabela de Documentos Oficiais Emitidos
    const issuedDoc = await this.prisma.issuedAcademicDocument.findUnique({
      where: { verificationHash: hash },
      include: {
        student: {
          include: {
            course: true,
          },
        },
        academicSemester: {
          include: {
            academicYear: true,
          },
        },
      },
    });

    if (issuedDoc) {
      return {
        isValid: true,
        documentNumber: issuedDoc.documentNumber,
        documentType: issuedDoc.documentType,
        issuedAt: issuedDoc.issuedAt,
        status: issuedDoc.status,
        authenticityStatus:
          issuedDoc.status === IssuedDocumentStatus.EMITIDO
            ? 'AUTENTICO_E_VALIDO'
            : 'DOCUMENTO_REVOGADO_OU_CANCELADO',
        student: {
          fullName: issuedDoc.student.fullName,
          studentNumber: issuedDoc.student.studentNumber,
          identityCardNumber: issuedDoc.student.identityCardNumber,
          course: issuedDoc.student.course?.name ?? 'Nao informado',
        },
        academicSummary: issuedDoc.metadata,
      };
    }

    // 2. Pesquisa de redundancia em Comprovativos de Matricula (Enrollment Hash)
    const enrollment = await this.prisma.enrollment.findUnique({
      where: { verificationHash: hash },
      include: {
        student: {
          include: {
            course: true,
          },
        },
        academicSemester: {
          include: {
            academicYear: true,
          },
        },
        turma: {
          include: {
            discipline: true,
          },
        },
      },
    });

    if (enrollment) {
      return {
        isValid: true,
        documentNumber: `MATR-${enrollment.id.slice(0, 8).toUpperCase()}`,
        documentType: 'COMPROVATIVO_MATRICULA_TURMA',
        issuedAt: enrollment.enrolledAt,
        status: enrollment.status,
        authenticityStatus:
          enrollment.status === 'CONFIRMADA'
            ? 'AUTENTICO_E_VALIDO'
            : 'INSCRICAO_CANCELADA_OU_ANULADA',
        student: {
          fullName: enrollment.student.fullName,
          studentNumber: enrollment.student.studentNumber,
          identityCardNumber: enrollment.student.identityCardNumber,
          course: enrollment.student.course?.name ?? 'Nao informado',
        },
        academicSummary: {
          turma: enrollment.turma.code,
          disciplina: enrollment.turma.discipline.name,
          anoLetivo: enrollment.academicSemester.academicYear.code,
          semestre: enrollment.academicSemester.semesterNumber,
        },
      };
    }

    return {
      isValid: false,
      authenticityStatus: 'DOCUMENTO_INEXISTENTE_OU_INVALIDO',
      message:
        'O codigo hash informado nao corresponde a nenhum documento academico oficial emitido por esta instituicao.',
    };
  }

  /**
   * RF-25: URL Pre-assinada para Download de Documento Emitido
   */
  async getDocumentDownloadUrl(
    documentId: string,
    accountId: string,
    roles: UserRole[],
  ) {
    const doc = await this.prisma.issuedAcademicDocument.findUnique({
      where: { id: documentId },
      include: { student: true },
    });

    if (!doc) {
      throw new NotFoundException('Documento academico nao localizado.');
    }

    const isStudent = roles.includes(UserRole.ESTUDANTE) && !roles.includes(UserRole.SECRETARIA);
    if (isStudent && doc.student.accountId !== accountId) {
      throw new ForbiddenException('Acesso negado: documento pertence a outro estudante.');
    }

    if (!doc.fileKey) {
      throw new BadRequestException('O arquivo correspondente a este documento ainda esta sendo processado.');
    }

    const downloadUrl = await this.storageService.getPresignedDownloadUrl(
      'siga-documents',
      doc.fileKey,
      3600,
    );

    return {
      downloadUrl,
      documentNumber: doc.documentNumber,
      expiresInSeconds: 3600,
    };
  }
}
