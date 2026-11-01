import {
  Injectable,
  UnauthorizedException,
  ForbiddenException,
  NotFoundException,
  BadRequestException,
  Logger,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { ConfigService } from "@nestjs/config";

import * as crypto from "crypto";
import * as bcrypt from "bcrypt";
import { Response } from "express";

import {
  LoginInput,
  SwitchProfileInput,
  ForgotPasswordInput,
  ResetPasswordInput,
} from "./dto/auth.schema";
import { AccountStatus, UserRole } from "@prisma/client";
import { PrismaService } from "@infra/database/prisma.service";
import { MailerService } from "@infra/mailer/mailer.service";

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly mailerService: MailerService,
  ) {}

  /**
   * RF-01: Autenticacao centralizada multi-identificador
   * Permite login via Email, Numero de Matricula ou Bilhete de Identidade (BI).
   */
  async login(
    input: LoginInput,
    res: Response,
    ipAddress?: string,
    userAgent?: string,
  ) {
    const identifier = input.identifier.trim();

    // Busca conta associada por Email, Matricula de Estudante, BI ou Registro de Funcionario/Docente
    const account = await this.findAccountByIdentifier(identifier);

    if (!account) {
      throw new UnauthorizedException(
        "Credenciais de acesso incorretas ou conta inexistente",
      );
    }

    if (account.status !== AccountStatus.ACTIVE) {
      throw new UnauthorizedException(
        "Esta conta de acesso encontra-se inativa ou suspensa",
      );
    }

    const isPasswordValid = await bcrypt.compare(
      input.password,
      account.passwordHash,
    );
    if (!isPasswordValid) {
      throw new UnauthorizedException(
        "Credenciais de acesso incorretas ou conta inexistente",
      );
    }

    // Atualiza data do ultimo acesso
    await this.prisma.account.update({
      where: { id: account.id },
      data: { lastLoginAt: new Date() },
    });

    const activeProfile = account.roles[0] || UserRole.ESTUDANTE;

    // Emissao de tokens (JWT 15m + Refresh rotativo 7d em Cookie HttpOnly)
    const accessToken = this.generateAccessToken(
      account.id,
      account.email,
      account.roles,
      activeProfile,
    );
    const rawRefreshToken = await this.createAndPersistRefreshToken(
      account.id,
      ipAddress,
      userAgent,
    );

    this.setRefreshTokenCookie(res, rawRefreshToken);

    return {
      accessToken,
      expiresIn: "15m",
      activeProfile,
      account: {
        id: account.id,
        email: account.email,
        roles: account.roles,
        status: account.status,
        profiles: {
          student: account.studentProfile
            ? {
                id: account.studentProfile.id,
                studentNumber: account.studentProfile.studentNumber,
                fullName: account.studentProfile.fullName,
                academicStatus: account.studentProfile.academicStatus,
                currentYear: account.studentProfile.currentYear,
              }
            : null,
          docente: account.docenteProfile
            ? {
                id: account.docenteProfile.id,
                mechanographicNumber:
                  account.docenteProfile.mechanographicNumber,
                fullName: account.docenteProfile.fullName,
                category: account.docenteProfile.category,
              }
            : null,
          staff: account.staffProfile
            ? {
                id: account.staffProfile.id,
                employeeNumber: account.staffProfile.employeeNumber,
                fullName: account.staffProfile.fullName,
                department: account.staffProfile.department,
                jobTitle: account.staffProfile.jobTitle,
              }
            : null,
          coordinator: account.coordinatorProfile
            ? {
                id: account.coordinatorProfile.id,
              }
            : null,
        },
      },
    };
  }

  /**
   * RF-01: Renovacao rotativa de sessao atraves de cookie HttpOnly
   */
  async refreshTokens(
    rawRefreshToken: string,
    res: Response,
    ipAddress?: string,
    userAgent?: string,
  ) {
    if (!rawRefreshToken) {
      throw new UnauthorizedException("Sessao inexistente ou expirada");
    }

    const tokenHash = this.hashToken(rawRefreshToken);

    const tokenRecord = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
      include: { account: true },
    });

    if (
      !tokenRecord ||
      tokenRecord.isRevoked ||
      tokenRecord.expiresAt < new Date()
    ) {
      // Se um token revogado for reutilizado, revoga todos os tokens desta conta por precaucao contra roubo
      if (tokenRecord && tokenRecord.isRevoked) {
        await this.prisma.refreshToken.updateMany({
          where: { accountId: tokenRecord.accountId },
          data: { isRevoked: true },
        });
      }
      throw new UnauthorizedException("Sessao expirada ou invalida");
    }

    if (tokenRecord.account.status !== AccountStatus.ACTIVE) {
      throw new UnauthorizedException(
        "Esta conta de acesso encontra-se inativa ou suspensa",
      );
    }

    // Rotacao: revoga o token antigo e gera um novo
    await this.prisma.refreshToken.update({
      where: { id: tokenRecord.id },
      data: { isRevoked: true },
    });

    const activeProfile = tokenRecord.account.roles[0];
    const newAccessToken = this.generateAccessToken(
      tokenRecord.account.id,
      tokenRecord.account.email,
      tokenRecord.account.roles,
      activeProfile,
    );
    const newRawRefreshToken = await this.createAndPersistRefreshToken(
      tokenRecord.account.id,
      ipAddress,
      userAgent,
    );

    this.setRefreshTokenCookie(res, newRawRefreshToken);

    return {
      accessToken: newAccessToken,
      expiresIn: "15m",
      activeProfile,
    };
  }

  /**
   * RF-02: Troca dinamica de contexto de perfil sem necessidade de novo login
   */
  async switchProfile(accountId: string, input: SwitchProfileInput) {
    const targetRole = input.targetRole;

    const account = await this.prisma.account.findUnique({
      where: { id: accountId },
      include: {
        studentProfile: true,
        docenteProfile: true,
        staffProfile: true,
        coordinatorProfile: true,
      },
    });

    if (!account) {
      throw new NotFoundException("Conta de acesso nao encontrada");
    }

    const isSuperAdmin = account.roles.includes(UserRole.SUPER_ADMIN);
    const hasRole = account.roles.includes(targetRole);

    if (!hasRole && !isSuperAdmin) {
      throw new ForbiddenException(
        `A sua conta nao possui o papel [${targetRole}] vinculado para atuacao.`,
      );
    }

    const newAccessToken = this.generateAccessToken(
      account.id,
      account.email,
      account.roles,
      targetRole,
    );

    return {
      accessToken: newAccessToken,
      expiresIn: "15m",
      activeProfile: targetRole,
      mensagem: `Contexto de atuacao alterado com sucesso para ${targetRole}`,
    };
  }

  /**
   * RF-01: Encerramento de sessao com invalidacao de cookie e revogacao de token
   */
  async logout(rawRefreshToken: string, res: Response) {
    if (rawRefreshToken) {
      const tokenHash = this.hashToken(rawRefreshToken);
      await this.prisma.refreshToken.updateMany({
        where: { tokenHash },
        data: { isRevoked: true },
      });
    }

    res.clearCookie("refreshToken", {
      httpOnly: true,
      secure: this.configService.get("NODE_ENV") === "production",
      sameSite: "lax",
      path: "/",
    });

    return {
      mensagem: "Sessao encerrada com sucesso",
    };
  }

  /**
   * Retorna os dados completos do utilizador autenticado e seu perfil ativo
   */
  async getMe(accountId: string, activeProfile: UserRole) {
    const account = await this.prisma.account.findUnique({
      where: { id: accountId },
      include: {
        studentProfile: true,
        docenteProfile: true,
        staffProfile: true,
        coordinatorProfile: true,
      },
    });

    if (!account) {
      throw new NotFoundException("Conta de acesso nao encontrada");
    }

    return {
      id: account.id,
      email: account.email,
      roles: account.roles,
      status: account.status,
      activeProfile,
      profiles: {
        student: account.studentProfile,
        docente: account.docenteProfile,
        staff: account.staffProfile,
        coordinator: account.coordinatorProfile,
      },
      lastLoginAt: account.lastLoginAt,
      createdAt: account.createdAt,
    };
  }

  /**
   * RF-03: Solicitacao de recuperacao de senha segura
   */
  async forgotPassword(input: ForgotPasswordInput) {
    const email = input.email.toLowerCase().trim();
    const account = await this.prisma.account.findUnique({
      where: { email },
    });

    // Resposta idempotente e generica para evitar enumeracao de usuarios
    const genericResponse = {
      mensagem:
        "Se o email estiver cadastrado no sistema, as instrucoes de recuperacao serao enviadas.",
    };

    if (!account || account.status !== AccountStatus.ACTIVE) {
      return genericResponse;
    }

    const rawToken = crypto.randomBytes(32).toString("hex");
    const tokenHash = this.hashToken(rawToken);
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000); // 30 minutos de validade

    await this.prisma.passwordResetToken.create({
      data: {
        accountId: account.id,
        tokenHash,
        expiresAt,
      },
    });

    this.logger.log(
      `[RECUPERACAO DE SENHA] Token gerado para ${email} (Validade: 30 minutos)`,
    );

    await this.mailerService.sendPasswordResetEmail(email, rawToken);

    return genericResponse;
  }

  /**
   * RF-03: Redefinicao definitiva de senha com token de uso unico
   */
  async resetPassword(input: ResetPasswordInput) {
    const tokenHash = this.hashToken(input.token.trim());

    const tokenRecord = await this.prisma.passwordResetToken.findUnique({
      where: { tokenHash },
      include: { account: true },
    });

    if (
      !tokenRecord ||
      tokenRecord.isUsed ||
      tokenRecord.expiresAt < new Date()
    ) {
      throw new BadRequestException(
        "Token de redefinicao invalido ou expirado",
      );
    }

    const newPasswordHash = await bcrypt.hash(input.newPassword, 10);

    // Atualiza a senha e marca token como usado numa unica transacao
    await this.prisma.$transaction([
      this.prisma.account.update({
        where: { id: tokenRecord.accountId },
        data: { passwordHash: newPasswordHash },
      }),
      this.prisma.passwordResetToken.update({
        where: { id: tokenRecord.id },
        data: { isUsed: true },
      }),
      // Revoga todas as sessoes ativas para forcar re-autenticacao segura
      this.prisma.refreshToken.updateMany({
        where: { accountId: tokenRecord.accountId },
        data: { isRevoked: true },
      }),
    ]);

    return {
      mensagem:
        "Senha redefinida com sucesso. Pode agora iniciar sessao com a nova credencial.",
    };
  }

  // ============================================================================
  // METODOS AUXILIARES PRIVADOS
  // ============================================================================

  private generateAccessToken(
    accountId: string,
    email: string,
    roles: UserRole[],
    activeProfile: UserRole,
  ): string {
    const payload = {
      sub: accountId,
      email,
      roles,
      activeProfile,
    };

    return this.jwtService.sign(payload);
  }

  private async createAndPersistRefreshToken(
    accountId: string,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<string> {
    const rawToken = crypto.randomBytes(40).toString("hex");
    const tokenHash = this.hashToken(rawToken);
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 dias

    await this.prisma.refreshToken.create({
      data: {
        accountId,
        tokenHash,
        expiresAt,
        ipAddress: ipAddress || null,
        userAgent: userAgent || null,
      },
    });

    return rawToken;
  }

  private setRefreshTokenCookie(res: Response, rawToken: string) {
    const isProduction = this.configService.get("NODE_ENV") === "production";
    res.cookie("refreshToken", rawToken, {
      httpOnly: true,
      secure: isProduction,
      sameSite: "lax",
      path: "/",
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 dias
    });
  }

  private hashToken(token: string): string {
    return crypto.createHash("sha256").update(token).digest("hex");
  }

  private async findAccountByIdentifier(identifier: string) {
    // 1. Tentar por Email
    if (identifier.includes("@")) {
      return this.prisma.account.findUnique({
        where: { email: identifier.toLowerCase() },
        include: {
          studentProfile: true,
          docenteProfile: true,
          staffProfile: true,
          coordinatorProfile: true,
        },
      });
    }

    // 2. Tentar por Matricula de Estudante
    const student = await this.prisma.studentProfile.findFirst({
      where: {
        OR: [
          { studentNumber: { equals: identifier, mode: "insensitive" } },
          { identityCardNumber: { equals: identifier, mode: "insensitive" } },
        ],
      },
      include: {
        account: {
          include: {
            studentProfile: true,
            docenteProfile: true,
            staffProfile: true,
            coordinatorProfile: true,
          },
        },
      },
    });
    if (student) return student.account;

    // 3. Tentar por Numero Mecanografico ou BI do Docente
    const docente = await this.prisma.docenteProfile.findFirst({
      where: {
        OR: [
          { mechanographicNumber: { equals: identifier, mode: "insensitive" } },
          { identityCardNumber: { equals: identifier, mode: "insensitive" } },
        ],
      },
      include: {
        account: {
          include: {
            studentProfile: true,
            docenteProfile: true,
            staffProfile: true,
            coordinatorProfile: true,
          },
        },
      },
    });
    if (docente) return docente.account;

    // 4. Tentar por Numero de Funcionario ou BI de Staff
    const staff = await this.prisma.staffProfile.findFirst({
      where: {
        OR: [
          { employeeNumber: { equals: identifier, mode: "insensitive" } },
          { identityCardNumber: { equals: identifier, mode: "insensitive" } },
        ],
      },
      include: {
        account: {
          include: {
            studentProfile: true,
            docenteProfile: true,
            staffProfile: true,
            coordinatorProfile: true,
          },
        },
      },
    });
    if (staff) return staff.account;

    return null;
  }
}
