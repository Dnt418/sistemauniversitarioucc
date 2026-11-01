import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserRole } from '@prisma/client';
import { ROLES_KEY } from '../decorators/roles.decorator';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<UserRole[]>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );

    // Se a rota nao define restricao de papeis, autoriza acesso
    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user;
    const activeProfile: UserRole = request.activeProfile;

    if (!user) {
      throw new ForbiddenException('Acesso restrito a utilizadores autenticados');
    }

    // Super Admin tem permissao institucional transversal
    if (user.roles.includes(UserRole.SUPER_ADMIN)) {
      return true;
    }

    // O perfil ativo com o qual a requisicao esta sendo executada deve constar na lista de papeis autorizados
    const hasRequiredRole = requiredRoles.includes(activeProfile);

    if (!hasRequiredRole) {
      throw new ForbiddenException(
        `Acesso negado: o seu perfil ativo [${activeProfile}] nao possui permissao para este recurso. Papeis autorizados: ${requiredRoles.join(', ')}`,
      );
    }

    return true;
  }
}

