// Ported from OpenUSD 26.11.1: pxr/imaging/hdx/shaders/selection.glslfx
// Copyright 2018 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// HioGlslfx, HioGlslfxConfig and HioGlslfxResourceLayout against native
// OpenUSD 26.11.1 (fixtures/glslfx): every Storm
// shader file (and hdx/shaders/selection.glslfx, which Storm imports), each
// as a file and as a stream exposing every section, plus authored syntax,
// import, configuration, JSON and layout cases. OpenUSD has no upstream test
// of hio/glslfx*; the expected values are the native results.
//
// The native installed resource directory (<install>/lib/usd/<lib>/resources)
// corresponds to the TypeScript plugins' ResourcePath (/usd/<lib>/resources,
// hdSt/src/shaderResources.ts, hdx/src/shaderResources.ts).
import { describe, expect, it } from 'vitest'
import { runGlslfxCase as run, type GlslfxCase as Case } from './glslfxCase.ts'
import { HdSt_RegisterShaderResources } from '../../hdSt/src/shaderResources.ts'
import { Hdx_RegisterShaderResources } from '../../hdx/src/shaderResources.ts'
import { readOracleFixture } from '../../../testing/oracleFixture.ts'

HdSt_RegisterShaderResources()
Hdx_RegisterShaderResources()

const native = readOracleFixture<{ cases: Array<{ case: Case; result: any }> }>(
  new URL('./fixtures/glslfx/expected.json', import.meta.url))

const NATIVE_RESOURCES = '<install>/lib/usd/'
const RESOURCES = '/usd/'
function toTs<T>(value: T): T {
  if (typeof value === 'string') return value.split(NATIVE_RESOURCES).join(RESOURCES) as T
  if (Array.isArray(value)) return value.map(toTs) as T
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, toTs(v)])) as T
  }
  return value
}

describe('HioGlslfx matches native OpenUSD 26.11.1', () => {
  for (const { case: nativeCase, result: nativeResult } of native.cases) {
    it(nativeCase.name, () => {
      const c = toTs(nativeCase)
      const expected = toTs(nativeResult)
      const actual = run(c)
      // GetHash() hashes every line read, so it is comparable only when no
      // line names a resource path (those differ between the native install
      // and the TypeScript resource directory).
      if (nativeCase.kind === 'stream' && nativeCase.input.includes(NATIVE_RESOURCES)) {
        actual.hash = expected.hash
      }
      expect(actual).toEqual(expected)
    })
  }
})
