import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  FeeType,
  InvoiceStatus,
  PaymentStatus,
  AuditAction,
  UserRole,
} from '@prisma/client';
import * as crypto from 'crypto';
import { PrismaService } from '@infra/database/prisma.service';
import { StorageService } from '@infra/storage/storage.service';
import {
  CreateFeeCatalogDto,
  CreateInvoiceDto,
  GenerateMonthlyInvoicesDto,
  SubmitPaymentProofDto,
  ValidatePaymentProofDto,
} from './dto/financial.schema';
import { EventsGateway } from '@infra/websocket/events.gateway';

@Injectable()
export class FinancialService {
  private readonly logger = new Logger(FinancialService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storageService: StorageService,
    private readonly eventsGateway: EventsGateway,
  ) {}

  /**
   * RF-20: Tabela de Emolumentos e Taxas Institucionais
   * Cadastro de nova taxa/propina parametrizada por curso e ano letivo.
   */
  async createFeeCatalog(dto: CreateFeeCatalogDto) {
    const existing = await this.prisma.feeCatalog.findUnique({
      where: { code: dto.code },
    });

    if (existing) {
      throw new ConflictException(
        `Ja existe um emolumento cadastrado com o codigo '${dto.code}'.`,
      );
    }

    const fee = await this.prisma.feeCatalog.create({
      data: {
        code: dto.code,
        feeType: dto.feeType,
        name: dto.name,
        amount: new Prisma.Decimal(dto.amount),
        finePercentage: new Prisma.Decimal(dto.finePercentage ?? 10.0),
        courseId: dto.courseId ?? null,
        academicYearId: dto.academicYearId ?? null,
        isActive: true,
      },
      include: {
        course: { select: { id: true, code: true, name: true } },
        academicYear: { select: { id: true, code: true } },
      },
    });

    this.logger.log(`Emolumento cadastrado: ${fee.name} (${fee.code}) - ${fee.amount} AOA`);
    return fee;
  }

  /**
   * RF-20: Listagem de Emolumentos e Taxas
   */
  async listFeeCatalogs(courseId?: string, academicYearId?: string) {
    const whereClause: any = { isActive: true };
    if (courseId) whereClause.courseId = courseId;
    if (academicYearId) whereClause.academicYearId = academicYearId;

    return this.prisma.feeCatalog.findMany({
      where: whereClause,
      include: {
        course: { select: { id: true, code: true, name: true } },
        academicYear: { select: { id: true, code: true } },
      },
      orderBy: { code: 'asc' },
    });
  }

  /**
   * RF-21: Geracao Automatizada de Propinas Mensais
   * Cria faturas individuais para todos os estudantes matriculados no semestre selecionado.
   */
  async generateMonthlyInvoices(
    staffAccountId: string,
    dto: GenerateMonthlyInvoicesDto,
  ) {
    const feeCatalog = await this.prisma.feeCatalog.findUnique({
      where: { id: dto.feeCatalogId },
    });

    if (!feeCatalog) {
      throw new NotFoundException('Catalogo de emolumento de propina nao localizado.');
    }

    // Identificar estudantes matriculados com inscricoes ativas no semestre
    const enrollments = await this.prisma.enrollment.findMany({
      where: {
        academicSemesterId: dto.academicSemesterId,
        status: 'CONFIRMADA',
        ...(dto.courseId
          ? {
              student: {
                courseId: dto.courseId,
              },
            }
          : {}),
      },
      select: {
        studentProfileId: true,
      },
      distinct: ['studentProfileId'],
    });

    if (enrollments.length === 0) {
      throw new BadRequestException(
        'Nenhum estudante matriculado encontrado para o semestre e curso indicados.',
      );
    }

    const dueDate = new Date(dto.dueDate);
    const monthsNames = [
      '',
      'Janeiro',
      'Fevereiro',
      'Marco',
      'Abril',
      'Maio',
      'Junho',
      'Julho',
      'Agosto',
      'Setembro',
      'Outubro',
      'Novembro',
      'Dezembro',
    ];
    const monthName = monthsNames[dto.monthReference] || `Mes ${dto.monthReference}`;

    let createdCount = 0;
    const now = new Date();

    await this.prisma.$transaction(async (tx) => {
      for (const enr of enrollments) {
        // Verificar se ja foi faturada propina deste mesmo mes/ano para o aluno
        const existingInvoice = await tx.invoice.findFirst({
          where: {
            studentProfileId: enr.studentProfileId,
            feeCatalogId: dto.feeCatalogId,
            monthReference: dto.monthReference,
            yearReference: dto.yearReference,
          },
        });

        if (existingInvoice) {
          continue; // Ja foi faturada anteriormente
        }

        const randomSuffix = crypto.randomBytes(3).toString('hex').toUpperCase();
        const invoiceNumber = `FAT-${dto.yearReference}-${String(dto.monthReference).padStart(2, '0')}-${randomSuffix}`;

        await tx.invoice.create({
          data: {
            invoiceNumber,
            studentProfileId: enr.studentProfileId,
            feeCatalogId: dto.feeCatalogId,
            academicSemesterId: dto.academicSemesterId,
            title: `Propina referente a ${monthName}/${dto.yearReference} - ${feeCatalog.name}`,
            baseAmount: feeCatalog.amount,
            fineAmount: new Prisma.Decimal(0.0),
            discountAmount: new Prisma.Decimal(0.0),
            totalAmount: feeCatalog.amount,
            paidAmount: new Prisma.Decimal(0.0),
            dueDate,
            monthReference: dto.monthReference,
            yearReference: dto.yearReference,
            status: InvoiceStatus.PENDENTE,
          },
        });

        createdCount++;
      }
    });

    this.logger.log(
      `Geracao de propinas concluida: ${createdCount} faturas emitidas para ${monthName}/${dto.yearReference}.`,
    );

    this.eventsGateway.notifyRole(UserRole.ESTUDANTE, 'propinas:emitidas', {
      monthReference: dto.monthReference,
      yearReference: dto.yearReference,
      dueDate,
      message: `As propinas referentes a ${monthName}/${dto.yearReference} foram emitidas na Tesouraria.`,
    });

    return {
      message: `Propinas mensais geradas com sucesso.`,
      invoicesGenerated: createdCount,
      monthReference: dto.monthReference,
      yearReference: dto.yearReference,
      dueDate,
    };
  }

