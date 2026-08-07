import { describe, expect, it } from '@effect/vitest';
import { Either, Schema } from 'effect';
import { CLOSED_DEAL_RESULTS, OPEN_DEAL_STAGES } from './enums';
import { toValidationIssues } from './errors';
import {
  CreateLeadInput,
  LEAD_STATUS_AFTER_DEAL_CREATED,
  UpdateLeadInput,
  leadHasOpenDealsMessage,
  leadStatusAfterDealClosed,
  leadStatusAfterDealMoved,
} from './lead';

/*
 * O Schema de cadastro de Lead é puro, então vale o `it` comum — sem Layer, sem
 * `it.effect`.
 *
 * Cada teste aqui vale por dois: este é o mesmo objeto que valida o formulário
 * no navegador (via `@hookform/resolvers/effect-ts`) e o corpo de `POST /leads`
 * na API. Uma regra escrita aqui não tem como valer só de um lado.
 */

/** Um UUID qualquer: o `<select>` de responsável manda um destes. */
const OWNER_ID = '4f0b4d9a-1c8e-4a5f-9c2b-6e7a1d3f5b90';

/** O formulário preenchido como a tela o manda: tudo string, opcionais vazios. */
const FILLED_FORM = {
  name: 'Juliana Prado',
  company: 'Smart Fit Morumbi',
  email: 'juliana.prado@smartfitmorumbi.com.br',
  phone: '(11) 98812-4471',
  jobTitle: '',
  source: 'REFERRAL',
  ownerId: OWNER_ID,
  notes: '',
};

const decode = (form: Record<string, unknown>) =>
  Schema.decodeUnknownEither(CreateLeadInput)(
    { ...FILLED_FORM, ...form },
    {
      // O mesmo que a API e o resolver do formulário usam: todas as queixas de
      // uma vez, para que a tela pinte os campos errados juntos.
      errors: 'all',
    },
  );

const accept = (form: Record<string, unknown> = {}) => {
  const result = decode(form);
  if (Either.isLeft(result)) {
    throw new Error(`Esperava aceitar, mas recusou: ${result.left.message}`);
  }
  return result.right;
};

/**
 * As queixas por campo. Passam pelo mesmo `toValidationIssues` que a API usa
 * para montar o corpo de erro, então o que se afirma aqui é o texto que a tela
 * de fato recebe — não uma leitura paralela da recusa.
 */
const reject = (form: Record<string, unknown>): ReadonlyMap<string, string> => {
  const result = decode(form);
  if (Either.isRight(result)) throw new Error('Esperava recusa, mas aceitou.');

  return new Map(
    toValidationIssues(result.left).map((issue) => [issue.path, issue.message]),
  );
};

