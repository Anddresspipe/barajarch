import tseslint from 'typescript-eslint';
export default tseslint.config(
  { ignores: ['dist/**', 'node_modules/**'] },
  ...tseslint.configs.recommended,
  {
    files: ['src/**/*.ts'],
    rules: {
      complexity: ['error', 10],
      '@typescript-eslint/no-explicit-any': 'error',
      'no-restricted-syntax': ['error',
        { selector: "Literal[value='CLASICA']", message: 'Literal de modalidad fuera de motor-reglas/plugins' },
        { selector: "Literal[value='APUNTADO']", message: 'Literal de modalidad fuera de motor-reglas/plugins' }],
    },
  },
  { files: ['src/motor-reglas/**/*.ts', 'src/app/**/*.ts'], rules: { 'no-restricted-syntax': 'off' } },
  {
    files: ['src/**/*.ts'], ignores: ['src/**/repositorio/**', 'src/app/**'],
    rules: { 'no-restricted-imports': ['error', { paths: [{ name: 'pg', message: 'pg solo en repositorios' }] }] },
  },
);
