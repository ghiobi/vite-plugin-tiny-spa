import fs from 'node:fs'
import path from 'node:path'
import type { MutableOutputBundle } from './types.js'

/**
 * Load Vite's written output into the same mutable bundle shape used by the inliner.
 */
export function readOutputBundle(outDir: string): { bundle: MutableOutputBundle; existingFiles: string[] } {
  const existingFiles = listFiles(outDir)
  const bundle: MutableOutputBundle = {}

  for (const absolutePath of existingFiles) {
    const fileName = toPosixPath(path.relative(outDir, absolutePath))
    if (/\.(?:js|mjs)$/i.test(fileName)) {
      bundle[fileName] = { type: 'chunk', code: fs.readFileSync(absolutePath, 'utf8') }
    } else if (/\.(?:html|css|svg|txt|json|xml|webmanifest)$/i.test(fileName)) {
      bundle[fileName] = { type: 'asset', source: fs.readFileSync(absolutePath, 'utf8') }
    } else {
      bundle[fileName] = { type: 'asset', source: fs.readFileSync(absolutePath) }
    }
  }

  return { bundle, existingFiles }
}

/**
 * Write the folded bundle back to disk and remove files deleted from the bundle map.
 */
export function writeOutputBundle(outDir: string, existingFiles: string[], bundle: MutableOutputBundle): void {
  const keptFiles = new Set(Object.keys(bundle))

  for (const absolutePath of existingFiles) {
    const fileName = toPosixPath(path.relative(outDir, absolutePath))
    if (!keptFiles.has(fileName)) {
      fs.rmSync(absolutePath, { force: true })
    }
  }

  for (const [fileName, entry] of Object.entries(bundle)) {
    const absolutePath = path.join(outDir, fileName)
    fs.mkdirSync(path.dirname(absolutePath), { recursive: true })
    if (entry.type === 'chunk') {
      fs.writeFileSync(absolutePath, entry.code)
    } else {
      fs.writeFileSync(absolutePath, entry.source)
    }
  }

  removeEmptyDirectories(outDir)
}

/**
 * Recursively list files below a directory so nested assets can be folded too.
 */
function listFiles(directory: string): string[] {
  const files: string[] = []

  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const absolutePath = path.join(directory, entry.name)
    if (entry.isDirectory()) {
      files.push(...listFiles(absolutePath))
    } else if (entry.isFile()) {
      files.push(absolutePath)
    }
  }

  return files
}

/**
 * Remove empty asset directories left after inlined files are deleted.
 */
function removeEmptyDirectories(directory: string): void {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (!entry.isDirectory()) {
      continue
    }

    const absolutePath = path.join(directory, entry.name)
    removeEmptyDirectories(absolutePath)

    if (fs.readdirSync(absolutePath).length === 0) {
      fs.rmdirSync(absolutePath)
    }
  }
}

function toPosixPath(value: string): string {
  return value.split(path.sep).join(path.posix.sep)
}
