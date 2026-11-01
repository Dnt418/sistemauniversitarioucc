import {
  Controller,
  Get,
  Post,
  Put,
  Param,
  Body,
  Req,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
} from '@nestjs/swagger';
import { Request } from 'express';
import { UserRole } from '@prisma/client';
import { Roles } from '@common/decorators/roles.decorator';
import { CurrentUser } from '@common/decorators/current-user.decorator';
import { GradingService } from './grading.service';
import {
  RecordAttendanceDto,
  UpdateGradesDto,
  SubmitPautaDto,
  RectifyPautaDto,
} from './dto/grading.schema';

@ApiTags('Gestao Docente, Faltas e Pautas (RF-12 a RF-15, RF-26)')
@ApiBearerAuth('JWT-Auth')
@Controller('grading')
export class GradingController {
  constructor(private readonly gradingService: GradingService) {}

  @Get('turmas')
  @Roles(
    UserRole.DOCENTE,
    UserRole.COORDENADOR,
    UserRole.SECRETARIA,
    UserRole.SUPER_ADMIN,
  )
  @ApiOperation({
    summary: 'Painel de turmas ativas do docente (RF-12)',
    description:
      'Retorna todas as turmas lecionadas pelo docente autenticado ou visao institucional para administradores e coordenadores.',
  })
  @ApiResponse({ status: 200, description: 'Listagem de turmas retornada com sucesso' })
  async getDocenteTurmas(
    @CurrentUser('id') accountId: string,
    @CurrentUser('roles') roles: UserRole[],
  ) {
    return this.gradingService.getDocenteTurmas(accountId, roles);
  }

  @Get('turmas/:id/roster')
  @Roles(
    UserRole.DOCENTE,
    UserRole.COORDENADOR,
    UserRole.SECRETARIA,
    UserRole.SUPER_ADMIN,
  )
  @ApiParam({ name: 'id', description: 'ID da turma' })
  @ApiOperation({
    summary: 'Pauta nominal de chamada e notas correntes da turma (RF-12, RF-13)',
    description:
      'Exibe a relacao nominal dos estudantes, calculo percentual acumulado de faltas (com aviso se exceder 25%) e notas parciais registradas.',
  })
  @ApiResponse({ status: 200, description: 'Pauta nominal retornada com sucesso' })
  async getTurmaRoster(
    @Param('id') turmaId: string,
    @CurrentUser('id') accountId: string,
    @CurrentUser('roles') roles: UserRole[],
  ) {
    return this.gradingService.getTurmaRoster(turmaId, accountId, roles);
  }

  @Post('turmas/:id/attendance')
  @Roles(UserRole.DOCENTE, UserRole.COORDENADOR, UserRole.SUPER_ADMIN)
  @HttpCode(HttpStatus.CREATED)
  @ApiParam({ name: 'id', description: 'ID da turma' })
  @ApiOperation({
    summary: 'Registro do diario de classe e controle de assiduidade (RF-13)',
    description:
      'Salva a aula ministrada (data, sumario, horas) e a folha de presencas e ausencias justificadas/injustificadas de cada estudante.',
  })
  @ApiResponse({ status: 201, description: 'Presencas registradas com sucesso' })
  async recordAttendance(
    @Param('id') turmaId: string,
    @CurrentUser('id') accountId: string,
    @CurrentUser('roles') roles: UserRole[],
    @Body() dto: RecordAttendanceDto,
  ) {
    return this.gradingService.recordAttendance(turmaId, accountId, roles, dto);
  }

  @Get('turmas/:id/attendance')
  @Roles(
    UserRole.DOCENTE,
    UserRole.COORDENADOR,
    UserRole.SECRETARIA,
    UserRole.SUPER_ADMIN,
  )
  @ApiParam({ name: 'id', description: 'ID da turma' })
  @ApiOperation({
    summary: 'Historico de aulas ministradas e presencas da turma (RF-13)',
  })
  @ApiResponse({ status: 200, description: 'Historico de assiduidade retornado' })
  async getTurmaAttendanceHistory(
    @Param('id') turmaId: string,
    @CurrentUser('id') accountId: string,
    @CurrentUser('roles') roles: UserRole[],
  ) {
    return this.gradingService.getTurmaAttendanceHistory(
      turmaId,
      accountId,
      roles,
    );
  }

  @Put('turmas/:id/grades')
  @Roles(UserRole.DOCENTE, UserRole.COORDENADOR, UserRole.SUPER_ADMIN)
  @ApiParam({ name: 'id', description: 'ID da turma' })
  @ApiOperation({
    summary: 'Lancamento e calculo de notas e avaliacoes (RF-14, RF-15)',
    description:
      'Calcula automaticamente notas de frequencia, exame normal, recurso, melhoria, e estados regulamentares (Aprovado, Admitido ao Recurso, Reprovado por Nota, Reprovado por Falta). Bloqueia edicao caso fora do prazo ou se pauta congelada.',
  })
  @ApiResponse({ status: 200, description: 'Classificacoes atualizadas com sucesso' })
  async updateGrades(
    @Param('id') turmaId: string,
    @CurrentUser('id') accountId: string,
    @CurrentUser('roles') roles: UserRole[],
    @Body() dto: UpdateGradesDto,
  ) {
    return this.gradingService.updateGrades(turmaId, accountId, roles, dto);
  }

  @Post('turmas/:id/pauta/submit')
  @Roles(UserRole.DOCENTE, UserRole.COORDENADOR, UserRole.SUPER_ADMIN)
  @ApiParam({ name: 'id', description: 'ID da turma' })
  @ApiOperation({
    summary: 'Submissao e congelamento definitivo da pauta (RF-15)',
    description:
      'Gera a assinatura digital SHA-256 e congela a pauta para impedir ulteriores modificacoes pelo docente regente.',
  })
  @ApiResponse({ status: 200, description: 'Pauta homologada e congelada com sucesso' })
  async submitAndFreezePauta(
    @Param('id') turmaId: string,
    @CurrentUser('id') accountId: string,
    @CurrentUser('roles') roles: UserRole[],
    @Body() dto: SubmitPautaDto,
  ) {
    return this.gradingService.submitAndFreezePauta(
      turmaId,
      accountId,
      roles,
      dto,
    );
  }

  @Post('pautas/:id/rectify')
  @Roles(UserRole.SECRETARIA, UserRole.COORDENADOR, UserRole.SUPER_ADMIN)
  @ApiParam({ name: 'id', description: 'ID da pauta' })
  @ApiOperation({
    summary: 'Retificacao formal de pauta congelada via Secretaria (RF-26)',
    description:
      'Aplica retificacoes aprovadas pelo Conselho Pedagogico mediante protocolo de despacho e justificativa, gravando historico imutavel de auditoria.',
  })
  @ApiResponse({ status: 200, description: 'Pauta retificada com sucesso e registrada na auditoria' })
  async rectifyPauta(
    @Param('id') pautaId: string,
    @CurrentUser('id') staffAccountId: string,
    @Body() dto: RectifyPautaDto,
    @Req() req: Request,
  ) {
    const ipAddress = req.ip || req.socket?.remoteAddress;
    const userAgent = req.headers['user-agent'];

    return this.gradingService.rectifyPautaBySecretaria(
      pautaId,
      staffAccountId,
      dto,
      ipAddress,
      userAgent,
    );
  }
}

