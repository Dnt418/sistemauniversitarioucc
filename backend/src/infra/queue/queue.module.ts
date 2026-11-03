import { QueueService } from "./queue.service";
import { Global, Module } from "@nestjs/common";
import { EmailWorker } from "./workers/email.worker";
import { DocumentWorker } from "./workers/document.worker";

@Global()
@Module({
  providers: [QueueService, DocumentWorker, EmailWorker],
  exports: [QueueService],
})
export class QueueModule {}
