import { describe, expect, it } from '@effect/vitest';
import { DEAL_STAGES } from './enums';
import { isOpenDealStage } from './pipeline';

/*
 * A regra pura do Pipeline, testada direto — sem Layer, sem Effect, sem
 * servidor. É o teste mais barato do projeto justamente porque a regra não
 * depende de nada: as duas pontas que a consomem (o `<select>` do formulário e
 * a rota que recusa quem tentar por fora) chamam esta mesma função.
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
