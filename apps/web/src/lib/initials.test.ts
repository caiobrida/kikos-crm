import { describe, expect, it } from '@effect/vitest';
import { initialsFromName } from './initials';

describe('initialsFromName', () => {
  it('usa o primeiro e o último nome', () => {
    expect(initialsFromName('Caio Brida')).toBe('CB');
    expect(initialsFromName('Ana Paula Nogueira')).toBe('AN');
  });

  it('ignora partículas do meio do nome', () => {
    expect(initialsFromName('Maria da Silva')).toBe('MS');
    expect(initialsFromName('Luís dos Santos e Souza')).toBe('LS');
  });

  it('usa as duas primeiras letras quando só há um nome', () => {
    expect(initialsFromName('Rafael')).toBe('RA');
  });

  it('normaliza espaço sobrando e caixa', () => {
    expect(initialsFromName('  joão   pedro  ')).toBe('JP');
  });

  it('devolve ? quando não há nome', () => {
    expect(initialsFromName('')).toBe('?');
    expect(initialsFromName('   ')).toBe('?');
  });
});
