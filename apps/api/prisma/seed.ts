import type { LeadSource, LeadStatus } from '@kikos/domain';
import { hashPassword } from '../src/auth/password';
import { createPrismaClient } from '../src/prisma';

/*
 * Os dados de exemplo: o gestor e os três vendedores dos mockups, mais a
 * carteira de contatos que a lista de Leads mostra no primeiro acesso.
 *
 * O CRM aberto pela primeira vez precisa se parecer com o desenho, então os
 * nomes daqui são os mesmos que aparecem nos cards e nas tabelas. Deals e
 * comentários entram nas fatias seguintes.
 *
 * O seed é idempotente: `upsert` por e-mail para os Users e por identificador
 * fixo para os Leads. Rodá-lo duas vezes não duplica ninguém e não derruba a
 * `tokenVersion` de quem já está logado.
 */

const SEED_PASSWORD = 'kikos123';

const USERS = [
  { name: 'Rodrigo Ramos', email: 'rodrigo.ramos@kikos.com.br', role: 'MANAGER' },
  { name: 'Ana Paula Nogueira', email: 'ana.nogueira@kikos.com.br', role: 'SELLER' },
  { name: 'Caio Brida', email: 'caio.brida@kikos.com.br', role: 'SELLER' },
  { name: 'Maria da Silva', email: 'maria.silva@kikos.com.br', role: 'SELLER' },
] as const;

type SeedUserEmail = (typeof USERS)[number]['email'];

interface SeedLead {
  readonly name: string;
  readonly company: string;
  readonly email: string;
  readonly phone: string;
  readonly jobTitle: string | null;
  readonly source: LeadSource;
  readonly status: LeadStatus;
  readonly owner: SeedUserEmail;
  readonly notes: string | null;
  /** Há quantos dias foi a última interação. Vira data absoluta na gravação. */
  readonly lastInteractionDaysAgo: number;
}

/*
 * Catorze contatos: mais de uma página com o tamanho padrão de dez, o que faz a
 * paginação da tela aparecer sem que ninguém precise cadastrar nada antes.
 */
const LEADS: readonly SeedLead[] = [
  {
    name: 'Juliana Prado',
    company: 'Smart Fit Morumbi',
    email: 'juliana.prado@smartfitmorumbi.com.br',
    phone: '(11) 98812-4471',
    jobTitle: 'Gerente de Operações',
    source: 'REFERRAL',
    status: 'NEGOTIATION',
    owner: 'ana.nogueira@kikos.com.br',
    notes: 'Quer trocar a linha de esteiras das duas unidades até o fim do trimestre.',
    lastInteractionDaysAgo: 0,
  },
  {
    name: 'Marcelo Tanaka',
    company: 'Bodytech Vila Olímpia',
    email: 'marcelo.tanaka@bodytechvo.com.br',
    phone: '(11) 97744-2039',
    jobTitle: 'Diretor',
    source: 'EVENT',
    status: 'NEGOTIATION',
    owner: 'caio.brida@kikos.com.br',
    notes: 'Conhecemos na feira IHRSA. Pediu proposta para a sala de musculação inteira.',
    lastInteractionDaysAgo: 1,
  },
  {
    name: 'Patrícia Rezende',
    company: 'Studio Corpo Livre',
    email: 'patricia@corpolivre.com.br',
    phone: '(11) 99120-8834',
    jobTitle: 'Sócia-proprietária',
    source: 'SOCIAL_MEDIA',
    status: 'CONTACT',
    owner: 'maria.silva@kikos.com.br',
    notes: 'Studio pequeno, orçamento apertado. Interessada na linha de entrada.',
    lastInteractionDaysAgo: 2,
  },
  {
    name: 'Rafael Monteiro',
    company: 'CrossBox Zona Sul',
    email: 'rafael@crossboxzs.com.br',
    phone: '(11) 98330-7712',
    jobTitle: 'Head Coach',
    source: 'WEBSITE',
    status: 'CONTACT',
    owner: 'ana.nogueira@kikos.com.br',
    notes: null,
    lastInteractionDaysAgo: 3,
  },
  {
    name: 'Camila Duarte',
    company: 'Academia Ritmo',
    email: 'camila.duarte@academiaritmo.com.br',
    phone: '(21) 99654-1180',
    jobTitle: 'Coordenadora Comercial',
    source: 'WEBSITE',
    status: 'NEW',
    owner: 'caio.brida@kikos.com.br',
    notes: 'Preencheu o formulário do site pedindo catálogo.',
    lastInteractionDaysAgo: 4,
  },
  {
    name: 'Eduardo Bastos',
    company: 'Rede Vital Fitness',
    email: 'eduardo.bastos@vitalfitness.com.br',
    phone: '(31) 98877-3321',
    jobTitle: 'Gerente de Compras',
    source: 'OUTBOUND',
    status: 'WON',
    owner: 'maria.silva@kikos.com.br',
    notes: 'Fechou a reposição de bicicletas ergométricas de quatro unidades.',
    lastInteractionDaysAgo: 5,
  },
  {
    name: 'Larissa Fontes',
    company: 'Studio Pilates Aurora',
    email: 'larissa@aurorapilates.com.br',
    phone: '(11) 97012-5566',
    jobTitle: null,
    source: 'REFERRAL',
    status: 'CONTACT',
    owner: 'ana.nogueira@kikos.com.br',
    notes: 'Indicada pela Patrícia, do Corpo Livre.',
    lastInteractionDaysAgo: 6,
  },
  {
    name: 'Gustavo Peixoto',
    company: 'Academia Ritmo',
    email: 'gustavo.peixoto@academiaritmo.com.br',
    phone: '(21) 99432-7788',
    jobTitle: 'Sócio',
    source: 'EVENT',
    status: 'LOST',
    owner: 'caio.brida@kikos.com.br',
    notes: 'Fechou com concorrente por prazo de entrega.',
    lastInteractionDaysAgo: 8,
  },
  {
    name: 'Beatriz Andrade',
    company: 'Espaço Movimento',
    email: 'beatriz@espacomovimento.com.br',
    phone: '(41) 98221-9043',
    jobTitle: 'Proprietária',
    source: 'SOCIAL_MEDIA',
    status: 'NEW',
    owner: 'maria.silva@kikos.com.br',
    notes: null,
    lastInteractionDaysAgo: 9,
  },
  {
    name: 'Thiago Vasconcelos',
    company: 'Panobianco Santo André',
    email: 'thiago.v@panobiancosa.com.br',
    phone: '(11) 96543-2210',
    jobTitle: 'Gerente de Unidade',
    source: 'OUTBOUND',
    status: 'NEGOTIATION',
    owner: 'rodrigo.ramos@kikos.com.br',
    notes: 'Conta grande. Rodrigo assumiu pessoalmente.',
    lastInteractionDaysAgo: 10,
  },
  {
    name: 'Fernanda Lopes',
    company: 'Clube Atlético Paulistano',
    email: 'fernanda.lopes@atleticopaulistano.com.br',
    phone: '(11) 95521-3390',
    jobTitle: 'Diretora de Esportes',
    source: 'REFERRAL',
    status: 'CONTACT',
    owner: 'ana.nogueira@kikos.com.br',
    notes: 'Renovação da academia do clube prevista para o próximo ano.',
    lastInteractionDaysAgo: 12,
  },
  {
    name: 'André Siqueira',
    company: 'Fit Center Guarulhos',
    email: 'andre.siqueira@fitcenterguarulhos.com.br',
    phone: '(11) 94410-6677',
    jobTitle: null,
    source: 'WEBSITE',
    status: 'NEW',
    owner: 'caio.brida@kikos.com.br',
    notes: null,
    lastInteractionDaysAgo: 15,
  },
  {
    name: 'Renata Camargo',
    company: 'Academia Força Total',
    email: 'renata@forcatotal.com.br',
    phone: '(51) 99887-1122',
    jobTitle: 'Gerente Administrativa',
    source: 'OUTBOUND',
    status: 'LOST',
    owner: 'maria.silva@kikos.com.br',
    notes: 'Adiou o investimento para o ano que vem.',
    lastInteractionDaysAgo: 20,
  },
  {
    name: 'Paulo Menezes',
    company: 'Hotel Serrano Wellness',
    email: 'paulo.menezes@serranowellness.com.br',
    phone: '(24) 98123-4455',
    jobTitle: 'Gerente Geral',
    source: 'OTHER',
    status: 'WON',
    owner: 'rodrigo.ramos@kikos.com.br',
    notes: 'Equipou a academia do hotel. Cliente satisfeito, pode indicar a rede.',
    lastInteractionDaysAgo: 25,
  },
];

