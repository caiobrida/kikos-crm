import type { ValidationIssue } from '@kikos/domain';
import { Schema } from 'effect';

/*
 * O único caminho do app web até a API.
 *
 * O prefixo `/api` é convenção do proxy do Vite, não da API: o servidor serve
 * `/auth/login`, `/leads`… sem prefixo, e o Vite reescreve. Isso deixa
 * navegador e servidor na mesma origem, que é o que faz os cookies `httpOnly`
 * de sessão funcionarem sem CORS com credenciais (ADR-0004).
 */
const API_PREFIX = '/api';

/** Um erro vindo da API, já com a mensagem em português pronta para a tela. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    /** A tag do erro de domínio, como `InvalidCredentials`. */
    readonly code: string,
    message: string,
    /** Presente em `ValidationFailed`, para marcar o campo culpado. */
    readonly issues: readonly ValidationIssue[] = [],
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export interface RequestOptions {
  readonly method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  readonly body?: unknown;
  readonly signal?: AbortSignal;
  /**
   * Desliga a renovação automática. Vale para o login: um 401 ali significa
   * credencial errada, e tentar renovar uma sessão que nunca existiu só
   * gastaria uma requisição antes de mostrar a mesma mensagem.
   */
  readonly skipRefresh?: boolean;
}

const send = (path: string, options: RequestOptions): Promise<Response> =>
  fetch(`${API_PREFIX}${path}`, {
    method: options.method ?? 'GET',
    ...(options.body === undefined
      ? {}
      : {
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(options.body),
        }),
    ...(options.signal === undefined ? {} : { signal: options.signal }),
  });

/*
 * A renovação concorrente, que é a parte com mais chance de bug sutil desta
 * fatia.
 *
 * Ao voltar de uma aba deixada aberta, o access de 15 minutos já venceu e
 * várias telas disparam requisições ao mesmo tempo. Todas tomam 401 juntas. Se
 * cada uma renovasse por conta própria, seriam três chamadas a `/auth/refresh`
 * — e as duas últimas rodariam com um refresh que a primeira já pode ter
 * girado.
 *
 * A variável de módulo guarda a renovação **em andamento**: quem chegar
 * enquanto ela existe recebe a mesma Promise em vez de começar outra. O
 * `finally` a devolve para `null` quando termina, para que a próxima expiração
 * dispare uma renovação nova.
 */
let refreshInFlight: Promise<boolean> | null = null;

const refreshSession = (): Promise<boolean> => {
  refreshInFlight ??= fetch(`${API_PREFIX}/auth/refresh`, { method: 'POST' })
    .then((response) => response.ok)
    .catch(() => false)
    .finally(() => {
      refreshInFlight = null;
    });

  return refreshInFlight;
};

const toApiError = async (response: Response): Promise<ApiError> => {
  try {
    const body: unknown = await response.json();

    if (typeof body === 'object' && body !== null && 'message' in body) {
      const { error, message, issues } = body as {
        error?: string;
        message?: string;
        issues?: readonly ValidationIssue[];
      };

      return new ApiError(
        response.status,
        error ?? 'UnknownError',
        message ?? 'Não foi possível concluir a operação.',
        issues ?? [],
      );
    }
  } catch {
    // Resposta sem JSON — cai na mensagem genérica abaixo.
  }

  return new ApiError(
    response.status,
    'UnknownError',
    'Não foi possível falar com o servidor. Tente de novo.',
  );
};

/** Manda a requisição e, em caso de 401, renova a sessão e a repete uma vez. */
const requestWithRefresh = async (
  path: string,
  options: RequestOptions,
): Promise<Response> => {
  const response = await send(path, options);

  if (response.status !== 401 || options.skipRefresh === true) return response;

  const renewed = await refreshSession();
  return renewed ? send(path, options) : response;
};

/**
 * Faz a requisição e decodifica a resposta com um Schema do pacote
 * compartilhado — o mesmo que a API usou para codificá-la.
 */
export const apiJson = async <A, I>(
  schema: Schema.Schema<A, I>,
  path: string,
  options: RequestOptions = {},
): Promise<A> => {
  const response = await requestWithRefresh(path, options);

  if (!response.ok) throw await toApiError(response);

  return Schema.decodeUnknownPromise(schema)(await response.json());
};

/** Para as rotas que respondem 204, como o logout. */
export const apiSend = async (
  path: string,
  options: RequestOptions = {},
): Promise<void> => {
  const response = await requestWithRefresh(path, options);

  if (!response.ok) throw await toApiError(response);
};
