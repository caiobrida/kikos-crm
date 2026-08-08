import { Schema } from 'effect';
import { DealStage } from './enums';
import { TotalInCents } from './money';
import { UserSummary } from './user';

/*
 * O que `GET /dashboard/summary` responde: o funil visto por duas dimensões
 * diferentes do mesmo dado.
 *
 * **As duas leituras não podem se contradizer**, e é por isso que elas vêm numa
 * resposta só, de uma agregação só. Um negócio encerrado tem estágio `CLOSED`
 * *e* resultado ganho ou perdido — as duas dimensões de ADR-0003 —, então ele
 * aparece nas duas metades daqui: uma vez na coluna Fechado do funil, uma vez na
 * barra do responsável que o fechou. Não é dupla contagem, é a mesma linha
 * respondendo a duas perguntas; o que seria erro é as duas metades descreverem
 * instantes diferentes do banco, e é a agregação única que o impede.
 *
 * A soma disso vira uma invariante verificável, e ela é o teste mais importante
 * desta fatia:
 *
 *     pipeline[CLOSED].count === Σ (owners[i].won.count + owners[i].lost.count)
 *
 * Nada aqui é filtrado por busca ou por vendedor: o dashboard é o panorama do
 * funil inteiro. Quem recorta é a tabela abaixo dos gráficos, que reusa
 * `GET /deals` — a mesma listagem do "carregar mais" do board.
 */

/**
 * Quantos negócios, e quanto valor somado — o par que os dois gráficos leem.
 *
 * Os dois andam juntos porque respondem à mesma pergunta por dois lados:
 * "quanto valor está parado aqui" e "em quantos negócios ele está". Um estágio
 * com um negócio de R$ 500.000,00 e outro com dez de R$ 50.000,00 pesam o mesmo
 * no funil e pedem esforços completamente diferentes do time.
 */
export const DealTally = Schema.Struct({
  count: Schema.Int,
  /** Soma em centavos, sem o teto de um valor individual. Ver `money.ts`. */
  valueInCents: TotalInCents,
});

export type DealTally = typeof DealTally.Type;

/**
 * Uma coluna do funil, contada e somada.
 *
 * Vêm as cinco, na ordem de `DEAL_STAGES`, e **inclusive as vazias** — pelo mesmo
 * motivo que o board devolve a coluna vazia: um estágio sem negócio nenhum
 * também é informação sobre o funil, e um gráfico que omitisse a barra mudaria
 * de forma a cada leitura.
 *
 * `CLOSED` está entre elas, e é o que faz os números do gráfico baterem com os
 * contadores do board — que também mostra as cinco colunas.
 */
export const StageTally = Schema.Struct({
  stage: DealStage,
  ...DealTally.fields,
});

export type StageTally = typeof StageTally.Type;

/**
 * O que um Owner fechou: quantos negócios ele ganhou e quantos perdeu, com o
 * valor de cada lado.
 *
 * **É por Owner, e não por Seller**, e a distinção é a do CONTEXT.md: Seller é
 * um User com `role` igual a `SELLER`; Owner é o User a quem o negócio está
 * atribuído, qualquer que seja o papel dele. O gráfico compara quem recebeu
 * negócio, e o gestor que fecha uma venda é um deles. A tela chama isso de
 * "vendedor responsável", que é o rótulo em português do mesmo verbete.
 *
 * **Vem o time inteiro**, e não só quem fechou alguma coisa. Duas razões, e as
 * duas importam:
 *
 * 1. quem não fechou nada é justamente o que um gráfico de performance precisa
 *    mostrar — uma linha vazia é uma resposta, uma linha ausente é um silêncio;
 * 2. omitir alguém quebraria a invariante do topo deste arquivo. Um negócio
 *    fechado por um User fora da lista sumiria deste gráfico e continuaria
 *    contado na coluna Fechado — os dois passariam a discordar sobre o mesmo
 *    negócio.
 *
 * Por isso a lista é a de `GET /users` sem filtro de papel, e não a de
 * `?role=SELLER`: um Deal pertence a um User (ADR-0001).
 *
 * `OPEN` não tem lugar aqui: o gráfico compara resultados, e em aberto é o
 * estado de quem ainda não terminou — quem está no funil já está contado no
 * `pipeline`.
 */
export const OwnerTally = Schema.Struct({
  owner: UserSummary,
  won: DealTally,
  lost: DealTally,
});

export type OwnerTally = typeof OwnerTally.Type;

/** O panorama inteiro — o que `GET /dashboard/summary` responde. */
export const DashboardSummary = Schema.Struct({
  /** As cinco colunas do funil, na ordem de `DEAL_STAGES`. */
  pipeline: Schema.Array(StageTally),
  /** O time inteiro, em ordem alfabética — a mesma de `GET /users`. */
  owners: Schema.Array(OwnerTally),
});

export type DashboardSummary = typeof DashboardSummary.Type;
export type DashboardSummaryEncoded = typeof DashboardSummary.Encoded;

/** O par zerado — o Owner que ainda não fechou negócio desse lado. */
export const NO_DEALS: DealTally = { count: 0, valueInCents: 0 };
