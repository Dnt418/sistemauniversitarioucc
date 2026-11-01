import { NestFactory } from "@nestjs/core";
import { Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { SwaggerModule, DocumentBuilder } from "@nestjs/swagger";
import { patchNestJsSwagger, ZodValidationPipe } from "nestjs-zod";
import cookieParser from "cookie-parser";

import { AppModule } from "./app.module";
import { AllExceptionsFilter } from "./common/filters/all-exceptions.filter";
import { ResponseTransformInterceptor } from "./common/interceptors/response-transform.interceptor";
import { EnvConfig } from "./config/env.schema";

async function bootstrap() {
  const logger = new Logger("SIGA-Bootstrap");

  // Habilita integração profunda do Zod com OpenAPI/Swagger
  patchNestJsSwagger();

  const app = await NestFactory.create(AppModule);
  const configService = app.get<ConfigService<EnvConfig, true>>(ConfigService);

  const port = configService.get("PORT", { infer: true });
  const apiPrefix = configService.get("API_PREFIX", { infer: true });
  const corsOrigin = configService.get("CORS_ORIGIN", { infer: true });

  // Cookies seguros (obrigatório para Refresh Tokens e sessão)
  app.use(cookieParser());

  // Habilitar CORS para os portais frontend (Admin, Docente, Estudante)
  const allowedOrigins = corsOrigin.split(",").map((o) => o.trim());
  app.enableCors({
    origin: allowedOrigins,
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Active-Profile"],
  });

  // Prefixo Global da API (ex.: /api/v1)
  app.setGlobalPrefix(apiPrefix);

  // Pipeline Global Funcional com Zod (eliminação total do class-validator)
  app.useGlobalPipes(new ZodValidationPipe());

  // Filtro Global de Exceções unificado
  app.useGlobalFilters(new AllExceptionsFilter());

  // Interceptor Global de Resposta padronizada
  app.useGlobalInterceptors(new ResponseTransformInterceptor());

  // Configuração da Documentação Interativa OpenAPI / Swagger
  const swaggerConfig = new DocumentBuilder()
    .setTitle("SIGA Universitário - API Gateway")
    .setDescription(
      "Documentação oficial da API do Sistema Integrado de Gestão Acadêmica (SIGA). " +
        "Arquitetura baseada em monólito modular, Zod Pipes e isolamento estrito de perfis.",
    )
    .setVersion("0.1.0")
    .addBearerAuth(
      {
        type: "http",
        scheme: "bearer",
        bearerFormat: "JWT",
        name: "Authorization",
        description: "Insira o Access Token JWT (validade de 15 minutos)",
        in: "header",
      },
      "JWT-Auth",
    )
    .addApiKey(
      {
        type: "apiKey",
        name: "X-Active-Profile",
        in: "header",
        description:
          "Papel ativo selecionado (ex: DOCENTE, ESTUDANTE, SECRETARIA)",
      },
      "Active-Profile",
    )
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup(`${apiPrefix}/docs`, app, document, {
    customSiteTitle: "SIGA Universitário - Swagger Docs",
    swaggerOptions: {
      persistAuthorization: true,
    },
  });

  await app.listen(port);
  logger.log(
    `SIGA Backend em execucao em: http://localhost:${port}/${apiPrefix}`,
  );
  logger.log(
    `Documentacao Swagger disponivel em: http://localhost:${port}/${apiPrefix}/docs`,
  );
}

bootstrap();
