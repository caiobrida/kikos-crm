import type { DealResult, DealStage, LeadStatus, UserRole } from '@kikos/domain';

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

export const USER_ROLE_LABELS: Record<UserRole, string> = {
  MANAGER: 'Gestor',
  SELLER: 'Vendedor',
};
