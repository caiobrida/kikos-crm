import {
  DEAL_STAGES,
  DashboardSummary,
  type DealTally,
  type OwnerTally,
  type UserId,
} from '@kikos/domain';
import { afterEach, beforeEach, describe, expect, it } from '@effect/vitest';
import { Schema } from 'effect';
import {
  DELETED_DEAL_TITLE,
  closedDealsOwnedBy,
  closedValueOwnedBy,
  dealsInStage,
  makeTestHarness,
  valueInStage,
  type TestHarness,
} from '../testing/harness';
import * as read from '../testing/reads';

/*
 * O contrato de `GET /dashboard/summary` — o panorama que o gestor lê de
 * relance.
 *
 * O que este arquivo existe para provar é a regra que o dashboard mais tem a
 * chance de quebrar: **os dois gráficos olham dimensões diferentes do mesmo dado
 * (ADR-0003) e não podem se contradizer**. Um negócio encerrado está na coluna
 * Fechado *e* na barra de ganhos do responsável, e a soma de uma metade tem de
 * fechar com a outra — em toda leitura, inclusive depois de encerrar e de
 * remover.
 */
let harness: TestHarness;

beforeEach(async () => {
  harness = await makeTestHarness();
});

afterEach(async () => {
  await harness.close();
});

/** Abre o dashboard e decodifica com o Schema que o app web usa. */
const summary = async (): Promise<DashboardSummary> => {
  const response = await harness.get('/dashboard/summary');
  expect(response.statusCode).toBe(200);
  return Schema.decodeUnknownSync(DashboardSummary)(response.json());
};

const stage = (panorama: DashboardSummary, name: string): DealTally => {
  const found = panorama.pipeline.find((tally) => tally.stage === name);
  if (found === undefined) throw new Error(`O funil não trouxe a coluna ${name}.`);
  return found;
};

const owner = (panorama: DashboardSummary, id: UserId): OwnerTally => {
  const found = panorama.owners.find((tally) => tally.owner.id === id);
  if (found === undefined) throw new Error(`O dashboard não trouxe o responsável ${id}.`);
  return found;
};

/** Quantos negócios o time inteiro encerrou, somando os dois desfechos. */
const closedByTeam = (panorama: DashboardSummary): number =>
  panorama.owners.reduce((sum, tally) => sum + tally.won.count + tally.lost.count, 0);

it('recusa quem não está logado', async () => {
  const response = await harness.app.inject({
    method: 'GET',
    url: '/dashboard/summary',
  });

  expect(response.statusCode).toBe(401);
});

describe('o funil', () => {
  it('devolve as cinco colunas, na ordem do funil', async () => {
    const panorama = await summary();

    expect(panorama.pipeline.map((tally) => tally.stage)).toEqual([...DEAL_STAGES]);
  });

  it('conta em cada coluna o mesmo que o contador do board', async () => {
    const panorama = await summary();

    for (const name of DEAL_STAGES) {
      expect(stage(panorama, name).count).toBe(dealsInStage(name));
    }
  });

  it('soma o valor dos negócios de cada coluna', async () => {
    const panorama = await summary();

    for (const name of DEAL_STAGES) {
      expect(stage(panorama, name).valueInCents).toBe(valueInStage(name));
    }
  });

  it('devolve a coluna vazia em vez de omiti-la', async () => {
    // A carteira de exemplo enche as cinco colunas; esvaziar uma pelo caminho
    // que o produto oferece é o que prova que a barra continua desenhada.
    const panorama = await summary();
    const closable = stage(panorama, 'NEGOTIATION');
    expect(closable.count).toBe(1);

    const deal = await read.dealNamed(harness, 'Renovação do parque de máquinas');
    expect(
      (await harness.post(`/deals/${deal.id}/close`, { result: 'WON' })).statusCode,
    ).toBe(200);

    const after = await summary();
    expect(after.pipeline.map((tally) => tally.stage)).toEqual([...DEAL_STAGES]);
    expect(stage(after, 'NEGOTIATION')).toEqual({
      stage: 'NEGOTIATION',
      count: 0,
      valueInCents: 0,
    });
  });

  it('não conta o negócio removido', async () => {
    /*
     * A fixture nasce com um negócio removido em `CONTACT_MADE`. As contagens
     * acima já o excluem porque `dealsInStage` conta só os visíveis; esta
     * asserção fixa o motivo, para que uma agregação que esquecesse o filtro
     * falhe aqui dizendo qual é o problema.
     */
    const panorama = await summary();
    const crowded = stage(panorama, 'CONTACT_MADE');

    expect(crowded.count).toBe(dealsInStage('CONTACT_MADE'));

    const response = await harness.get(
      `/deals?search=${encodeURIComponent(DELETED_DEAL_TITLE)}`,
    );
    expect(response.json()).toMatchObject({ total: 0 });
  });
});

