import { Schema } from 'effect';

/**
 * Um campo de escolha do formulário — um `<select>` ou um campo preenchido por
 * um seletor —, como o navegador de fato o manda.
 *
 * O problema que isto resolve aparece em todo formulário do CRM: um `<select>`
 * sem escolha manda `""`, não a ausência do campo. Se o Schema pedisse
 * `LeadSource` ou `UserId` direto, o lado **codificado** seria a união fechada,
 * e o formulário não teria como nascer em branco sem mentir para o compilador.
 *
 * `Schema.filter` com um type guard resolve os dois lados de uma vez: o lado
 * codificado continua `string`, o decodificado é o tipo estreito, e a recusa
 * carrega a frase que vai aparecer embaixo do campo. O guard é o `Schema.is` do
 * próprio Schema de origem — a regra sobre o que é um valor válido continua
 * escrita num lugar só, e este módulo só cuida do "ninguém escolheu ainda".
 *
 * A mensagem é escrita por quem declara o campo, porque é ela que aparece na
 * tela: "Escolha o vendedor responsável." diz mais do que qualquer texto
 * genérico que este módulo pudesse inventar.
 */
export const Chosen = <A extends string, I>(
  schema: Schema.Schema<A, I>,
  missing: string,
) => {
  // `Schema.is` é montado uma vez, e não a cada valor validado.
  const isChosen = Schema.is(schema);

  return Schema.String.pipe(
    Schema.filter((value): value is A => isChosen(value), { message: () => missing }),
  );
};
