import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from "@nestjs/common";
import { Observable } from "rxjs";
import { tap } from "rxjs/operators";
import { AuditAction } from "@prisma/client";
import { PrismaService } from "@infra/database/prisma.service";

@Injectable()
export class AuditLogInterceptor implements NestInterceptor {
  private readonly logger = new Logger(AuditLogInterceptor.name);

  constructor(private readonly prisma: PrismaService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    const method = request.method;

    // Apenas operacoes de gravacao/mutacao sao compulsivamente auditadas (RF-04)
    const mutatingMethods = ["POST", "PUT", "PATCH", "DELETE"];
    if (!mutatingMethods.includes(method)) {
      return next.handle();
    }

    const path = request.originalUrl || request.url;
    const user = request.user;
    const activeProfile =
      request.activeProfile || user?.roles?.[0] || "SISTEMA";
    const ipAddress = (
      request.headers["x-forwarded-for"] ||
      request.ip ||
      "127.0.0.1"
    ).toString();
    const userAgent = (
      request.headers["user-agent"] || "Desconhecido"
    ).toString();

    // Sanitizar payload removendo credenciais e dados sensiveis
    const sanitizedBody = this.sanitizePayload(request.body);

    let action: AuditAction = AuditAction.UPDATE;
    if (method === "POST") action = AuditAction.CREATE;
    if (method === "DELETE") action = AuditAction.DELETE;

    const resource = this.extractResourceName(path);
    const resourceId = request.params?.id || null;

    return next.handle().pipe(
      tap({
        next: async (responseBody) => {
          try {
            // Se o endpoint for login, o usuario pode ter sido autenticado durante a requisicao
            const accountId =
              user?.id || responseBody?.data?.account?.id || null;

            await this.prisma.auditLog.create({
              data: {
                accountId,
                activeProfile: String(activeProfile),
                action,
                resource,
                resourceId: resourceId ? String(resourceId) : null,
                newData: sanitizedBody,
                endpoint: path,
                method,
                ipAddress,
                userAgent,
              },
            });
          } catch (err: any) {
            this.logger.error(
              `Falha ao gravar registro de auditoria imutavel para ${method} ${path}: ${err.message}`,
            );
          }
        },
      }),
    );
  }

  private extractResourceName(path: string): string {
    const parts = path.split("/").filter(Boolean);
    // Exemplo: /api/v1/academic/courses -> "academic/courses"
    if (parts.length > 2 && parts[0] === "api") {
      return parts.slice(2).join("/");
    }
    return parts[parts.length - 1] || "geral";
  }

  private sanitizePayload(body: any): any {
    if (!body || typeof body !== "object") return body;

    const sanitized = { ...body };
    const sensitiveFields = [
      "password",
      "senha",
      "passwordHash",
      "token",
      "refreshToken",
      "newPassword",
      "currentPassword",
    ];

    for (const key of Object.keys(sanitized)) {
      if (sensitiveFields.includes(key)) {
        sanitized[key] = "[REDUZIDO_POR_SEGURANCA]";
      } else if (typeof sanitized[key] === "object") {
        sanitized[key] = this.sanitizePayload(sanitized[key]);
      }
    }

    return sanitized;
  }
}
