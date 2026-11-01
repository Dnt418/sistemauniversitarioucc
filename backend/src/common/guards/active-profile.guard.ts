import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from "@nestjs/common";
import { UserRole } from "@prisma/client";

@Injectable()
export class ActiveProfileGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    // Se a rota for pública ou o usuário não estiver autenticado ainda, deixa passar para o JwtAuthGuard decidir
    if (!user) {
      return true;
    }

    const rawHeader = request.headers["x-active-profile"];

    if (rawHeader && typeof rawHeader === "string") {
      const requestedRole = rawHeader.toUpperCase().trim() as UserRole;
      const validRoles = Object.values(UserRole);

      if (!validRoles.includes(requestedRole)) {
        throw new ForbiddenException(
          `Perfil [${requestedRole}] desconhecido. Papeis aceitos: ${validRoles.join(", ")}`,
        );
      }

      // Super Admin tem privilégio de transitar ou auditar qualquer perfil
      const isSuperAdmin = user.roles.includes(UserRole.SUPER_ADMIN);
      const hasRole = user.roles.includes(requestedRole);

      if (!hasRole && !isSuperAdmin) {
        throw new ForbiddenException(
          `A sua conta nao possui o papel [${requestedRole}] habilitado para atuacao.`,
        );
      }

      request.activeProfile = requestedRole;
      user.activeProfile = requestedRole;
    } else {
      // Default: se nao enviou cabecalho, assume o perfil ativo do token ou o primeiro papel da conta
      const defaultRole =
        user.activeProfile || user.roles[0] || UserRole.ESTUDANTE;
      request.activeProfile = defaultRole;
      user.activeProfile = defaultRole;
    }

    return true;
  }
}
