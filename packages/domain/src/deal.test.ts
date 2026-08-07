import { describe, expect, it } from '@effect/vitest';
import { Either, Schema } from 'effect';
import { CreateDealInput, type CreateDealInputEncoded } from './deal';
import { toValidationIssues } from './errors';

/*
 * O Schema que valida o formulário "Cadastrar Novo Negócio" e o corpo de
 * `POST /deals` — o mesmo objeto nas duas pontas.
 *
 * Estes testes rodam sobre a forma **codificada**: é assim que o `<form>`
 * entrega os campos (tudo string, `""` no opcional em branco) e é assim que o
 * JSON chega na rota. O que eles descrevem, portanto, vale para os dois lados
 * ao mesmo tempo.
 */

const LEAD_ID = '11111111-2222-4333-8444-000000000001';
const OWNER_ID = '33333333-4444-4555-8666-000000000002';

const form = (
  overrides: Partial<CreateDealInputEncoded> = {},
): CreateDealInputEncoded => ({
  title: 'Esteiras profissionais',
  valueInCents: 1_250_000,
  leadId: LEAD_ID,
  ownerId: OWNER_ID,
  stage: 'NEW',
  expectedCloseDate: '',
  description: '',
  ...overrides,
});

const decode = Schema.decodeUnknownEither(CreateDealInput, { errors: 'all' });

/** As queixas da recusa, no mesmo formato que a API devolve. */
const rejection = (input: CreateDealInputEncoded) => {
  const result = decode(input);
  if (Either.isRight(result)) return [];
  return toValidationIssues(result.left);
};

const rejectedFields = (input: CreateDealInputEncoded): readonly string[] =>
  rejection(input).map((issue) => issue.path);

/** A frase que vai aparecer embaixo do campo. */
const messageFor = (input: CreateDealInputEncoded, field: string): string | undefined =>
  rejection(input).find((issue) => issue.path === field)?.message;

const decoded = (input: CreateDealInputEncoded) => Either.getOrThrow(decode(input));

describe('CreateDealInput', () => {
  describe('o que ele aceita', () => {
    it('decodifica o formulário preenchido na forma que o domínio quer', () => {
      const deal = decoded(
        form({ expectedCloseDate: '2026-09-20', description: '  Doze esteiras.  ' }),
      );

      expect(deal.title).toBe('Esteiras profissionais');
      // Centavos inteiros, como em todo o CRM: quem converte de reais é a tela.
      expect(deal.valueInCents).toBe(1_250_000);
      expect(deal.expectedCloseDate).toEqual(new Date('2026-09-20T00:00:00.000Z'));
      expect(deal.description).toBe('Doze esteiras.');
    });

    it('lê o opcional em branco como ausência, e não como texto vazio', () => {
      const deal = decoded(form());

      expect(deal.expectedCloseDate).toBeUndefined();
      expect(deal.description).toBeUndefined();
    });

    it('aceita Fechado como estágio, porque a recusa não é do Schema', () => {
      /*
       * O vocabulário de `DealStage` inclui `CLOSED`; o que o proíbe como
       * estágio inicial é a regra pura do Pipeline, e é ela que responde 422.
       * Recusar aqui daria 400 e trocaria "esse movimento não existe" por
       * "esse campo está malformado".
       */
      expect(decoded(form({ stage: 'CLOSED' })).stage).toBe('CLOSED');
    });

    it('faz o caminho de volta para a forma que o formulário mostra', () => {
      const filled = form({ expectedCloseDate: '2026-09-20', description: 'Doze.' });
      const encoded = Schema.encodeSync(CreateDealInput)(decoded(filled));

      // `encodeSync` é como o app web monta o corpo da requisição, em vez de
      // escrevê-lo à mão — e é como a fatia de edição preencherá os campos.
      expect(encoded).toEqual(filled);
    });
  });

  describe('o que ele recusa', () => {
    it('aponta o campo obrigatório em branco', () => {
      expect(rejectedFields(form({ title: '   ' }))).toContain('title');
    });

    it('aponta o Lead que ninguém escolheu', () => {
      // O campo de Lead nasce vazio: só é preenchido quando alguém escolhe um
      // contato da busca.
      expect(rejectedFields(form({ leadId: '' }))).toContain('leadId');
    });

    it('aponta o responsável que ninguém escolheu', () => {
      expect(rejectedFields(form({ ownerId: '' }))).toContain('ownerId');
    });

    it('recusa um estágio fora do vocabulário', () => {
      expect(rejectedFields(form({ stage: 'QUASE_FECHANDO' as never }))).toContain(
        'stage',
      );
    });

    it('recusa valor negativo e valor acima do teto, cada um com a sua queixa', () => {
      expect(messageFor(form({ valueInCents: -1 }), 'valueInCents')).toBe(
        'O valor não pode ser negativo.',
      );
      expect(messageFor(form({ valueInCents: 1_000_000_001 }), 'valueInCents')).toBe(
        'O valor máximo é R$ 10.000.000,00.',
      );
    });

    it('recusa o valor que não é um número de centavos', () => {
      // `NaN` é como o campo de dinheiro diz "está em branco, ou tem texto que
      // não é valor nenhum" — e a frase precisa fazer sentido embaixo dele.
      expect(messageFor(form({ valueInCents: Number.NaN }), 'valueInCents')).toBe(
        'Informe um valor válido, como 12.500,00.',
      );
      expect(rejectedFields(form({ valueInCents: 125.5 }))).toContain('valueInCents');
    });

    it('recusa uma data prevista malformada', () => {
      expect(rejectedFields(form({ expectedCloseDate: '20/09/2026' }))).toContain(
        'expectedCloseDate',
      );
      expect(rejectedFields(form({ expectedCloseDate: '2026-02-31' }))).toContain(
        'expectedCloseDate',
      );
    });

    it('junta as queixas de todos os campos numa recusa só', () => {
      // A tela pinta os campos errados de uma vez, em vez de revelar o próximo
      // erro a cada tentativa.
      const fields = rejectedFields(form({ title: '', leadId: '', ownerId: '' }));

      expect(fields).toEqual(expect.arrayContaining(['title', 'leadId', 'ownerId']));
    });
  });
});
