import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import { tinySpa } from '../../../plugin/index.ts'

const fixtureDir = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  root: fixtureDir,
  build: {
    outDir: path.resolve(fixtureDir, '../../../playground-dist'),
    emptyOutDir: true,
  },
  plugins: [
    tinySpa({
      cdn: {
        packages: ['sugar-high'],
        query: { target: 'es2022' },
      },
    }),
  ],
})
