import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
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
import { Public } from '@common/decorators/public.decorator';
import { RegistryService } from './registry.service';
import {
  UploadPersonalDocumentDto,
  ValidatePersonalDocumentDto,
  RegisterCareerEventDto,
  RequestDocumentEmissionDto,
} from './dto/registry.schema';

@ApiTags('Secretaria Academica, Prontuario Geral e Documentos (RF-24, RF-25)')
@ApiBearerAuth('JWT-Auth')
@Controller('registry')
export class RegistryController {
  constructor(private readonly registryService: RegistryService) {}

  @Post('documents/personal')
  @Roles(UserRole.ESTUDANTE, UserRole.SECRETARIA, UserRole.SUPER_ADMIN)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Envio de documento pessoal para o prontuario geral (RF-24)',
    description: 'Submete comprovativo de BI, Certificado de Habilitacoes, Fotografia ou Atestado.',
  })
  @ApiResponse({ status: 201, description: 'Documento submetido com sucesso' })
  async uploadPersonalDocument(
    @CurrentUser('id') accountId: string,
    @Body() dto: UploadPersonalDocumentDto,
  ) {
    return this.registryService.uploadPersonalDocument(accountId, dto);
  }

  @Get('documents/personal')
  @Roles(UserRole.ESTUDANTE)
  @ApiOperation({
    summary: 'Consulta do prontuario geral do estudante autenticado (RF-24)',
  })
  @ApiResponse({ status: 200, description: 'Prontuario retornado com sucesso' })
  async getMyPersonalDocuments(@CurrentUser('id') accountId: string) {
    return this.registryService.listStudentPersonalDocuments(accountId);
  }

  @Get('documents/personal/:studentId')
  @Roles(UserRole.SECRETARIA, UserRole.COORDENADOR, UserRole.SUPER_ADMIN)
  @ApiParam({ name: 'studentId', description: 'ID de perfil do estudante' })
  @ApiOperation({
    summary: 'Consulta do prontuario e eventos de carreira de qualquer estudante (Secretaria)',
  })
  @ApiResponse({ status: 200, description: 'Prontuario completo retornado' })
  async getStudentPersonalDocuments(@Param('studentId') studentId: string) {
    return this.registryService.listStudentPersonalDocuments(studentId);
  }

  @Post('documents/personal/:id/validate')
  @Roles(UserRole.SECRETARIA, UserRole.SUPER_ADMIN)
  @ApiParam({ name: 'id', description: 'ID do documento pessoal' })
  @ApiOperation({
    summary: 'Validacao ou rejeicao de documento do prontuario pela Secretaria (RF-24)',
  })
  @ApiResponse({ status: 200, description: 'Documento validado com sucesso' })
  async validatePersonalDocument(
    @Param('id') documentId: string,
    @CurrentUser('id') staffAccountId: string,
    @Body() dto: ValidatePersonalDocumentDto,
    @Req() req: Request,
  ) {
    const ipAddress = req.ip || req.socket?.remoteAddress;
    const userAgent = req.headers['user-agent'];

    return this.registryService.validatePersonalDocument(
      staffAccountId,
      documentId,
      dto,
      ipAddress,
      userAgent,
    );
  }

  @Post('career-events')
  @Roles(UserRole.SECRETARIA, UserRole.SUPER_ADMIN)
  @ApiOperation({
    summary: 'Registro de evento de carreira academica (RF-24)',
    description:
      'Registra trancamento total/parcial, anulacao, transferencia ou desistencia com numero de despacho institucional.',
  })
  @ApiResponse({ status: 201, description: 'Evento de carreira registrado com sucesso' })
  async registerCareerEvent(
    @CurrentUser('id') staffAccountId: string,
    @Body() dto: RegisterCareerEventDto,
    @Req() req: Request,
  ) {
    const ipAddress = req.ip || req.socket?.remoteAddress;
    const userAgent = req.headers['user-agent'];

    return this.registryService.registerCareerEvent(
      staffAccountId,
      dto,
      ipAddress,
      userAgent,
    );
  }

  @Post('issue')
  @Roles(UserRole.ESTUDANTE, UserRole.SECRETARIA, UserRole.SUPER_ADMIN)
  @ApiOperation({
    summary: 'Emissao automatizada de certidoes e declaracoes academicas (RF-25)',
    description:
      'Gera declaracao de matricula, certidao de notas ou guia de transferencia com hash SHA-256 e agenda geracao do PDF.',
  })
  @ApiResponse({ status: 201, description: 'Documento emitido com sucesso' })
  async issueAcademicDocument(
    @CurrentUser('id') accountId: string,
    @CurrentUser('roles') roles: UserRole[],
    @Body() dto: RequestDocumentEmissionDto,
    @Query('studentId') studentId?: string,
  ) {
    return this.registryService.issueAcademicDocument(
      accountId,
      roles,
      dto,
      studentId,
    );
  }

  @Public()
  @Get('verify/:hash')
  @ApiParam({ name: 'hash', description: 'Codigo hash SHA-256 do documento' })
  @ApiOperation({
    summary: 'Validacao publica instantanea de autenticidade documental (RF-25)',
    description:
      'Acesso publico sem credenciais para conferencia de veracidade por orgaos externos, consulados e empregadores.',
  })
  @ApiResponse({ status: 200, description: 'Diagnostico de autenticidade documental' })
  async verifyPublicDocument(@Param('hash') hash: string) {
    return this.registryService.verifyPublicDocument(hash);
  }

  @Get('documents/:id/download-url')
  @Roles(UserRole.ESTUDANTE, UserRole.SECRETARIA, UserRole.SUPER_ADMIN)
  @ApiParam({ name: 'id', description: 'ID do documento emitido' })
  @ApiOperation({
    summary: 'Obtem URL pre-assinada para download do documento oficial em PDF (RF-25)',
  })
  @ApiResponse({ status: 200, description: 'URL pre-assinada para download' })
  async getDocumentDownloadUrl(
    @Param('id') documentId: string,
    @CurrentUser('id') accountId: string,
    @CurrentUser('roles') roles: UserRole[],
  ) {
    return this.registryService.getDocumentDownloadUrl(
      documentId,
      accountId,
      roles,
    );
  }
}

