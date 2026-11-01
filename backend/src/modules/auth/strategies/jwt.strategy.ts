import { Injectable, UnauthorizedException } from "@nestjs/common";
import { PassportStrategy } from "@nestjs/passport";
import { ExtractJwt, Strategy } from "passport-jwt";
import { ConfigService } from "@nestjs/config";
import { AccountStatus, UserRole } from "@prisma/client";
import { PrismaService } from "@infra/database/prisma.service";

export interface JwtPayload {
  sub: string;
  email: string;
  roles: UserRole[];
  activeProfile?: UserRole;
  iat?: number;
  exp?: number;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>("JWT_SECRET", { infer: true }),
    });
  }

  async validate(payload: JwtPayload) {
    const account = await this.prisma.account.findUnique({
      where: { id: payload.sub },
      select: {
        id: true,
        email: true,
        status: true,
        roles: true,
        studentProfile: { select: { id: true } },
        docenteProfile: { select: { id: true } },
        staffProfile: { select: { id: true } },
        coordinatorProfile: { select: { id: true } },
      },
    });

    if (!account) {
      throw new UnauthorizedException("Conta de acesso inexistente");
    }

    if (account.status !== AccountStatus.ACTIVE) {
      throw new UnauthorizedException(
        "Esta conta de acesso encontra-se inativa ou suspensa",
      );
    }

    return {
      id: account.id,
      email: account.email,
      roles: account.roles,
      status: account.status,
      profiles: {
        hasStudent: !!account.studentProfile,
        hasDocente: !!account.docenteProfile,
        hasStaff: !!account.staffProfile,
        hasCoordinator: !!account.coordinatorProfile,
      },
      activeProfile: payload.activeProfile || account.roles[0],
    };
  }
}
