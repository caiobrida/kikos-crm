import {
  STAGE_MOVE_REFUSALS,
  refuseStageMove,
  type DealListItem,
  type DealStage,
} from '@kikos/domain';
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { ApiError } from '../lib/api';
import { cn } from '../lib/cn';
import {
  INITIAL_BOARD_VIEW,
  boardViewKey,
  useBoard,
  useMoveDealStage,
  type BoardView,
} from '../lib/deals';
import { useDebouncedValue } from '../lib/useDebouncedValue';
import { useSellers } from '../lib/sellers';
import { Button } from '../ui/Button';
import { Input } from '../ui/Field';
import { OwnerFilter } from '../ui/OwnerFilter';
import { BoardColumn } from './BoardColumn';
import { CreateDealModal } from './CreateDealModal';
import { DealDetailModal } from './DealDetailModal';
import { DealPanel, PANEL_CLEARANCE } from './DealPanel';

/*
 * O board de Negócios.
 *
 * Vale aqui a mesma regra da lista de Leads: **a tela não recorta nada.** Não há
 * `filter`, `sort` nem `slice` sobre os dados neste arquivo. Busca e vendedor
 * viram query string, e o servidor devolve as cinco colunas já formadas, cada
 * uma com o seu total.
 *
 * A diferença para uma tabela é o que o kanban tem de próprio: as cinco colunas
 * abrem numa requisição só — "página 2 do board" não significa nada —, e é cada
 * coluna que carrega mais, sozinha, quando tem mais negócios do que coube na
 * primeira leva.
 *
 * O board é também o dono do arrasto. Três coisas moram aqui porque nenhuma
 * coluna sozinha as saberia: **qual card está no ar** (a coluna de destino
 * precisa saber de onde ele veio para consultar a regra), **como mover** (é uma
 * mutação só, para qualquer coluna) e **o motivo do movimento que não
 * aconteceu**, num aviso só.
 *
 * Esse aviso é para a recusa que **acontece** — a do servidor, depois que o
 * card já pulou de coluna. A recusa que o navegador faz durante o arrasto não
 * passa por aqui: ela é dita pela própria coluna que recusa, sobreposta, porque
 * um aviso crescendo no topo da página deslocaria o board no meio do gesto.
 *
 * O board é também quem hospeda as duas camadas de detalhe, e as duas guardam o
 * negócio escolhido em lugares diferentes de propósito:
 *
 * - **o painel lateral vive em estado**, porque abrir o resumo de um card é um
 *   gesto de consulta. Fosse uma rota, o botão voltar passaria a desfazer
 *   cliques em card, e o histórico do navegador viraria a lista de tudo que
 *   alguém espiou no funil.
 * - **o modal vive na URL** (`/negocios/:dealId`), porque ele é o lugar onde se
 *   trabalha o negócio: recarregar mantém aberto, voltar fecha, e o link vai
 *   para um colega. É a rota do negócio que renderiza este board com o modal
 *   por cima — e é por isso que esta tela responde por dois caminhos.
 */

const countLabel = (total: number): string => {
  if (total === 0) return 'Nenhum negócio';
  return total === 1 ? '1 negócio' : `${total} negócios`;
};

/** O que a recusa do servidor tem a dizer para quem arrastou o card. */
const moveFailure = (error: unknown): string =>
  error instanceof ApiError
    ? error.message
    : 'Não foi possível falar com o servidor. O card voltou para o lugar.';

