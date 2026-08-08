import type { ClosedDealResult, DealStage } from '@kikos/domain';

/*
 * As cores e as medidas dos gráficos do dashboard.
 *
 * **Nada aqui foi escolhido a olho.** As duas famílias abaixo passaram por um
 * validador de paleta, rodado contra a superfície do card em que os gráficos são
 * desenhados, conferindo claridade, croma, contraste e — o que mais importa
 * aqui — separação sob daltonismo. O que cada escolha custou está escrito junto
 * dela, porque a próxima pessoa a mexer numa dessas cores precisa saber o que a
 * prende.
 *
 * Os valores são as variáveis do tema (`index.css`), e não hex repetido: SVG
 * aceita `var(--…)` em `fill` como CSS aceita, e é o que mantém o gráfico e o
 * resto da interface pintando com a mesma paleta.
 *
 * Elas moram num módulo separado dos componentes de propósito: um arquivo que
 * exporta componentes **e** tabelas de constante perde o hot reload do Vite, que
 * só sabe trocar um módulo em pé quando tudo que sai dele é componente.
 */

/**
 * A rampa do funil: **um degrau por estágio, claro no começo e escuro no fim.**
 *
 * Estágio é uma dimensão *ordinal* — trocar a ordem de "Novo" e "Negociação"
 * mudaria o significado, ao contrário de trocar dois vendedores de lugar. Por
 * isso ela é uma cor só em cinco claridades, e não cinco cores diferentes: a
 * ordem do funil aparece na própria tinta, e não só no rótulo do eixo. Cinco
 * matizes distintos aqui gastariam o canal de identidade para recontar uma
 * ordem que o eixo já conta.
 *
 * A direção — claro no `NEW`, escuro no `CLOSED` — acompanha o que o funil faz:
 * o topo é onde tudo entra, e o gráfico escurece conforme o negócio caminha para
 * a saída. De quebra, num tema escuro isso põe o brilho onde há o que fazer e
 * deixa a coluna Fechado, que é terminal, como a mais discreta.
 *
 * Os degraus são 100/300/500/700/800 do laranja, e o pulo de dois não é
 * estético: com degraus vizinhos (300/400/500…) a diferença de claridade fica
 * abaixo do que o olho separa, e a rampa deixa de comunicar ordem nenhuma. As
 * duas pontas foram acrescentadas ao tema justamente para fechar esta rampa.
 *
 * **O degrau mais escuro fica em ~2,5:1 contra a superfície do card**, abaixo do
 * 3:1 que se pede de uma marca sozinha. É deliberado, e é o preço de caber cinco
 * degraus separados numa família só: escurecer menos aproximaria os degraus,
 * clarear o fim inverteria a leitura do funil. O que paga por isso é a regra de
 * que nenhum valor depende da barra ser vista — cada uma leva o número escrito
 * ao lado, o eixo carrega a escala, e a tabela de negócios embaixo dos gráficos
 * tem as mesmas linhas em texto.
 */
export const STAGE_RAMP: Record<DealStage, string> = {
  NEW: 'var(--color-brand-100)',
  CONTACT_MADE: 'var(--color-brand-300)',
  PROPOSAL_SENT: 'var(--color-brand-500)',
  NEGOTIATION: 'var(--color-brand-700)',
  CLOSED: 'var(--color-brand-800)',
};

/**
 * As duas cores do desfecho — verde de ganho, vermelho de perda.
 *
 * Elas não são "as séries 1 e 2" de uma paleta: são as cores reservadas do
 * produto, as mesmas do selo de resultado e do card do board, e significam a
 * mesma coisa em toda a interface.
 *
 * **Verde e vermelho lado a lado é o par mais arriscado que existe**, e é por
 * isso que os degraus são 400 e 500 em vez dos 500 dos selos: o par
 * `won-500 / lost-500` colapsa sob deuteranopia — as duas barras viram quase a
 * mesma cor —, e `won-400 / lost-500` abre a distância o suficiente para que a
 * diferença sobreviva. O número saiu do validador, não do olho.
 *
 * Mesmo assim a cor **nunca** é o único canal: as duas barras vão rotuladas com
 * o número, a legenda repete a dupla, e a ordem dentro do grupo é sempre a
 * mesma. Quem não distingue as cores lê o gráfico pelo texto.
 */
export const RESULT_TONES: Record<ClosedDealResult, string> = {
  WON: 'var(--color-won-400)',
  LOST: 'var(--color-lost-500)',
};

/** A grade e os eixos: um passo acima da superfície, e nunca tracejados. */
export const CHART_GRID = 'var(--color-surface-700)';

/** A faixa que acende sob o cursor — indica a linha, não acrescenta dado. */
export const CHART_CURSOR = 'var(--color-surface-800)';

/**
 * Como todo texto desenhado dentro de um gráfico se veste: marca de eixo,
 * nome de categoria e rótulo colado na ponta da barra.
 *
 * Um token só para os três, e **nunca a cor da série**: um laranja claro ou um
 * verde são ilegíveis como letra sobre a superfície, e a identidade já vem da
 * barra ao lado do texto. O tamanho é o `text-xs` do resto da interface.
 */
export const CHART_TEXT = { fill: 'var(--color-ink-muted)', fontSize: 12 } as const;

/**
 * O eixo dos números — o horizontal, nos dois gráficos, porque as barras deles
 * crescem para a direita.
 *
 * Sem risquinho em cada marca (`tickLine`): a grade já leva o olho até o valor,
 * e o traço a mais é ruído. A linha de base fica, porque é dela que as barras
 * saem.
 */
export const VALUE_AXIS_PROPS = {
  type: 'number',
  tickLine: false,
  axisLine: { stroke: CHART_GRID },
  tick: CHART_TEXT,
} as const;

/**
 * O eixo dos nomes — o vertical.
 *
 * Aqui nem risquinho nem linha de base: o eixo das categorias não mede nada, e
 * uma régua desenhada ao lado dos nomes sugere uma escala que não existe.
 */
export const CATEGORY_AXIS_PROPS = {
  type: 'category',
  tickLine: false,
  axisLine: false,
  tick: CHART_TEXT,
} as const;

/**
 * Quão grossa uma barra pode ficar.
 *
 * Um teto, e não uma altura: a barra nunca preenche a faixa que lhe cabe, e a
 * sobra é o ar que separa uma da outra. Barra gorda e saturada é o que faz um
 * gráfico parecer gritado.
 */
export const CHART_BAR_SIZE = 18;

/**
 * O canto arredondado fica na ponta que cresce; a base continua reta.
 *
 * A ordem é a do SVG do Recharts — superior-esquerdo, superior-direito,
 * inferior-direito, inferior-esquerdo —, e como as barras destes dois gráficos
 * crescem para a direita, são os dois da direita que arredondam.
 */
export const CHART_BAR_RADIUS: [number, number, number, number] = [0, 4, 4, 0];
