import type { ReactNode } from 'react';

/**
 * Um dado com o seu rótulo: o par que o painel lateral e o detalhamento usam
 * para desenhar tudo que é só leitura.
 *
 * É um `<dt>`/`<dd>`, e por isso ele **precisa** estar dentro de um `<dl>`: a
 * lista de definição é o elemento que diz "isto é um conjunto de rótulos e
 * valores", e é o que faz um leitor de tela anunciar "Telefone" antes do
 * número em vez de ler duas linhas soltas.
 *
 * Mora aqui, e não dentro de uma das duas telas, porque as duas mostram o mesmo
 * negócio com o mesmo vocabulário visual — o painel é o recorte curto do que o
 * modal mostra inteiro. Duas cópias do par divergiriam no primeiro ajuste de
 * espaçamento.
 */
export interface DefinitionProps {
  readonly label: string;
  readonly children: ReactNode;
}

export const Definition = ({ label, children }: DefinitionProps) => (
  <div className="flex flex-col gap-0.5">
    <dt className="text-xs text-ink-faint">{label}</dt>
    <dd className="text-sm text-ink">{children}</dd>
  </div>
);

/**
 * O que a tela mostra onde não há dado nenhum.
 *
 * Uma frase, e não uma linha em branco: um campo vazio parece defeito da tela,
 * e "não informado" é a resposta de verdade — o cargo do contato e a data
 * prevista são opcionais no cadastro.
 */
export const NotInformed = () => <span className="text-ink-faint">Não informado</span>;
