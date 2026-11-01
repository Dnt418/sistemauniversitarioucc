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
  ApiQuery,
} from '@nestjs/swagger';
import { Request } from 'express';
import { UserRole } from '@prisma/client';
import { Roles } from '@common/decorators/roles.decorator';
import { CurrentUser } from '@common/decorators/current-user.decorator';
import { FinancialService } from './financial.service';
import {
  CreateFeeCatalogDto,
  GenerateMonthlyInvoicesDto,
  GetPresignedUploadUrlDto,
  SubmitPaymentProofDto,
  ValidatePaymentProofDto,
} from './dto/financial.schema';

@ApiTags('Modulo Financeiro e Gestao de Propinas (RF-20 a RF-23)')
@ApiBearerAuth('JWT-Auth')
@Controller('financial')
export class FinancialController {
  constructor(private readonly financialService: FinancialService) {}

  @Post('catalogs')
  @Roles(UserRole.FINANCEIRO, UserRole.SUPER_ADMIN)
  @ApiOperation({
    summary: 'Cadastro de taxa ou propina na tabela de emolumentos (RF-20)',
  })
  @ApiResponse({ status: 201, description: 'Emolumento cadastrado com sucesso' })
  async createFeeCatalog(@Body() dto: CreateFeeCatalogDto) {
    return this.financialService.createFeeCatalog(dto);
  }

  @Get('catalogs')
  @Roles(
    UserRole.FINANCEIRO,
    UserRole.SECRETARIA,
    UserRole.COORDENADOR,
    UserRole.ESTUDANTE,
    UserRole.SUPER_ADMIN,
  )
  @ApiQuery({ name: 'courseId', required: false })
  @ApiQuery({ name: 'academicYearId', required: false })
  @ApiOperation({
    summary: 'Listagem de taxas e emolumentos vigentes (RF-20)',
  })
  @ApiResponse({ status: 200, description: 'Tabela de emolumentos retornada com sucesso' })
  async listFeeCatalogs(
    @Query('courseId') courseId?: string,
    @Query('academicYearId') academicYearId?: string,
  ) {
    return this.financialService.listFeeCatalogs(courseId, academicYearId);
  }

  @Post('invoices/generate-monthly')
  @Roles(UserRole.FINANCEIRO, UserRole.SUPER_ADMIN)
  @ApiOperation({
    summary: 'Geracao automatica em massa de propinas mensais (RF-21)',
    description:
      'Emite faturas com data de vencimento e calculo de juros por mora para todos os estudantes ativos no semestre.',
  })
  @ApiResponse({ status: 201, description: 'Propinas geradas com sucesso' })
  async generateMonthlyInvoices(
    @CurrentUser('id') staffAccountId: string,
    @Body() dto: GenerateMonthlyInvoicesDto,
  ) {
    return this.financialService.generateMonthlyInvoices(staffAccountId, dto);
  }

  @Get('statement')
  @Roles(UserRole.ESTUDANTE)
  @ApiOperation({
    summary: 'Extrato da conta corrente do estudante autenticado (RF-21)',
    description:
      'Retorna faturas liquidadas, pendentes e vencidas com atualizacao automatica de multas por atraso e indicador de regularidade.',
  })
  @ApiResponse({ status: 200, description: 'Extrato financeiro retornado' })
  async getMyStatement(@CurrentUser('id') accountId: string) {
    return this.financialService.getStudentAccountStatement(accountId);
  }

  @Get('statement/:studentId')
  @Roles(UserRole.FINANCEIRO, UserRole.SECRETARIA, UserRole.SUPER_ADMIN)
  @ApiParam({ name: 'studentId', description: 'ID de perfil do estudante' })
  @ApiOperation({
    summary: 'Extrato da conta corrente de qualquer estudante (Consulta Tesouraria)',
  })
  @ApiResponse({ status: 200, description: 'Extrato financeiro retornado' })
  async getStudentStatement(@Param('studentId') studentId: string) {
    return this.financialService.getStudentAccountStatement(studentId);
  }

