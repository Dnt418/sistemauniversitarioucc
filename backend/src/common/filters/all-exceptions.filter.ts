import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { ZodValidationException } from 'nestjs-zod';
import { ZodError } from 'zod';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message: string | object = 'Erro interno do servidor';
    let error = 'Internal Server Error';
    let details: unknown = null;

    // 1. Tratamento de exceções Zod (validação de schemas e contratos)
    if (exception instanceof ZodValidationException) {
      status = HttpStatus.BAD_REQUEST;
      error = 'Bad Request';
      const zodError = exception.getZodError();
      message = 'Falha na validação dos dados de entrada';
      details = (zodError as ZodError).errors.map((err) => ({
        field: err.path.join('.'),
        message: err.message,
        code: err.code,
      }));
    } else if (exception instanceof ZodError) {
      status = HttpStatus.BAD_REQUEST;
      error = 'Bad Request';
      message = 'Falha na validação dos dados de entrada';
      details = exception.errors.map((err) => ({
        field: err.path.join('.'),
        message: err.message,
        code: err.code,
      }));
    }
    // 2. Tratamento de HttpExceptions padrão do NestJS
    else if (exception instanceof HttpException) {
      status = exception.getStatus();
      const exceptionResponse = exception.getResponse();

      if (typeof exceptionResponse === 'string') {
        message = exceptionResponse;
      } else if (typeof exceptionResponse === 'object' && exceptionResponse !== null) {
        const resObj = exceptionResponse as Record<string, unknown>;
        message = (resObj.message as string) || exception.message;
        error = (resObj.error as string) || error;
        if (resObj.details) details = resObj.details;
      }
    }
    // 3. Exceções não tratadas / Erros inesperados
    else if (exception instanceof Error) {
      this.logger.error(
        `[${request.method}] ${request.url} - Erro inesperado: ${exception.message}`,
        exception.stack,
      );
      message = exception.message;
    }

    const errorPayload = {
      success: false,
      statusCode: status,
      error,
      message,
      ...(details ? { details } : {}),
      path: request.url,
      timestamp: new Date().toISOString(),
    };

    response.status(status).json(errorPayload);
  }
}

