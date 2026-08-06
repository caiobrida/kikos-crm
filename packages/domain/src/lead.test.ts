import { describe, expect, it } from '@effect/vitest';
import { Either, ParseResult, Schema } from 'effect';
import { CreateLeadInput } from './lead';

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

/** As queixas por campo, no mesmo formato que a API devolve em `issues`. */
const reject = (form: Record<string, unknown>): ReadonlyMap<string, string> => {
  const result = decode(form);
  if (Either.isRight(result)) throw new Error('Esperava recusa, mas aceitou.');

  return new Map(
    ParseResult.ArrayFormatter.formatErrorSync(result.left).map((issue) => [
      issue.path.join('.'),
      issue.message,
    ]),
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
