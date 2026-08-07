import { describe, expect, it } from '@effect/vitest';
import { DEAL_STAGES, OPEN_DEAL_STAGES } from './enums';
import { isOpenDealStage, refuseStageMove } from './pipeline';

/*
 * As regras puras do Pipeline, testadas direto — sem Layer, sem Effect, sem
 * servidor. São os testes mais baratos do projeto justamente porque as regras
 * não dependem de nada: as duas pontas que as consomem (o `<select>` do
 * formulário e a rota que recusa quem tentar por fora; a coluna que aceita o
 * drop e a rota que move) chamam estas mesmas funções.
 */
describe('isOpenDealStage', () => {
  it('aceita os quatro estágios em que um negócio pode nascer', () => {
    for (const stage of DEAL_STAGES) {
      expect(isOpenDealStage(stage)).toBe(stage !== 'CLOSED');
    }
  });

  it('recusa Fechado, que não é destino de escolha nem de movimentação', () => {
    // Chega-se em Fechado marcando Ganho ou Perdido, e por nenhum outro
    // caminho (ADR-0003).
    expect(isOpenDealStage('CLOSED')).toBe(false);
  });
});

/*
 * A regra que decide o movimento. **É a mesma função dos dois lados**: a coluna
 * do board pergunta a ela se aceita o card antes de qualquer ida ao servidor, e
 * a rota pergunta a ela antes de escrever. Um teste aqui vale pelos dois.
 */
describe('refuseStageMove', () => {
  it('deixa andar entre os quatro estágios abertos, nos dois sentidos', () => {
    for (const from of OPEN_DEAL_STAGES) {
      for (const to of OPEN_DEAL_STAGES) {
        // Negociação real avança e recua, então não existe par proibido entre
        // os abertos — nem o par que anda para trás, nem o que salta estágios.
        expect(refuseStageMove(from, to)).toBeUndefined();
      }
    }
  });

  it('recusa arrastar para Fechado, de qualquer estágio aberto', () => {
    for (const from of OPEN_DEAL_STAGES) {
      // `InvalidStageTransition` é 422: o estágio existe, o movimento é que
      // não. Encerrar é decisão explícita — Ganho ou Perdido (ADR-0003).
      expect(refuseStageMove(from, 'CLOSED')).toBe('InvalidStageTransition');
    }
  });

  it('recusa mover um negócio já encerrado, inclusive de volta ao funil', () => {
    for (const to of DEAL_STAGES) {
      expect(refuseStageMove('CLOSED', to)).toBe('DealAlreadyClosed');
    }
  });

  it('diz "já encerrado" antes de "movimento inexistente" quando os dois valem', () => {
    /*
     * Um negócio fechado arrastado para a própria coluna Fechado casa com as
     * duas recusas. A primeira é a que responde: qualquer escrita em negócio
     * encerrado falha com `DealAlreadyClosed` (ADR-0003), e é essa a frase que
     * explica o que aconteceu para quem arrastou.
     */
    expect(refuseStageMove('CLOSED', 'CLOSED')).toBe('DealAlreadyClosed');
  });

  it('deixa passar o movimento para o estágio em que o negócio já está', () => {
    /*
     * Não é recusa: `PATCH` com o estágio atual é idempotente, e a tela nem
     * chega a pedi-lo — soltar um card na coluna de onde ele saiu não é
     * movimento. Recusar aqui inventaria um erro que a tabela do spec não tem.
     */
    for (const stage of OPEN_DEAL_STAGES) {
      expect(refuseStageMove(stage, stage)).toBeUndefined();
    }
  });
});
