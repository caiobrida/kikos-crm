import { Schema } from 'effect';

/*
 * Os vocabulários fechados do domínio. Em inglês no código e no banco; os
 * rótulos em português vivem no app web (`src/lib/labels.ts`).
 *
 * `Schema.Literal(...)` é a união de literais do Effect. Em TypeScript comum
 * seria `type DealStage = 'NEW' | 'CONTACT_MADE' | ...`. A diferença é que o
 * Schema também existe em tempo de execução: o mesmo valor que dá o tipo
 * valida a entrada da API e o formulário no navegador.
 */

/** Onde o Deal está no Pipeline — a coluna do kanban. Ver ADR-0003. */
export const DealStage = Schema.Literal(
  'NEW',
  'CONTACT_MADE',
  'PROPOSAL_SENT',
  'NEGOTIATION',
  'CLOSED',
);
/**
 * `typeof X.Type` extrai o tipo TypeScript de um Schema. Declarar o `type` com
 * o mesmo nome do `const` é idiomático em Effect: quem importa `DealStage`
 * recebe o validador ou o tipo conforme a posição em que usa o nome.
 */
export type DealStage = typeof DealStage.Type;

/**
 * Os quatro Stages abertos, na ordem do Pipeline. `CLOSED` fica de fora porque
 * não é destino de movimentação: chega-se nele marcando Ganho ou Perdido.
 */
export const OPEN_DEAL_STAGES = [
  'NEW',
  'CONTACT_MADE',
  'PROPOSAL_SENT',
  'NEGOTIATION',
] as const satisfies readonly DealStage[];

/** Todos os Stages na ordem em que as colunas do board aparecem. */
export const DEAL_STAGES = [...OPEN_DEAL_STAGES, 'CLOSED'] as const;

/** O desfecho do Deal. Ortogonal ao Stage — ver ADR-0003. */
export const DealResult = Schema.Literal('OPEN', 'WON', 'LOST');
export type DealResult = typeof DealResult.Type;

export const DEAL_RESULTS = [
  'OPEN',
  'WON',
  'LOST',
] as const satisfies readonly DealResult[];

/** A situação do relacionamento com o Lead. Vocabulário distinto do Stage. */
export const LeadStatus = Schema.Literal('NEW', 'CONTACT', 'NEGOTIATION', 'WON', 'LOST');
export type LeadStatus = typeof LeadStatus.Type;

export const LEAD_STATUSES = [
  'NEW',
  'CONTACT',
  'NEGOTIATION',
  'WON',
  'LOST',
] as const satisfies readonly LeadStatus[];

/**
 * Por qual canal o Lead chegou ao time. Existe para responder depois "quais
 * canais trazem contato bom", então `OTHER` é a saída de emergência e não o
 * default de quem não quis escolher.
 */
export const LeadSource = Schema.Literal(
  'WEBSITE',
  'REFERRAL',
  'SOCIAL_MEDIA',
  'EVENT',
  'OUTBOUND',
  'OTHER',
);
export type LeadSource = typeof LeadSource.Type;

/** O papel de um User. Rótulo para listar vendedores, não regra de acesso. */
export const UserRole = Schema.Literal('MANAGER', 'SELLER');
export type UserRole = typeof UserRole.Type;

export const USER_ROLES = ['MANAGER', 'SELLER'] as const satisfies readonly UserRole[];
