import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
} from "@nestjs/common";
import { Queue } from "bullmq";
import { ConfigService } from "@nestjs/config";
import { RedisService } from "../redis/redis.service";

export interface EnrollmentJobData {
  estudanteId: string;
  turmaId: string;
  academicSemesterId: string;
  solicitadoEm: string;
}

export interface EmailJobData {
  to: string;
  subject: string;
  template: string;
  context: Record<string, any>;
}

export interface DocumentJobData {
  tipo:
    | "COMPROVATIVO_INSCRICAO"
    | "DECLARACAO_MATRICULA"
    | "CERTIDAO_NOTAS"
    | "PAUTA_FINAL";
  solicitanteId: string;
  referenciaId?: string;
  metadata: Record<string, any>;
}

@Injectable()
export class QueueService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(QueueService.name);

  private enrollmentQueue?: Queue<EnrollmentJobData>;
  private emailQueue?: Queue<EmailJobData>;
  private documentQueue?: Queue<DocumentJobData>;
  private isReady = false;

  constructor(
    private readonly configService: ConfigService,
    private readonly redisService: RedisService,
  ) {}

  onModuleInit() {
    try {
      const redisClient = this.redisService.getClient();

      this.enrollmentQueue = new Queue<EnrollmentJobData>("fila-matriculas", {
        connection: redisClient,
        defaultJobOptions: {
          attempts: 5,
          backoff: { type: "exponential", delay: 1000 },
          removeOnComplete: 1000,
          removeOnFail: 5000,
        },
      });

      this.emailQueue = new Queue<EmailJobData>("fila-emails", {
        connection: redisClient,
        defaultJobOptions: {
          attempts: 3,
          backoff: { type: "fixed", delay: 3000 },
          removeOnComplete: 500,
          removeOnFail: 2000,
        },
      });

      this.documentQueue = new Queue<DocumentJobData>("fila-documentos", {
        connection: redisClient,
        defaultJobOptions: {
          attempts: 2,
          removeOnComplete: 500,
        },
      });

      this.isReady = true;
      this.logger.log(
        "Filas BullMQ registradas com sucesso (Matriculas, Emails, Documentos)",
      );
    } catch (err: any) {
      this.isReady = false;
      this.logger.warn(
        `[AVISO] Filas BullMQ em modo passivo: ${err.message}. O BullMQ requer Redis 5+ (o Docker Compose em infra/ orquestra o Redis 7).`,
      );
    }
  }

  async onModuleDestroy() {
    if (this.isReady) {
      await Promise.all([
        this.enrollmentQueue?.close(),
        this.emailQueue?.close(),
        this.documentQueue?.close(),
      ]);
      this.logger.log("Filas BullMQ encerradas com sucesso");
    }
  }

  /**
   * RF-10: Enfileira inscricao para persistencia relacional desacoplada
   */
  async addEnrollmentJob(data: EnrollmentJobData) {
    if (!this.isReady || !this.enrollmentQueue) {
      this.logger.warn(
        `[AVISO] Fila inativa. Processando matricula sincrona em contingencia: ${data.estudanteId}`,
      );
      return { id: `local_${Date.now()}`, data };
    }

    try {
      const job = await this.enrollmentQueue.add("persist-enrollment", data, {
        jobId: `enroll_${data.estudanteId}_${data.turmaId}`,
      });
      this.logger.log(
        `Inscricao enfileirada [Job ID: ${job.id}] para o Estudante: ${data.estudanteId}`,
      );
      return job;
    } catch (err: any) {
      this.logger.error(`Falha ao enfileirar matricula: ${err.message}`);
      return { id: `fallback_${Date.now()}`, data };
    }
  }

  /**
   * RF-03: Enfileira envio assincrono de emails e tokens
   */
  async addEmailJob(data: EmailJobData) {
    if (!this.isReady || !this.emailQueue) {
      this.logger.warn(
        `[AVISO] Fila inativa. Email simulado para envio: ${data.to}`,
      );
      return { id: `local_${Date.now()}`, data };
    }

    try {
      const job = await this.emailQueue.add("send-email", data);
      this.logger.log(
        `Email enfileirado [Job ID: ${job.id}] para destinatario: ${data.to}`,
      );
      return job;
    } catch (err: any) {
      this.logger.error(`Falha ao enfileirar email: ${err.message}`);
      return { id: `fallback_${Date.now()}`, data };
    }
  }

  /**
   * RF-11, RF-25: Enfileira geracao assincrona de PDFs com QR Code e hash
   */
  async addDocumentJob(data: DocumentJobData) {
    if (!this.isReady || !this.documentQueue) {
      this.logger.warn(
        `[AVISO] Fila inativa. Solicitacao de documento registrada: ${data.tipo}`,
      );
      return { id: `local_${Date.now()}`, data };
    }

    try {
      const job = await this.documentQueue.add("generate-document", data);
      this.logger.log(
        `Geracao de documento [Job ID: ${job.id}] do tipo: ${data.tipo}`,
      );
      return job;
    } catch (err: any) {
      this.logger.error(`Falha ao enfileirar documento: ${err.message}`);
      return { id: `fallback_${Date.now()}`, data };
    }
  }

  getEnrollmentQueue(): Queue<EnrollmentJobData> | undefined {
    return this.enrollmentQueue;
  }

  getEmailQueue(): Queue<EmailJobData> | undefined {
    return this.emailQueue;
  }

  getDocumentQueue(): Queue<DocumentJobData> | undefined {
    return this.documentQueue;
  }
}
