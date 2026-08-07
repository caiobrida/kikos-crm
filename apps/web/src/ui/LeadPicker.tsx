import type { LeadListItem } from '@kikos/domain';
import { useId, useRef, useState, type KeyboardEvent } from 'react';
import { cn } from '../lib/cn';
import { useLeadSearch } from '../lib/leads';
import { useDebouncedValue } from '../lib/useDebouncedValue';
import { Button } from './Button';
import { Input } from './Field';

/**
 * O campo que vincula um negócio a um contato **já cadastrado**, buscando pelo
 * nome.
 *
 * Não é um `<select>` porque a carteira não cabe num: a lista de opções vem do
 * servidor a cada busca, com o mesmo endpoint e o mesmo atraso de 300ms da tela
 * de Leads. O que este campo entrega para fora é o contato inteiro, e não só o
 * identificador — é dele que sai o vendedor responsável pré-preenchido, sem uma
 * segunda ida ao servidor.
 *
 * O padrão de acessibilidade é o combobox da WAI-ARIA: o campo se anuncia como
 * `combobox`, a lista como `listbox`, e `aria-activedescendant` diz qual opção
 * está em destaque sem tirar o foco do campo — que é o que faz as setas e o
 * Enter funcionarem para quem usa leitor de tela.
 */
export interface LeadPickerProps {
  readonly id: string;
  /** O contato escolhido, ou `undefined` enquanto ninguém escolheu. */
  readonly value: LeadListItem | undefined;
  readonly onChange: (lead: LeadListItem | undefined) => void;
  readonly invalid?: boolean;
}

export const LeadPicker = ({ id, value, onChange, invalid }: LeadPickerProps) => {
  const [term, setTerm] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  /** Qual opção as setas destacaram. Volta ao topo a cada busca nova. */
  const [highlight, setHighlight] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();

  const search = useDebouncedValue(term, 300);
  const leads = useLeadSearch(search, isOpen && value === undefined);
  const options = leads.data?.data ?? [];

  const isListVisible = isOpen && value === undefined;

  const choose = (lead: LeadListItem) => {
    onChange(lead);
    setIsOpen(false);
    setTerm('');
  };

  /** Limpa a escolha e devolve o campo ao estado de busca, já com o foco. */
  const clear = () => {
    onChange(undefined);
    setTerm('');
    setIsOpen(true);
    inputRef.current?.focus();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') {
      setIsOpen(false);
      return;
    }

    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      // Sem isto o cursor pularia para a ponta do texto junto com o destaque.
      event.preventDefault();
      setIsOpen(true);

      if (options.length === 0) return;
      const step = event.key === 'ArrowDown' ? 1 : options.length - 1;
      setHighlight((current) => (current + step) % options.length);
      return;
    }

    if (event.key === 'Enter' && isListVisible) {
      const lead = options.at(highlight);
      if (lead === undefined) return;

      // Enter aqui escolhe o contato; deixá-lo passar enviaria o formulário
      // inteiro com o campo ainda vazio.
      event.preventDefault();
      choose(lead);
    }
  };

  return (
    <div className="relative">
      <div className="flex items-center gap-2">
        <Input
          id={id}
          ref={inputRef}
          role="combobox"
          aria-expanded={isListVisible}
          aria-controls={listId}
          aria-autocomplete="list"
          {...(isListVisible && options.length > 0
            ? { 'aria-activedescendant': `${listId}-${String(highlight)}` }
            : {})}
          {...(invalid === undefined ? {} : { invalid })}
          autoComplete="off"
          placeholder="Busque pelo nome do contato"
          /*
           * Com um contato escolhido o campo mostra quem é — nome e empresa,
           * como no card do board — e para de aceitar digitação: trocar é uma
           * ação explícita, para que ninguém apague meio nome e fique com um
           * vínculo que não corresponde ao texto na tela.
           */
          readOnly={value !== undefined}
          value={value === undefined ? term : `${value.name} · ${value.company}`}
          onChange={(event) => {
            setTerm(event.target.value);
            setHighlight(0);
            setIsOpen(true);
          }}
          onFocus={() => setIsOpen(value === undefined)}
          onBlur={() => setIsOpen(false)}
          onKeyDown={handleKeyDown}
        />

        {value === undefined ? null : (
          <Button variant="secondary" size="sm" onClick={clear}>
            Trocar
          </Button>
        )}
      </div>

      {isListVisible ? (
        <ul
          id={listId}
          role="listbox"
          aria-label="Contatos encontrados"
          className="absolute z-10 mt-1 max-h-64 w-full overflow-y-auto rounded-lg bg-surface-800 py-1 shadow-xl ring-1 ring-surface-600"
        >
          {options.length === 0 ? (
            <li className="px-3 py-2 text-xs text-ink-faint">
              {leads.isPending
                ? 'Buscando…'
                : 'Nenhum contato com esse nome. Cadastre-o em Leads primeiro.'}
            </li>
          ) : (
            options.map((lead, index) => (
              <li
                key={lead.id}
                id={`${listId}-${String(index)}`}
                role="option"
                aria-selected={index === highlight}
                /*
                 * `onMouseDown` com `preventDefault`, e não `onClick`: o clique
                 * tira o foco do campo antes de disparar, e o `onBlur` fecharia
                 * a lista debaixo do cursor.
                 */
                onMouseDown={(event) => {
                  event.preventDefault();
                  choose(lead);
                }}
                onMouseEnter={() => setHighlight(index)}
                className={cn(
                  'cursor-pointer px-3 py-2 text-sm',
                  index === highlight ? 'bg-surface-700 text-ink' : 'text-ink-muted',
                )}
              >
                <span className="block truncate text-ink">{lead.name}</span>
                <span className="block truncate text-xs text-ink-muted">
                  {lead.company}
                </span>
              </li>
            ))
          )}
        </ul>
      ) : null}
    </div>
  );
};
