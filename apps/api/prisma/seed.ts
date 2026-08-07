import {
  stageMoveRecord,
  type CommentKind,
  type DealResult,
  type DealStage,
  type LeadSource,
  type LeadStatus,
} from '@kikos/domain';
import { hashPassword } from '../src/auth/password';
import { createPrismaClient } from '../src/prisma';

/*
 * Os dados de exemplo: o gestor e os três vendedores dos mockups, a carteira de
 * contatos da lista de Leads, o funil que o board mostra no primeiro acesso, e a
 * linha do tempo dos negócios que o detalhamento abre.
 *
 * O CRM aberto pela primeira vez precisa se parecer com o desenho, então os
 * nomes daqui são os mesmos que aparecem nos cards e nas tabelas.
 *
 * O seed é idempotente: `upsert` por e-mail para os Users e por identificador
 * fixo para Leads e Deals. Rodá-lo duas vezes não duplica ninguém e não derruba
 * a `tokenVersion` de quem já está logado.
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
 *
 * Todos são de vendedores. O modelo aceita qualquer User como responsável — o
 * `role` é rótulo, não regra (ADR-0001) —, mas a tela oferece os vendedores, e
 * dado de exemplo que não aparece no filtro só confunde quem está avaliando.
 */
const LEADS = [
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
    owner: 'caio.brida@kikos.com.br',
    notes: 'Conta grande, com compra centralizada pela matriz.',
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
    owner: 'maria.silva@kikos.com.br',
    notes: 'Equipou a academia do hotel. Cliente satisfeito, pode indicar a rede.',
    lastInteractionDaysAgo: 25,
  },
  /*
   * `as const satisfies` em vez de anotar o tipo: o `satisfies` cobra que cada
   * linha seja um `SeedLead` de verdade, e o `as const` preserva os literais,
   * de onde sai o `SeedLeadEmail` abaixo. É o que faz um Deal apontar para um
   * contato inexistente quebrar o typecheck, em vez de estourar na inserção.
   */
] as const satisfies readonly SeedLead[];

type SeedLeadEmail = (typeof LEADS)[number]['email'];

/*
 * ---------------------------------------------------------------------------
 * O funil
 * ---------------------------------------------------------------------------
 *
 * Vinte e um negócios espalhados pelas cinco colunas do board. A distribuição
 * não é aleatória:
 *
 * - **Proposta enviada tem sete**, mais que os cinco de uma leva de coluna, o
 *   que faz o "carregar mais" aparecer sem que ninguém precise cadastrar nada;
 * - a coluna Fechado tem ganhos e perdidos, porque estágio e resultado são
 *   dimensões diferentes (ADR-0003);
 * - os estágios batem com o status dos Leads da carteira: quem tem proposta ou
 *   negociação em aberto está como "Em negociação", quem tem negócio ganho está
 *   como "Ganho", e os três contatos ainda sem negócio continuam "Novo". É a
 *   regra "último evento vence" do spec, já refletida nos dados.
 *
 * Os valores são inteiros em centavos, como em todo o CRM.
 */
interface SeedDeal {
  readonly title: string;
  readonly valueInCents: number;
  readonly lead: SeedLeadEmail;
  readonly owner: SeedUserEmail;
  readonly stage: DealStage;
  readonly result: DealResult;
  readonly description: string | null;
  /** Em quantos dias se espera fechar. `null` quando não foi informado. */
  readonly expectedCloseInDays: number | null;
  readonly lastInteractionDaysAgo: number;
}