describe('os responsáveis', () => {
  it('devolve o time inteiro, em ordem alfabética', async () => {
    const panorama = await summary();

    expect(panorama.owners.map((tally) => tally.owner.name)).toEqual([
      harness.seller.name,
      harness.manager.name,
    ]);
  });

  it('conta e soma os ganhos e os perdidos de cada responsável', async () => {
    const panorama = await summary();
    const manager = owner(panorama, harness.manager.id);

    expect(manager.won).toEqual({
      count: closedDealsOwnedBy('manager', 'WON'),
      valueInCents: closedValueOwnedBy('manager', 'WON'),
    });
    expect(manager.lost).toEqual({
      count: closedDealsOwnedBy('manager', 'LOST'),
      valueInCents: closedValueOwnedBy('manager', 'LOST'),
    });
  });

  it('devolve em zero quem ainda não encerrou negócio nenhum', async () => {
    /*
     * Uma linha em zero é uma resposta; uma linha ausente é um silêncio. É a
     * razão de o dashboard listar o time inteiro em vez de só quem fechou —
     * e é também o que impede a soma dos dois gráficos de divergir.
     */
    const panorama = await summary();

    expect(owner(panorama, harness.seller.id)).toMatchObject({
      won: { count: 0, valueInCents: 0 },
      lost: { count: 0, valueInCents: 0 },
    });
  });

  it('conta o gestor que fechou negócio, e não só quem tem papel de vendedor', async () => {
    /*
     * O verbete é **Owner**, não Seller (ver CONTEXT.md): quem recebe um negócio
     * é um User qualquer, e o gestor da fixture fechou dois. Se a lista fosse
     * `?role=SELLER`, estes dois sumiriam daqui e continuariam contados na
     * coluna Fechado — que é exatamente a contradição que esta fatia evita.
     */
    const panorama = await summary();
    const manager = owner(panorama, harness.manager.id);

    expect(manager.won.count + manager.lost.count).toBeGreaterThan(0);
  });

  it('não devolve e-mail nem hash de senha do responsável', async () => {
    const response = await harness.get('/dashboard/summary');

    expect(JSON.stringify(response.json())).not.toContain('@kikos.com.br');
    expect(JSON.stringify(response.json())).not.toContain('$2');
  });
});

describe('os dois gráficos não se contradizem', () => {
  it('a coluna Fechado é a soma dos ganhos e perdidos do time', async () => {
    const panorama = await summary();

    expect(closedByTeam(panorama)).toBe(stage(panorama, 'CLOSED').count);
  });

  it('encerrar um negócio move o número de um gráfico para o outro', async () => {
    const before = await summary();
    const deal = await read.dealNamed(harness, 'Renovação do parque de máquinas');

    const response = await harness.post(`/deals/${deal.id}/close`, { result: 'WON' });
    expect(response.statusCode).toBe(200);

    const after = await summary();

    // Saiu da coluna em que estava e entrou na Fechado — o total do funil não
    // muda, porque o negócio continua existindo.
    expect(stage(after, 'NEGOTIATION').count).toBe(
      stage(before, 'NEGOTIATION').count - 1,
    );
    expect(stage(after, 'CLOSED').count).toBe(stage(before, 'CLOSED').count + 1);
    expect(stage(after, 'CLOSED').valueInCents).toBe(
      stage(before, 'CLOSED').valueInCents + deal.valueInCents,
    );

    // E entrou nos ganhos de quem era o responsável, com o valor junto.
    const tally = owner(after, deal.owner.id);
    expect(tally.won.count).toBe(owner(before, deal.owner.id).won.count + 1);
    expect(tally.won.valueInCents).toBe(
      owner(before, deal.owner.id).won.valueInCents + deal.valueInCents,
    );

    // A invariante continua valendo depois da escrita.
    expect(closedByTeam(after)).toBe(stage(after, 'CLOSED').count);
  });

  it('o mesmo encerramento chega à lista de Leads, com o selo do contato', async () => {
    /*
     * A terceira ponta do "os números batem": o dashboard e a carteira contam a
     * mesma história sobre o mesmo acontecimento. Encerrar como ganho soma um
     * aos ganhos do responsável **e** leva o contato vinculado para o status
     * `WON`, pela regra "último evento vence" do domínio. Se as duas telas
     * divergissem, o gestor veria uma venda no gráfico e um contato "em
     * negociação" na lista.
     */
    const deal = await read.dealNamed(harness, 'Renovação do parque de máquinas');
    const before = await summary();

    expect(
      (await harness.post(`/deals/${deal.id}/close`, { result: 'WON' })).statusCode,
    ).toBe(200);

    const after = await summary();
    expect(owner(after, deal.owner.id).won.count).toBe(
      owner(before, deal.owner.id).won.count + 1,
    );

    const lead = await read.leadNamed(harness, deal.lead.name);
    expect(lead.status).toBe('WON');
  });

  it('remover um negócio encerrado o tira dos dois gráficos de uma vez', async () => {
    const before = await summary();
    const deal = await read.dealNamed(harness, 'Kit de acessórios funcionais');

    expect((await harness.del(`/deals/${deal.id}`)).statusCode).toBe(204);

    const after = await summary();

    expect(stage(after, 'CLOSED').count).toBe(stage(before, 'CLOSED').count - 1);
    expect(stage(after, 'CLOSED').valueInCents).toBe(
      stage(before, 'CLOSED').valueInCents - deal.valueInCents,
    );

    const tally = owner(after, deal.owner.id);
    expect(tally.won.count).toBe(owner(before, deal.owner.id).won.count - 1);
    expect(tally.won.valueInCents).toBe(
      owner(before, deal.owner.id).won.valueInCents - deal.valueInCents,
    );

    expect(closedByTeam(after)).toBe(stage(after, 'CLOSED').count);
  });

  it('remover um negócio em aberto o tira do funil e da tabela', async () => {
    const before = await summary();
    const deal = await read.dealNamed(harness, 'Esteiras para a sala principal');

    expect((await harness.del(`/deals/${deal.id}`)).statusCode).toBe(204);

    const after = await summary();
    expect(stage(after, 'NEW').count).toBe(stage(before, 'NEW').count - 1);
    expect(stage(after, 'NEW').valueInCents).toBe(
      stage(before, 'NEW').valueInCents - deal.valueInCents,
    );

    // A tabela do dashboard é a mesma listagem paginada do board: um negócio
    // removido some das duas pela mesma cláusula, na camada de repositório.
    const listed = await harness.get(
      `/deals?search=${encodeURIComponent('Esteiras para a sala principal')}`,
    );
    expect(listed.json()).toMatchObject({ total: 0 });
  });
});
