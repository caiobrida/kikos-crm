import {
  DEAL_STAGES,
  DealId,
  LeadId,
  UserId,
  type DealBoard,
  type DealListItem,
  type DealPage,
  type DealStage,
} from '@kikos/domain';
import { Schema } from 'effect';
import { describe, expect, it } from 'vitest';
import { boardWithDealMoved, pageWithoutDeal } from './board';

/*
 * O board como ele fica **antes** da resposta do servidor.
 *
 * Estas duas funções são o que faz o card pular de coluna na velocidade do
 * gesto, e são puras de propósito. Recortar dados no navegador é justamente o
 * que este CRM não faz; a exceção é o intervalo entre o gesto e a confirmação,
 * e mantê-la pura é o que permite exercitá-la sem React, sem cache e sem
 * servidor — que é onde um erro aqui seria caro, porque um card duplicado ou um
 * contador errado aparece por um instante e ninguém reproduz depois.
 */

/** Identificadores de teste: UUID de verdade, porque a marca só sai do Schema. */
const dealId = (n: number): DealId =>
  Schema.decodeSync(DealId)(`00000000-0000-4000-8000-${String(n).padStart(12, '0')}`);

const LEAD_ID = Schema.decodeSync(LeadId)('11111111-2222-4333-8444-000000000001');
const OWNER_ID = Schema.decodeSync(UserId)('33333333-4444-4555-8666-000000000002');

const card = (n: number, stage: DealStage): DealListItem => ({
  id: dealId(n),
  title: `Esteiras da unidade ${n}`,
  valueInCents: 1_250_000,
  stage,
  /*
   * Em aberto sempre: estas funções preveem o board **depois de um arrasto**, e
   * arrastar é o gesto que só existe entre estágios abertos. Encerrar não passa
   * por aqui — não tem escrita otimista, porque reabrir negócio não existe.
   */
  result: 'OPEN',
  lead: { id: LEAD_ID, name: 'Ana Beatriz Souza', company: 'Studio Corpo Livre' },
  owner: { id: OWNER_ID, name: 'Ana Paula Nogueira' },
});

/** As cinco colunas, com os cards distribuídos e o total de cada uma por fora. */
const boardOf = (
  columns: Partial<Record<DealStage, { deals: DealListItem[]; total?: number }>>,
): DealBoard => ({
  columns: DEAL_STAGES.map((stage) => {
    const column = columns[stage];
    return {
      stage,
      deals: column?.deals ?? [],
      total: column?.total ?? column?.deals.length ?? 0,
    };
  }),
});

/**
 * O movimento, com a garantia de que houve board. A função devolve
 * `DealBoard | undefined` porque o cache pode não ter carregado ainda; o caso
 * vazio tem teste próprio, e nos demais o `undefined` seria só ruído nas
 * asserções.
 */
const afterMoving = (board: DealBoard, deal: DealListItem, to: DealStage): DealBoard => {
  const after = boardWithDealMoved(board, deal, to);
  if (after === undefined) throw new Error('O movimento devolveu board nenhum.');
  return after;
};

const columnOf = (board: DealBoard, stage: DealStage) => {
  const column = board.columns.find((candidate) => candidate.stage === stage);
  if (column === undefined) throw new Error(`O board não tem a coluna ${stage}.`);
  return column;
};

const idsIn = (board: DealBoard, stage: DealStage): readonly DealId[] =>
  columnOf(board, stage).deals.map((deal) => deal.id);