  /**
   * RF-21: Conta Corrente e Extrato Financeiro do Estudante
   * Lista todas as faturas, calcula multas por mora em tempo real e consolida o saldo devedor.
   */
  async getStudentAccountStatement(accountIdOrStudentProfileId: string) {
    let studentProfile = await this.prisma.studentProfile.findUnique({
      where: { accountId: accountIdOrStudentProfileId },
    });

    if (!studentProfile) {
      studentProfile = await this.prisma.studentProfile.findUnique({
        where: { id: accountIdOrStudentProfileId },
      });
    }

    if (!studentProfile) {
      throw new NotFoundException('Perfil de estudante nao localizado.');
    }

    const invoices = await this.prisma.invoice.findMany({
      where: { studentProfileId: studentProfile.id },
      include: {
        feeCatalog: true,
        academicSemester: {
          include: {
            academicYear: true,
          },
        },
        paymentProofs: {
          orderBy: { createdAt: 'desc' },
        },
      },
      orderBy: { dueDate: 'asc' },
    });

    const now = new Date();
    let totalInvoiced = new Prisma.Decimal(0);
    let totalPaid = new Prisma.Decimal(0);
    let totalPending = new Prisma.Decimal(0);
    let totalOverdue = new Prisma.Decimal(0);
    let overdueCount = 0;

    const processedInvoices = [];

    for (const inv of invoices) {
      let currentStatus = inv.status;
      let fineAmount = new Prisma.Decimal(inv.fineAmount);
      let totalAmount = new Prisma.Decimal(inv.totalAmount);

      // Verificacao de Vencimento e Calculo de Multa por Mora (RF-21)
      if (
        (inv.status === InvoiceStatus.PENDENTE || inv.status === InvoiceStatus.VENCIDO) &&
        now > inv.dueDate
      ) {
        currentStatus = InvoiceStatus.VENCIDO;
        overdueCount++;

        // Calcular multa regulamentar (padrao 10% do valor base)
        const finePercentage = inv.feeCatalog?.finePercentage ?? new Prisma.Decimal(10.0);
        fineAmount = new Prisma.Decimal(
          (Number(inv.baseAmount) * (Number(finePercentage) / 100)).toFixed(2),
        );
        totalAmount = new Prisma.Decimal(
          (Number(inv.baseAmount) + Number(fineAmount) - Number(inv.discountAmount)).toFixed(2),
        );

        // Atualizar no banco se houve acrescimo de multa
        if (!inv.fineAmount.equals(fineAmount) || inv.status !== InvoiceStatus.VENCIDO) {
          await this.prisma.invoice.update({
            where: { id: inv.id },
            data: {
              status: InvoiceStatus.VENCIDO,
              fineAmount,
              totalAmount,
            },
          });
        }

        const remaining = Number(totalAmount) - Number(inv.paidAmount);
        totalOverdue = totalOverdue.plus(new Prisma.Decimal(remaining > 0 ? remaining : 0));
      }

      totalInvoiced = totalInvoiced.plus(totalAmount);
      totalPaid = totalPaid.plus(inv.paidAmount);

      if (currentStatus === InvoiceStatus.PENDENTE) {
        const remaining = Number(totalAmount) - Number(inv.paidAmount);
        totalPending = totalPending.plus(new Prisma.Decimal(remaining > 0 ? remaining : 0));
      }

      processedInvoices.push({
        id: inv.id,
        invoiceNumber: inv.invoiceNumber,
        title: inv.title,
        baseAmount: Number(inv.baseAmount),
        fineAmount: Number(fineAmount),
        discountAmount: Number(inv.discountAmount),
        totalAmount: Number(totalAmount),
        paidAmount: Number(inv.paidAmount),
        balanceDue: Number(totalAmount) - Number(inv.paidAmount),
        dueDate: inv.dueDate,
        status: currentStatus,
        monthReference: inv.monthReference,
        yearReference: inv.yearReference,
        paidAt: inv.paidAt,
        semester: inv.academicSemester
          ? `${inv.academicSemester.academicYear.code} - Semestre ${inv.academicSemester.semesterNumber}`
          : null,
        paymentProofs: inv.paymentProofs.map((p) => ({
          id: p.id,
          bankName: p.bankName,
          transactionReference: p.transactionReference,
          amount: Number(p.amount),
          paymentDate: p.paymentDate,
          paymentMethod: p.paymentMethod,
          status: p.status,
          receiptFileKey: p.receiptFileKey,
          rejectionReason: p.rejectionReason,
        })),
      });
    }

    const isCompliant = overdueCount === 0 && totalOverdue.equals(new Prisma.Decimal(0));

    return {
      student: {
        id: studentProfile.id,
        studentNumber: studentProfile.studentNumber,
        fullName: studentProfile.fullName,
      },
      summary: {
        totalInvoiced: Number(totalInvoiced),
        totalPaid: Number(totalPaid),
        totalPending: Number(totalPending),
        totalOverdue: Number(totalOverdue),
        overdueCount,
        isCompliant, // Indicador de adimplencia financeira (RF-23)
      },
      invoices: processedInvoices,
    };
  }

