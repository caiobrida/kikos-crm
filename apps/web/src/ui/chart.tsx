import type { ReactNode } from 'react';

/*
 * A moldura e a chrome dos gráficos do dashboard — tudo que não é a barra.
 *
 * As cores e as medidas moram em `chartTokens.ts`, ao lado; aqui só o que
 * desenha. O que junta estas peças não é o número de chamadores — `ChartLegend`
 * só serve ao gráfico de resultados, porque é o único com duas séries — e sim o
 * fato de todas substituírem um desenho que a biblioteca de gráficos faria por
 * conta própria, com cores e tipografia que não são as do produto.
 */

/**
 * O balão do hover, na casca dos outros elementos elevados da interface.
 *
 * Ele **acrescenta**, nunca esconde: todo número que aparece aqui também está
 * num rótulo ao lado da barra, no eixo, ou na tabela abaixo dos gráficos. Um
 * valor que só existisse no balão ficaria fora do alcance de quem não usa mouse.
 */
export const ChartTooltip = ({
  title,
  children,
}: {
  readonly title: string;
  readonly children: ReactNode;
}) => (
  <div className="rounded-lg bg-surface-800 px-3 py-2 text-xs shadow-lg ring-1 ring-surface-600">
    <p className="font-medium text-ink">{title}</p>
    <dl className="mt-1.5 flex flex-col gap-1 text-ink-muted">{children}</dl>
  </div>
);

/** Uma linha do balão: o que é, e quanto. */
export const ChartTooltipRow = ({
  label,
  value,
  swatch,
}: {
  readonly label: string;
  readonly value: string;
  /** A cor da série, como um ponto ao lado do texto — nunca no texto. */
  readonly swatch?: string;
}) => (
  <div className="flex items-center gap-2 whitespace-nowrap">
    {swatch === undefined ? null : (
      <span
        aria-hidden="true"
        className="size-2 shrink-0 rounded-full"
        style={{ backgroundColor: swatch }}
      />
    )}
    <dt>{label}</dt>
    <dd className="ml-auto font-medium text-ink">{value}</dd>
  </div>
);

/**
 * A moldura de um gráfico: título, subtítulo e o desenho.
 *
 * O subtítulo diz **o que a barra mede**, e não é enfeite: sem ele, um gráfico
 * de funil com barras de tamanhos diferentes pode ser lido como quantidade
 * quando é valor — e as duas leituras levam a decisões opostas.
 */
export const ChartCard = ({
  title,
  subtitle,
  children,
}: {
  readonly title: string;
  readonly subtitle: string;
  readonly children: ReactNode;
}) => (
  <section className="rounded-card bg-surface-900 p-5 ring-1 ring-surface-700">
    <h2 className="text-sm font-semibold text-ink">{title}</h2>
    <p className="mt-1 text-xs text-ink-muted">{subtitle}</p>

    <div className="mt-5">{children}</div>
  </section>
);

/**
 * A legenda, escrita à mão em vez da que a biblioteca desenha.
 *
 * Duas razões: ela precisa vestir os mesmos tokens de texto do resto da
 * interface — a cor da série mora no ponto ao lado, nunca na letra —, e precisa
 * ficar **acima** do desenho, onde é lida antes das barras e não depois delas.
 */
export const ChartLegend = ({
  items,
}: {
  readonly items: readonly { readonly label: string; readonly tone: string }[];
}) => (
  <ul className="mb-4 flex flex-wrap items-center gap-4">
    {items.map((item) => (
      <li key={item.label} className="flex items-center gap-2 text-xs text-ink-muted">
        <span
          aria-hidden="true"
          className="size-2.5 rounded-full"
          style={{ backgroundColor: item.tone }}
        />
        {item.label}
      </li>
    ))}
  </ul>
);
