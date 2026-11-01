import { Global, Module } from '@nestjs/common';
import { QueueService } from './queue.service';
import { DocumentWorker } from './workers/document.worker';
import { EmailWorker } from './workers/email.worker';

@Global()
@Module({
  providers: [QueueService, DocumentWorker, EmailWorker],
  exports: [QueueService],
})
export class QueueModule {}

