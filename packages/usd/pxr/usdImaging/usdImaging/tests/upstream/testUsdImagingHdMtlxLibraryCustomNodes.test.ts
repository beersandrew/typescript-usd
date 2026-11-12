// Ported from OpenUSD 26.11.1:
//  pxr/usdImaging/usdImaging/testenv/testUsdImagingHdMtlx.cpp
// Copyright 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// The reference build's testUsdImagingHdMtlx program
// (pxr/usdImaging/usdImaging/testenv/testUsdImagingHdMtlx.cpp, OpenUSD
// 26.11.1; testUsdImagingHdMtlxProgram.ts) on the scenes of the
// testUsdImagingGLMaterialXLibraryCustomNodes_* registrations
// (pxr/usdImaging/usdImagingGL/CMakeLists.txt:-41), run in their
// testenv directory with the registrations' ENV (PXR_MTLX_PLUGIN_SEARCH_PATHS=./libraryNodes):
// MaterialX custom nodes, defined in XIncluded documents, through usdMtlx's
// file format, Sdr and HdMtlx. Expected: the reference build's written
// documents and stdout and the layers its usdMtlx file format reads, captured
// into fixtures/testUsdImagingHdMtlxCustomNodes (FIXTURES.md). The scene files are
// the testenv's, copied unchanged into fixtures/testUsdImagingHdMtlxCustomNodes/Library/.

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { Layer } from 'typescript-usd/sdf'
import { Stage } from 'typescript-usd/usd'
import { main } from './testUsdImagingHdMtlxProgram.ts'

const fixtures = new URL('fixtures/testUsdImagingHdMtlxCustomNodes/', import.meta.url)
const testenv = fileURLToPath(new URL('Library/', fixtures))
const captured = JSON.parse(readFileSync(new URL('capture.json', fixtures), 'utf8')).payload as
  Record<string, { returnCode: number, stdout: string }>
const names = Object.keys(captured).filter(key => key.startsWith('Library/')).map(key => key.slice('Library/'.length))

/** The layers of layers.usda.txt, by mtlx file name. */
function expectedLayers(): Map<string, string> {
  const text = readFileSync(new URL('Library/layers.usda.txt', fixtures), 'utf8')
    .replaceAll('<testenv>/', testenv)
  const layers = new Map<string, string>()
  for (const part of text.split(/^### /m).slice(1)) {
    const newline = part.indexOf('\n')
    layers.set(part.slice(0, newline), part.slice(newline + 1))
  }
  return layers
}

describe('testUsdImagingHdMtlx on the LibraryCustomNodes scenes', () => {
  const cwd = process.cwd()
  beforeAll(() => {
    process.chdir(testenv)
    process.env.PXR_MTLX_PLUGIN_SEARCH_PATHS = './libraryNodes'
  })
  // usdMtlx reads its search paths when its plugin registers (upstream, when
  // the process starts), so it is loaded after the ENV is set.
  beforeAll(async () => {
    await import('typescript-usd/usdMtlx')
  })
  afterAll(() => {
    process.chdir(cwd)
  })

  for (const [name, layer] of expectedLayers()) {
    it(`reads ${name} as the reference build's usdMtlx file format does`, async () => {
      const actual = (await Stage.open(`${testenv}${name}`))!
      const expected = await Stage.open(Layer.createInMemory(`expected-${name}.usda`, layer))
      try {
        const paths = [...expected.traverse()].sort()
        expect([...actual.traverse()].sort()).toEqual(paths)
        expect(actual.getCompositionErrors()).toEqual([])
        for (const path of paths) {
          const a = actual.getPrim(path)!, b = expected.getPrim(path)!
          expect(a.typeName, path).toBe(b.typeName)
          expect(a.getPropertyNames().sort(), path).toEqual(b.getPropertyNames().sort())
          for (const property of b.getPropertyNames()) {
            const x = a.getAttr(property), y = b.getAttr(property)
            if (!y) continue
            expect(x?.getValue(), `${path}.${property} value`).toEqual(y.getValue())
            expect(x?.getConnections(), `${path}.${property} connections`).toEqual(y.getConnections())
          }
        }
      } finally { actual.dispose(); expected.dispose() }
    })
  }

  for (const name of names) {
    it(`testUsdImagingHdMtlx --filename ${name}.usda`, async () => {
      const { stdout, written } = await main(`${name}.usda`)
      expect(stdout).toBe(captured[`Library/${name}`]!.stdout)
      expect(written.get(`${name}.mtlx`)).toBe(readFileSync(new URL(`Library/${name}.mtlx`, fixtures), 'utf8'))
    })
  }
})
