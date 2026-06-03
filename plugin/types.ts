/**
 * Top-level plugin options.
 *
 * The plugin has two independent jobs:
 * - `cdn`: keep selected npm packages out of the local bundle and point imports at an ESM CDN.
 * - `singleFile`: fold Vite's emitted HTML/CSS/JS/assets into one deployable HTML file.
 */
export interface TinySpaOptions {
  /**
   * Rewrite selected bare imports to browser ESM CDN URLs. Defaults to true.
   */
  cdn?: boolean | CdnOptions

  /**
   * Inline the production app into HTML. Defaults to true.
   */
  singleFile?: boolean | SingleFileOptions
}

export interface CdnOptions {
  /**
   * CDN origin to generate absolute ESM URLs from.
   */
  origin?: string

  /**
   * Dependency package names to rewrite. Defaults to package.json dependencies.
   */
  packages?: string[]

  /**
   * Extra package names to rewrite in addition to the default package set.
   */
  include?: string[]

  /**
   * Package names that should keep being bundled.
   */
  exclude?: string[]

  /**
   * Pin CDN URLs to the locally installed package version when available.
   */
  pinVersions?: boolean

  /**
   * Optional CDN query string, for example `target=es2022`.
   */
  query?: string | Record<string, string | number | boolean | undefined>
}

/**
 * Controls how aggressively the written Vite output is folded into HTML.
 *
 * Defaults are optimized for microcontroller/static-file deployments: one
 * `index.html`, no sibling assets, and a strict failure when a local emitted
 * asset reference cannot be folded.
 */
export interface SingleFileOptions {
  /**
   * Inline module script assets into the HTML entry. Defaults to true.
   */
  inlineScripts?: boolean

  /**
   * Inline stylesheet assets into the HTML entry. Defaults to true.
   */
  inlineStyles?: boolean

  /**
   * Inline emitted asset URLs as data URIs. Defaults to true.
   */
  inlineAssets?: boolean

  /**
   * Delete assets that were folded into HTML. Defaults to true.
   */
  removeInlinedAssets?: boolean

  /**
   * Fail the build if local emitted asset references remain in HTML. Defaults to true.
   */
  strict?: boolean

  /**
   * Vite assetsInlineLimit override. Defaults to Number.MAX_SAFE_INTEGER. Use false to leave unchanged.
   */
  assetsInlineLimit?: number | false

  /**
   * Disable CSS code splitting so styles are easier to inline. Defaults to true.
   */
  disableCssCodeSplit?: boolean

  /**
   * Disable Vite modulepreload tags for the single-file target. Defaults to true.
   */
  disableModulePreload?: boolean

  /**
   * Disable production code splitting for SPA output. Defaults to true.
   */
  disableCodeSplitting?: boolean
}

export interface NormalizedSingleFileOptions
  extends Required<Omit<SingleFileOptions, 'assetsInlineLimit'>> {
  assetsInlineLimit: number | false
}

export type ExternalMatcher = string | RegExp

export type ExternalOption =
  | ExternalMatcher
  | ExternalMatcher[]
  | ((source: string, importer?: string, isResolved?: boolean) => boolean | null | void)
  | undefined

export type PathsOption =
  | Record<string, string>
  | ((source: string) => string | null | undefined)
  | undefined

export type RolldownOutput = {
  paths?: PathsOption
  codeSplitting?: boolean
  [key: string]: unknown
}

export type RolldownOptions = {
  output?: RolldownOutput | RolldownOutput[]
  external?: ExternalOption
  [key: string]: unknown
}

export type PackageJson = {
  dependencies?: Record<string, string>
  peerDependencies?: Record<string, string>
}

export type BundleAsset = {
  type: 'asset'
  source: string | Uint8Array
  [key: string]: unknown
}

export type BundleChunk = {
  type: 'chunk'
  code: string
  [key: string]: unknown
}

export type MutableOutputBundle = Record<string, BundleAsset | BundleChunk>

/**
 * Cached data URI for an emitted asset that can be embedded into HTML/CSS/JS text.
 */
export type AssetData = {
  fileName: string
  source: string | Uint8Array
  uri: string
}