describe('CreateLeadInput', () => {
  describe('o formulário preenchido', () => {
    it('aceita os seis campos obrigatórios mais os dois opcionais', () => {
      const lead = accept({
        jobTitle: 'Gerente de Operações',
        notes: 'Quer trocar as esteiras.',
      });

      expect(lead.name).toBe('Juliana Prado');
      expect(lead.source).toBe('REFERRAL');
      expect(lead.ownerId).toBe(OWNER_ID);
      expect(lead.jobTitle).toBe('Gerente de Operações');
      expect(lead.notes).toBe('Quer trocar as esteiras.');
    });

    it('apara os espaços que ninguém quis digitar', () => {
      const lead = accept({ name: '  Juliana Prado  ', company: ' Smart Fit Morumbi ' });

      expect(lead.name).toBe('Juliana Prado');
      expect(lead.company).toBe('Smart Fit Morumbi');
    });

    it('normaliza o e-mail, como no login', () => {
      const lead = accept({ email: '  Juliana.Prado@SmartFit.com.br ' });

      expect(lead.email).toBe('juliana.prado@smartfit.com.br');
    });

    it('lê campo opcional em branco como ausência, e não como texto vazio', () => {
      const lead = accept({ jobTitle: '   ', notes: '' });

      // A diferença aparece no banco: a coluna fica `NULL`, não uma string
      // vazia que a tela depois teria que tratar como se fosse nada.
      expect(lead.jobTitle).toBeUndefined();
      expect(lead.notes).toBeUndefined();
    });

    it('volta à forma do formulário na hora de enviar', () => {
      // O caminho que a mutação do app web usa: o valor de domínio é
      // *codificado* de volta com o mesmo Schema, em vez de virar um corpo de
      // requisição montado à mão. `undefined` volta a ser `""`.
      const wire = Schema.encodeSync(CreateLeadInput)(accept());

      expect(wire).toEqual(FILLED_FORM);
    });

    it('ignora o que o formulário não oferece', () => {
      const lead = accept({
        status: 'WON',
        lastInteractionAt: '2020-01-01T00:00:00.000Z',
      });

      // Quem decide o status e a última interação de um Lead recém-criado é o
      // domínio, não o corpo da requisição.
      expect(lead).not.toHaveProperty('status');
      expect(lead).not.toHaveProperty('lastInteractionAt');
    });
  });

  describe('a recusa', () => {
    it('aponta o campo obrigatório em branco', () => {
      expect(reject({ name: '' }).get('name')).toBe('Informe o nome do contato.');
      expect(reject({ company: '' }).get('company')).toBe('Informe a empresa.');
      expect(reject({ phone: '' }).get('phone')).toBe('Informe o telefone.');
    });

    it('não aceita espaço em branco como preenchimento', () => {
      expect(reject({ name: '   ' }).get('name')).toBe('Informe o nome do contato.');
    });

    it('recusa e-mail malformado com a mesma mensagem do login', () => {
      expect(reject({ email: 'juliana.prado' }).get('email')).toBe(
        'Informe um e-mail válido.',
      );
    });

    it('cobra a escolha da origem, que o `<select>` manda vazia', () => {
      expect(reject({ source: '' }).get('source')).toBe('Escolha a origem do Lead.');
      expect(reject({ source: 'INDICACAO' }).get('source')).toBe(
        'Escolha a origem do Lead.',
      );
    });

    it('cobra a escolha do responsável', () => {
      expect(reject({ ownerId: '' }).get('ownerId')).toBe(
        'Escolha o vendedor responsável.',
      );
      expect(reject({ ownerId: 'ana' }).get('ownerId')).toBe(
        'Escolha o vendedor responsável.',
      );
    });

    it('recusa texto absurdamente longo, que só chega por engano ou por má-fé', () => {
      expect(reject({ name: 'a'.repeat(200) }).has('name')).toBe(true);
      expect(reject({ notes: 'a'.repeat(3000) }).has('notes')).toBe(true);
    });

    it('reúne todas as queixas numa recusa só', () => {
      const issues = reject({ name: '', company: '', email: 'nao-e-email' });

      // A tela pinta os três campos de uma vez, em vez de revelar o próximo
      // erro a cada tentativa de salvar.
      expect([...issues.keys()].sort()).toEqual(['company', 'email', 'name']);
    });
  });
});

/*
 * A carga de `PUT /leads/:id` — e, campo por campo, o mesmo formulário.
 *
 * O que estes testes fixam é a decisão: **editar um contato é preencher o
 * cadastro de novo**, com os valores que já estavam lá. Não há um segundo
 * vocabulário de "campos editáveis" que possa divergir do primeiro.
 */
describe('UpdateLeadInput', () => {
  const edit = Schema.decodeUnknownEither(UpdateLeadInput, { errors: 'all' });

  it('aceita a carga inteira do cadastro', () => {
    const lead = Either.getOrThrow(
      edit({ ...FILLED_FORM, jobTitle: 'Gerente de Operações', notes: 'Ligar terça.' }),
    );

    expect(lead.name).toBe('Juliana Prado');
    expect(lead.jobTitle).toBe('Gerente de Operações');
    expect(lead.notes).toBe('Ligar terça.');
  });

  it('cobra os mesmos campos obrigatórios que o cadastro cobra', () => {
    // Um contato não fica sem nome por ter sido salvo pela tela de edição: a
    // regra é a mesma, e é isso que "um Schema só" quer dizer.
    expect(Either.isLeft(edit({ ...FILLED_FORM, name: '   ' }))).toBe(true);
    expect(Either.isLeft(edit({ ...FILLED_FORM, email: 'juliana.prado' }))).toBe(true);
    expect(Either.isLeft(edit({ ...FILLED_FORM, ownerId: '' }))).toBe(true);
  });

  it('não deixa a edição escolher o status nem a última interação', () => {
    const lead = Either.getOrThrow(
      edit({
        ...FILLED_FORM,
        status: 'WON',
        lastInteractionAt: '2020-01-01T00:00:00.000Z',
      }),
    );

    /*
     * Os dois continuam sendo decididos pelo domínio, como na criação: o selo do
     * contato é sincronizado pelas ações de Deal, e corrigir um telefone não é
     * interação com o cliente. Um campo que não existe no Schema não tem como ser
     * escolhido pelo corpo da requisição.
     */
    expect(lead).not.toHaveProperty('status');
    expect(lead).not.toHaveProperty('lastInteractionAt');
  });

  it('volta à forma do formulário, que é como a tela abre a edição', () => {
    // O caminho de verdade da tela de edição: o contato que veio do servidor é
    // *codificado* para preencher os campos, e decodificado de volta ao salvar.
    const wire = Schema.encodeSync(UpdateLeadInput)(Either.getOrThrow(edit(FILLED_FORM)));

    expect(wire).toEqual(FILLED_FORM);
  });
});

