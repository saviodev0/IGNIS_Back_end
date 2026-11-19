import type { Request } from 'express';

/** O que o `AuthGuard` coloca no token: `sub` é o id do aluno e `email` o e-mail dele. */
export interface AuthUser {
  sub: string;
  email: string;
}

/**
 * Requisição de uma rota protegida pelo `AuthGuard`. Use no lugar de `any`
 * para o TypeScript conferir `request.user.sub` (e acusar erro de digitação).
 */
export interface AuthenticatedRequest extends Request {
  user: AuthUser;
}
