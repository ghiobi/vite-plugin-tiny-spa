import path from 'node:path'
import { fileURLToPath } from 'node:url'
import js from '@eslint/js'
import globals from 'globals'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

const rootDir = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig([
  globalIgnores(['dist', 'playground-dist', 'examples/*/dist']),
  {
    files: ['plugin/**/*.ts', 'tests/fixtures/**/*.ts', 'examples/**/*.ts', 'examples/**/*.tsx'],
    extends: [js.configs.recommended, tseslint.configs.recommended],
    languageOptions: {
      parserOptions: {
        tsconfigRootDir: rootDir,
      },
      globals: { ...globals.browser, ...globals.node },
    },
  },
  {
    files: ['scripts/**/*.mjs', 'examples/**/scripts/**/*.mjs'],
    extends: [js.configs.recommended],
    languageOptions: {
      globals: globals.node,
    },
  },
])
