import {
  Controller,
  Post,
  Get,
  Body,
  Req,
  Res,
  HttpCode,
  HttpStatus,
  UseGuards,
} from "@nestjs/common";
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiHeader,
} from "@nestjs/swagger";
import { Request, Response } from "express";
import { UserRole } from "@prisma/client";

import { AuthService } from "./auth.service";
import {
  LoginDto,
  SwitchProfileDto,
  ForgotPasswordDto,
  ResetPasswordDto,
} from "./dto/auth.schema";
import { Public } from "@common/decorators/public.decorator";
import { CurrentUser } from "@common/decorators/current-user.decorator";
import { ActiveProfile } from "@common/decorators/active-profile.decorator";
import { JwtAuthGuard } from "@common/guards/jwt-auth.guard";
import { ActiveProfileGuard } from "@common/guards/active-profile.guard";

@ApiTags("Autenticacao e Identidade")
@Controller("auth")
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post("login")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "Autenticacao centralizada multi-identificador (RF-01)",
    description:
      "Permite autenticacao informando Email, Numero de Matricula ou Bilhete de Identidade (BI). Emite Access Token JWT e Refresh Token em cookie HttpOnly.",
  })
  @ApiResponse({ status: 200, description: "Autenticado com sucesso" })
  @ApiResponse({
    status: 401,
    description: "Credenciais invalidas ou conta inativa",
  })
  async login(
    @Body() dto: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const ipAddress = (
      req.headers["x-forwarded-for"] ||
      req.ip ||
      "127.0.0.1"
    ).toString();
    const userAgent = (req.headers["user-agent"] || "Desconhecido").toString();
    return this.authService.login(dto, res, ipAddress, userAgent);
  }

  @Public()
  @Post("refresh")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "Renovacao rotativa de sessao (RF-01)",
    description:
      "Rotaciona o token de sessao persistido no cookie HttpOnly e emite um novo Access Token.",
  })
  @ApiResponse({ status: 200, description: "Sessao renovada com sucesso" })
  @ApiResponse({
    status: 401,
    description: "Refresh token invalido ou expirado",
  })
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const rawRefreshToken = req.cookies?.refreshToken;
    const ipAddress = (
      req.headers["x-forwarded-for"] ||
      req.ip ||
      "127.0.0.1"
    ).toString();
    const userAgent = (req.headers["user-agent"] || "Desconhecido").toString();
    return this.authService.refreshTokens(
      rawRefreshToken,
      res,
      ipAddress,
      userAgent,
    );
  }

  @UseGuards(JwtAuthGuard, ActiveProfileGuard)
  @Post("switch-profile")
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth("JWT-Auth")
  @ApiOperation({
    summary: "Troca dinamica de contexto de perfil (RF-02)",
    description:
      "Permite a um utilizador com multiplos papeis alternar o perfil ativo sem precisar autenticar novamente.",
  })
  @ApiResponse({
    status: 200,
    description: "Perfil ativo alterado com sucesso",
  })
  @ApiResponse({
    status: 403,
    description: "Papel solicitado nao vinculado a esta conta",
  })
  async switchProfile(
    @CurrentUser("id") accountId: string,
    @Body() dto: SwitchProfileDto,
  ) {
    return this.authService.switchProfile(accountId, dto);
  }

  @Public()
  @Post("logout")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "Encerramento de sessao (RF-01)",
    description:
      "Invalida o cookie de sessao e revoga o Refresh Token na base de dados.",
  })
  @ApiResponse({ status: 200, description: "Sessao encerrada com sucesso" })
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const rawRefreshToken = req.cookies?.refreshToken;
    return this.authService.logout(rawRefreshToken, res);
  }

  @UseGuards(JwtAuthGuard, ActiveProfileGuard)
  @Get("me")
  @ApiBearerAuth("JWT-Auth")
  @ApiHeader({
    name: "X-Active-Profile",
    required: false,
    description: "Contexto de atuacao selecionado (ex.: DOCENTE, ESTUDANTE)",
  })
  @ApiOperation({
    summary: "Obtem os dados da conta autenticada e o perfil ativo corrente",
  })
  @ApiResponse({ status: 200, description: "Dados do utilizador autenticado" })
  @ApiResponse({ status: 401, description: "Nao autorizado" })
  async getMe(
    @CurrentUser("id") accountId: string,
    @ActiveProfile() activeProfile: UserRole,
  ) {
    return this.authService.getMe(accountId, activeProfile);
  }

  @Public()
  @Post("forgot-password")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "Solicitacao de recuperacao de senha (RF-03)",
    description:
      "Gera token de uso unico com validade de 30 minutos para redefinicao de senha.",
  })
  @ApiResponse({
    status: 200,
    description: "Instrucoes enviadas caso o email exista",
  })
  async forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.authService.forgotPassword(dto);
  }

  @Public()
  @Post("reset-password")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "Redefinicao definitiva de senha com token (RF-03)",
    description:
      "Aplica a nova senha e revoga todas as sessoes ativas da conta.",
  })
  @ApiResponse({ status: 200, description: "Senha alterada com sucesso" })
  @ApiResponse({ status: 400, description: "Token invalido ou expirado" })
  async resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(dto);
  }
}
