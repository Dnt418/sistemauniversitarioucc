import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { Worker, Job } from 'bullmq';
import { RedisService } from '@infra/redis/redis.service';
import { MailerService } from '@infra/mailer/mailer.service';
import { EmailJobData } from '../queue.service';

@Injectable()
export class EmailWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(EmailWorker.name);
  private worker?: Worker<EmailJobData>;
  private isRunning = false;

  constructor(
    private readonly redisService: RedisService,
    private readonly mailerService: MailerService,
  ) {}

  onModuleInit() {
    try {
      const redisClient = this.redisService.getClient();

      this.worker = new Worker<EmailJobData>(
        'fila-emails',
        async (job: Job<EmailJobData>) => {
          return this.processEmailJob(job);
        },
        {
          connection: redisClient,
          concurrency: 5,
        },
      );

      this.worker.on('completed', (job) => {
        this.logger.log(`Job de email concluido com sucesso [ID: ${job.id}]`);
      });

      this.worker.on('failed', (job, err) => {
        this.logger.error(
          `Falha no processamento de email [ID: ${job?.id}]: ${err.message}`,
        );
      });

      this.isRunning = true;
      this.logger.log('Worker BullMQ para disparo de emails (fila-emails) ativo.');
    } catch (err: any) {
      this.isRunning = false;
      this.logger.warn(
        `[AVISO] Worker de emails em modo passivo: ${err.message}. (Requer Redis 5+).`,
      );
    }
  }

  async onModuleDestroy() {
    if (this.isRunning && this.worker) {
      await this.worker.close();
      this.logger.log('Worker de emails finalizado com sucesso.');
    }
  }

  private async processEmailJob(job: Job<EmailJobData>) {
    const { to, subject, context } = job.data;
    this.logger.log(`Processando disparo de email para: ${to} (Assunto: ${subject})`);

    const htmlContent = context?.html || `<p>${subject}</p>`;
    const textContent = context?.text || subject;

    return this.mailerService.sendEmail({
      to,
      subject,
      html: htmlContent,
      text: textContent,
    });
  }
}

