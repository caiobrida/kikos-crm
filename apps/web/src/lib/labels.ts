import type { CommentKind, LeadSource, LeadStatus, UserRole } from '@kikos/domain';

/*
 * O mapa único de rótulos: código e banco em inglês, interface em português.
 * Sem biblioteca de internacionalização — o produto tem um idioma só.
 *
 * `Record<DealResult, string>` é o que torna isto seguro: acrescentar um valor
 * no pacote de domínio e esquecer o rótulo aqui quebra o typecheck, em vez de
 * aparecer como um selo sem nome na tela.
 */

/*
 * Os nomes dos estágios e dos desfechos são a exceção: eles moram no pacote
 * compartilhado, e não aqui. Deixaram de ser só interface quando os registros
 * de sistema da linha do tempo passaram a gravar a frase pronta no banco — a
 * mudança de estágio primeiro, o encerramento depois —, e é o servidor quem a
 * escreve. O re-export mantém o import de todo mundo apontando para este
 * arquivo, que continua sendo o lugar onde se procura um rótulo.
 */
export { DEAL_RESULT_LABELS, DEAL_STAGE_LABELS } from '@kikos/domain';

/*
 * O que cada espécie de registro da linha do tempo é.
 *
 * A distinção entre o que uma pessoa escreveu e o que o sistema registrou é
 * feita na tela por cor, forma e ícone — e nenhuma das três chega a quem usa
 * leitor de tela. Estes rótulos são a versão em texto dessa mesma distinção.
 */
export const COMMENT_KIND_LABELS: Record<CommentKind, string> = {
  USER: 'Comentário',
  SYSTEM: 'Registro do sistema',
};

export const LEAD_STATUS_LABELS: Record<LeadStatus, string> = {
  NEW: 'Novo',
  CONTACT: 'Em contato',
  NEGOTIATION: 'Em negociação',
  WON: 'Ganho',
  LOST: 'Perdido',
};

/*
 * Por qual canal o contato chegou. "Indicação" e "Prospecção ativa" são como o
 * time fala; `REFERRAL` e `OUTBOUND` são como o banco guarda.
 */
export const LEAD_SOURCE_LABELS: Record<LeadSource, string> = {
  WEBSITE: 'Site',
  REFERRAL: 'Indicação',
  SOCIAL_MEDIA: 'Redes sociais',
  EVENT: 'Evento',
  OUTBOUND: 'Prospecção ativa',
  OTHER: 'Outro',
};

/*
 * O cargo, como aparece no rodapé da barra lateral. `MANAGER` é o papel de
 * gestão, e no time da Kikos quem o ocupa é o Diretor de Vendas — o rótulo dos
 * mockups. Ver CONTEXT.md, verbete "Role".
 */
export const USER_ROLE_LABELS: Record<UserRole, string> = {
  MANAGER: 'Diretor de Vendas',
  SELLER: 'Vendedor',
};