describe('boardWithDealMoved', () => {
  const moving = card(1, 'NEW');

  it('tira o card da origem e o põe no topo do destino', () => {
    const before = boardOf({
      NEW: { deals: [moving, card(2, 'NEW')] },
      CONTACT_MADE: { deals: [card(3, 'CONTACT_MADE')] },
    });

    const after = afterMoving(before, moving, 'CONTACT_MADE');

    expect(idsIn(after, 'NEW')).toEqual([dealId(2)]);
    /*
     * No topo, e não no fim: a coluna vem do mais recente para o mais antigo, e
     * mover é o acontecimento mais recente do funil. É onde o servidor vai
     * devolvê-lo quando o board recarregar — a tela não inventa uma ordem que a
     * resposta seguinte desmentiria.
     */
    expect(idsIn(after, 'CONTACT_MADE')).toEqual([dealId(1), dealId(3)]);
  });

  it('marca o card com o estágio de destino', () => {
    const after = afterMoving(
      boardOf({ NEW: { deals: [moving] } }),
      moving,
      'NEGOTIATION',
    );

    // Sem isso o card continuaria dizendo de onde saiu, e arrastá-lo de novo
    // consultaria a regra de transição com a origem errada.
    expect(columnOf(after, 'NEGOTIATION').deals.at(0)?.stage).toBe('NEGOTIATION');
  });

  it('ajusta os contadores das duas colunas envolvidas', () => {
    const before = boardOf({
      // Uma coluna cheia: sete negócios, dois cards carregados.
      NEW: { deals: [moving, card(2, 'NEW')], total: 7 },
      CONTACT_MADE: { deals: [], total: 3 },
    });

    const after = afterMoving(before, moving, 'CONTACT_MADE');

    expect(columnOf(after, 'NEW').total).toBe(6);
    expect(columnOf(after, 'CONTACT_MADE').total).toBe(4);
  });

  it('não mexe nas colunas que ficaram de fora do movimento', () => {
    const before = boardOf({
      NEW: { deals: [moving] },
      PROPOSAL_SENT: { deals: [card(4, 'PROPOSAL_SENT')], total: 9 },
    });

    const after = afterMoving(before, moving, 'CONTACT_MADE');

    expect(columnOf(after, 'PROPOSAL_SENT')).toEqual(columnOf(before, 'PROPOSAL_SENT'));
  });

  it('conta certo o card que veio de uma página seguinte da coluna', () => {
    /*
     * O card arrastado pode ter chegado pelo "carregar mais", e aí ele não está
     * na leva que o board trouxe. O contador da origem precisa cair assim
     * mesmo: quem diz de onde o negócio saiu é o estágio dele, e não a presença
     * na lista.
     */
    const before = boardOf({
      NEW: { deals: [card(2, 'NEW')], total: 7 },
      CONTACT_MADE: { deals: [], total: 0 },
    });

    const after = afterMoving(before, moving, 'CONTACT_MADE');

    expect(columnOf(after, 'NEW').total).toBe(6);
    expect(idsIn(after, 'NEW')).toEqual([dealId(2)]);
    expect(idsIn(after, 'CONTACT_MADE')).toEqual([dealId(1)]);
  });

  it('deixa o board intacto quando ele ainda não carregou', () => {
    expect(boardWithDealMoved(undefined, moving, 'CONTACT_MADE')).toBeUndefined();
  });
});

describe('pageWithoutDeal', () => {
  const page: DealPage = {
    data: [card(1, 'NEW'), card(2, 'NEW')],
    page: 2,
    pageSize: 5,
    total: 7,
  };

  it('tira o card da página carregada e desconta o total', () => {
    // As páginas seguintes de uma coluna cheia são consultas próprias, e o
    // movimento precisa alcançá-las: senão o card fica na origem e no destino
    // ao mesmo tempo até a resposta do servidor chegar.
    const after = pageWithoutDeal(page, dealId(1));

    expect(after?.data.map((deal) => deal.id)).toEqual([dealId(2)]);
    expect(after?.total).toBe(6);
  });

  it('deixa a página como está quando o card não é dela', () => {
    expect(pageWithoutDeal(page, dealId(9))).toEqual(page);
  });

  it('deixa a página intacta quando ela ainda não carregou', () => {
    expect(pageWithoutDeal(undefined, dealId(1))).toBeUndefined();
  });
});
