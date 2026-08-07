import { describe, expect, it } from '@effect/vitest';
import { stageMoveRecord } from './comment';
import { DEAL_STAGES } from './enums';
import { DEAL_STAGE_LABELS } from './pipeline';

/*
 * O texto do registro de sistema, testado direto — sem Layer, sem servidor.
 *
 * A regra que ele carrega é curta e fácil de quebrar sem perceber: a linha do
 * tempo precisa chamar cada estágio pelo mesmo nome que o cabeçalho da coluna
 * usa. Uma frase montada com o valor cru do enum passaria despercebida no
 * typecheck e só apareceria como "PROPOSAL_SENT" no histórico de um negócio.
 */
describe('stageMoveRecord', () => {
  it('nomeia os dois estágios em português, como o board os nomeia', () => {
    expect(stageMoveRecord('CONTACT_MADE', 'PROPOSAL_SENT')).toBe(
      'Estágio alterado de Contato feito para Proposta enviada.',
    );
  });

  it('não deixa vazar o valor cru do enum para o histórico', () => {
    for (const from of DEAL_STAGES) {
      for (const to of DEAL_STAGES) {
        const record = stageMoveRecord(from, to);

        expect(record).toContain(DEAL_STAGE_LABELS[from]);
        expect(record).toContain(DEAL_STAGE_LABELS[to]);
        // Os valores do vocabulário são MAIÚSCULOS_COM_SUBLINHADO; nenhum
        // rótulo em português tem sublinhado.
        expect(record).not.toContain('_');
      }
    }
  });
});
