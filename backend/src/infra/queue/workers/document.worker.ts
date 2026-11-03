import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from "@nestjs/common";
import { Worker, Job } from "bullmq";
import { DocumentJobData } from "../queue.service";
import { IssuedDocumentStatus } from "@prisma/client";
import { RedisService } from "@infra/redis/redis.service";
import { PrismaService } from "@infra/database/prisma.service";
import { StorageService } from "@infra/storage/storage.service";
import { EventsGateway } from "@infra/websocket/events.gateway";
import { PdfGeneratorService } from "@infra/pdf/pdf-generator.service";

@Injectable()
export class DocumentWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DocumentWorker.name);
  private worker?: Worker<DocumentJobData>;
  private isRunning = false;

  constructor(
    private readonly redisService: RedisService,
    private readonly prisma: PrismaService,
    private readonly storageService: StorageService,
    private readonly pdfGeneratorService: PdfGeneratorService,
    private readonly eventsGateway: EventsGateway,
  ) {}

  onModuleInit() {
    try {
      const redisClient = this.redisService.getClient();

      this.worker = new Worker<DocumentJobData>(
        "fila-documentos",
        async (job: Job<DocumentJobData>) => {
          return this.processDocumentJob(job);
        },
        {
          connection: redisClient,
          concurrency: 5,
        },
      );

      this.worker.on("completed", (job) => {
        this.logger.log(
          `Job de documento concluido com sucesso [ID: ${job.id}]`,
        );
      });

      this.worker.on("failed", (job, err) => {
        this.logger.error(
          `Falha no processamento de documento [ID: ${job?.id}]: ${err.message}`,
        );
      });

      this.isRunning = true;
      this.logger.log(
        "Worker BullMQ para geracao de documentos (fila-documentos) ativo.",
      );
    } catch (err: any) {
      this.isRunning = false;
      this.logger.warn(
        `[AVISO] Worker de documentos em modo passivo: ${err.message}. (Requer Redis 5+).`,
      );
    }
  }

  async onModuleDestroy() {
    if (this.isRunning && this.worker) {
      await this.worker.close();
      this.logger.log("Worker de documentos finalizado com sucesso.");
    }
  }

  private async processDocumentJob(job: Job<DocumentJobData>) {
    const { referenciaId, tipo, metadata } = job.data;
    this.logger.log(
      `Iniciando compilacao vetorial do documento: ${tipo} (${referenciaId})`,
    );

    if (!referenciaId) {
      this.logger.warn(
        `Job de documento ignorado: referenciaId nao informado.`,
      );
      return;
    }

    // Processamento de Declaracao / Certidao Academica Oficial
    const issuedDoc = await this.prisma.issuedAcademicDocument.findUnique({
      where: { id: referenciaId },
      include: {
        student: {
          include: {
            course: true,
          },
        },
      },
    });

    if (issuedDoc) {
      const docMetadata = (issuedDoc.metadata as any) ?? {};

      const pdfBuffer =
        await this.pdfGeneratorService.generateAcademicDocumentPdf({
          documentNumber: issuedDoc.documentNumber,
          documentType: issuedDoc.documentType,
          studentName: issuedDoc.student.fullName,
          studentNumber: issuedDoc.student.studentNumber,
          identityCardNumber: issuedDoc.student.identityCardNumber,
          courseName: issuedDoc.student.course?.name ?? "Licenciatura",
          issuedAt: issuedDoc.issuedAt,
          verificationHash: issuedDoc.verificationHash,
          purpose: docMetadata.purpose,
          coeficienteRendimento: docMetadata.coeficienteRendimento,
          grades: docMetadata.gradesSnapshot,
        });

      const fileKey =
        issuedDoc.fileKey ||
        `documents/${issuedDoc.student.studentNumber}/${issuedDoc.documentNumber}.pdf`;

      // Upload do arquivo compilado para o MinIO
      await this.storageService.uploadBuffer(
        "siga-documents",
        fileKey,
        pdfBuffer,
        "application/pdf",
      );

      // Atualiza estado do documento no banco
      await this.prisma.issuedAcademicDocument.update({
        where: { id: issuedDoc.id },
        data: {
          status: IssuedDocumentStatus.EMITIDO,
          fileKey,
          fileUrl: `/siga-documents/${fileKey}`,
        },
      });

      // Emite notificacao via WebSockets
      this.eventsGateway.notifyAccount(
        issuedDoc.student.accountId,
        "documento:gerado",
        {
          documentId: issuedDoc.id,
          documentNumber: issuedDoc.documentNumber,
          documentType: issuedDoc.documentType,
          verificationHash: issuedDoc.verificationHash,
          downloadUrl: `/api/v1/registry/documents/${issuedDoc.id}/download-url`,
          message: `O documento ${issuedDoc.documentNumber} foi compilado e encontra-se disponivel para download.`,
        },
      );

      this.logger.log(
        `PDF gerado e gravado no MinIO: [siga-documents/${fileKey}] (${pdfBuffer.length} bytes)`,
      );
      return { success: true, fileKey, bytes: pdfBuffer.length };
    }

    // Processamento de Comprovativo de Matricula em Turma
    const enrollment = await this.prisma.enrollment.findUnique({
      where: { id: referenciaId },
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
      const pdfBuffer =
        await this.pdfGeneratorService.generateEnrollmentProofPdf({
          studentName: enrollment.student.fullName,
          studentNumber: enrollment.student.studentNumber,
          identityCardNumber: enrollment.student.identityCardNumber,
          courseName: enrollment.student.course?.name ?? "Licenciatura",
          enrolledAt: enrollment.enrolledAt,
          academicYear: enrollment.academicSemester.academicYear.code,
          semesterNumber: enrollment.academicSemester.semesterNumber,
          turmas: [
            {
              turmaCode: enrollment.turma.code,
              disciplinaCode: enrollment.turma.discipline.code,
              disciplinaName: enrollment.turma.discipline.name,
              credits: enrollment.turma.discipline.credits,
              turno: enrollment.turma.turno,
            },
          ],
          totalCredits: enrollment.turma.discipline.credits,
          verificationHash: enrollment.verificationHash,
        });

      const fileKey = `proofs/enrollments/${enrollment.student.studentNumber}/MATR-${enrollment.id.slice(0, 8)}.pdf`;

      await this.storageService.uploadBuffer(
        "siga-documents",
        fileKey,
        pdfBuffer,
        "application/pdf",
      );

      this.eventsGateway.notifyAccount(
        enrollment.student.accountId,
        "matricula:comprovativo_gerado",
        {
          enrollmentId: enrollment.id,
          verificationHash: enrollment.verificationHash,
          fileKey,
          message: "O comprovativo de inscricao em PDF foi gerado com sucesso.",
        },
      );

      return { success: true, fileKey, bytes: pdfBuffer.length };
    }

    this.logger.warn(
      `Registro de referencia ${referenciaId} nao localizado para emissao de PDF.`,
    );
  }
}