/*
 * A frase que explica por que um contato não pôde ser removido.
 *
 * Ela mora no domínio, e não na rota, pelo mesmo motivo que as recusas do funil
 * moram: é o servidor quem conta os negócios, e é a tela quem mostra o número.
 * Uma frase só, escrita num lugar só.
 */
describe('leadHasOpenDealsMessage', () => {
  it('diz quantos negócios travam a remoção', () => {
    // "quantos Deals em aberto estão travando" é requisito do spec: sem o
    // número, quem lê não sabe se falta fechar um negócio ou uma dúzia.
    expect(leadHasOpenDealsMessage(3)).toContain('3');
  });

  it('concorda em número com o que contou', () => {
    expect(leadHasOpenDealsMessage(1)).toContain('1 negócio em aberto');
    expect(leadHasOpenDealsMessage(2)).toContain('2 negócios em aberto');
  });
});

/*
 * A outra regra pura desta fatia: o status que o contato assume quando um
 * negócio dele muda de estágio.
 *
 * Ela é o que faz a lista de Leads e o board contarem a mesma história — mover
 * um card muda o selo da carteira sem que ninguém atualize duas telas na mão.
 */
describe('leadStatusAfterDealMoved', () => {
  it('leva o contato para Em negociação quando a proposta saiu', () => {
    expect(leadStatusAfterDealMoved('PROPOSAL_SENT')).toBe('NEGOTIATION');
    expect(leadStatusAfterDealMoved('NEGOTIATION')).toBe('NEGOTIATION');
  });

  it('não mexe no selo quando o negócio anda no começo do funil', () => {
    /*
     * A tabela do spec tem uma linha só para movimentação, e estes dois
     * estágios não estão nela. O `undefined` é essa ausência dita em voz alta:
     * o movimento vale como interação — a data anda —, mas não é evento de
     * status.
     *
     * Um Lead tem vários Deals. Se recuar rebaixasse o contato para Em contato,
     * um negócio andando para trás desfaria o Ganho registrado por **outro**.
     */
    expect(leadStatusAfterDealMoved('NEW')).toBeUndefined();
    expect(leadStatusAfterDealMoved('CONTACT_MADE')).toBeUndefined();
  });

  it('não repete o status com que o contato nasce ao ganhar um negócio', () => {
    // Criar um negócio é evento de status (`CONTACT`); movê-lo para o mesmo
    // estágio não é. As duas regras existem separadas por isso.
    expect(LEAD_STATUS_AFTER_DEAL_CREATED).toBe('CONTACT');
    expect(leadStatusAfterDealMoved('NEW')).not.toBe(LEAD_STATUS_AFTER_DEAL_CREATED);
  });

  it('responde a todos os estágios abertos', () => {
    // Um estágio novo no funil precisa passar por aqui para decidir se é evento
    // de status ou não, em vez de cair num caso que ninguém escreveu.
    for (const stage of OPEN_DEAL_STAGES) {
      expect(() => leadStatusAfterDealMoved(stage)).not.toThrow();
    }
  });
});

/*
 * A última linha da tabela de status do spec, e a única que **sempre** mexe no
 * selo: o desfecho de um negócio é o evento mais forte que existe sobre o
 * relacionamento com o contato.
 */
describe('leadStatusAfterDealClosed', () => {
  it('leva o contato ao mesmo desfecho do negócio', () => {
    expect(leadStatusAfterDealClosed('WON')).toBe('WON');
    expect(leadStatusAfterDealClosed('LOST')).toBe('LOST');
  });

  it('nunca devolve `undefined`, ao contrário da movimentação', () => {
    /*
     * Movimentar às vezes não é evento de status; encerrar sempre é. É a
     * diferença que faz este retorno ser `LeadStatus` e o daquela ser
     * `LeadStatus | undefined` — e é o compilador quem cobra a distinção de
     * quem chama.
     */
    for (const result of CLOSED_DEAL_RESULTS) {
      expect(leadStatusAfterDealClosed(result)).not.toBeUndefined();
    }
  });
});
