// The built package resolves its own `typescript-usd/...` imports through
// publishConfig.exports, so every source entry in `exports` needs a built
// counterpart there: a subpath missing from publishConfig makes the packed
// main entry fail to import (ERR_PACKAGE_PATH_NOT_EXPORTED).
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { repoRoot } from './libraryImports.ts'

interface Manifest {
  exports: Record<string, string>
  publishConfig: { exports: Record<string, string | { types: string, default: string }> }
}
const manifest = JSON.parse(readFileSync(path.join(repoRoot, 'package.json'), 'utf8')) as Manifest
const built = (source: string, extension: string): string =>
  source.replace(/^\.\/pxr\//, './dist/pxr/').replace(/\.ts$/, extension)

describe('package exports', () => {
  it('publishes exactly the source entry points', () => {
    expect(Object.keys(manifest.publishConfig.exports).sort()).toEqual(Object.keys(manifest.exports).sort())
  })

  for (const [subpath, source] of Object.entries(manifest.exports)) {
    it(`${subpath} publishes the build of ${source}`, () => {
      const published = manifest.publishConfig.exports[subpath]
      if (!source.endsWith('.ts')) {
        // A resource is published as the copied file.
        expect(published).toBe(built(source, path.extname(source)))
        return
      }
      expect(published).toEqual({ types: built(source, '.d.ts'), default: built(source, '.js') })
    })
  }
})
