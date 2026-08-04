/*
 * O ponto de entrada do pacote de domínio.
 *
 * Regra que não se quebra: nada aqui dentro pode tocar Node, Prisma ou I/O.
 * O pacote é importado pelo navegador. O `tsconfig.json` do pacote não carrega
 * os tipos do Node e o ESLint barra os imports de servidor — as duas travas
 * existem para que a regra falhe no CI em vez de falhar no build do Vite.
 */
export * from './enums';
export * from './health';
