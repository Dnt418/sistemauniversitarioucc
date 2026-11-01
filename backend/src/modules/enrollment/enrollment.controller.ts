import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiQuery,
} from '@nestjs/swagger';
import { UserRole } from '@prisma/client';

import { EnrollmentService } from './enrollment.service';
import { EnrollStudentDto, CancelEnrollmentDto } from './dto/enrollment.schema';
import { Roles } from '@common/decorators/roles.decorator';
import { CurrentUser } from '@common/decorators/current-user.decorator';
import { Public } from '@common/decorators/public.decorator';

@ApiTags('Inscricao e Matricula Online (Motor de Concorrencia)')
@ApiBearerAuth('JWT-Auth')
@Controller('enrollment')
export class EnrollmentController {
  constructor(private readonly enrollmentService: EnrollmentService) {}

  @Get('eligible')
  @Roles(UserRole.ESTUDANTE)
  @ApiOperation({
    summary: 'Painel de selecao de turmas e disciplinas elegiveis (RF-09)',
    description: 'Calcula em tempo real as cadeiras disponiveis para inscricao de acordo com o plano de estudos, precedencias e vagas no Redis.',
  })
  @ApiResponse({ status: 200, description: 'Listagem de disciplinas e turmas com contadores de vagas em tempo real' })
  async getEligible(@CurrentUser('id') accountId: string) {
    return this.enrollmentService.getEligibleDisciplines(accountId);
  }

  @Post('confirm')
  @Roles(UserRole.ESTUDANTE, UserRole.SECRETARIA, UserRole.SUPER_ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Motor de reserva atomica de vagas e confirmacao de matricula (RF-10)',
    description: 'Reserva vagas em milissegundos via scripts Lua no Redis prevenindo overbooking, valida choques de horario e emite comprovativo com hash SHA-256.',
  })
  @ApiResponse({ status: 200, description: 'Matricula confirmada com sucesso' })
  @ApiResponse({ status: 400, description: 'Choque de horarios ou limite de creditos excedido' })
  @ApiResponse({ status: 409, description: 'Vagas esgotadas na turma solicitada' })
  async confirmEnrollment(
    @CurrentUser('id') accountId: string,
    @Body() dto: EnrollStudentDto,
  ) {
    return this.enrollmentService.enrollStudent(accountId, dto);
  }

  @Get('my-enrollments')
  @Roles(UserRole.ESTUDANTE)
  @ApiQuery({ name: 'semesterId', required: false })
  @ApiOperation({
    summary: 'Consulta o historico de matriculas e comprovativos do estudante (RF-11)',
  })
  async getMyEnrollments(
    @CurrentUser('id') accountId: string,
    @Query('semesterId') semesterId?: string,
  ) {
    return this.enrollmentService.getStudentEnrollments(accountId, semesterId);
  }

  @Post('cancel')
  @Roles(UserRole.ESTUDANTE, UserRole.SECRETARIA)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Cancelamento formal de matricula com liberacao atomica de vaga',
  })
  @ApiResponse({ status: 200, description: 'Inscricao cancelada com sucesso' })
  async cancelEnrollment(
    @CurrentUser('id') accountId: string,
    @Body() dto: CancelEnrollmentDto,
  ) {
    return this.enrollmentService.cancelEnrollment(accountId, dto);
  }

  @Public()
  @Get('verify/:hash')
  @ApiOperation({
    summary: 'Validacao publica de autenticidade documental via QR Code (RF-11)',
    description: 'Permite a qualquer pessoa ou entidade verificar se um comprovativo emitido e autentico e reconhecido pela instituicao.',
  })
  @ApiResponse({ status: 200, description: 'Documento autentico e valido' })
  @ApiResponse({ status: 404, description: 'Documento inexistente ou nao reconhecido' })
  async verifyAuthenticity(@Param('hash') hash: string) {
    return this.enrollmentService.verifyEnrollmentAuthenticity(hash);
  }
}

