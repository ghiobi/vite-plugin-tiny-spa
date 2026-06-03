import path from 'node:path'
import type { Plugin, UserConfig } from 'vite'
import {
  makeCdnPaths,
  makeExternal,
  normalizeCdnOptions,
  resolvePackageSet,
  resolvePackageVersions,
  toCdnUrl,
  withRolldownOutputs,
} from './cdn.js'
import { inlineFileSystemOutput, normalizeSingleFileOptions } from './single-file.js'
import type { RolldownOptions, TinySpaOptions } from './types.js'

export type { CdnOptions, SingleFileOptions, TinySpaOptions } from './types.js'

/**
 * Create a Vite plugin that emits a tiny SPA artifact.
 *
 * Development mode is untouched. During production builds, selected dependencies
 * can become CDN imports and the final written output can be reduced to one HTML file.
 */
export function tinySpa(options: TinySpaOptions = {}): Plugin {
  const cdnOptions = normalizeCdnOptions(options.cdn)
  const singleFileOptions = normalizeSingleFileOptions(options.singleFile)
  let projectRoot = process.cwd()
  let base = '/'
  let outDir = path.resolve(projectRoot, 'dist')
  let packageVersions = new Map<string, string | undefined>()
  let rewrittenPackages = new Set<string>()

  return {
    name: 'vite-plugin-tiny-spa',
    apply: 'build',
    enforce: 'pre',
    config(config) {
      projectRoot = config.root ? path.resolve(config.root) : process.cwd()

      // Vite 8 uses build.rolldownOptions for production bundling.
      // This package targets Vite 8's current Rolldown-based build API.
      const existingBuild = config.build ?? {}
      const existingRolldownOptions = (existingBuild as { rolldownOptions?: RolldownOptions })
        .rolldownOptions
      const rolldownOptions: RolldownOptions = {
        ...existingRolldownOptions,
      }

      if (cdnOptions) {
        rewrittenPackages = resolvePackageSet(projectRoot, cdnOptions)
        packageVersions = resolvePackageVersions(projectRoot, rewrittenPackages, cdnOptions)
        rolldownOptions.external = makeExternal(existingRolldownOptions?.external, rewrittenPackages)
        rolldownOptions.output = withRolldownOutputs(existingRolldownOptions?.output, (output) => ({
          ...output,
          paths: makeCdnPaths(output?.paths, (source) =>
            toCdnUrl(source, rewrittenPackages, packageVersions, cdnOptions),
          ),
        }))
      }

      if (singleFileOptions && singleFileOptions.disableCodeSplitting) {
        rolldownOptions.output = withRolldownOutputs(rolldownOptions.output, (output) => ({
          ...output,
          codeSplitting: false,
        }))
      }

      const build = {
        rolldownOptions,
      } as NonNullable<UserConfig['build']> & { rolldownOptions?: RolldownOptions }

      if (singleFileOptions) {
        if (singleFileOptions.assetsInlineLimit !== false) {
          build.assetsInlineLimit = singleFileOptions.assetsInlineLimit
        }

        if (singleFileOptions.disableCssCodeSplit) {
          build.cssCodeSplit = false
        }

        if (singleFileOptions.disableModulePreload) {
          build.modulePreload = false
        }
      }

      return { build }
    },
    configResolved(config) {
      projectRoot = config.root
      base = config.base || '/'
      outDir = path.resolve(config.root, config.build.outDir)
    },
    writeBundle() {
      if (!singleFileOptions) {
        return
      }

      inlineFileSystemOutput(outDir, base, singleFileOptions)
    },
  }
}

export default tinySpa
