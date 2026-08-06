import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import prettier from 'eslint-config-prettier';

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/build/**',
      '**/coverage/**',
      '**/node_modules/**',
      // O client do Prisma é gerado a cada `prisma generate`.
      'apps/api/src/generated/**',
    ],
  },

  js.configs.recommended,
  ...tseslint.configs.recommended,

  {
    rules: {
      // Effect usa `_tag`, `_id` e afins como convenção de discriminante.
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },

  // O pacote de domínio é browser-safe: nada que toque Node, Prisma ou I/O.
  // O tsconfig do pacote já derruba os tipos do Node; esta regra derruba os
  // imports antes que alguém tente.
  {
    files: ['packages/domain/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                'node:*',
                'fs',
                'path',
                'crypto',
                'os',
                'child_process',
                'http',
                'https',
              ],
              message: '@kikos/domain é browser-safe: nada de builtins do Node aqui.',
            },
            {
              group: ['@prisma/client', 'prisma', 'fastify', 'bcryptjs'],
              message:
                '@kikos/domain é browser-safe: nada de servidor, Prisma ou I/O aqui.',
            },
          ],
        },
      ],
    },
  },

  {
    files: ['apps/api/**/*.ts'],
    languageOptions: {
      globals: globals.node,
    },
  },

  {
    files: ['apps/web/**/*.{ts,tsx}'],
    languageOptions: {
      globals: globals.browser,
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
    },
  },

  // Arquivos de configuração rodam em Node, não no navegador.
  {
    files: ['*.config.{js,ts}', '**/*.config.{js,ts}', 'eslint.config.js'],
    languageOptions: {
      globals: globals.node,
    },
  },

  prettier,
);
