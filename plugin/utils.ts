import fs from 'node:fs'
import path from 'node:path'
import type { PackageJson } from './types.js'

/**
 * Read package metadata from a Vite project root.
 */
export function readPackageJson(root: string): PackageJson {
  const packageJsonPath = path.join(root, 'package.json')

  if (!fs.existsSync(packageJsonPath)) {
    return {}
  }

  return JSON.parse(fs.readFileSync(packageJsonPath, 'utf8')) as PackageJson
}

/**
 * Find installed package versions from the project root or ancestor monorepo roots.
 */
export function readInstalledPackageVersion(root: string, packageName: string): string | undefined {
  for (const directory of ancestorDirectories(root)) {
    const packageJsonPath = path.join(directory, 'node_modules', packageName, 'package.json')

    if (fs.existsSync(packageJsonPath)) {
      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8')) as { version?: string }
      return packageJson.version
    }
  }

  return undefined
}

/**
 * Return `start`, then each parent directory up to the filesystem root.
 */
export function ancestorDirectories(start: string): string[] {
  const directories: string[] = []
  let current = path.resolve(start)

  while (true) {
    directories.push(current)
    const parent = path.dirname(current)

    if (parent === current) {
      return directories
    }

    current = parent
  }
}

/**
 * Strip common npm semver range prefixes for CDN version pins.
 */
export function cleanVersionRange(versionRange: string | undefined): string | undefined {
  return versionRange?.replace(/^[~^<>=\s]+/, '')
}

/**
 * Escape user/build-generated text before putting it into a RegExp constructor.
 */
export function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