  /**
   * RF-22: URL Pre-assinada para Upload de Comprovativo / Bordero
   * Permite que o estudante envie o bordero diretamente ao bucket seguro MinIO 'siga-proofs'.
   */
  async getPresignedUploadUrl(
    accountId: string,
    fileName: string,
    contentType: string,
  ) {
    const studentProfile = await this.prisma.studentProfile.findUnique({
      where: { accountId },
    });

    if (!studentProfile) {
      throw new NotFoundException('Perfil de estudante nao localizado.');
    }

    const sanitizedFileName = fileName.replace(/[^a-zA-Z0-9.-]/g, '_');
    const fileKey = `borderos/${studentProfile.studentNumber}/${Date.now()}-${sanitizedFileName}`;
    const bucket = 'siga-proofs';

    const uploadUrl = await this.storageService.getPresignedUploadUrl(
      bucket,
      fileKey,
      300,
    );

    return {
      uploadUrl,
      fileKey,
      bucket,
      expiresInSeconds: 300,
    };
  }

  /**
   * RF-22: Submissao de Pagamento / Bordero pelo Estudante
   */
  async submitPaymentProof(accountId: string, dto: SubmitPaymentProofDto) {
    const studentProfile = await this.prisma.studentProfile.findUnique({
      where: { accountId },
    });

    if (!studentProfile) {
      throw new NotFoundException('Perfil de estudante nao localizado.');
    }

    const invoice = await this.prisma.invoice.findUnique({
      where: { id: dto.invoiceId },
    });

    if (!invoice) {
      throw new NotFoundException('Fatura ou obrigacao nao localizada.');
    }

    if (invoice.studentProfileId !== studentProfile.id) {
      throw new ForbiddenException(
        'Acesso negado: a fatura selecionada nao pertence ao estudante autenticado.',
      );
    }

    if (invoice.status === InvoiceStatus.PAGO) {
      throw new BadRequestException('Esta fatura ja se encontra integralmente liquidada.');
    }

    const paymentDate = new Date(dto.paymentDate);
    if (isNaN(paymentDate.getTime())) {
      throw new BadRequestException('Data de pagamento invalida.');
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const proof = await tx.paymentProof.create({
        data: {
          invoiceId: dto.invoiceId,
          studentProfileId: studentProfile.id,
          bankName: dto.bankName.toUpperCase(),
          transactionReference: dto.transactionReference,
          amount: new Prisma.Decimal(dto.amount),
          paymentDate,
          paymentMethod: dto.paymentMethod,
          receiptFileUrl: `/siga-proofs/${dto.receiptFileKey}`,
          receiptFileKey: dto.receiptFileKey,
          status: PaymentStatus.PENDENTE,
          notes: dto.notes,
        },
      });

      // Atualizar status da fatura para EM_ANALISE
      await tx.invoice.update({
        where: { id: dto.invoiceId },
        data: {
          status: InvoiceStatus.EM_ANALISE,
        },
      });

      return proof;
    });

