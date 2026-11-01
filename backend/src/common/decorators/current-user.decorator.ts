import { createParamDecorator, ExecutionContext } from "@nestjs/common";
import { Account, UserRole } from "@prisma/client";

export interface AuthenticatedUser {
  id: string;
  email: string;
  roles: UserRole[];
  status: string;
  activeProfile: UserRole;
}

export const CurrentUser = createParamDecorator(
  (data: keyof AuthenticatedUser | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    const user = request.user as AuthenticatedUser;

    if (!user) {
      return null;
    }

    return data ? user[data] : user;
  },
);
