/*
 * O ponto de entrada do pacote de domínio.
 *
 * Regra que não se quebra: nada aqui dentro pode tocar Node, Prisma ou I/O.
 * O pacote é importado pelo navegador. O `tsconfig.json` do pacote não carrega
 * os tipos do Node e o ESLint barra os imports de servidor — as duas travas
 * existem para que a regra falhe no CI em vez de falhar no build do Vite.
 */
export * from './auth';
export * from './choice';
export * from './comment';
export * from './dates';
export * from './deal';
export * from './enums';
export * from './errors';
export * from './health';
export * from './ids';
export * from './lead';
export * from './money';
export * from './pagination';
export * from './pipeline';
export * from './text';
export * from './user';
