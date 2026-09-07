import tseslint from 'typescript-eslint'

// Start with correctness rules; formatting and broad stylistic migrations are separate work.
export default [{
  files: ['src/**/*.{ts,tsx}'],
  languageOptions: {
    parser: tseslint.parser,
    parserOptions: {
      project: ['./tsconfig.json', './tsconfig.client.json'],
      tsconfigRootDir: import.meta.dirname,
    },
  },
  plugins: { '@typescript-eslint': tseslint.plugin },
  rules: {
    '@typescript-eslint/no-floating-promises': 'error',
    '@typescript-eslint/no-misused-promises': 'error',
    '@typescript-eslint/await-thenable': 'error',
    'no-duplicate-case': 'error',
    'no-unreachable': 'error',
  },
}]
