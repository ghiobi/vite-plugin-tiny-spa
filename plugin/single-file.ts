import fs from 'node:fs'
import path from 'node:path'
import { lookup as lookupMime } from 'mrmime'
import { readOutputBundle, writeOutputBundle } from './filesystem.js'
import type { AssetData, MutableOutputBundle, NormalizedSingleFileOptions, TinySpaOptions } from './types.js'
import { escapeRegExp } from './utils.js'

const HTML_ESCAPE_IN_SCRIPT = /<\/(script)/gi

/**
 * Apply single-file defaults once so later code can avoid repeating option fallback logic.
 */
export function normalizeSingleFileOptions(
  options: TinySpaOptions['singleFile'],
): NormalizedSingleFileOptions | false {
  if (options === false) {
    return false
  }

  const userOptions = options === true || options === undefined ? {} : options

  return {
    inlineScripts: userOptions.inlineScripts ?? true,
    inlineStyles: userOptions.inlineStyles ?? true,
    inlineAssets: userOptions.inlineAssets ?? true,
    removeInlinedAssets: userOptions.removeInlinedAssets ?? true,
    strict: userOptions.strict ?? true,
    assetsInlineLimit: userOptions.assetsInlineLimit ?? Number.MAX_SAFE_INTEGER,
    disableCssCodeSplit: userOptions.disableCssCodeSplit ?? true,
    disableModulePreload: userOptions.disableModulePreload ?? true,
    disableCodeSplitting: userOptions.disableCodeSplitting ?? true,
  }
}

/**
 * Re-read the final files from disk, fold assets, then write back only the kept files.
 *
 * The filesystem pass avoids depending on subtle differences across Vite's
 * output lifecycle while still leaving Vite's normal build intact.
 */
export function inlineFileSystemOutput(
  outDir: string,
  base: string,
  options: NormalizedSingleFileOptions,
): void {
  if (!fs.existsSync(outDir)) {
    return
  }

  const { bundle, existingFiles } = readOutputBundle(outDir)
  inlineEmittedAssets(bundle, base, options)
  writeOutputBundle(outDir, existingFiles, bundle)
}

/**
 * Fold script/style tags and emitted asset references into HTML assets in the bundle map.
 *
 * `inlinedFiles` tracks which emitted files can be deleted after their content has
 * been embedded or converted to data URIs.
 */
function inlineEmittedAssets(
  bundle: MutableOutputBundle,
  base: string,
  options: NormalizedSingleFileOptions,
): void {
  const dataAssets = options.inlineAssets ? collectDataAssets(bundle) : new Map<string, AssetData>()
  const inlinedFiles = new Set<string>()

  if (options.inlineAssets) {
    replaceAssetReferences(bundle, base, dataAssets, inlinedFiles)
  }

  for (const [fileName, entry] of Object.entries(bundle)) {
    if (entry.type !== 'asset' || !fileName.endsWith('.html')) {
      continue
    }

    const html = toText(entry.source)
    entry.source = inlineHtmlAssetRefs(html, bundle, base, dataAssets, inlinedFiles, options)

    if (options.strict) {
      assertNoLocalBundleRefs(fileName, String(entry.source), bundle)
    }
  }

  if (options.removeInlinedAssets) {
    for (const fileName of inlinedFiles) {
      if (!fileName.endsWith('.html')) {
        delete bundle[fileName]
      }
    }
  }
}

/**
 * Precompute data URIs for non-code assets that are safe to embed inline.
 */
function collectDataAssets(bundle: MutableOutputBundle): Map<string, AssetData> {
  const assets = new Map<string, AssetData>()

  for (const [fileName, entry] of Object.entries(bundle)) {
    if (entry.type !== 'asset' || !canInlineAsDataUri(fileName)) {
      continue
    }

    assets.set(fileName, {
      fileName,
      source: entry.source,
      uri: toDataUri(fileName, entry.source),
    })
  }

  return assets
}

/**
 * Replace emitted asset URLs inside generated JS/CSS/text assets with data URIs.
 */
function replaceAssetReferences(
  bundle: MutableOutputBundle,
  base: string,
  assets: Map<string, AssetData>,
  inlinedFiles: Set<string>,
): void {
  for (const entry of Object.values(bundle)) {
    if (entry.type === 'chunk') {
      entry.code = replaceAssetReferencesInText(entry.code, base, assets, inlinedFiles)
      continue
    }

    if (typeof entry.source === 'string') {
      entry.source = replaceAssetReferencesInText(entry.source, base, assets, inlinedFiles)
    }
  }
}

