import { describe, expect, it } from '@effect/vitest';
import { toQueryString } from './queryString';

/*
 * Este helper existe por um motivo específico, e é ele que os testes guardam:
 * a API valida `?status=` contra uma união fechada, então mandar o parâmetro
 * vazio — o que a tela faz no instante em que alguém limpa um filtro — seria
 * um 400 na cara do usuário.
 */
describe('toQueryString', () => {
  it('omite os filtros vazios', () => {
    expect(toQueryString({ search: '', status: '', page: 1 })).toBe('?page=1');
  });

  it('omite o que não foi informado', () => {
    expect(toQueryString({ search: undefined, page: 2 })).toBe('?page=2');
  });

  it('não devolve um ponto de interrogação sozinho', () => {
    expect(toQueryString({ search: '', status: undefined })).toBe('');
  });

  it('escapa o que o usuário digitou', () => {
    expect(toQueryString({ search: 'Corpo & Cia' })).toBe('?search=Corpo+%26+Cia');
  });

  it('mantém o número zero, que é valor e não ausência', () => {
    expect(toQueryString({ total: 0 })).toBe('?total=0');
  });
});
