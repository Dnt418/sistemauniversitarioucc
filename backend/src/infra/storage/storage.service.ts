import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { Readable } from "stream";
import { ConfigService } from "@nestjs/config";
import { Injectable, Logger } from "@nestjs/common";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private readonly s3Client: S3Client;

  constructor(private readonly configService: ConfigService) {
    const endpoint =
      this.configService.get<string>("S3_ENDPOINT") || "http://localhost:9000";
    const region = this.configService.get<string>("S3_REGION") || "us-east-1";
    const accessKeyId =
      this.configService.get<string>("S3_ACCESS_KEY") || "minioadmin";
    const secretAccessKey =
      this.configService.get<string>("S3_SECRET_KEY") ||
      "minioadmin_secret_2026";

    this.s3Client = new S3Client({
      endpoint,
      region,
      credentials: {
        accessKeyId,
        secretAccessKey,
      },
      forcePathStyle: true, // Obrigatorio para compatibilidade com MinIO local
    });

    this.logger.log(
      `Cliente S3/MinIO inicializado para o endpoint: ${endpoint}`,
    );
  }

  /**
   * Upload direto de Buffer (usado por geradores de PDF e processadores backend)
   */
  async uploadBuffer(
    bucket: string,
    key: string,
    buffer: Buffer,
    contentType: string,
  ): Promise<string> {
    try {
      await this.s3Client.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: key,
          Body: buffer,
          ContentType: contentType,
        }),
      );

      this.logger.log(
        `Arquivo salvo com sucesso no bucket [${bucket}]: ${key}`,
      );
      return key;
    } catch (err: any) {
      this.logger.error(
        `Falha ao gravar arquivo no bucket [${bucket}/${key}]: ${err.message}`,
      );
      throw err;
    }
  }

  /**
   * Gera URL pré-assinada para upload direto pelo navegador do utilizador (evita sobrecarga no backend)
   */
  async getPresignedUploadUrl(
    bucket: string,
    key: string,
    expiresInSeconds = 300,
  ): Promise<string> {
    const command = new PutObjectCommand({
      Bucket: bucket,
      Key: key,
    });

    return getSignedUrl(this.s3Client, command, {
      expiresIn: expiresInSeconds,
    });
  }

  /**
   * Gera URL pré-assinada com tempo limitado para download seguro de documentos e borderos
   */
  async getPresignedDownloadUrl(
    bucket: string,
    key: string,
    expiresInSeconds = 3600,
  ): Promise<string> {
    const command = new GetObjectCommand({
      Bucket: bucket,
      Key: key,
    });

    return getSignedUrl(this.s3Client, command, {
      expiresIn: expiresInSeconds,
    });
  }

  /**
   * Remove arquivo do Object Storage
   */
  async deleteObject(bucket: string, key: string): Promise<void> {
    try {
      await this.s3Client.send(
        new DeleteObjectCommand({
          Bucket: bucket,
          Key: key,
        }),
      );
      this.logger.log(`Arquivo removido do bucket [${bucket}]: ${key}`);
    } catch (err: any) {
      this.logger.error(
        `Falha ao remover arquivo do bucket [${bucket}/${key}]: ${err.message}`,
      );
      throw err;
    }
  }

  /**
   * Retorna os nomes dos buckets padrao configurados
   */
  getDefaultBuckets() {
    return {
      documents:
        this.configService.get<string>("S3_BUCKET_DOCUMENTS") ||
        "siga-documents",
      proofs:
        this.configService.get<string>("S3_BUCKET_PROOFS") || "siga-proofs",
      pautas:
        this.configService.get<string>("S3_BUCKET_PAUTAS") || "siga-pautas",
    };
  }
}
