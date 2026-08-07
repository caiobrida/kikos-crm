import type { DealBoard, DealId, DealListItem, DealPage, DealStage } from '@kikos/domain';

/*
 * O board depois do gesto, antes da resposta.
 *
 * Este é o **único lugar do CRM em que a tela recorta dados**, e a exceção tem
 * um motivo estreito: o vendedor arrasta um card e ele precisa estar na outra
 * coluna no instante do gesto, não um ida-e-volta depois. O que estas funções
 * produzem é uma previsão do que o servidor vai responder — e por isso elas
 * imitam o servidor de perto: o card entra no topo da coluna, porque ela vem do
 * mais recente para o mais antigo, e os dois contadores se ajustam, porque o
 * total é do recorte inteiro e não do que está na tela.
 *
 * Sendo puras, elas são exercitadas sem React, sem cache e sem servidor. É o
 * tipo de código em que um erro custa caro para descobrir: um card duplicado ou
 * um contador errado dura o tempo de uma requisição e ninguém consegue
 * reproduzir depois.
 */

/**
 * O board com o negócio já na coluna de destino.
 *
 * O card é removido de **todas** as colunas e inserido no topo da de destino.
 * Remover de todas, e não só da origem, é o que impede o card de aparecer duas
 * vezes quando o board em cache está um passo atrás do que se está arrastando.
 *
 * Os contadores não olham para as listas: quem diz de que coluna o negócio saiu
 * é o `stage` dele. Um card carregado pelo "carregar mais" não está na leva que
 * o board trouxe, e mesmo assim precisa descontar do total da origem.
 */
export const boardWithDealMoved = (
  board: DealBoard | undefined,
  deal: DealListItem,
  to: DealStage,
): DealBoard | undefined => {
  if (board === undefined) return undefined;
  if (deal.stage === to) return board;

  const moved: DealListItem = { ...deal, stage: to };

  return {
    columns: board.columns.map((column) => {
      const deals = column.deals.filter((candidate) => candidate.id !== deal.id);

      if (column.stage === to) {
        return { ...column, total: column.total + 1, deals: [moved, ...deals] };
      }

      if (column.stage === deal.stage) {
        // `Math.max` porque o contador é do servidor e a subtração é um palpite:
        // um total desencontrado do card arrastado nunca pode virar "-1
        // negócios" no cabeçalho.
        return { ...column, total: Math.max(0, column.total - 1), deals };
      }

      return column;
    }),
  };
};

/**
 * Uma página do "carregar mais" sem o negócio que saiu da coluna.
 *
 * As páginas seguintes de uma coluna cheia são consultas próprias, com cache
 * próprio, e o movimento precisa alcançá-las: senão o card arrastado da página
 * 2 continuaria desenhado na origem enquanto já aparece no destino.
 *
 * A página de destino não recebe nada — o card entra pela primeira leva da
 * coluna, no board. Empurrá-lo também para uma página seguinte o mostraria duas
 * vezes.
 */
export const pageWithoutDeal = (
  page: DealPage | undefined,
  id: DealId,
): DealPage | undefined => {
  if (page === undefined) return undefined;

  const data = page.data.filter((deal) => deal.id !== id);
  if (data.length === page.data.length) return page;

  return { ...page, data, total: Math.max(0, page.total - 1) };
};
