/**
 * Monta a query string de uma listagem, deixando de fora o que está vazio.
 *
 * A omissão não é estética. A API valida `status`, `sortBy` e companhia contra
 * uniões fechadas, e um `?status=` sem valor é uma string vazia que não pertence
 * a nenhuma delas — mandar o parâmetro no instante em que alguém limpa um
 * filtro devolveria 400 em vez de devolver a lista sem filtro.
 */
export const toQueryString = (
  params: Readonly<Record<string, string | number | undefined>>,
): string => {
  const search = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    // `0` é um valor legítimo; só `undefined` e a string vazia são ausência.
    if (value === undefined || value === '') continue;
    search.set(key, String(value));
  }

  const query = search.toString();
  return query === '' ? '' : `?${query}`;
};