const DEALS = [
  {
    title: 'Kit de halteres emborrachados',
    valueInCents: 840_000,
    lead: 'patricia@corpolivre.com.br',
    owner: 'maria.silva@kikos.com.br',
    stage: 'NEW',
    result: 'OPEN',
    description: 'Linha de entrada, dois pares por peso.',
    expectedCloseInDays: 45,
    lastInteractionDaysAgo: 2,
  },
  {
    title: 'Piso emborrachado para a área de peso livre',
    valueInCents: 1_290_000,
    lead: 'rafael@crossboxzs.com.br',
    owner: 'ana.nogueira@kikos.com.br',
    stage: 'NEW',
    result: 'OPEN',
    description: null,
    expectedCloseInDays: null,
    lastInteractionDaysAgo: 3,
  },
  {
    title: 'Bolas, colchonetes e acessórios',
    valueInCents: 380_000,
    lead: 'larissa@aurorapilates.com.br',
    owner: 'ana.nogueira@kikos.com.br',
    stage: 'NEW',
    result: 'OPEN',
    description: null,
    expectedCloseInDays: 60,
    lastInteractionDaysAgo: 6,
  },
  {
    title: 'Aparelhos de pilates para o studio',
    valueInCents: 3_450_000,
    lead: 'larissa@aurorapilates.com.br',
    owner: 'ana.nogueira@kikos.com.br',
    stage: 'CONTACT_MADE',
    result: 'OPEN',
    description: 'Cadillac, reformer e barrel.',
    expectedCloseInDays: 40,
    lastInteractionDaysAgo: 4,
  },
  {
    title: 'Renovação da academia do clube',
    valueInCents: 15_600_000,
    lead: 'fernanda.lopes@atleticopaulistano.com.br',
    owner: 'ana.nogueira@kikos.com.br',
    stage: 'CONTACT_MADE',
    result: 'OPEN',
    description: 'Projeto previsto para o próximo ano, com verba já aprovada.',
    expectedCloseInDays: 120,
    lastInteractionDaysAgo: 12,
  },
  {
    title: 'Estação de treino funcional',
    valueInCents: 2_780_000,
    lead: 'rafael@crossboxzs.com.br',
    owner: 'ana.nogueira@kikos.com.br',
    stage: 'CONTACT_MADE',
    result: 'OPEN',
    description: null,
    expectedCloseInDays: null,
    lastInteractionDaysAgo: 7,
  },
  {
    title: 'Bicicletas ergométricas',
    valueInCents: 1_950_000,
    lead: 'patricia@corpolivre.com.br',
    owner: 'maria.silva@kikos.com.br',
    stage: 'CONTACT_MADE',
    result: 'OPEN',
    description: 'Seis unidades para a sala de aula coletiva.',
    expectedCloseInDays: 50,
    lastInteractionDaysAgo: 9,
  },
  {
    title: 'Esteiras profissionais — unidade Morumbi',
    valueInCents: 12_500_000,
    lead: 'juliana.prado@smartfitmorumbi.com.br',
    owner: 'ana.nogueira@kikos.com.br',
    stage: 'PROPOSAL_SENT',
    result: 'OPEN',
    description: 'Doze esteiras, com instalação e um ano de manutenção.',
    expectedCloseInDays: 30,
    lastInteractionDaysAgo: 0,
  },
  {
    title: 'Esteiras profissionais — unidade Berrini',
    valueInCents: 9_800_000,
    lead: 'juliana.prado@smartfitmorumbi.com.br',
    owner: 'ana.nogueira@kikos.com.br',
    stage: 'PROPOSAL_SENT',
    result: 'OPEN',
    description: 'Mesma proposta da Morumbi, com nove esteiras.',
    expectedCloseInDays: 30,
    lastInteractionDaysAgo: 1,
  },
  {
    title: 'Sala de musculação completa',
    valueInCents: 48_000_000,
    lead: 'marcelo.tanaka@bodytechvo.com.br',
    owner: 'caio.brida@kikos.com.br',
    stage: 'PROPOSAL_SENT',
    result: 'OPEN',
    description: 'Proposta apresentada ao conselho depois da feira IHRSA.',
    expectedCloseInDays: 25,
    lastInteractionDaysAgo: 1,
  },
  {
    title: 'Área de cardio do mezanino',
    valueInCents: 22_400_000,
    lead: 'marcelo.tanaka@bodytechvo.com.br',
    owner: 'caio.brida@kikos.com.br',
    stage: 'PROPOSAL_SENT',
    result: 'OPEN',
    description: null,
    expectedCloseInDays: 35,
    lastInteractionDaysAgo: 5,
  },
  {
    title: 'Reposição de aparelhos de musculação',
    valueInCents: 18_700_000,
    lead: 'thiago.v@panobiancosa.com.br',
    owner: 'caio.brida@kikos.com.br',
    stage: 'PROPOSAL_SENT',
    result: 'OPEN',
    description: 'Compra centralizada pela matriz.',
    expectedCloseInDays: 20,
    lastInteractionDaysAgo: 10,
  },
  {
    title: 'Esteiras e elípticos da matriz',
    valueInCents: 26_300_000,
    lead: 'thiago.v@panobiancosa.com.br',
    owner: 'caio.brida@kikos.com.br',
    stage: 'PROPOSAL_SENT',
    result: 'OPEN',
    description: null,
    expectedCloseInDays: null,
    lastInteractionDaysAgo: 14,
  },
  {
    /*
     * O responsável do negócio é a Maria, e o do Lead é a Ana: quem prospecta
     * nem sempre é quem fecha, e o modelo separa as duas coisas de propósito.
     */
    title: 'Linha de bicicletas indoor',
    valueInCents: 6_700_000,
    lead: 'juliana.prado@smartfitmorumbi.com.br',
    owner: 'maria.silva@kikos.com.br',
    stage: 'PROPOSAL_SENT',
    result: 'OPEN',
    description: 'Vinte bicicletas para a sala de spinning.',
    expectedCloseInDays: 45,
    lastInteractionDaysAgo: 16,
  },
  {
    title: 'Contrato guarda-chuva das cinco unidades',
    valueInCents: 92_000_000,
    lead: 'marcelo.tanaka@bodytechvo.com.br',
    owner: 'caio.brida@kikos.com.br',
    stage: 'NEGOTIATION',
    result: 'OPEN',
    description: 'Desconto por volume em discussão com o financeiro.',
    expectedCloseInDays: 15,
    lastInteractionDaysAgo: 1,
  },
  {
    title: 'Equipamentos da nova unidade',
    valueInCents: 31_500_000,
    lead: 'thiago.v@panobiancosa.com.br',
    owner: 'caio.brida@kikos.com.br',
    stage: 'NEGOTIATION',
    result: 'OPEN',
    description: 'Inauguração prevista para o próximo trimestre.',
    expectedCloseInDays: 22,
    lastInteractionDaysAgo: 8,
  },
  {
    title: 'Renovação do parque de máquinas',
    valueInCents: 27_900_000,
    lead: 'juliana.prado@smartfitmorumbi.com.br',
    owner: 'ana.nogueira@kikos.com.br',
    stage: 'NEGOTIATION',
    result: 'OPEN',
    description: 'Troca das duas unidades até o fim do trimestre.',
    expectedCloseInDays: 18,
    lastInteractionDaysAgo: 11,
  },
  {
    title: 'Reposição de bicicletas ergométricas',
    valueInCents: 8_900_000,
    lead: 'eduardo.bastos@vitalfitness.com.br',
    owner: 'maria.silva@kikos.com.br',
    stage: 'CLOSED',
    result: 'WON',
    description: 'Quatro unidades da rede.',
    expectedCloseInDays: null,
    lastInteractionDaysAgo: 5,
  },
  {
    title: 'Academia do hotel — equipamento completo',
    valueInCents: 14_200_000,
    lead: 'paulo.menezes@serranowellness.com.br',
    owner: 'maria.silva@kikos.com.br',
    stage: 'CLOSED',
    result: 'WON',
    description: 'Cliente satisfeito, pode indicar a rede.',
    expectedCloseInDays: null,
    lastInteractionDaysAgo: 25,
  },
  {
    title: 'Ampliação do espaço de crossfit',
    valueInCents: 5_600_000,
    lead: 'gustavo.peixoto@academiaritmo.com.br',
    owner: 'caio.brida@kikos.com.br',
    stage: 'CLOSED',
    result: 'LOST',
    description: 'Fechou com concorrente por prazo de entrega.',
    expectedCloseInDays: null,
    lastInteractionDaysAgo: 8,
  },
  {
    title: 'Renovação da sala de musculação',
    valueInCents: 7_300_000,
    lead: 'renata@forcatotal.com.br',
    owner: 'maria.silva@kikos.com.br',
    stage: 'CLOSED',
    result: 'LOST',
    description: 'Adiou o investimento para o ano que vem.',
    expectedCloseInDays: null,
    lastInteractionDaysAgo: 20,
  },
  /* `as const satisfies`, como na carteira: o `satisfies` cobra que cada linha
     seja um `SeedDeal` de verdade, e o `as const` preserva os títulos, de onde
     sai o `SeedDealTitle` abaixo. É o que faz um comentário apontar para um
     negócio inexistente quebrar o typecheck, em vez de estourar na inserção. */
] as const satisfies readonly SeedDeal[];

