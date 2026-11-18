import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

import type { AuthenticatedRequest, AuthUser } from '../authenticated-request';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly jwtService: JwtService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();

    const token = request.cookies?.ignis_token;

    if (!token) {
      throw new UnauthorizedException('Token não informado');
    }

    try {
      const payload = await this.jwtService.verifyAsync<AuthUser>(token);

      request.user = payload;

      return true;
    } catch {
      throw new UnauthorizedException('Token inválido ou expirado');
    }
  }
}