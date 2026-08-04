import { DEAL_RESULTS, DEAL_STAGES, LEAD_STATUSES, USER_ROLES } from '@kikos/domain';
import { useState, type ReactNode } from 'react';
import { USER_ROLE_LABELS } from '../lib/labels';
import { useApiHealth } from '../lib/useApiHealth';
import { Avatar } from '../ui/Avatar';
import { Badge, DealResultBadge, DealStageBadge, LeadStatusBadge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Field, Input, Select, Textarea } from '../ui/Field';
import { Modal } from '../ui/Modal';
import {
  Table,
  TableBody,
  TableCell,
  TableEmpty,
  TableHead,
  TableHeadCell,
  TableRow,
} from '../ui/Table';

/*
 * A vitrine das primitivas. Não é tela do produto: existe para que as fatias
 * seguintes montem Leads, board e Dashboard reusando estas peças em vez de
 * inventar botão e selo de novo em cada tela.
 */

const Section = ({
  title,
  description,
  children,
}: {
  readonly title: string;
  readonly description: string;
  readonly children: ReactNode;
}) => (
  <section className="border-t border-surface-800 py-8">
    <h2 className="text-sm font-semibold tracking-wide text-brand-400 uppercase">
      {title}
    </h2>
    <p className="mt-1 max-w-2xl text-sm text-ink-muted">{description}</p>
    <div className="mt-5">{children}</div>
  </section>
);

const Swatch = ({
  className,
  name,
  meaning,
}: {
  readonly className: string;
  readonly name: string;
  readonly meaning: string;
}) => (
  <div className="flex items-center gap-3">
    <span
      className={`size-10 shrink-0 rounded-lg ring-1 ring-white/10 ${className}`}
      aria-hidden="true"
    />
    <div className="text-sm">
      <p className="font-medium text-ink">{name}</p>
      <p className="text-xs text-ink-muted">{meaning}</p>
    </div>
  </div>
);

const ApiHealthStrip = () => {
  const health = useApiHealth();

  if (health.kind === 'loading') {
    return <Badge tone="neutral">Consultando a API…</Badge>;
  }

  if (health.kind === 'unreachable') {
    return (
      <Badge tone="lost" withDot>
        API fora do ar — {health.message}
      </Badge>
    );
  }

  return (
    <Badge tone="won" withDot>
      {health.health.service} respondeu às{' '}
      {health.health.checkedAt.toLocaleTimeString('pt-BR')}
    </Badge>
  );
};

const SELLERS = ['Ana Paula Nogueira', 'Caio Brida', 'Maria da Silva', 'Rafael'] as const;

