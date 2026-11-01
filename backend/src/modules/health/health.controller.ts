import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';

@ApiTags('Health & Status')
@Controller('health')
export class HealthController {
  @Get()
  @ApiOperation({ summary: 'Verifica a saúde operacional da API Gateway' })
  @ApiResponse({ status: 200, description: 'Serviço operacional' })
  check() {
    return {
      status: 'ok',
      service: 'siga-backend',
      version: '0.1.0',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    };
  }
}

