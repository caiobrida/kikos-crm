import type { IncomingMessage, ServerResponse } from 'node:http';
import { AppLayerLive, makeRuntime } from './runtime';
import { buildServer } from './server';

/*
 * A API como uma serverless function da Vercel.
 *
 * Ela não reimplementa nada: monta o mesmo `buildServer` que o `main.ts` monta,
 * com o mesmo `ManagedRuntime`. A diferença é só quem escuta — lá um socket,
 * aqui uma função que a plataforma invoca.
 *
 * **Este arquivo mora em `apps/api/src` e não em `api/`, e a distinção é o que
 * faz o deploy funcionar.** O compilador da Vercel processa o que está em
 * `api/` com `moduleResolution: nodenext`, que exige `.js` explícito em todo
 * import relativo — e `@kikos/domain` publica `./src/index.ts`, TypeScript cru
 * que aquela resolução não sabe ler. Aqui o arquivo é compilado pelo `tsc` do
 * workspace, como todo o resto, e o `esbuild` do build o empacota em JavaScript
 * antes de a Vercel olhar para ele.
 */

/*
 * O runtime fica **fora** do handler de propósito. É a mesma decisão do
 * ADR-0002 num ambiente diferente: construído aqui, ele sobrevive entre
 * requisições que caiam na mesma instância quente, e só uma invocação fria paga
 * a abertura da conexão com o Postgres. Dentro do handler, cada requisição
 * reconstruiria o grafo de dependências.
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
   * `/leads`… sem prefixo. Esta linha é exatamente a reescrita que o proxy do
   * Vite faz em desenvolvimento (ver `vite.config.ts`), e é o que mantém
   * navegador e API na mesma origem — sem isso os cookies `httpOnly` de sessão
   * exigiriam CORS com credenciais e `SameSite=None` (ADR-0004).
   */
  req.url = (req.url ?? '/').replace(/^\/api/, '') || '/';

  app.server.emit('request', req, res);
}
