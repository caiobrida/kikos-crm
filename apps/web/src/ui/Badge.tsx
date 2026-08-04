import type { DealResult, DealStage, LeadStatus } from '@kikos/domain';
import { cn } from '../lib/cn';
import { DEAL_RESULT_LABELS, DEAL_STAGE_LABELS, LEAD_STATUS_LABELS } from '../lib/labels';

/**
 * O tom carrega o significado, não a cor. `won` é sempre verde e `lost` sempre
 * vermelho em toda a interface porque as duas se referem ao mesmo desfecho,
 * seja num selo de Result, num card do board ou numa linha de tabela.
 */
type BadgeTone = 'neutral' | 'info' | 'brand' | 'progress' | 'won' | 'lost';

const BASE =
  'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ' +
  'ring-1 ring-inset whitespace-nowrap';

const TONES: Record<BadgeTone, string> = {
  neutral: 'bg-surface-700 text-ink-muted ring-surface-500',
  info: 'bg-sky-500/10 text-sky-300 ring-sky-500/30',
  brand: 'bg-brand-500/10 text-brand-300 ring-brand-500/30',
  progress: 'bg-violet-500/10 text-violet-300 ring-violet-500/30',
  won: 'bg-won-500/10 text-won-300 ring-won-500/30',
  lost: 'bg-lost-500/10 text-lost-300 ring-lost-500/30',
};

const DOTS: Record<BadgeTone, string> = {
  neutral: 'bg-ink-faint',
  info: 'bg-sky-400',
  brand: 'bg-brand-400',
  progress: 'bg-violet-400',
  won: 'bg-won-400',
  lost: 'bg-lost-400',
};

export interface BadgeProps {
  readonly tone?: BadgeTone;
  /** O ponto colorido ajuda a distinguir os tons sem depender só da cor do texto. */
  readonly withDot?: boolean;
  readonly className?: string;
  readonly children: React.ReactNode;
}

export const Badge = ({
  tone = 'neutral',
  withDot = false,
  className,
  children,
}: BadgeProps) => (
  <span className={cn(BASE, TONES[tone], className)}>
    {withDot ? (
      <span aria-hidden="true" className={cn('size-1.5 rounded-full', DOTS[tone])} />
    ) : null}
    {children}
  </span>
);

/*
 * Os três selos concretos do produto. Cada mapa é um `Record` sobre o enum do
 * pacote de domínio: um valor novo lá quebra o typecheck aqui, em vez de cair
 * num tom padrão silencioso.
 */

const LEAD_STATUS_TONES: Record<LeadStatus, BadgeTone> = {
  NEW: 'info',
  CONTACT: 'brand',
  NEGOTIATION: 'progress',
  WON: 'won',
  LOST: 'lost',
};

export const LeadStatusBadge = ({ status }: { readonly status: LeadStatus }) => (
  <Badge tone={LEAD_STATUS_TONES[status]} withDot>
    {LEAD_STATUS_LABELS[status]}
  </Badge>
);

const DEAL_STAGE_TONES: Record<DealStage, BadgeTone> = {
  NEW: 'neutral',
  CONTACT_MADE: 'info',
  PROPOSAL_SENT: 'brand',
  NEGOTIATION: 'progress',
  CLOSED: 'neutral',
};

export const DealStageBadge = ({ stage }: { readonly stage: DealStage }) => (
  <Badge tone={DEAL_STAGE_TONES[stage]}>{DEAL_STAGE_LABELS[stage]}</Badge>
);

const DEAL_RESULT_TONES: Record<DealResult, BadgeTone> = {
  OPEN: 'neutral',
  WON: 'won',
  LOST: 'lost',
};

export const DealResultBadge = ({ result }: { readonly result: DealResult }) => (
  <Badge tone={DEAL_RESULT_TONES[result]} withDot>
    {DEAL_RESULT_LABELS[result]}
  </Badge>
);
