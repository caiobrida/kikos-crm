import { useNavigate } from 'react-router';
import { useDashboardSummary } from '../lib/dashboard';
import { dealCountLabel } from '../lib/deals';
import { Alert } from '../ui/Alert';
import { DashboardDealsTable } from './DashboardDealsTable';
import { OwnerResultChart } from './OwnerResultChart';
import { PipelineChart } from './PipelineChart';

/*
 * O Dashboard — a tela em que o gestor cai ao entrar no CRM.
 *
 * Ela responde a duas perguntas de relance e oferece uma terceira coisa: onde
 * está parado o valor do funil, como cada vendedor está indo, e a tabela por
 * onde se desce do panorama ao negócio concreto.
 *
 * **Os dois gráficos vêm de uma resposta só** (`GET /dashboard/summary`), de uma
 * agregação só, num instante só do banco. Não é economia de requisição: eles
 * olham dimensões diferentes do mesmo dado — a coluna em que o negócio está e o
 * resultado com que ele terminou (ADR-0003) —, e duas leituras separadas
 * poderiam pegar o banco em instantes diferentes e mostrar um negócio já
 * encerrado que ainda não foi ganho por ninguém. Os dois gráficos não podem se
 * contradizer, e é a leitura única que garante isso.
 *
 * **A tabela tem consulta própria**, e é de propósito: ela tem busca, ordenação e
 * página, e os gráficos não têm nenhuma das três. Ela reusa `GET /deals`, o mesmo
 * endpoint do "carregar mais" do board.
 *
 * Abrir um negócio pela tabela **navega para o endereço do negócio**
 * (`/negocios/:dealId`), que é o mesmo modal do board por cima do funil. Um
 * negócio tem um endereço só: um `/dashboard/:dealId` paralelo daria duas
 * respostas para "qual é o link deste negócio?", e o spec pede que esse link
 * seja compartilhável — o que só significa alguma coisa se for único.
 */

export const DashboardPage = () => {
  const summary = useDashboardSummary();
  const navigate = useNavigate();

  const panorama = summary.data;
  const total = panorama?.pipeline.reduce((sum, tally) => sum + tally.count, 0);

  return (
    <div className="mx-auto max-w-7xl px-8 py-10">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold text-ink">Dashboard</h1>
        <p className="mt-1 text-sm text-ink-muted">
          {total === undefined
            ? 'Carregando o panorama…'
            : `${dealCountLabel(total)} no funil, contando os já encerrados.`}
        </p>
      </header>

      {summary.isError ? (
        <Alert>Não foi possível carregar o panorama do funil. Tente de novo.</Alert>
      ) : null}

      {/*
        Os dois gráficos lado a lado em tela larga, empilhados em tela estreita.
        Espremê-los em duas colunas numa tela pequena é o que transforma barra em
        tarja e rótulo em reticências.
      */}
      <div className="mb-6 grid gap-6 xl:grid-cols-2">
        {panorama === undefined ? (
          <>
            <ChartPlaceholder />
            <ChartPlaceholder />
          </>
        ) : (
          <>
            <PipelineChart pipeline={panorama.pipeline} />
            <OwnerResultChart owners={panorama.owners} />
          </>
        )}
      </div>

      <DashboardDealsTable onOpen={(deal) => void navigate(`/negocios/${deal.id}`)} />
    </div>
  );
};

/**
 * O lugar de um gráfico enquanto ele carrega.
 *
 * Uma moldura da mesma altura, e não um esqueleto piscando: os cards já ocupam o
 * espaço que vão ocupar, então a tabela abaixo não pula de lugar quando os
 * gráficos chegam.
 */
const ChartPlaceholder = () => (
  <div className="flex h-80 items-center justify-center rounded-card bg-surface-900 text-sm text-ink-faint ring-1 ring-surface-700">
    Carregando o funil…
  </div>
);
