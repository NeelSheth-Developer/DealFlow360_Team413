// @ts-check
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';

export default tseslint.config(
  {
    // `public/` is browser code for the dev tester, outside the TS project.
    ignores: ['dist/**', 'node_modules/**', 'drizzle/**', 'public/**'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
      ],
      'no-console': 'error',
      eqeqeq: ['error', 'always', { null: 'ignore' }],
    },
  },
  {
    files: ['*.config.js', '*.config.ts', 'drizzle.config.ts'],
    extends: [tseslint.configs.disableTypeChecked],
  },
  {
    // CLI scripts talk to an operator on stdout, not through the request logger.
    files: ['src/scripts/**/*.ts'],
    rules: { 'no-console': 'off' },
  },
  prettier,
);
