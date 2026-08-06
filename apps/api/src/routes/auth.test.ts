import { SessionUser } from '@kikos/domain';
import { afterEach, beforeEach, describe, expect, it } from '@effect/vitest';
import { Schema } from 'effect';
import { config } from '../config';
import { ACCESS_COOKIE, REFRESH_COOKIE } from '../http/cookies';
import {
  TEST_PASSWORD,
  cookieValue,
  makeTestHarness,
  type TestHarness,
} from '../testing/harness';

/*
 * O contrato de autenticação, exercitado pela pilha inteira do Fastify com
 * `app.inject()` — requisição de verdade, sem porta aberta e sem Postgres.
 *
 * `it` comum e não `it.effect`: o que se testa aqui é a resposta HTTP, que já
 * é uma Promise. `it.effect` é para programa que devolve Effect.
 */
describe('autenticação', () => {
  let harness: TestHarness;

  beforeEach(async () => {
    harness = await makeTestHarness();
  });

  afterEach(async () => {
    await harness.close();
  });

  const login = (email: string, password: string) =>
    harness.app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email, password },
    });

  describe('POST /auth/login', () => {
    it('devolve o User e grava os dois cookies de sessão', async () => {
      const response = await login(harness.manager.email, TEST_PASSWORD);

      expect(response.statusCode).toBe(200);

      // Decodificar com o Schema compartilhado é a asserção que importa: se a
      // rota e o contrato divergirem, isto falha.
      const user = Schema.decodeUnknownSync(SessionUser)(response.json());
      expect(user.name).toBe('Rodrigo Ramos');
      expect(user.role).toBe('MANAGER');

      expect(cookieValue(response.cookies, ACCESS_COOKIE)).toBeDefined();
      expect(cookieValue(response.cookies, REFRESH_COOKIE)).toBeDefined();
    });

    it('não devolve o hash da senha', async () => {
      const response = await login(harness.manager.email, TEST_PASSWORD);

      expect(JSON.stringify(response.json())).not.toContain('$2');
    });

    it('marca os cookies como httpOnly, fora do alcance do JavaScript da página', async () => {
      const response = await login(harness.manager.email, TEST_PASSWORD);

      for (const name of [ACCESS_COOKIE, REFRESH_COOKIE]) {
        const cookie = response.cookies.find((candidate) => candidate.name === name);
        expect(cookie?.httpOnly).toBe(true);
      }
    });

    it('restringe o cookie de refresh à rota que o consome', async () => {
      const response = await login(harness.manager.email, TEST_PASSWORD);

      const refresh = response.cookies.find((cookie) => cookie.name === REFRESH_COOKIE);
      expect(refresh?.path).toBe(config.auth.refreshCookiePath);
    });

    it('recusa a senha errada com 401 e sem gravar cookie', async () => {
      const response = await login(harness.manager.email, 'senha-errada');

      expect(response.statusCode).toBe(401);
      expect(response.json()).toMatchObject({ error: 'InvalidCredentials' });
      expect(response.cookies).toHaveLength(0);
    });

    it('responde a e-mail inexistente exatamente como a senha errada', async () => {
      const unknownEmail = await login('ninguem@kikos.com.br', TEST_PASSWORD);
      const wrongPassword = await login(harness.manager.email, 'senha-errada');

      // Diferenciar as duas respostas diria a quem está tentando quais
      // e-mails existem.
      expect(unknownEmail.statusCode).toBe(wrongPassword.statusCode);
      expect(unknownEmail.json()).toEqual(wrongPassword.json());
    });

    it('aceita o e-mail com espaço e caixa alta, porque o Schema normaliza', async () => {
      const response = await login('  Rodrigo.Ramos@Kikos.com.BR ', TEST_PASSWORD);

      expect(response.statusCode).toBe(200);
    });

    it('recusa corpo inválido com 400 e aponta o campo culpado', async () => {
      const response = await harness.app.inject({
        method: 'POST',
        url: '/auth/login',
        payload: { email: 'não-é-e-mail', password: '' },
      });

      expect(response.statusCode).toBe(400);

      const body = response.json<{
        error: string;
        issues: { path: string }[];
      }>();
      expect(body.error).toBe('ValidationFailed');
      expect(body.issues.map((issue) => issue.path).sort()).toEqual([
        'email',
        'password',
      ]);
    });
  });

  describe('GET /auth/me', () => {
    it('devolve o User da sessão', async () => {
      const session = await login(harness.seller.email, TEST_PASSWORD);

      const response = await harness.app.inject({
        method: 'GET',
        url: '/auth/me',
        cookies: { [ACCESS_COOKIE]: cookieValue(session.cookies, ACCESS_COOKIE)! },
      });

      expect(response.statusCode).toBe(200);
      expect(Schema.decodeUnknownSync(SessionUser)(response.json()).email).toBe(
        harness.seller.email,
      );
    });

    it('recusa quem não manda cookie nenhum', async () => {
      const response = await harness.app.inject({ method: 'GET', url: '/auth/me' });

      expect(response.statusCode).toBe(401);
      expect(response.json()).toMatchObject({ error: 'Unauthorized' });
    });

    it('recusa um token que não foi assinado por esta API', async () => {
      const response = await harness.app.inject({
        method: 'GET',
        url: '/auth/me',
        cookies: { [ACCESS_COOKIE]: 'nao.e.um.jwt' },
      });

      expect(response.statusCode).toBe(401);
    });

    it('recusa o token de refresh usado como token de acesso', async () => {
      const session = await login(harness.manager.email, TEST_PASSWORD);

      const response = await harness.app.inject({
        method: 'GET',
        url: '/auth/me',
        cookies: { [ACCESS_COOKIE]: cookieValue(session.cookies, REFRESH_COOKIE)! },
      });

      // Sem o tipo dentro do payload, um token de 7 dias passaria por um de 15
      // minutos.
      expect(response.statusCode).toBe(401);
    });
  });

  describe('POST /auth/refresh', () => {
    it('emite um access novo que dá acesso às rotas protegidas', async () => {
      const session = await login(harness.manager.email, TEST_PASSWORD);

      const refreshed = await harness.app.inject({
        method: 'POST',
        url: '/auth/refresh',
        cookies: { [REFRESH_COOKIE]: cookieValue(session.cookies, REFRESH_COOKIE)! },
      });

      expect(refreshed.statusCode).toBe(200);

      const response = await harness.app.inject({
        method: 'GET',
        url: '/auth/me',
        cookies: { [ACCESS_COOKIE]: cookieValue(refreshed.cookies, ACCESS_COOKIE)! },
      });

      expect(response.statusCode).toBe(200);
    });

    it('não reemite o refresh, para que os 7 dias contem desde o login', async () => {
      const session = await login(harness.manager.email, TEST_PASSWORD);

      const refreshed = await harness.app.inject({
        method: 'POST',
        url: '/auth/refresh',
        cookies: { [REFRESH_COOKIE]: cookieValue(session.cookies, REFRESH_COOKIE)! },
      });

      // Regravar o refresh a cada renovação faria a validade do ADR-0004
      // deslizar para sempre e nunca vencer para quem usa o CRM todo dia.
      expect(cookieValue(refreshed.cookies, ACCESS_COOKIE)).toBeDefined();
      expect(cookieValue(refreshed.cookies, REFRESH_COOKIE)).toBeUndefined();
    });

    it('recusa quem não tem cookie de refresh', async () => {
      const response = await harness.app.inject({ method: 'POST', url: '/auth/refresh' });

      expect(response.statusCode).toBe(401);
    });
  });

  describe('POST /auth/logout', () => {
    it('encerra a sessão no servidor: o token anterior deixa de funcionar', async () => {
      const session = await login(harness.manager.email, TEST_PASSWORD);
      const accessToken = cookieValue(session.cookies, ACCESS_COOKIE)!;

      const before = await harness.app.inject({
        method: 'GET',
        url: '/auth/me',
        cookies: { [ACCESS_COOKIE]: accessToken },
      });
      expect(before.statusCode).toBe(200);

      const logout = await harness.app.inject({
        method: 'POST',
        url: '/auth/logout',
        cookies: { [ACCESS_COOKIE]: accessToken },
      });
      expect(logout.statusCode).toBe(204);

      /*
       * O mesmo token, ainda dentro da validade e com a assinatura correta,
       * agora carrega uma `tokenVersion` defasada. É isto que diferencia sair
       * de verdade de apenas pedir ao navegador que esqueça o cookie.
       */
      const after = await harness.app.inject({
        method: 'GET',
        url: '/auth/me',
        cookies: { [ACCESS_COOKIE]: accessToken },
      });
      expect(after.statusCode).toBe(401);
    });

    it('invalida também o token de refresh emitido antes dele', async () => {
      const session = await login(harness.manager.email, TEST_PASSWORD);

      await harness.app.inject({
        method: 'POST',
        url: '/auth/logout',
        cookies: { [ACCESS_COOKIE]: cookieValue(session.cookies, ACCESS_COOKIE)! },
      });

      const response = await harness.app.inject({
        method: 'POST',
        url: '/auth/refresh',
        cookies: { [REFRESH_COOKIE]: cookieValue(session.cookies, REFRESH_COOKIE)! },
      });

      expect(response.statusCode).toBe(401);
    });

    it('apaga os cookies do navegador', async () => {
      const session = await login(harness.manager.email, TEST_PASSWORD);

      const response = await harness.app.inject({
        method: 'POST',
        url: '/auth/logout',
        cookies: { [ACCESS_COOKIE]: cookieValue(session.cookies, ACCESS_COOKIE)! },
      });

      expect(cookieValue(response.cookies, ACCESS_COOKIE)).toBe('');
      expect(cookieValue(response.cookies, REFRESH_COOKIE)).toBe('');
    });

    it('recusa quem não está logado', async () => {
      const response = await harness.app.inject({ method: 'POST', url: '/auth/logout' });

      expect(response.statusCode).toBe(401);
    });
  });
});
