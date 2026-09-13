import js from '@eslint/js'
import reactHooks from 'eslint-plugin-react-hooks'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  {
    ignores: [
      'dist',
      'dist-data',
      'coverage',
      'playwright-report',
      'test-results',
      'public/data',
      'scripts/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  {
    // The plugin was a dependency but was never registered, which is how three real bugs got
    // through `npm run check`: a useMemo missing `f.day` from its deps (the day filter silently
    // did nothing), and two effects returning their cleanup into a `.then()` so ECharts instances
    // and resize listeners were never disposed. `useLoad` is this project's own data hook and
    // takes a dependency array, so it is declared as one.
    plugins: { 'react-hooks': reactHooks },
    languageOptions: { parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname } },
    settings: { 'react-hooks': { additionalHooks: '(useLoad)' } },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      '@typescript-eslint/no-non-null-assertion': 'error',
      '@typescript-eslint/restrict-template-expressions': [
        'error',
        { allowNumber: true, allowNullish: true },
      ],
      '@typescript-eslint/no-unnecessary-condition': 'off',
      '@typescript-eslint/no-confusing-void-expression': 'off',
    },
  },
  { files: ['**/*.js', 'e2e/**/*.ts'], ...tseslint.configs.disableTypeChecked },
)
