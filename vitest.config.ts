import { defineConfig } from 'vitest/config';

// Uma configuração de testes para o monorepo inteiro. Os testes ficam ao lado
// do código que exercitam, em `src/**/*.test.ts`.
export default defineConfig({
  test: {
    include: ['{apps,packages}/*/src/**/*.test.{ts,tsx}'],
    environment: 'node',
  },
});
