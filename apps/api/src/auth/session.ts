import {
  InvalidCredentials,
  SessionUser,
  Unauthorized,
  type LoginRequest,
} from '@kikos/domain';
import { Effect, Option } from 'effect';
import { UserRepository, type UserRecord } from '../repositories/UserRepository';
import { verifyPassword } from './password';
import { verifyToken, type TokenKind } from './tokens';

/*
 * Os casos de uso de sessão. Dependem do repositório, então vivem na API e não
 * no pacote compartilhado — o pacote guarda só Schemas, erros e regra pura.
 *
 * Cada função devolve um `Effect<Sucesso, Erro, UserRepository>`: o terceiro
 * parâmetro é a dependência, e é o compilador quem cobra que alguém a forneça
 * antes de rodar.
 */

/** A projeção que sai pela API: sem hash de senha, sem `tokenVersion`. */
export const toSessionUser = (user: UserRecord): SessionUser => ({
  id: user.id,
  name: user.name,
  email: user.email,
  role: user.role,
});

/*
 * Um hash real, de uma senha que ninguém tem.
 *
 * Sem ele, um e-mail inexistente responderia sem passar pelo bcrypt e um
 * e-mail cadastrado com senha errada responderia depois dele — e a diferença
 * de tempo diria a quem está tentando quais e-mails existem. Comparar contra
 * este chamariz faz os dois caminhos custarem o mesmo.
 */
const DECOY_PASSWORD_HASH =
  '$2b$10$cbiMSLfp7WCM9TC8xWRxB.OQrc/DKrK0CNWWVoXo2Tok0gjq0gvU2';

/** A mesma mensagem para e-mail inexistente e senha errada, de propósito. */
const invalidCredentials = new InvalidCredentials({
  message: 'E-mail ou senha incorretos.',
});

export const login = (
  input: LoginRequest,
): Effect.Effect<UserRecord, InvalidCredentials, UserRepository> =>
  Effect.gen(function* () {
    const users = yield* UserRepository;
    const found = yield* users.findByEmail(input.email);

    const passwordHash = Option.match(found, {
      onNone: () => DECOY_PASSWORD_HASH,
      onSome: (user) => user.passwordHash,
    });

    const matches = yield* Effect.promise(() =>
      verifyPassword(input.password, passwordHash),
    );

    if (!matches || Option.isNone(found)) {
      return yield* Effect.fail(invalidCredentials);
    }

    return found.value;
  });

/**
 * Resolve o User de um token, conferindo a `tokenVersion` contra o banco.
 *
 * É esta leitura que dá cancelamento real a um JWT: o logout incrementa a
 * coluna, e um token assinado com a versão anterior passa a ser recusado mesmo
 * estando dentro da validade e com a assinatura correta (ADR-0004).
 */
const resolveSession = (
  token: string | undefined,
  kind: TokenKind,
): Effect.Effect<UserRecord, Unauthorized, UserRepository> =>
  Effect.gen(function* () {
    if (token === undefined || token === '') {
      return yield* Effect.fail(new Unauthorized({ message: 'Sessão não encontrada.' }));
    }

    const claims = yield* Effect.promise(() => verifyToken(token, kind));
    if (claims === null) {
      return yield* Effect.fail(new Unauthorized({ message: 'Sessão inválida.' }));
    }

    const users = yield* UserRepository;
    const found = yield* users.findById(claims.userId);

    if (Option.isNone(found) || found.value.tokenVersion !== claims.tokenVersion) {
      return yield* Effect.fail(new Unauthorized({ message: 'Sessão expirada.' }));
    }

    return found.value;
  });

/** Usado pelo middleware, a cada requisição de rota protegida. */
export const authenticateAccessToken = (
  token: string | undefined,
): Effect.Effect<UserRecord, Unauthorized, UserRepository> =>
  resolveSession(token, 'access');

/** Usado por `POST /auth/refresh`, que só aceita o token de refresh. */
export const authenticateRefreshToken = (
  token: string | undefined,
): Effect.Effect<UserRecord, Unauthorized, UserRepository> =>
  resolveSession(token, 'refresh');

/**
 * Encerra a sessão no servidor, não só no navegador: incrementar a versão
 * derruba todos os tokens daquele User, inclusive os de outros dispositivos.
 */
export const logout = (user: UserRecord): Effect.Effect<void, never, UserRepository> =>
  Effect.gen(function* () {
    const users = yield* UserRepository;
    yield* users.incrementTokenVersion(user.id);
  });
