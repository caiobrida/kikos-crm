import type { OwnerTally } from '@kikos/domain';
import {
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { DEAL_RESULT_LABELS } from '../lib/labels';
import { formatBRL } from '../lib/money';
import { ChartCard, ChartLegend, ChartTooltip, ChartTooltipRow } from '../ui/chart';
import {
  CATEGORY_AXIS_PROPS,
  CHART_BAR_RADIUS,
  CHART_BAR_SIZE,
  CHART_CURSOR,
  CHART_GRID,
  CHART_TEXT,
  RESULT_TONES,
  VALUE_AXIS_PROPS,
} from '../ui/chartTokens';

/*
 * Ganhos e perdidos, responsável a responsável.
 *
 * **A barra conta negócios, e não soma reais**, ao contrário do gráfico do
 * funil. É a leitura que a pergunta pede — "quantos ele fechou, e quantos ele
 * perdeu" —, e é também a que deixa os dois gráficos verificáveis um contra o
 * outro: a soma de todas as barras daqui é exatamente o número da coluna Fechado
 * do outro. O valor de cada lado está no balão do hover, para quem quiser descer
 * do volume ao dinheiro.
 *
 * **É por Owner, não por Seller** (ver CONTEXT.md e o Schema `OwnerTally`): o
 * eixo lista quem recebeu negócio, qualquer que seja o papel da conta. O título
 * diz "vendedor" porque é o rótulo em português do mesmo verbete — "Vendedor
 * Responsável".
 *
 * **O time inteiro aparece, inclusive quem ainda não fechou nada.** Uma linha
 * vazia é uma resposta — num gráfico de barras ancorado no zero, barra nenhuma
 * *é* o zero —, enquanto uma linha ausente é um silêncio que se confunde com
 * "essa pessoa não existe". O subtítulo diz isso em texto, para que a leitura
 * não dependa de reconhecer a convenção. A ordem é alfabética e não um ranking:
 * uma barra que troca de lugar a cada venda obriga a reler o eixo inteiro para
 * achar a pessoa que se estava acompanhando.
 *
 * A dupla verde/vermelho é a mais arriscada que existe para quem não distingue
 * as duas cores, e por isso ela **nunca** carrega sozinha o significado: as duas
 * barras vão rotuladas com o número, a legenda está acima do desenho, e a ordem
 * dentro do par é sempre a mesma. Os degraus escolhidos estão explicados em
 * `ui/chartTokens.ts`.
 */

interface OwnerRow {
  readonly ownerId: string;
  readonly name: string;
  readonly won: number;
  readonly lost: number;
  readonly wonValueInCents: number;
  readonly lostValueInCents: number;
}

/** Quanto espaço o nome do responsável ocupa à esquerda do desenho, em px. */
const NAME_AXIS_WIDTH = 140;

/** Quanto uma faixa de responsável ocupa: duas barras, o vão entre elas, e ar. */
const ROW_HEIGHT = 56;

/** A faixa do eixo de quantidades, embaixo do desenho. */
const AXIS_BAND = 28;

/** O ar à direita, para o rótulo da ponta da barra não encostar na borda. */
const LABEL_ROOM = 28;

export interface OwnerResultChartProps {
  readonly owners: readonly OwnerTally[];
}

export const OwnerResultChart = ({ owners }: OwnerResultChartProps) => {
  const rows: readonly OwnerRow[] = owners.map((tally) => ({
    ownerId: tally.owner.id,
    name: tally.owner.name,
    won: tally.won.count,
    lost: tally.lost.count,
    wonValueInCents: tally.won.valueInCents,
    lostValueInCents: tally.lost.valueInCents,
  }));

  const isEmpty = rows.every((row) => row.won === 0 && row.lost === 0);

  return (
    <ChartCard
      title="Ganhos e perdidos por vendedor"
      subtitle="Quantos negócios cada responsável encerrou — sem barra, nenhum. Passe o cursor para ver o valor de cada lado."
    >
      <ChartLegend
        items={[
          { label: DEAL_RESULT_LABELS.WON, tone: RESULT_TONES.WON },
          { label: DEAL_RESULT_LABELS.LOST, tone: RESULT_TONES.LOST },
        ]}
      />

      {isEmpty ? (
        <p className="py-10 text-center text-sm text-ink-muted">
          Nenhum negócio encerrado ainda. Marque um negócio como ganho ou perdido para o
          comparativo começar.
        </p>
      ) : (
        /*
          A altura cresce com o time, em vez de ser fixa: com uma altura fixa, um
          time maior espremeria as barras até virarem tarjas — e um time menor
          deixaria metade do card vazio. A faixa do eixo entra na conta para que
          as marcas de quantidade não fiquem de fora do card.
        */
        <ResponsiveContainer width="100%" height={rows.length * ROW_HEIGHT + AXIS_BAND}>
          <BarChart
            data={[...rows]}
            layout="vertical"
            margin={{ top: 0, right: LABEL_ROOM, bottom: 0, left: 0 }}
            /*
             * Os dois espaçamentos que separam as barras. `barGap` é o vão de 2px
             * entre o ganho e o perdido do mesmo responsável — é o fundo
             * aparecendo que separa as duas, e não um contorno desenhado em volta
             * delas. `barCategoryGap` é o ar entre uma pessoa e a seguinte.
             */
            barGap={2}
            barCategoryGap="35%"
          >
            <CartesianGrid horizontal={false} stroke={CHART_GRID} />

            <XAxis
              {...VALUE_AXIS_PROPS}
              // Meio negócio não existe: sem isto o eixo inventa marcas em 0,5
              // quando o time todo fechou dois.
              allowDecimals={false}
            />

            <YAxis
              {...CATEGORY_AXIS_PROPS}
              /*
               * O identificador, e não o nome: dois homônimos no time
               * empilhariam as barras numa faixa só. O nome entra pelo
               * `tickFormatter`, que é o que a tela mostra.
               */
              dataKey="ownerId"
              width={NAME_AXIS_WIDTH}
              tickFormatter={(ownerId: string) =>
                rows.find((row) => row.ownerId === ownerId)?.name ?? ''
              }
            />

            <Tooltip
              cursor={{ fill: CHART_CURSOR }}
              content={({ active, label }) => {
                const row = rows.find((candidate) => candidate.ownerId === label);
                if (active !== true || row === undefined) return null;

                return (
                  <ChartTooltip title={row.name}>
                    <ChartTooltipRow
                      label={DEAL_RESULT_LABELS.WON}
                      value={`${String(row.won)} · ${formatBRL(row.wonValueInCents)}`}
                      swatch={RESULT_TONES.WON}
                    />
                    <ChartTooltipRow
                      label={DEAL_RESULT_LABELS.LOST}
                      value={`${String(row.lost)} · ${formatBRL(row.lostValueInCents)}`}
                      swatch={RESULT_TONES.LOST}
                    />
                  </ChartTooltip>
                );
              }}
            />

            {/*
              Ganho vem primeiro, sempre. A ordem dentro do par é o terceiro
              canal de identidade, depois do rótulo e da legenda — e é o que
              ainda funciona quando as duas cores são a mesma para quem olha.
            */}
            <Bar
              dataKey="won"
              name={DEAL_RESULT_LABELS.WON}
              fill={RESULT_TONES.WON}
              barSize={CHART_BAR_SIZE}
              radius={CHART_BAR_RADIUS}
              /*
               * Sem animação: o gráfico é redesenhado a cada escrita no funil, e
               * uma barra crescendo do zero a cada invalidação é movimento que
               * não corresponde a nada que aconteceu.
               */
              isAnimationActive={false}
            >
              <LabelList dataKey="won" position="right" {...CHART_TEXT} />
            </Bar>

            <Bar
              dataKey="lost"
              name={DEAL_RESULT_LABELS.LOST}
              fill={RESULT_TONES.LOST}
              barSize={CHART_BAR_SIZE}
              radius={CHART_BAR_RADIUS}
              isAnimationActive={false}
            >
              <LabelList dataKey="lost" position="right" {...CHART_TEXT} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}
    </ChartCard>
  );
};