type SeedDealTitle = (typeof DEALS)[number]['title'];

/*
 * ---------------------------------------------------------------------------
 * A linha do tempo
 * ---------------------------------------------------------------------------
 *
 * Os negócios mais adiantados do funil abrem com histórico, que é o que faz o
 * detalhamento se parecer com o mockup no primeiro acesso. A distribuição
 * também não é aleatória:
 *
 * - **as duas espécies convivem** em mais de um negócio, e é isso que mostra a
 *   distinção visual entre o que uma pessoa escreveu e o que o sistema
 *   registrou sem que ninguém precise arrastar um card antes;
 * - o texto dos registros de sistema sai de `stageMoveRecord`, a **mesma**
 *   função que a rota de movimentação usa — dado de exemplo escrito à mão logo
 *   divergiria do que o produto grava;
 * - os negócios recém-abertos ficam sem histórico, que é o estado de quem
 *   acabou de cadastrar um.
 */
interface SeedComment {
  readonly deal: SeedDealTitle;
  readonly kind: CommentKind;
  readonly body: string;
  readonly author: SeedUserEmail;
  readonly daysAgo: number;
}

const COMMENTS: readonly SeedComment[] = [
  {
    deal: 'Esteiras profissionais — unidade Morumbi',
    kind: 'SYSTEM',
    body: stageMoveRecord('NEW', 'CONTACT_MADE'),
    author: 'ana.nogueira@kikos.com.br',
    daysAgo: 9,
  },
  {
    deal: 'Esteiras profissionais — unidade Morumbi',
    kind: 'USER',
    body: 'Visitei a unidade. São doze esteiras da linha antiga, todas com mais de seis anos de uso.',
    author: 'ana.nogueira@kikos.com.br',
    daysAgo: 7,
  },
  {
    deal: 'Esteiras profissionais — unidade Morumbi',
    kind: 'SYSTEM',
    body: stageMoveRecord('CONTACT_MADE', 'PROPOSAL_SENT'),
    author: 'ana.nogueira@kikos.com.br',
    daysAgo: 3,
  },
  {
    deal: 'Esteiras profissionais — unidade Morumbi',
    kind: 'USER',
    body: 'Proposta enviada com instalação e um ano de manutenção inclusos. A Juliana leva ao comitê na quinta.',
    author: 'ana.nogueira@kikos.com.br',
    daysAgo: 0,
  },
  {
    deal: 'Sala de musculação completa',
    kind: 'SYSTEM',
    body: stageMoveRecord('CONTACT_MADE', 'PROPOSAL_SENT'),
    author: 'caio.brida@kikos.com.br',
    daysAgo: 4,
  },
  {
    deal: 'Sala de musculação completa',
    kind: 'USER',
    body: 'Apresentei ao conselho depois da feira. Pediram para desmembrar o orçamento por sala.',
    author: 'caio.brida@kikos.com.br',
    daysAgo: 1,
  },
  {
    deal: 'Contrato guarda-chuva das cinco unidades',
    kind: 'SYSTEM',
    body: stageMoveRecord('PROPOSAL_SENT', 'NEGOTIATION'),
    author: 'caio.brida@kikos.com.br',
    daysAgo: 6,
  },
  {
    deal: 'Contrato guarda-chuva das cinco unidades',
    kind: 'USER',
    body: 'Financeiro pediu desconto por volume. Levei 8% e eles voltaram pedindo 12%.',
    author: 'caio.brida@kikos.com.br',
    daysAgo: 1,
  },
  {
    deal: 'Renovação do parque de máquinas',
    kind: 'USER',
    body: 'Cliente quer fechar as duas unidades juntas para conseguir preço melhor.',
    author: 'ana.nogueira@kikos.com.br',
    daysAgo: 11,
  },
  {
    deal: 'Academia do hotel — equipamento completo',
    kind: 'USER',
    body: 'Entrega e montagem concluídas. O Paulo topou nos indicar para as outras unidades da rede.',
    author: 'maria.silva@kikos.com.br',
    daysAgo: 25,
  },
  {
    deal: 'Ampliação do espaço de crossfit',
    kind: 'USER',
    body: 'Perdemos por prazo: o concorrente entregava em três semanas e nós em oito.',
    author: 'caio.brida@kikos.com.br',
    daysAgo: 8,
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

/** O mesmo para os Deals, noutra faixa, pelo mesmo motivo. */
const dealId = (index: number): string =>
  `22222222-3333-4444-8555-${String(index + 1).padStart(12, '0')}`;

/**
 * E o mesmo para os registros da linha do tempo.
 *
 * Aqui o identificador estável importa mais que nos outros: comentário não se
 * edita nem se remove, então um seed que inserisse em vez de fazer `upsert`
 * duplicaria o histórico a cada execução — e não haveria rota para limpar.
 */
const commentId = (index: number): string =>
  `33333333-4444-4555-8666-${String(index + 1).padStart(12, '0')}`;

const DAY_MS = 24 * 60 * 60 * 1000;

const daysAgo = (days: number): Date => new Date(Date.now() - days * DAY_MS);
const daysAhead = (days: number): Date => new Date(Date.now() + days * DAY_MS);

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

  const leadIdByEmail = new Map<string, string>();

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

    leadIdByEmail.set(lead.email, leadId(index));
  }

  const dealIdByTitle = new Map<string, string>();

  for (const [index, deal] of DEALS.entries()) {
    const ownerId = userIdByEmail.get(deal.owner);
    const dealLeadId = leadIdByEmail.get(deal.lead);
    if (ownerId === undefined || dealLeadId === undefined) {
      throw new Error(
        `O negócio "${deal.title}" aponta para um Lead ou responsável fora do seed.`,
      );
    }

    const {
      owner: _owner,
      lead: _lead,
      expectedCloseInDays,
      lastInteractionDaysAgo,
      ...fields
    } = deal;

    const data = {
      ...fields,
      leadId: dealLeadId,
      ownerId,
      expectedCloseDate:
        expectedCloseInDays === null ? null : daysAhead(expectedCloseInDays),
      /*
       * Encerrar preenche resultado, data de fechamento e estágio numa operação
       * só (ADR-0003), então um negócio de exemplo com resultado e sem data
       * seria um estado que o domínio não sabe produzir.
       */
      closedAt: deal.result === 'OPEN' ? null : daysAgo(lastInteractionDaysAgo),
      lastInteractionAt: daysAgo(lastInteractionDaysAgo),
      deletedAt: null,
    };

    await prisma.deal.upsert({
      where: { id: dealId(index) },
      update: data,
      create: { id: dealId(index), ...data },
    });

    dealIdByTitle.set(deal.title, dealId(index));
  }

  for (const [index, comment] of COMMENTS.entries()) {
    const authorId = userIdByEmail.get(comment.author);
    const commentDealId = dealIdByTitle.get(comment.deal);
    if (authorId === undefined || commentDealId === undefined) {
      throw new Error(
        `O registro "${comment.body}" aponta para um negócio ou autor fora do seed.`,
      );
    }

    // O campo é renomeado na desestruturação porque `daysAgo` já é o nome da
    // função que converte "há N dias" em data absoluta, logo acima.
    const { deal: _deal, author: _author, daysAgo: written, ...fields } = comment;
    const data = {
      ...fields,
      dealId: commentDealId,
      authorId,
      createdAt: daysAgo(written),
    };

    await prisma.comment.upsert({
      where: { id: commentId(index) },
      update: data,
      create: { id: commentId(index), ...data },
    });
  }

  console.log(
    `Seed: ${USERS.length} usuários, ${LEADS.length} leads, ${DEALS.length} negócios ` +
      `e ${COMMENTS.length} registros na linha do tempo. Senha de todos: ${SEED_PASSWORD}`,
  );
} finally {
  await prisma.$disconnect();
}
