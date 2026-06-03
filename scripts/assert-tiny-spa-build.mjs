import fs from 'node:fs'
import path from 'node:path'

const outDir = path.resolve('playground-dist')
const htmlPath = path.join(outDir, 'index.html')

if (!fs.existsSync(htmlPath)) {
  throw new Error('Expected playground-dist/index.html to exist')
}

const files = fs
  .readdirSync(outDir, { recursive: true })
  .map((file) => String(file))
  .filter((file) => !file.startsWith('.'))

if (files.length !== 1 || files[0] !== 'index.html') {
  throw new Error(`Expected single-file output, received: ${files.join(', ')}`)
}

const html = fs.readFileSync(htmlPath, 'utf8')

for (const expected of ['https://esm.sh/sugar-high@', '?target=es2022']) {
  if (!html.includes(expected)) {
    throw new Error(`Expected single-file HTML to contain ${expected}`)
  }
}

for (const unexpected of [
  '<script type="module" crossorigin src=',
  '<link rel="stylesheet"',
  '/assets/',
  'node_modules/sugar-high',
]) {
  if (html.includes(unexpected)) {
    throw new Error(`Expected single-file HTML not to contain ${unexpected}`)
  }
}

if (!html.includes('<style>') || !html.includes('<script type="module">')) {
  throw new Error('Expected CSS and module JS to be inlined into index.html')
}

if (!html.includes('data:image/svg+xml,') || !html.includes('data:image/png;base64,')) {
  throw new Error('Expected SVG and PNG assets to be inlined as data URIs')
}

for (const file of ['dist/plugin/index.js', 'dist/plugin/index.d.ts']) {
  if (!fs.existsSync(path.resolve(file))) {
    throw new Error(`Expected plugin build artifact ${file}`)
  }
}

console.log('tiny SPA package fixture verified')