  @Post('proofs/presigned-upload-url')
  @Roles(UserRole.ESTUDANTE)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Requisicao de URL pre-assinada para upload seguro de bordero (RF-22)',
    description:
      'Gera URL pre-assinada para envio direto do arquivo ao bucket MinIO siga-proofs.',
  })
  @ApiResponse({ status: 200, description: 'URL pre-assinada gerada com sucesso' })
  async getPresignedUploadUrl(
    @CurrentUser('id') accountId: string,
    @Body() dto: GetPresignedUploadUrlDto,
  ) {
    return this.financialService.getPresignedUploadUrl(
      accountId,
      dto.fileName,
      dto.contentType,
    );
  }

  @Post('proofs')
  @Roles(UserRole.ESTUDANTE)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Submissao do comprovativo / bordero de pagamento (RF-22)',
    description:
      'Registra a solicitacao de baixa bancaria e coloca a fatura sob status EM_ANALISE.',
  })
  @ApiResponse({ status: 201, description: 'Comprovativo submetido com sucesso' })
  async submitPaymentProof(
    @CurrentUser('id') accountId: string,
    @Body() dto: SubmitPaymentProofDto,
  ) {
    return this.financialService.submitPaymentProof(accountId, dto);
  }

  @Get('proofs/pending')
  @Roles(UserRole.FINANCEIRO, UserRole.SUPER_ADMIN)
  @ApiOperation({
    summary: 'Painel da Tesouraria de comprovativos pendentes de conferencia (RF-22)',
  })
  @ApiResponse({ status: 200, description: 'Lista de borderos pendentes de validacao' })
  async listPendingPaymentProofs() {
    return this.financialService.listPendingPaymentProofs();
  }

  @Post('proofs/:id/validate')
  @Roles(UserRole.FINANCEIRO, UserRole.SUPER_ADMIN)
  @ApiParam({ name: 'id', description: 'ID do comprovativo de pagamento' })
  @ApiOperation({
    summary: 'Conferencia e aprovacao/rejeicao de bordero pela Tesouraria (RF-22)',
    description:
      'Confirma o recebimento do valor na conta institucional, liquidando a fatura e registrando auditoria imutavel.',
  })
  @ApiResponse({ status: 200, description: 'Bordero validado com sucesso' })
  async validatePaymentProof(
    @Param('id') paymentProofId: string,
    @CurrentUser('id') staffAccountId: string,
    @Body() dto: ValidatePaymentProofDto,
    @Req() req: Request,
  ) {
    const ipAddress = req.ip || req.socket?.remoteAddress;
    const userAgent = req.headers['user-agent'];

    return this.financialService.validatePaymentProof(
      staffAccountId,
      paymentProofId,
      dto,
      ipAddress,
      userAgent,
    );
  }

  @Get('proofs/:id/download-url')
  @Roles(UserRole.ESTUDANTE, UserRole.FINANCEIRO, UserRole.SUPER_ADMIN)
  @ApiParam({ name: 'id', description: 'ID do comprovativo de pagamento' })
  @ApiOperation({
    summary: 'Obtem URL segura para visualizacao/download do bordero (RF-22)',
  })
  @ApiResponse({ status: 200, description: 'URL pre-assinada de download' })
  async getReceiptDownloadUrl(
    @Param('id') paymentProofId: string,
    @CurrentUser('id') accountId: string,
    @CurrentUser('roles') roles: UserRole[],
  ) {
    return this.financialService.getReceiptDownloadUrl(
      paymentProofId,
      accountId,
      roles,
    );
  }

  @Get('compliance/:studentId')
  @Roles(
    UserRole.FINANCEIRO,
    UserRole.SECRETARIA,
    UserRole.COORDENADOR,
    UserRole.SUPER_ADMIN,
  )
  @ApiParam({ name: 'studentId', description: 'ID de perfil do estudante' })
  @ApiOperation({
    summary: 'Verificacao da trava financeira academica (RF-23)',
    description:
      'Valida se o estudante possui inadimplencias ou dividas ativas que bloqueiem matriculas ou emissao de documentos.',
  })
  @ApiResponse({ status: 200, description: 'Diagnostico de regularidade financeira' })
  async checkFinancialCompliance(@Param('studentId') studentId: string) {
    return this.financialService.checkFinancialCompliance(studentId);
  }
}

