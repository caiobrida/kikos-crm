import { HealthResponse } from '@kikos/domain';
import { Schema } from 'effect';
import { useEffect, useState } from 'react';

export type ApiHealthState =
  | { readonly kind: 'loading' }
  | { readonly kind: 'ok'; readonly health: HealthResponse }
  | { readonly kind: 'unreachable'; readonly message: string };

/**
 * Consulta `GET /api/health` e decodifica a resposta com o Schema do pacote de
 * domínio — o mesmo que a API usa para codificá-la.
 *
 * Serve de prova viva de duas decisões desta fatia: o Vite está proxiando
 * `/api` para a API, e o pacote compartilhado é importável pelo navegador.
 */
export const useApiHealth = (): ApiHealthState => {
  const [state, setState] = useState<ApiHealthState>({ kind: 'loading' });

  useEffect(() => {
    const controller = new AbortController();

    const check = async (): Promise<void> => {
      try {
        const response = await fetch('/api/health', { signal: controller.signal });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        // `decodeUnknownPromise` é a ponte do Effect para o mundo async comum:
        // devolve uma Promise que rejeita com o erro de parse.
        const health = await Schema.decodeUnknownPromise(HealthResponse)(
          await response.json(),
        );

        setState({ kind: 'ok', health });
      } catch (error) {
        if (controller.signal.aborted) return;
        setState({
          kind: 'unreachable',
          message: error instanceof Error ? error.message : 'falha desconhecida',
        });
      }
    };

    void check();

    return () => {
      controller.abort();
    };
  }, []);

  return state;
};
