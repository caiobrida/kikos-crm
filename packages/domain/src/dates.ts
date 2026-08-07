import { Schema } from 'effect';

/*
 * As datas que um formulário produz.
 *
 * Um `<input type="date">` manda `"AAAA-MM-DD"` — só o dia, sem hora e sem
 * fuso — ou `""` quando ninguém preencheu. As duas coisas precisam de tradução
 * antes de virar a coluna `DateTime` do banco, e é o Schema quem a descreve,
 * nos dois sentidos.
 */

const DATE_INPUT = /^\d{4}-\d{2}-\d{2}$/;

/**
 * O texto é um dia que existe no calendário?
 *
 * A conferência do formato não basta: `new Date('2026-02-31')` não estoura, ele
 * rola para 3 de março. Comparar a data de volta com o texto é o que separa
 * "31 de fevereiro" de uma data de verdade.
 */
const isDayOrBlank = (value: string): boolean => {
  if (value === '') return true;
  if (!DATE_INPUT.test(value)) return false;

  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().startsWith(value);
};

/**
 * Uma data opcional informada por dia, como a prevista de fechamento de um Deal.
 *
 * O lado codificado é o que o `<input type="date">` produz e o que trafega no
 * JSON: `"2026-09-20"` ou `""`. O lado decodificado é o que o domínio guarda:
 * `Date` ou `undefined`. O `""` significa ausência pelo mesmo motivo que em
 * `OptionalText` — senão a tela teria dois jeitos de dizer "não informado".
 *
 * **A hora é meia-noite UTC, e não meia-noite local.** O campo é um dia do
 * calendário, não um instante: fixar o fuso aqui é o que impede a mesma data
 * aparecer como o dia anterior para quem abre a tela em outro lugar. O caminho
 * de volta corta os dez primeiros caracteres do ISO, que é exatamente o formato
 * que o `<input>` aceita de volta.
 */
export const OptionalDate = Schema.transform(
  Schema.String.pipe(
    Schema.filter(isDayOrBlank, {
      message: () => 'Informe uma data válida.',
      identifier: 'OptionalDate',
    }),
  ),
  Schema.UndefinedOr(Schema.DateFromSelf),
  {
    strict: true,
    decode: (day) => (day === '' ? undefined : new Date(`${day}T00:00:00.000Z`)),
    encode: (date) => (date === undefined ? '' : date.toISOString().slice(0, 10)),
  },
);
