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

/**
 * Os dois desfechos com que um Deal **termina** — o vocabulário do encerramento.
 *
 * `OPEN` fica de fora pelo mesmo motivo que `CLOSED` fica de fora de
 * `OPEN_DEAL_STAGES`: em aberto é o estado de quem ainda não terminou, e não uma
 * escolha que alguém faz. É esta lista que desenha os dois botões do
 * detalhamento e o diálogo que o arrasto para Fechado abre.
 */
export const CLOSED_DEAL_RESULTS = [
  'WON',
  'LOST',
] as const satisfies readonly DealResult[];

/**
 * O desfecho de um Deal encerrado. Ao contrário de `OpenDealStage`, que é só um
 * tipo, este também é um Schema: ele valida o corpo de `POST /deals/:id/close`,
 * e é aí que "encerrar é escolher entre Ganho e Perdido" deixa de ser convenção
 * e vira a única entrada que a rota aceita.
 *
 * Deriva da lista acima em vez de repetir os literais, então um desfecho novo no
 * vocabulário entra nos dois lugares de uma vez.
 */
export const ClosedDealResult = Schema.Literal(...CLOSED_DEAL_RESULTS);
export type ClosedDealResult = typeof ClosedDealResult.Type;

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

/** As origens na ordem em que o `<select>` do cadastro as oferece. */
export const LEAD_SOURCES = [
  'WEBSITE',
  'REFERRAL',
  'SOCIAL_MEDIA',
  'EVENT',
  'OUTBOUND',
  'OTHER',
] as const satisfies readonly LeadSource[];

/**
 * A espécie de um Comment: escrito por uma pessoa (`USER`) ou gerado pelo
 * sistema ao registrar uma ação (`SYSTEM`).
 *
 * As duas espécies convivem na mesma tabela, distinguidas por este campo, em vez
 * de em duas tabelas com duas leituras: a linha do tempo é **uma** sequência, e
 * juntá-la depois exigiria ordenar dois conjuntos por data toda vez que alguém
 * abrisse um negócio. O que muda entre elas é só como a tela as desenha.
 */
export const CommentKind = Schema.Literal('USER', 'SYSTEM');
export type CommentKind = typeof CommentKind.Type;

/** O papel de um User. Rótulo para listar vendedores, não regra de acesso. */
export const UserRole = Schema.Literal('MANAGER', 'SELLER');
export type UserRole = typeof UserRole.Type;

export const USER_ROLES = ['MANAGER', 'SELLER'] as const satisfies readonly UserRole[];
