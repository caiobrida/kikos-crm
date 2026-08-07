import { describe, expect, it } from '@effect/vitest';
import { CLOSED_DEAL_RESULTS, DEAL_STAGES, OPEN_DEAL_STAGES } from './enums';
import {
  DEAL_RESULT_LABELS,
  isOpenDealStage,
  refuseDealClose,
  refuseStageMove,
  stageDrop,
} from './pipeline';

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

/*
 * A regra que decide o encerramento. É a irmã de `refuseStageMove`, e é curta
 * pelo mesmo motivo que aquela é: tudo que ela precisa saber está no estágio de
 * origem, porque "estágio Fechado com resultado em aberto" é inalcançável por
 * construção (ADR-0003).
 */
describe('refuseDealClose', () => {
  it('deixa encerrar um negócio que está em qualquer estágio aberto', () => {
    for (const stage of OPEN_DEAL_STAGES) {
      expect(refuseDealClose(stage)).toBeUndefined();
    }
  });

  it('recusa encerrar de novo um negócio já encerrado', () => {
    // 409, e não 422: o pedido existe no funil; o que impede é o desfecho já
    // registrado. Reabrir negócio não existe (ADR-0003).
    expect(refuseDealClose('CLOSED')).toBe('DealAlreadyClosed');
  });
});

/*
 * O gesto, que é outra pergunta que a mesma regra responde.
 *
 * `refuseStageMove` responde "esta **escrita** vale?", e é o que a rota
 * pergunta. `stageDrop` responde "o que este arrasto **faz**?", e é o que a
 * coluna do board pergunta — porque desde esta fatia soltar um card em Fechado
 * deixou de ser uma recusa e passou a ser o começo de uma decisão.
 */
describe('stageDrop', () => {
  it('move quando o destino é um estágio aberto', () => {
    for (const from of OPEN_DEAL_STAGES) {
      for (const to of OPEN_DEAL_STAGES) {
        expect(stageDrop(from, to)).toEqual({ kind: 'move', to });
      }
    }
  });

  it('abre a escolha entre Ganho e Perdido ao soltar em Fechado', () => {
    for (const from of OPEN_DEAL_STAGES) {
      /*
       * É a diferença desta fatia: a mesma regra que recusava o movimento
       * continua recusando-o — a rota de estágio devolve 422 —, e o que mudou é
       * o que a tela faz com o gesto (ADR-0003).
       */
      expect(stageDrop(from, 'CLOSED')).toEqual({ kind: 'close' });
    }
  });

  it('recusa qualquer arrasto de um negócio já encerrado', () => {
    for (const to of DEAL_STAGES) {
      expect(stageDrop('CLOSED', to)).toEqual({
        kind: 'refused',
        reason: 'DealAlreadyClosed',
      });
    }
  });

  it('recusa o negócio encerrado antes de oferecer a escolha', () => {
    // Um card já fechado arrastado para a própria coluna Fechado não abre
    // diálogo nenhum: encerrar duas vezes não existe.
    expect(stageDrop('CLOSED', 'CLOSED')).toEqual({
      kind: 'refused',
      reason: 'DealAlreadyClosed',
    });
  });

  it('concorda com `refuseStageMove` em tudo que não é Fechado', () => {
    /*
     * As duas leituras da mesma regra não podem divergir: onde o arrasto move,
     * a rota escreve; onde ele recusa, a rota recusa com o mesmo motivo. O
     * único par em que elas discordam de propósito é o destino Fechado.
     */
    for (const from of DEAL_STAGES) {
      for (const to of OPEN_DEAL_STAGES) {
        const drop = stageDrop(from, to);
        const refusal = refuseStageMove(from, to);

        expect(drop.kind === 'refused' ? drop.reason : undefined).toBe(refusal);
      }
    }
  });
});

/*
 * Os rótulos do desfecho, que desceram do app web para cá pelo mesmo motivo que
 * os de estágio desceram na fatia anterior: o registro de sistema do
 * encerramento grava a frase pronta no banco, e quem a escreve é o servidor.
 */
describe('DEAL_RESULT_LABELS', () => {
  it('nomeia os dois desfechos com as palavras dos botões', () => {
    expect(DEAL_RESULT_LABELS.WON).toBe('Ganho');
    expect(DEAL_RESULT_LABELS.LOST).toBe('Perdido');
  });

  it('tem rótulo para todo desfecho com que se pode encerrar', () => {
    for (const result of CLOSED_DEAL_RESULTS) {
      expect(DEAL_RESULT_LABELS[result]).not.toBe('');
    }
  });
});
