import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { Public } from '@common/decorators/public.decorator';

@ApiTags('Saude e Estado do Sistema')
@Controller('health')
export class HealthController {
  @Public()
  @Get()
  @ApiOperation({ summary: 'Verifica a saude operacional da API Gateway' })
  @ApiResponse({ status: 200, description: 'Servico operacional' })
  check() {
    return {
      status: 'operacional',
      servico: 'siga-backend',
      versao: '0.1.0',
      tempoAtivoSegundos: process.uptime(),
      dataHora: new Date().toISOString(),
    };
  }
}