/**
 * Inline HTML entry references to local emitted scripts, stylesheets, and asset URLs.
 */
function inlineHtmlAssetRefs(
  html: string,
  bundle: MutableOutputBundle,
  base: string,
  dataAssets: Map<string, AssetData>,
  inlinedFiles: Set<string>,
  options: NormalizedSingleFileOptions,
): string {
  let output = html

  if (options.inlineStyles) {
    output = output.replace(
      /<link\b([^>]*?)\bhref=(['"])([^'"]+)\2([^>]*)>/gi,
      (tag, before, _quote, href, after) => {
        const attrs = `${before} ${after}`
        if (!/\brel=(["'])stylesheet\1/i.test(attrs) && !/\brel=stylesheet\b/i.test(attrs)) {
          return tag
        }

        const fileName = resolveBundleFileName(href, bundle, base)
        const entry = fileName ? bundle[fileName] : undefined
        if (!fileName || !entry || entry.type !== 'asset') {
          return tag
        }

        inlinedFiles.add(fileName)
        return `<style${sanitizeAttrs(attrs, ['href', 'rel', 'crossorigin', 'integrity'])}>${escapeStyle(toText(entry.source))}</style>`
      },
    )
  }

  if (options.inlineScripts) {
    output = output.replace(
      /<script\b([^>]*?)\bsrc=(['"])([^'"]+)\2([^>]*)>\s*<\/script>/gi,
      (tag, before, _quote, src, after) => {
        const fileName = resolveBundleFileName(src, bundle, base)
        const entry = fileName ? bundle[fileName] : undefined
        if (!fileName || !entry) {
          return tag
        }

        const code = entry.type === 'chunk' ? entry.code : toText(entry.source)
        inlinedFiles.add(fileName)
        return `<script${sanitizeAttrs(`${before} ${after}`, ['src', 'crossorigin', 'integrity'])}>${escapeScript(code)}</script>`
      },
    )
  }

  if (options.inlineAssets) {
    output = replaceHtmlAttrAssetReferences(output, bundle, base, dataAssets, inlinedFiles)
  }

  return output
}

/**
 * Replace HTML `src` and `href` asset references with data URIs.
 */
function replaceHtmlAttrAssetReferences(
  html: string,
  bundle: MutableOutputBundle,
  base: string,
  assets: Map<string, AssetData>,
  inlinedFiles: Set<string>,
): string {
  return html.replace(/\b(src|href)=(['"])([^'"]+)\2/gi, (match, attr, quote, rawRef) => {
    const resolved = resolveBundleAssetReference(rawRef, bundle, base)
    const asset = resolved ? assets.get(resolved.fileName) : undefined

    if (!resolved || !asset) {
      return match
    }

    inlinedFiles.add(resolved.fileName)
    return `${attr}=${quote}${asset.uri}${resolved.fragment}${quote}`
  })
}

/**
 * Replace filename-like references in JS/CSS text with corresponding data URIs.
 */
function replaceAssetReferencesInText(
  text: string,
  base: string,
  assets: Map<string, AssetData>,
  inlinedFiles: Set<string>,
): string {
  let output = text

  for (const asset of assets.values()) {
    const escapedFileName = escapeRegExp(asset.fileName)
    const escapedBaseFileName = escapeRegExp(path.posix.basename(asset.fileName))
    const normalizedBase = normalizeBase(base)
    const candidates = [
      `/${asset.fileName}`,
      `./${asset.fileName}`,
      normalizedBase === '/' ? undefined : `${normalizedBase}${asset.fileName}`,
      asset.fileName,
    ].filter((candidate): candidate is string => Boolean(candidate))

    for (const candidate of candidates) {
      const escaped = candidate === asset.fileName ? escapedFileName : escapeRegExp(candidate)
      output = output.replace(new RegExp(`${escaped}(#[A-Za-z0-9_.:-]+)?`, 'g'), (_match, fragment = '') => {
        inlinedFiles.add(asset.fileName)
        return `${asset.uri}${fragment}`
      })
    }

    if (!asset.fileName.includes('/')) {
      output = output.replace(
        new RegExp(`/${escapedBaseFileName}(#[A-Za-z0-9_.:-]+)?`, 'g'),
        (_match, fragment = '') => {
          inlinedFiles.add(asset.fileName)
          return `${asset.uri}${fragment}`
        },
      )
    }
  }

  return output
}

function resolveBundleFileName(
  rawRef: string,
  bundle: MutableOutputBundle,
  base: string,
): string | undefined {
  return resolveBundleAssetReference(rawRef, bundle, base)?.fileName
}

/**
 * Resolve a URL from HTML/CSS/JS text back to a Vite-emitted bundle file.
 */
function resolveBundleAssetReference(
  rawRef: string,
  bundle: MutableOutputBundle,
  base: string,
): { fileName: string; fragment: string } | undefined {
  if (isExternalOrDataUrl(rawRef)) {
    return undefined
  }

  const [withoutFragment, fragment = ''] = rawRef.split('#', 2)
  const [withoutQuery] = withoutFragment.split('?', 1)
  const ref = decodeURI(withoutQuery)
  const normalizedBase = normalizeBase(base)
  const candidates = new Set<string>()

  candidates.add(ref)
  candidates.add(ref.replace(/^\.\//, ''))
  candidates.add(ref.replace(/^\//, ''))

  if (normalizedBase !== '/' && ref.startsWith(normalizedBase)) {
    candidates.add(ref.slice(normalizedBase.length))
  }

  for (const candidate of candidates) {
    if (candidate in bundle) {
      return { fileName: candidate, fragment: fragment ? `#${fragment}` : '' }
    }
  }

  return undefined
}

/**
 * Guardrail: strict single-file builds fail if HTML still points at emitted local files.
 */
function assertNoLocalBundleRefs(htmlFileName: string, html: string, bundle: MutableOutputBundle): void {
  const remainingRefs = new Set<string>()

  for (const fileName of Object.keys(bundle)) {
    if (fileName === htmlFileName || fileName.endsWith('.html')) {
      continue
    }

    if (
      html.includes(`/${fileName}`) ||
      html.includes(`./${fileName}`) ||
      html.includes(`"${fileName}`) ||
      html.includes(`'${fileName}`) ||
      html.includes(`\`${fileName}`)
    ) {
      remainingRefs.add(fileName)
    }
  }

  if (remainingRefs.size > 0) {
    throw new Error(
      `vite-plugin-tiny-spa could not inline every local asset referenced by ${htmlFileName}: ${[
        ...remainingRefs,
      ].join(', ')}`,
    )
  }
}

/**
 * Code and stylesheet assets are inlined as tags; everything else can become a data URI.
 */
function canInlineAsDataUri(fileName: string): boolean {
  return !/\.(?:html|js|mjs|cjs|css|map)$/i.test(fileName)
}

/**
 * Convert an emitted asset into a browser data URI with a best-effort MIME type.
 */
function toDataUri(fileName: string, source: string | Uint8Array): string {
  const mime = lookupMime(fileName) ?? 'application/octet-stream'

  if (mime === 'image/svg+xml') {
    return `data:${mime},${encodeURIComponent(toText(source))}`
  }

  return `data:${mime};base64,${Buffer.from(toBytes(source)).toString('base64')}`
}

function sanitizeAttrs(attrs: string, removeNames: string[]): string {
  let sanitized = attrs

  for (const name of removeNames) {
    sanitized = sanitized.replace(new RegExp(`\\s+${name}(?:=(["']).*?\\1|=[^\\s>]+)?`, 'gi'), '')
  }

  const normalized = sanitized.replace(/\s+/g, ' ').trim()
  return normalized ? ` ${normalized}` : ''
}

/**
 * Escape sequences that could prematurely terminate an inline module script tag.
 */
function escapeScript(code: string): string {
  return code.replace(HTML_ESCAPE_IN_SCRIPT, '<\\/$1').replace(/<!--/g, '<\\!--')
}

/**
 * Escape sequences that could prematurely terminate an inline style tag.
 */
function escapeStyle(css: string): string {
  return css.replace(/<\/(style)/gi, '<\\/$1')
}

function normalizeBase(base: string): string {
  if (!base || isExternalOrDataUrl(base)) {
    return '/'
  }

  return base.endsWith('/') ? base : `${base}/`
}

function isExternalOrDataUrl(ref: string): boolean {
  return /^(?:[a-z][a-z\d+.-]*:|\/\/|#)/i.test(ref)
}

function toText(source: string | Uint8Array): string {
  return typeof source === 'string' ? source : Buffer.from(source).toString('utf8')
}

function toBytes(source: string | Uint8Array): Uint8Array {
  return typeof source === 'string' ? Buffer.from(source) : source
}
