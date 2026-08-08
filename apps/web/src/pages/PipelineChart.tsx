import type { DealStage, StageTally } from '@kikos/domain';
import {
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
  Rectangle,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type BarShapeProps,
} from 'recharts';
import { dealCountLabel } from '../lib/deals';
import { DEAL_STAGE_LABELS } from '../lib/labels';
import { compactBRL, formatBRL } from '../lib/money';
import { ChartCard, ChartTooltip, ChartTooltipRow } from '../ui/chart';
import {
  CATEGORY_AXIS_PROPS,
  CHART_BAR_RADIUS,
  CHART_BAR_SIZE,
  CHART_CURSOR,
  CHART_GRID,
  CHART_TEXT,
  STAGE_RAMP,
  VALUE_AXIS_PROPS,
} from '../ui/chartTokens';

/*
 * Onde está parado o valor do funil.
 *
 * **A barra mede valor, e o rótulo ao lado dela diz a quantidade.** As duas
 * medidas estão no mesmo desenho, mas só uma delas tem eixo — e isso é
 * deliberado: um gráfico com duas escalas verticais diferentes inventa uma
 * correspondência que não existe nos dados, e é a forma mais comum de um painel
 * mentir sem nenhum número errado. Aqui o comprimento responde "quanto valor", o
 * rótulo responde "em quantos negócios", e o balão do hover repete os dois por
 * extenso.
 *
 * As barras são horizontais porque os nomes dos estágios são longos: em colunas
 * verticais, "Proposta enviada" ou vira duas linhas ou vira uma diagonal.
 *
 * Os números batem com os contadores do board por construção: as duas telas
 * contam a mesma coluna do mesmo jeito, no servidor, e as duas excluem o que foi
 * removido — o filtro mora na camada de repositório (ver o spec).
 */

interface PipelineRow {
  readonly stage: DealStage;
  readonly count: number;
  readonly valueInCents: number;
  /** "3 negócios", já escrito: é o rótulo que fica ao lado da barra. */
  readonly countLabel: string;
}

/**
 * Quanto espaço o rótulo do estágio ocupa à esquerda do desenho, em px.
 *
 * Dimensionado pelo mais longo — "Proposta enviada" —, com folga: apertado, o
 * eixo quebra o rótulo em duas linhas e a barra deixa de ficar na altura do
 * nome dela.
 */
const STAGE_AXIS_WIDTH = 132;

/** E quanto sobra à direita para o rótulo da quantidade não ser cortado. */
const COUNT_LABEL_ROOM = 88;

/**
 * Uma barra do funil, pintada pelo estágio que ela representa.
 *
 * O `shape` existe porque a cor varia **por barra** e não por série: cada
 * estágio é um degrau da rampa ordinal (ver `STAGE_RAMP`). O componente `Cell`
 * do Recharts faria o mesmo, mas está marcado para sair na versão 4 — e a
 * própria biblioteca aponta o `shape` como o caminho.
 *
 * Só as quatro medidas do retângulo são repassadas, e não o objeto inteiro que
 * o Recharts entrega: o resto são dados de layout que virariam atributos
 * inválidos no SVG.
 */
const StageBar = (props: BarShapeProps) => {
  const row = props.payload as PipelineRow | undefined;

  return (
    <Rectangle
      x={props.x}
      y={props.y}
      width={props.width}
      height={props.height}
      radius={CHART_BAR_RADIUS}
      {...(row === undefined ? {} : { fill: STAGE_RAMP[row.stage] })}
    />
  );
};

export interface PipelineChartProps {
  readonly pipeline: readonly StageTally[];
}

export const PipelineChart = ({ pipeline }: PipelineChartProps) => {
  const rows: readonly PipelineRow[] = pipeline.map((tally) => ({
    stage: tally.stage,
    count: tally.count,
    valueInCents: tally.valueInCents,
    countLabel: dealCountLabel(tally.count),
  }));

  const isEmpty = rows.every((row) => row.count === 0);

  return (
    <ChartCard
      title="Valor por estágio do funil"
      subtitle="A barra é o valor somado da coluna; o rótulo ao lado, quantos negócios a compõem."
    >
      {isEmpty ? (
        <p className="py-10 text-center text-sm text-ink-muted">
          Nenhum negócio no funil ainda. Cadastre um negócio para o funil ganhar forma.
        </p>
      ) : (
        /*
          A altura cobre o desenho **e** a faixa do eixo de valores embaixo dele.
          Uma altura que só coubesse o desenho empurraria as marcas do eixo para
          fora e deixaria o card com uma barrinha de rolagem própria.
        */
        <ResponsiveContainer width="100%" height={252}>
          <BarChart
            data={[...rows]}
            layout="vertical"
            margin={{ top: 0, right: COUNT_LABEL_ROOM, bottom: 0, left: 0 }}
          >
            {/* Só as linhas do eixo de valores: as horizontais separariam
                estágios que os próprios rótulos já separam. */}
            <CartesianGrid horizontal={false} stroke={CHART_GRID} />

            <XAxis {...VALUE_AXIS_PROPS} tickFormatter={compactBRL} />

            <YAxis
              {...CATEGORY_AXIS_PROPS}
              dataKey="stage"
              width={STAGE_AXIS_WIDTH}
              tickFormatter={(stage: DealStage) => DEAL_STAGE_LABELS[stage]}
            />

            <Tooltip
              // A faixa que acende sob o cursor é a superfície um passo acima,
              // e não a cor da série: ela indica a linha, não acrescenta dado.
              cursor={{ fill: CHART_CURSOR }}
              content={({ active, label }) => {
                const row = rows.find((candidate) => candidate.stage === label);
                if (active !== true || row === undefined) return null;

                return (
                  <ChartTooltip title={DEAL_STAGE_LABELS[row.stage]}>
                    <ChartTooltipRow
                      label="Valor somado"
                      value={formatBRL(row.valueInCents)}
                      swatch={STAGE_RAMP[row.stage]}
                    />
                    <ChartTooltipRow label="Negócios" value={String(row.count)} />
                  </ChartTooltip>
                );
              }}
            />

            <Bar
              dataKey="valueInCents"
              barSize={CHART_BAR_SIZE}
              shape={StageBar}
              /*
               * Sem animação: o gráfico é redesenhado a cada escrita no funil —
               * encerrar, remover, mover —, e uma barra crescendo do zero a cada
               * invalidação é movimento que não corresponde a nada que aconteceu.
               */
              isAnimationActive={false}
            >
              <LabelList dataKey="countLabel" position="right" {...CHART_TEXT} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}
    </ChartCard>
  );
};
