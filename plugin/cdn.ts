import type { RolldownOutput, CdnOptions, ExternalMatcher, ExternalOption, PathsOption, TinySpaOptions } from './types.js'
import { cleanVersionRange, readInstalledPackageVersion, readPackageJson } from './utils.js'

const DEFAULT_ORIGIN = 'https://esm.sh'

/**
 * Normalize `cdn: true | undefined` to default options while preserving `cdn: false`.
 */
export function normalizeCdnOptions(options: TinySpaOptions['cdn']): CdnOptions | false {
  if (options === false) {
    return false
  }

  if (options === true || options === undefined) {
    return {}
  }

  return options
}

/**
 * Decide which bare package imports should be rewritten to CDN URLs.
 */
export function resolvePackageSet(root: string, options: CdnOptions): Set<string> {
  const excluded = new Set(options.exclude ?? [])
  const packageJson = readPackageJson(root)
  const defaults = Object.keys(packageJson.dependencies ?? {})
  const requested = options.packages ?? defaults
  const packages = new Set([...requested, ...(options.include ?? [])])

  for (const packageName of excluded) {
    packages.delete(packageName)
  }

  return packages
}

/**
 * Resolve package versions for stable CDN URLs.
 *
 * Installed package versions win. Declared dependency ranges are a fallback so
 * package managers or monorepo layouts that omit a local node_modules still
 * produce deterministic URLs when possible.
 */
export function resolvePackageVersions(
  root: string,
  packageNames: Set<string>,
  options: CdnOptions,
): Map<string, string | undefined> {
  const packageJson = readPackageJson(root)
  const versions = new Map<string, string | undefined>()
  const pinVersions = options.pinVersions ?? true

  for (const packageName of packageNames) {
    if (pinVersions) {
      versions.set(
        packageName,
        readInstalledPackageVersion(root, packageName) ??
          cleanVersionRange(packageJson.dependencies?.[packageName] ?? packageJson.peerDependencies?.[packageName]),
      )
    } else {
      versions.set(packageName, undefined)
    }
  }

  return versions
}

/**
 * Merge the plugin's externalization rule with any external rule supplied by the user.
 */
export function makeExternal(existing: ExternalOption, packageNames: Set<string>) {
  return (source: string, importer?: string, isResolved?: boolean) => {
    if (matchesExternal(existing, source, importer, isResolved)) {
      return true
    }

    return shouldRewrite(source, packageNames)
  }
}

/**
 * Apply one output mutation to a single Rolldown output object or an output array.
 */
export function withRolldownOutputs(
  output: RolldownOutput | RolldownOutput[] | undefined,
  mapOutput: (output: RolldownOutput | undefined) => RolldownOutput,
): RolldownOutput | RolldownOutput[] {
  if (Array.isArray(output)) {
    return output.map((item) => mapOutput(item))
  }

  return mapOutput(output)
}

/**
 * Convert externalized package IDs into absolute CDN URLs while preserving user paths.
 */
export function makeCdnPaths(
  existingPaths: PathsOption,
  getCdnUrl: (source: string) => string | undefined,
): PathsOption {
  return (source: string) => {
    const existingPath = resolveExistingPath(existingPaths, source)
    if (existingPath) {
      return existingPath
    }

    return getCdnUrl(source) ?? source
  }
}

function resolveExistingPath(paths: PathsOption, source: string): string | undefined {
  if (typeof paths === 'function') {
    return paths(source) ?? undefined
  }

  return paths?.[source]
}

/**
 * Check whether the user's existing external option already externalizes this import.
 */
function matchesExternal(
  external: ExternalOption,
  source: string,
  importer?: string,
  isResolved?: boolean,
): boolean {
  if (!external) {
    return false
  }

  if (typeof external === 'function') {
    return external(source, importer, isResolved) === true
  }

  if (Array.isArray(external)) {
    return external.some((matcher) => matchesExternalMatcher(matcher, source))
  }

  return matchesExternalMatcher(external, source)
}

function matchesExternalMatcher(matcher: ExternalMatcher, source: string): boolean {
  if (typeof matcher === 'string') {
    return matcher === source
  }

  return matcher.test(source)
}

function shouldRewrite(source: string, packageNames: Set<string>): boolean {
  const parsed = parseBarePackageImport(source)
  return parsed ? packageNames.has(parsed.packageName) : false
}

/**
 * Format a bare package import as a pinned CDN URL, preserving subpaths.
 */
export function toCdnUrl(
  source: string,
  packageNames: Set<string>,
  packageVersions: Map<string, string | undefined>,
  options: CdnOptions,
): string | undefined {
  const parsed = parseBarePackageImport(source)

  if (!parsed || !packageNames.has(parsed.packageName)) {
    return undefined
  }

  const origin = (options.origin ?? DEFAULT_ORIGIN).replace(/\/$/, '')
  const version = packageVersions.get(parsed.packageName)
  const versionSuffix = version ? `@${version}` : ''
  const query = formatQuery(options.query)

  return `${origin}/${parsed.packageName}${versionSuffix}${parsed.subpath}${query}`
}

/**
 * Split a bare import into package name and subpath, including scoped package imports.
 */
function parseBarePackageImport(source: string): { packageName: string; subpath: string } | undefined {
  if (!source || !isBareImport(source)) {
    return undefined
  }

  const [specifier] = source.split(/[?#]/, 1)
  const parts = specifier.split('/')

  if (specifier.startsWith('@')) {
    if (parts.length < 2) {
      return undefined
    }

    const packageName = `${parts[0]}/${parts[1]}`
    return {
      packageName,
      subpath: specifier.slice(packageName.length),
    }
  }

  return {
    packageName: parts[0] ?? specifier,
    subpath: specifier.slice(parts[0]?.length ?? specifier.length),
  }
}

function isBareImport(source: string): boolean {
  return (
    !source.startsWith('.') &&
    !source.startsWith('/') &&
    !source.startsWith('\0') &&
    !source.includes(':')
  )
}

function formatQuery(query: CdnOptions['query']): string {
  if (!query) {
    return ''
  }

  if (typeof query === 'string') {
    const trimmed = query.replace(/^\?/, '')
    return trimmed ? `?${trimmed}` : ''
  }

  const params = new URLSearchParams()

  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) {
      params.set(key, String(value))
    }
  }

  const formatted = params.toString()
  return formatted ? `?${formatted}` : ''
}
