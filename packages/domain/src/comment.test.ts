import { describe, expect, it } from '@effect/vitest';
import { dealCloseRecord, stageMoveRecord } from './comment';
import { CLOSED_DEAL_RESULTS, DEAL_STAGES } from './enums';
import { DEAL_RESULT_LABELS, DEAL_STAGE_LABELS } from './pipeline';

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

/*
 * O registro que o encerramento deixa. Ele responde a pergunta que o gestor faz
 * ao reconstituir a negociação — como ela terminou —, e por isso nomeia o
 * desfecho em vez de dizer só "negócio encerrado".
 */
describe('dealCloseRecord', () => {
  it('nomeia o desfecho com a palavra do botão que encerrou', () => {
    expect(dealCloseRecord('WON')).toBe('Negócio encerrado como Ganho.');
    expect(dealCloseRecord('LOST')).toBe('Negócio encerrado como Perdido.');
  });

  it('não deixa vazar o valor cru do enum para o histórico', () => {
    for (const result of CLOSED_DEAL_RESULTS) {
      expect(dealCloseRecord(result)).toContain(DEAL_RESULT_LABELS[result]);
      expect(dealCloseRecord(result)).not.toContain(result);
    }
  });
});