    this.logger.log(
      `Comprovativo submetido: Estudante ${studentProfile.studentNumber}, Fatura ${invoice.invoiceNumber}, Ref: ${dto.transactionReference}`,
    );

    return {
      message: 'Comprovativo de pagamento submetido com sucesso. Aguardando confirmacao da Tesouraria.',
      paymentProofId: result.id,
      status: result.status,
    };
  }

  /**
   * RF-22: Painel de Pagamentos Pendentes de Validacao (Tesouraria)
   */
  async listPendingPaymentProofs() {
    const proofs = await this.prisma.paymentProof.findMany({
      where: { status: PaymentStatus.PENDENTE },
      include: {
        student: {
          select: {
            id: true,
            studentNumber: true,
            identityCardNumber: true,
            fullName: true,
            course: {
              select: {
                id: true,
                code: true,
                name: true,
              },
            },
          },
        },
        invoice: {
          select: {
            id: true,
            invoiceNumber: true,
            title: true,
            totalAmount: true,
            paidAmount: true,
            dueDate: true,
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    return proofs.map((p) => ({
      id: p.id,
      bankName: p.bankName,
      transactionReference: p.transactionReference,
      amount: Number(p.amount),
      paymentDate: p.paymentDate,
      paymentMethod: p.paymentMethod,
      receiptFileKey: p.receiptFileKey,
      submittedAt: p.createdAt,
      student: p.student,
      invoice: {
        id: p.invoice.id,
        invoiceNumber: p.invoice.invoiceNumber,
        title: p.invoice.title,
        totalAmount: Number(p.invoice.totalAmount),
        paidAmount: Number(p.invoice.paidAmount),
        dueDate: p.invoice.dueDate,
      },
    }));
  }

  /**
   * RF-22: Validacao e Conferencia de Bordero pela Tesouraria
   */
  async validatePaymentProof(
    staffAccountId: string,
    paymentProofId: string,
    dto: ValidatePaymentProofDto,
    ipAddress?: string,
    userAgent?: string,
  ) {
    const staffProfile = await this.prisma.staffProfile.findUnique({
      where: { accountId: staffAccountId },
    });

    if (!staffProfile) {
      throw new ForbiddenException(
        'Perfil institucional de tesouraria/funcionario nao localizado.',
      );
    }

    const proof = await this.prisma.paymentProof.findUnique({
      where: { id: paymentProofId },
      include: {
        invoice: true,
        student: true,
      },
    });

    if (!proof) {
      throw new NotFoundException('Comprovativo de pagamento nao localizado.');
    }

    if (proof.status !== PaymentStatus.PENDENTE) {
      throw new BadRequestException(
        `Este comprovativo ja se encontra processado com status '${proof.status}'.`,
      );
    }

    const isApproval = dto.status === 'APROVADO';

    const result = await this.prisma.$transaction(async (tx) => {
      // 1. Atualizar registro do comprovativo
      const updatedProof = await tx.paymentProof.update({
        where: { id: paymentProofId },
        data: {
          status: isApproval ? PaymentStatus.APROVADO : PaymentStatus.REJEITADO,
          verifiedByStaffId: staffProfile.id,
          verifiedAt: new Date(),
          rejectionReason: isApproval ? null : dto.rejectionReason,
          notes: dto.notes,
        },
      });

      // 2. Atualizar estado da Fatura correspondente
      const invoice = proof.invoice;
      if (isApproval) {
        const newPaidAmount = new Prisma.Decimal(
          (Number(invoice.paidAmount) + Number(proof.amount)).toFixed(2),
        );
        const isFullyPaid = newPaidAmount.greaterThanOrEqualTo(invoice.totalAmount);

        await tx.invoice.update({
          where: { id: invoice.id },
          data: {
            paidAmount: newPaidAmount,
            status: isFullyPaid ? InvoiceStatus.PAGO : InvoiceStatus.PENDENTE,
            paidAt: isFullyPaid ? new Date() : null,
          },
        });
      } else {
        // Se rejeitado, retornar para VENCIDO se expirado ou PENDENTE
        const isOverdue = new Date() > invoice.dueDate;
        await tx.invoice.update({
          where: { id: invoice.id },
          data: {
            status: isOverdue ? InvoiceStatus.VENCIDO : InvoiceStatus.PENDENTE,
          },
        });
      }

      // 3. Trilha de Auditoria Transacional Imutavel (RF-04)
      await tx.auditLog.create({
        data: {
          accountId: staffAccountId,
          activeProfile: 'FINANCEIRO',
          action: AuditAction.STATUS_CHANGE,
          resource: 'financial/payment-proofs',
          resourceId: paymentProofId,
          oldData: {
            proofStatus: proof.status,
            invoiceStatus: invoice.status,
            paidAmount: Number(invoice.paidAmount),
          },
          newData: {
            proofStatus: updatedProof.status,
            amount: Number(proof.amount),
            decision: dto.status,
            rejectionReason: dto.rejectionReason ?? null,
          },
          endpoint: `/api/v1/financial/proofs/${paymentProofId}/validate`,
          method: 'POST',
          ipAddress: ipAddress ?? null,
          userAgent: userAgent ?? null,
        },
      });

      return updatedProof;
    });

    this.logger.log(
      `Comprovativo ${paymentProofId} validado: Decisao '${dto.status}' por ${staffProfile.fullName}.`,
    );

    this.eventsGateway.notifyAccount(proof.student.accountId, 'pagamento:processado', {
      paymentProofId,
      invoiceNumber: proof.invoice.invoiceNumber,
      status: result.status,
      decision: dto.status,
      rejectionReason: dto.rejectionReason ?? null,
      message: isApproval
        ? `O pagamento referente a fatura ${proof.invoice.invoiceNumber} foi aprovado pela Tesouraria.`
        : `O pagamento referente a fatura ${proof.invoice.invoiceNumber} foi rejeitado: ${dto.rejectionReason}.`,
    });

    return {
      message: `Comprovativo de pagamento ${isApproval ? 'aprovado' : 'rejeitado'} com sucesso.`,
      paymentProofId: result.id,
      status: result.status,
    };
  }

  /**
   * RF-22: URL Pre-assinada para Download/Visualizacao do Comprovativo
   */
  async getReceiptDownloadUrl(
    paymentProofId: string,
    accountId: string,
    roles: UserRole[],
  ) {
    const proof = await this.prisma.paymentProof.findUnique({
      where: { id: paymentProofId },
      include: {
        student: true,
      },
    });

    if (!proof) {
      throw new NotFoundException('Comprovativo nao localizado.');
    }

    const isStudent = roles.includes(UserRole.ESTUDANTE) && !roles.includes(UserRole.FINANCEIRO);
    if (isStudent && proof.student.accountId !== accountId) {
      throw new ForbiddenException('Acesso negado ao comprovativo de outro estudante.');
    }

    const downloadUrl = await this.storageService.getPresignedDownloadUrl(
      'siga-proofs',
      proof.receiptFileKey,
      3600,
    );

    return {
      downloadUrl,
      fileKey: proof.receiptFileKey,
      expiresInSeconds: 3600,
    };
  }

  /**
   * RF-23: Trava Financeira Academica
   * Avalia a adimplencia do estudante. Bloqueia inscricoes e servicos em caso de inadimplencia.
   */
  async checkFinancialCompliance(studentProfileId: string) {
    const overdueInvoices = await this.prisma.invoice.findMany({
      where: {
        studentProfileId,
        dueDate: {
          lt: new Date(),
        },
        status: {
          in: [InvoiceStatus.PENDENTE, InvoiceStatus.VENCIDO],
        },
      },
    });

    const overdueCount = overdueInvoices.length;
    const totalDebt = overdueInvoices.reduce(
      (sum, inv) => sum + (Number(inv.totalAmount) - Number(inv.paidAmount)),
      0,
    );

    const isCompliant = overdueCount === 0 && totalDebt <= 0;

    return {
      isCompliant,
      overdueCount,
      totalDebt: Number(totalDebt.toFixed(2)),
      overdueInvoices: overdueInvoices.map((i) => ({
        id: i.id,
        invoiceNumber: i.invoiceNumber,
        title: i.title,
        dueDate: i.dueDate,
        debtAmount: Number(i.totalAmount) - Number(i.paidAmount),
      })),
    };
  }
}

