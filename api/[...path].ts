import type { IncomingMessage, ServerResponse } from 'node:http';
import { AppLayerLive, makeRuntime } from '../apps/api/src/runtime';
import { buildServer } from '../apps/api/src/server';

/*
 * A API como uma serverless function da Vercel.
 *
 * A Vercel transforma cada arquivo desta pasta numa função; `[...path]` é o
 * catch-all, então esta única função atende `/api/auth/login`, `/api/leads` e
 * todo o resto. Ela não reimplementa nada: monta o mesmo `buildServer` que o
 * `main.ts` monta, com o mesmo `ManagedRuntime`.
 *
 * **Um par de colchetes, não dois.** `[[...path]]` — o catch-all *opcional* — é
 * convenção de roteamento do Next.js, e o roteamento por sistema de arquivos das
 * Functions da Vercel não o reconhece: ele degrada para um segmento dinâmico só,
 * e aí `/api/health` chega mas `/api/auth/login` responde 404 antes de tocar no
 * Fastify.
 *
 * O runtime fica **fora** do handler de propósito. É a mesma decisão do ADR-0002
 * num ambiente diferente: construído aqui, ele sobrevive entre requisições que
 * caiam na mesma instância quente, e só uma invocação fria paga a abertura da
 * conexão com o Postgres. Dentro do handler, cada requisição reconstruiria o
 * grafo de dependências.
 */
const runtime = makeRuntime(AppLayerLive);
const app = buildServer({ runtime });

/*
 * `app.ready()` uma vez, guardado como Promise. Quem chegar durante a montagem
 * espera a mesma — é o mesmo padrão da renovação de sessão em `lib/api.ts`.
 */
const ready = app.ready();

export default async function handler(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  await ready;

  /*
   * A função vive sob `/api`; o contrato HTTP do servidor é `/auth/login`,
   * `/leads`… sem prefixo. Esta linha é exatamente o `rewrite` que o proxy do
   * Vite faz em desenvolvimento (ver `vite.config.ts`), e é o que mantém
   * navegador e API na mesma origem — sem isso os cookies `httpOnly` de sessão
   * exigiriam CORS com credenciais e `SameSite=None` (ADR-0004).
   */
  req.url = (req.url ?? '/').replace(/^\/api/, '') || '/';

  app.server.emit('request', req, res);
}
