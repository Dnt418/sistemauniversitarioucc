import {
  Controller,
  Get,
  Query,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiQuery,
} from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { Roles } from '@common/decorators/roles.decorator';
import { CurrentUser } from '@common/decorators/current-user.decorator';
import { StudentService } from './student.service';

@ApiTags('Portal do Estudante (RF-16 a RF-19)')
@ApiBearerAuth('JWT-Auth')
@Controller('student')
export class StudentController {
  constructor(private readonly studentService: StudentService) {}

  @Get('dashboard')
  @Roles(UserRole.ESTUDANTE)
  @ApiOperation({
    summary: 'Dashboard academico do estudante (RF-16)',
    description:
      'Retorna as turmas inscritas no semestre vigente com horarios, salas, docentes atribuidos e percentual de assiduidade em tempo real.',
  })
  @ApiResponse({ status: 200, description: 'Dashboard academico retornado com sucesso' })
  async getDashboard(@CurrentUser('id') accountId: string) {
    return this.studentService.getDashboard(accountId);
  }

  @Get('grades')
  @Roles(UserRole.ESTUDANTE)
  @ApiQuery({
    name: 'semesterId',
    required: false,
    description: 'Filtrar por ID do semestre letivo (omita para visualizar todas as inscricoes)',
  })
  @ApiOperation({
    summary: 'Consulta de notas continuas e pautas homologadas (RF-17)',
    description:
      'Exibe todas as notas parcelares (frequencias, trabalhos laboratoriais), exames e status de homologacao da pauta pelo docente.',
  })
  @ApiResponse({ status: 200, description: 'Relacao de notas retornada com sucesso' })
  async getGrades(
    @CurrentUser('id') accountId: string,
    @Query('semesterId') semesterId?: string,
  ) {
    return this.studentService.getStudentGrades(accountId, semesterId);
  }

  @Get('curriculum-progress')
  @Roles(UserRole.ESTUDANTE)
  @ApiOperation({
    summary: 'Historico curricular e Coeficiente de Rendimento (RF-18)',
    description:
      'Mapa visual da grelha do curso indicando cadeiras concluidas, em curso e pendentes, acompanhado do Coeficiente de Rendimento (media ponderada acumulada).',
  })
  @ApiResponse({ status: 200, description: 'Progresso curricular calculado com sucesso' })
  async getCurriculumProgress(@CurrentUser('id') accountId: string) {
    return this.studentService.getCurriculumProgress(accountId);
  }

  @Get('documents')
  @Roles(UserRole.ESTUDANTE)
  @ApiOperation({
    summary: 'Repositorio de documentos e certidoes emitidas (RF-19)',
    description:
      'Listagem de comprovativos de matricula e certidoes disponiveis para download com os respectivos codigos de verificacao SHA-256.',
  })
  @ApiResponse({ status: 200, description: 'Lista de documentos disponiveis para download' })
  async getDocuments(@CurrentUser('id') accountId: string) {
    return this.studentService.getStudentDocuments(accountId);
  }
}