export const PrimitivesPage = () => {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-ink">Kikos CRM — primitivas</h1>
          <p className="mt-1 text-sm text-ink-muted">
            As peças que todas as telas do CRM reusam.
          </p>
        </div>
        <ApiHealthStrip />
      </header>

      <Section
        title="Cores"
        description="Três cores carregam significado e não são usadas por decoração: laranja é ação, verde é negócio ganho, vermelho é negócio perdido."
      >
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Swatch className="bg-brand-500" name="brand" meaning="Ação e destaque" />
          <Swatch className="bg-won-500" name="won" meaning="Negócio ganho" />
          <Swatch className="bg-lost-500" name="lost" meaning="Negócio perdido" />
          <Swatch className="bg-surface-800" name="surface" meaning="Fundo e cartões" />
        </div>
      </Section>

      <Section
        title="Botões"
        description="Uma ação primária por tela. Secundário para o que acompanha, fantasma para o que não disputa atenção, e vermelho só para remover."
      >
        <div className="flex flex-wrap items-center gap-3">
          <Button>Novo negócio</Button>
          <Button variant="secondary">Cancelar</Button>
          <Button variant="ghost">Ver tudo</Button>
          <Button variant="danger">Remover</Button>
          <Button isLoading>Salvando</Button>
          <Button disabled>Indisponível</Button>
          <Button size="sm" variant="secondary">
            Compacto
          </Button>
        </div>
      </Section>

      <Section
        title="Campos"
        description="O asterisco marca o obrigatório antes de enviar, e o erro aparece junto do campo que o causou."
      >
        <div className="grid max-w-3xl gap-5 sm:grid-cols-2">
          <Field htmlFor="demo-nome" label="Nome" required>
            <Input id="demo-nome" placeholder="Ana Paula Nogueira" />
          </Field>

          <Field
            htmlFor="demo-email"
            label="E-mail"
            required
            error="Informe um e-mail válido."
          >
            <Input id="demo-email" defaultValue="ana@" invalid />
          </Field>

          <Field
            htmlFor="demo-origem"
            label="Origem do Lead"
            hint="Por qual canal o contato chegou ao time."
          >
            <Select id="demo-origem" defaultValue="">
              <option value="" disabled>
                Selecione…
              </option>
              <option value="INBOUND">Inbound</option>
              <option value="OUTBOUND">Outbound</option>
              <option value="REFERRAL">Indicação</option>
            </Select>
          </Field>

          <Field htmlFor="demo-cargo" label="Cargo">
            <Input id="demo-cargo" placeholder="Diretora de operações" disabled />
          </Field>

          <div className="sm:col-span-2">
            <Field htmlFor="demo-obs" label="Observações">
              <Textarea id="demo-obs" placeholder="O que foi conversado até aqui…" />
            </Field>
          </div>
        </div>
      </Section>

      <Section
        title="Selos"
        description="O Status do Lead e o Stage do Deal são vocabulários distintos, e o Result é ortogonal ao Stage. Cada um tem seu selo."
      >
        <div className="flex flex-col gap-4">
          <div>
            <p className="mb-2 text-xs tracking-wide text-ink-faint uppercase">
              Status do Lead
            </p>
            <div className="flex flex-wrap gap-2">
              {LEAD_STATUSES.map((status) => (
                <LeadStatusBadge key={status} status={status} />
              ))}
            </div>
          </div>

          <div>
            <p className="mb-2 text-xs tracking-wide text-ink-faint uppercase">
              Stage do Deal
            </p>
            <div className="flex flex-wrap gap-2">
              {DEAL_STAGES.map((stage) => (
                <DealStageBadge key={stage} stage={stage} />
              ))}
            </div>
          </div>

          <div>
            <p className="mb-2 text-xs tracking-wide text-ink-faint uppercase">
              Result do Deal
            </p>
            <div className="flex flex-wrap gap-2">
              {DEAL_RESULTS.map((result) => (
                <DealResultBadge key={result} result={result} />
              ))}
            </div>
          </div>
        </div>
      </Section>

      <Section
        title="Avatares"
        description="Não há foto no produto: as iniciais identificam o vendedor nos cards e nas tabelas, e o mesmo nome cai sempre no mesmo tom."
      >
        <div className="flex flex-wrap items-center gap-6">
          {SELLERS.map((name) => (
            <div key={name} className="flex items-center gap-2">
              <Avatar name={name} />
              <span className="text-sm text-ink-muted">{name}</span>
            </div>
          ))}
          <div className="flex items-center gap-2">
            <Avatar name="Ana Paula Nogueira" size="sm" />
            <Avatar name="Ana Paula Nogueira" size="md" />
            <Avatar name="Ana Paula Nogueira" size="lg" />
          </div>
        </div>
      </Section>

      <Section
        title="Tabela"
        description="A casca usada pela lista de Leads e pela tabela do Dashboard. Clicar numa linha abre o modal do registro."
      >
        <div className="flex flex-col gap-6">
          <Table>
            <TableHead>
              <TableRow>
                <TableHeadCell>Nome</TableHeadCell>
                <TableHeadCell>Responsável</TableHeadCell>
                <TableHeadCell>Papel</TableHeadCell>
                <TableHeadCell>Status</TableHeadCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {SELLERS.slice(0, 3).map((name, index) => (
                <TableRow key={name} onClick={() => setDetailOpen(true)}>
                  <TableCell>{name}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Avatar name={name} size="sm" />
                      <span className="text-ink-muted">{name.split(' ')[0]}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-ink-muted">
                    {USER_ROLE_LABELS[USER_ROLES[index === 0 ? 0 : 1]]}
                  </TableCell>
                  <TableCell>
                    <LeadStatusBadge status={LEAD_STATUSES[index] ?? 'NEW'} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          <Table>
            <TableHead>
              <TableRow>
                <TableHeadCell>Nome</TableHeadCell>
                <TableHeadCell>Status</TableHeadCell>
              </TableRow>
            </TableHead>
            <TableBody>
              <TableEmpty colSpan={2}>Nenhum Lead encontrado com esse filtro.</TableEmpty>
            </TableBody>
          </Table>
        </div>
      </Section>

      <Section
        title="Modais"
        description="O detalhamento de um Deal é um modal quase de tela cheia; confirmar remoção cabe no tamanho médio. Nunca há modal sobre modal."
      >
        <div className="flex flex-wrap gap-3">
          <Button variant="secondary" onClick={() => setDetailOpen(true)}>
            Abrir detalhamento
          </Button>
          <Button variant="secondary" onClick={() => setConfirmOpen(true)}>
            Abrir confirmação
          </Button>
        </div>

        <Modal
          open={detailOpen}
          onClose={() => setDetailOpen(false)}
          size="full"
          title="Implantação de esteiras — Academia Vitalis"
          description="O dossiê do cliente, a linha do tempo e as ações do Deal vivem aqui."
          footer={
            <>
              <Button variant="ghost" onClick={() => setDetailOpen(false)}>
                Fechar
              </Button>
              <Button>Salvar</Button>
            </>
          }
        >
          <div className="flex flex-col gap-4 text-sm text-ink-muted">
            <div className="flex flex-wrap items-center gap-3">
              <DealStageBadge stage="NEGOTIATION" />
              <DealResultBadge result="OPEN" />
              <Avatar name="Caio Brida" size="sm" />
            </div>
            <p>
              Casca vazia por enquanto: o conteúdo do detalhamento entra na fatia do
              painel e da linha do tempo.
            </p>
          </div>
        </Modal>

        <Modal
          open={confirmOpen}
          onClose={() => setConfirmOpen(false)}
          title="Remover este Lead?"
          description="A remoção é lógica: o registro sai das listagens, mas o histórico continua íntegro."
          footer={
            <>
              <Button variant="secondary" onClick={() => setConfirmOpen(false)}>
                Cancelar
              </Button>
              <Button variant="danger" onClick={() => setConfirmOpen(false)}>
                Remover
              </Button>
            </>
          }
        >
          <p className="text-sm text-ink-muted">
            Um Lead com Deal em aberto não pode ser removido — o servidor recusa e informa
            quantos negócios travam a operação.
          </p>
        </Modal>
      </Section>
    </main>
  );
};