/**
 * Identificadores fixos, um por Lead, na ordem da lista acima.
 *
 * O e-mail do Lead não é único (a remoção lógica não deixaria recadastrar um
 * contato apagado), então não serve de chave para o `upsert`. Um UUID estável
 * por posição resolve, e mantém `npm run db:seed` idempotente.
 */
const leadId = (index: number): string =>
  `11111111-2222-4333-8444-${String(index + 1).padStart(12, '0')}`;

const daysAgo = (days: number): Date => new Date(Date.now() - days * 24 * 60 * 60 * 1000);

const prisma = createPrismaClient();

try {
  const passwordHash = await hashPassword(SEED_PASSWORD);

  const userIdByEmail = new Map<string, string>();

  for (const user of USERS) {
    const saved = await prisma.user.upsert({
      where: { email: user.email },
      // Só o que identifica a pessoa é atualizado: `passwordHash` e
      // `tokenVersion` de quem já existe ficam como estão.
      update: { name: user.name, role: user.role },
      create: { ...user, passwordHash },
    });

    userIdByEmail.set(user.email, saved.id);
  }

  for (const [index, lead] of LEADS.entries()) {
    const ownerId = userIdByEmail.get(lead.owner);
    if (ownerId === undefined) {
      throw new Error(`Lead "${lead.name}" aponta para um responsável fora do seed.`);
    }

    const { owner: _owner, lastInteractionDaysAgo, ...fields } = lead;
    const data = {
      ...fields,
      ownerId,
      lastInteractionAt: daysAgo(lastInteractionDaysAgo),
      // Um contato reposto pelo seed volta a existir, mesmo que alguém o tenha
      // removido enquanto testava a tela.
      deletedAt: null,
    };

    await prisma.lead.upsert({
      where: { id: leadId(index) },
      update: data,
      create: { id: leadId(index), ...data },
    });
  }

  console.log(
    `Seed: ${USERS.length} usuários e ${LEADS.length} leads. ` +
      `Senha de todos: ${SEED_PASSWORD}`,
  );
} finally {
  await prisma.$disconnect();
}
