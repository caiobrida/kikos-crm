import type {
  DealResult,
  DealStage,
  LeadSource,
  LeadStatus,
  UserRole,
} from '@kikos/domain';

/*
 * O mapa único de rótulos: código e banco em inglês, interface em português.
 * Sem biblioteca de internacionalização — o produto tem um idioma só.
 *
 * `Record<DealStage, string>` é o que torna isto seguro: acrescentar um Stage
 * no pacote de domínio e esquecer o rótulo aqui quebra o typecheck, em vez de
 * aparecer como uma coluna sem nome na tela.
 */

export const DEAL_STAGE_LABELS: Record<DealStage, string> = {
  NEW: 'Novo',
  CONTACT_MADE: 'Contato feito',
  PROPOSAL_SENT: 'Proposta enviada',
  NEGOTIATION: 'Negociação',
  CLOSED: 'Fechado',
};

export const DEAL_RESULT_LABELS: Record<DealResult, string> = {
  OPEN: 'Em aberto',
  WON: 'Ganho',
  LOST: 'Perdido',
};

export const LEAD_STATUS_LABELS: Record<LeadStatus, string> = {
  NEW: 'Novo',
  CONTACT: 'Em contato',
  NEGOTIATION: 'Em negociação',
  WON: 'Ganho',
  LOST: 'Perdido',
};

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
