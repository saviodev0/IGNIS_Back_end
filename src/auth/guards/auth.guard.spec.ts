import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

import type { AuthenticatedRequest } from '../authenticated-request';
import { AuthGuard } from './auth.guard';

describe('AuthGuard', () => {
  const verifyAsync = jest.fn();
  const guard = new AuthGuard({ verifyAsync } as unknown as JwtService);

  const contextFor = (request: object) =>
    ({
      switchToHttp: () => ({ getRequest: () => request }),
    }) as unknown as ExecutionContext;

  beforeEach(() => verifyAsync.mockReset());

  it('coloca o aluno do token em request.user', async () => {
    verifyAsync.mockResolvedValue({ sub: 'aluno-1', email: 'a@b.com' });
    const request = { cookies: { ignis_token: 'token-valido' } };

    await expect(guard.canActivate(contextFor(request))).resolves.toBe(true);

    expect((request as unknown as AuthenticatedRequest).user.sub).toBe(
      'aluno-1',
    );
    expect(verifyAsync).toHaveBeenCalledWith('token-valido');
  });

  it('recusa quando não há token', async () => {
    await expect(
      guard.canActivate(contextFor({ cookies: {} })),
    ).rejects.toThrow(new UnauthorizedException('Token não informado'));
    await expect(guard.canActivate(contextFor({}))).rejects.toThrow(
      'Token não informado',
    );
    expect(verifyAsync).not.toHaveBeenCalled();
  });

  it('recusa token inválido ou expirado', async () => {
    verifyAsync.mockRejectedValue(new Error('jwt expired'));

    await expect(
      guard.canActivate(contextFor({ cookies: { ignis_token: 'velho' } })),
    ).rejects.toThrow(new UnauthorizedException('Token inválido ou expirado'));
  });
});

describe('AuthenticatedRequest (conferido na compilação)', () => {
  it('acusa erro de digitação em request.user', () => {
    const request = {
      user: { sub: 'x', email: 'a@b.com' },
    } as AuthenticatedRequest;

    expect(request.user.sub).toBe('x');
    // @ts-expect-error `sbu` não existe: com `any` esse erro passava despercebido
    expect(request.user.sbu).toBeUndefined();
  });
});