export const DealsBoardPage = () => {
  const [view, setView] = useState<BoardView>(INITIAL_BOARD_VIEW);
  /*
   * O modal é montado só quando está aberto, e não escondido com `open={false}`:
   * assim cada cadastro começa com o formulário em branco, sem depender de
   * alguém lembrar de limpá-lo ao fechar.
   */
  const [isCreating, setIsCreating] = useState(false);
  const sellers = useSellers();

  /** O card que está sendo arrastado, enquanto o gesto dura. */
  const [dragging, setDragging] = useState<DealListItem>();
  /** Por que o último movimento não aconteceu. Some assim que outro começa. */
  const [refusal, setRefusal] = useState<string>();

  /** O negócio aberto no painel lateral, se houver algum. */
  const [summarized, setSummarized] = useState<string>();

  /*
   * O negócio aberto no modal — que vem da URL, e não de estado. `useParams`
   * devolve `undefined` em `/negocios`, que é exatamente "nenhum modal aberto":
   * a ausência do parâmetro é o estado fechado, sem um segundo lugar onde
   * guardá-lo.
   */
  const { dealId } = useParams<{ dealId: string }>();
  const navigate = useNavigate();

  /*
   * Fechar o modal **substitui** a entrada do histórico em vez de empilhar
   * outra. Empilhando, o botão voltar reabriria o negócio que a pessoa acabou
   * de fechar; substituindo, ele leva de volta ao que havia antes de o modal
   * abrir — e quem chegou por um link compartilhado cai no board, sem nada atrás.
   */
  const closeDetail = () => void navigate('/negocios', { replace: true });

  const move = useMoveDealStage();

  /**
   * O movimento, venha ele do arrasto ou do seletor do card.
   *
   * A regra do funil é consultada **aqui também**, e não só na coluna que
   * aceita o drop: é a mesma função, e é ela que garante que nenhum caminho da
   * tela chegue a montar uma requisição que o servidor recusaria. Quando ela
   * recusa, a API não é chamada — o motivo aparece e o card não sai do lugar.
   */
  const moveDeal = (deal: DealListItem, to: DealStage) => {
    setDragging(undefined);

    const refused = refuseStageMove(deal.stage, to);
    if (refused !== undefined) {
      setRefusal(STAGE_MOVE_REFUSALS[refused]);
      return;
    }

    setRefusal(undefined);
    move.mutate(
      { deal, to },
      // A volta do card é da mutação, que desfaz o cache; o que sobra para a
      // tela é dizer por quê.
      { onError: (error) => setRefusal(moveFailure(error)) },
    );
  };

  const startDragging = (deal: DealListItem) => {
    setRefusal(undefined);
    setDragging(deal);
  };

  /*
   * A busca digitada e a busca consultada são duas coisas diferentes: o campo
   * responde a cada tecla, a consulta espera 300ms de silêncio. Trocar de
   * vendedor não passa por essa espera — só o texto passa.
   */
  const search = useDebouncedValue(view.search, 300);
  const query: BoardView = { search, ownerId: view.ownerId };
  const board = useBoard(query);

  const columns = board.data?.columns;
  const total = columns?.reduce((sum, column) => sum + column.total, 0);

  return (
    /*
      O painel é fixo na direita, então o board se afasta enquanto ele está
      aberto. Sem isso a coluna Fechado ficaria permanentemente por baixo dele —
      e "o board continua utilizável com o painel aberto" seria só uma frase.
    */
    <div className={cn('px-8 py-10', summarized === undefined ? '' : PANEL_CLEARANCE)}>
      <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-ink">Negócios</h1>
          <p className="mt-1 text-sm text-ink-muted">
            {total === undefined
              ? 'Carregando o funil…'
              : `${countLabel(total)} no recorte atual.`}
          </p>
        </div>

        <Button onClick={() => setIsCreating(true)}>Cadastrar Novo Negócio</Button>
      </header>

      {isCreating ? <CreateDealModal onClose={() => setIsCreating(false)} /> : null}

      {summarized === undefined ? null : (
        <DealPanel
          dealId={summarized}
          onClose={() => setSummarized(undefined)}
          onOpenDetail={() => void navigate(`/negocios/${summarized}`)}
        />
      )}

      {/*
        Montado só quando há negócio no endereço, e não escondido com
        `open={false}`: assim cada abertura começa do zero, e trocar de negócio
        pela URL não deixa o modal anterior meio desenhado por baixo.
      */}
      {dealId === undefined ? null : (
        <DealDetailModal dealId={dealId} onClose={closeDetail} />
      )}

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="min-w-64 flex-1">
          <label htmlFor="deals-search" className="sr-only">
            Buscar negócios
          </label>
          <Input
            id="deals-search"
            type="search"
            value={view.search}
            onChange={(event) =>
              setView((current) => ({ ...current, search: event.target.value }))
            }
            placeholder="Buscar por negócio, contato ou empresa"
          />
        </div>

        <div className="w-56">
          <OwnerFilter
            id="deals-owner"
            sellers={sellers.data ?? []}
            value={view.ownerId}
            onChange={(ownerId) => setView((current) => ({ ...current, ownerId }))}
          />
        </div>
      </div>

      {board.isError ? (
        <p
          role="alert"
          className="rounded-lg bg-lost-500/10 px-3 py-2 text-sm text-lost-300 ring-1 ring-lost-500/30"
        >
          Não foi possível carregar o funil. Tente de novo.
        </p>
      ) : null}

      {/*
        O motivo da recusa, num lugar só. `role="alert"` porque ele responde a
        um gesto que acabou de acontecer: quem usa leitor de tela precisa ouvir
        que o card voltou, e por quê, sem ir procurar.
      */}
      {refusal === undefined ? null : (
        <p
          role="alert"
          className="mb-4 flex items-start justify-between gap-3 rounded-lg bg-lost-500/10 px-3 py-2 text-sm text-lost-300 ring-1 ring-lost-500/30"
        >
          <span>{refusal}</span>

          <Button
            variant="ghost"
            size="sm"
            className="-my-1 shrink-0"
            onClick={() => setRefusal(undefined)}
          >
            Entendi
          </Button>
        </p>
      )}

      {columns === undefined ? null : (
        // O board rola na horizontal: cinco colunas não cabem em tela estreita,
        // e encolhê-las até caber é o que faz um card virar tarja ilegível.
        <div className="flex items-start gap-4 overflow-x-auto pb-4">
          {columns.map((column) => (
            /*
             * A `key` inclui o recorte de propósito: mudar a busca ou o
             * vendedor remonta a coluna, e com ela some o "carregar mais" já
             * clicado. Sem isso, a coluna continuaria mostrando as páginas
             * seguintes de um recorte que não existe mais.
             */
            <BoardColumn
              key={`${column.stage}:${boardViewKey(query)}`}
              column={column}
              view={query}
              dragging={dragging}
              onMove={moveDeal}
              onOpen={(deal) => setSummarized(deal.id)}
              onDragStart={startDragging}
              onDragEnd={() => setDragging(undefined)}
            />
          ))}
        </div>
      )}
    </div>
  );
};
