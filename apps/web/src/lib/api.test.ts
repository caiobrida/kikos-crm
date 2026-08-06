import { SessionUser } from '@kikos/domain';
import { afterEach, describe, expect, it } from '@effect/vitest';
import { ApiError, apiJson } from './api';

/*
 * O wrapper de fetch é módulo puro, sem React — então dá para testá-lo sem
 * ambiente de navegador e sem teste de componente, que estão fora da suíte
 * deste projeto.
 */

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

const UNAUTHORIZED = { error: 'Unauthorized', message: 'Sessão expirada.' };

const jsonResponse = (body: unknown, status: number): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

const SESSION = {
  id: '3b0f0a3a-0f5f-4d3a-9a2f-9c3a1f2b4c5d',
  name: 'Rodrigo Ramos',
  email: 'rodrigo.ramos@kikos.com.br',
  role: 'MANAGER',
};

/**
 * Um servidor de mentira que começa recusando tudo com 401 e passa a aceitar
 * depois que `/auth/refresh` é chamado. Registra cada URL pedida.
 */
const stubApi = (options: { readonly refreshSucceeds: boolean }) => {
  const calls: string[] = [];
  let sessionIsValid = false;

  globalThis.fetch = ((input: RequestInfo | URL) => {
    const url = String(input);
    calls.push(url);

    if (url.endsWith('/auth/refresh')) {
      sessionIsValid = options.refreshSucceeds;
      return Promise.resolve(
        options.refreshSucceeds
          ? jsonResponse(SESSION, 200)
          : jsonResponse(UNAUTHORIZED, 401),
      );
    }

    return Promise.resolve(
      sessionIsValid ? jsonResponse(SESSION, 200) : jsonResponse(UNAUTHORIZED, 401),
    );
  }) as typeof fetch;

  return {
    calls,
    refreshCalls: () => calls.filter((url) => url.endsWith('/auth/refresh')),
  };
};

describe('apiJson', () => {
  it('renova a sessão e repete a requisição que tomou 401', async () => {
    const stub = stubApi({ refreshSucceeds: true });

    const user = await apiJson(SessionUser, '/auth/me');

    expect(user.name).toBe('Rodrigo Ramos');
    expect(stub.calls).toEqual(['/api/auth/me', '/api/auth/refresh', '/api/auth/me']);
  });

  it('três requisições que tomam 401 juntas disparam uma renovação, não três', async () => {
    const stub = stubApi({ refreshSucceeds: true });

    await Promise.all([
      apiJson(SessionUser, '/auth/me'),
      apiJson(SessionUser, '/auth/me'),
      apiJson(SessionUser, '/auth/me'),
    ]);

    // É este número que separa "compartilham uma promise" de "cada uma renova
    // por conta própria".
    expect(stub.refreshCalls()).toHaveLength(1);
  });

  it('propaga o 401 quando a renovação também falha', async () => {
    const stub = stubApi({ refreshSucceeds: false });

    const error = await apiJson(SessionUser, '/auth/me').catch(
      (caught: unknown) => caught,
    );

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).status).toBe(401);
    // Uma tentativa só de renovação: sem repetição em laço.
    expect(stub.refreshCalls()).toHaveLength(1);
  });

  it('não tenta renovar quando o próprio login é recusado', async () => {
    const stub = stubApi({ refreshSucceeds: true });

    const error = await apiJson(SessionUser, '/auth/login', {
      method: 'POST',
      body: { email: 'rodrigo.ramos@kikos.com.br', password: 'errada' },
      skipRefresh: true,
    }).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(ApiError);
    expect(stub.refreshCalls()).toHaveLength(0);
  });

  it('traz a mensagem e a tag que a API mandou', async () => {
    globalThis.fetch = (() =>
      Promise.resolve(
        jsonResponse(
          { error: 'InvalidCredentials', message: 'E-mail ou senha incorretos.' },
          401,
        ),
      )) as typeof fetch;

    const error = (await apiJson(SessionUser, '/auth/login', {
      skipRefresh: true,
    }).catch((caught: unknown) => caught)) as ApiError;

    expect(error.code).toBe('InvalidCredentials');
    expect(error.message).toBe('E-mail ou senha incorretos.');
  });
});
