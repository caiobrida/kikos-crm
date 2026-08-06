import { useState } from 'react';
import { INITIAL_BOARD_VIEW, useBoard, type BoardView } from '../lib/deals';
import { useDebouncedValue } from '../lib/useDebouncedValue';
import { useSellers } from '../lib/sellers';
import { Input, Select } from '../ui/Field';
import { BoardColumn } from './BoardColumn';

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
 */

const countLabel = (total: number): string => {
  if (total === 0) return 'Nenhum negócio';
  return total === 1 ? '1 negócio' : `${total} negócios`;
};

export const DealsBoardPage = () => {
  const [view, setView] = useState<BoardView>(INITIAL_BOARD_VIEW);
  const sellers = useSellers();

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
    <div className="px-8 py-10">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold text-ink">Negócios</h1>
        <p className="mt-1 text-sm text-ink-muted">
          {total === undefined
            ? 'Carregando o funil…'
            : `${countLabel(total)} no recorte atual.`}
        </p>
      </header>

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
          <label htmlFor="deals-owner" className="sr-only">
            Filtrar por responsável
          </label>
          <Select
            id="deals-owner"
            value={view.ownerId}
            onChange={(event) =>
              setView((current) => ({ ...current, ownerId: event.target.value }))
            }
          >
            <option value="">Todos os responsáveis</option>
            {(sellers.data ?? []).map((seller) => (
              <option key={seller.id} value={seller.id}>
                {seller.name}
              </option>
            ))}
          </Select>
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
              key={`${column.stage}:${query.search}:${query.ownerId}`}
              column={column}
              view={query}
            />
          ))}
        </div>
      )}
    </div>
  );
};
