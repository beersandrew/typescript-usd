// Portions ported from OpenUSD 26.11.1, including: pxr/usd/pcp/primIndex.cpp
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

import { _resolverContextForResolver } from 'typescript-usd/usd/_internal'
// Deep-namespace gate for the former MAX_NAMESPACE_DEPTH = 48 cap in
// Stage population. That cap was a cycle guard (an unbounded namespace
// cycle such as ErrorArcCycle's ancestral reference cycle produces infinitely
// deep distinct prim paths), but it also truncates VALID deep hierarchies,
// which upstream composes without any depth limit — upstream bounds cycles
// through Pcp arc-cycle detection (PcpErrorArcCycle,
// pxr/usd/pcp/primIndex.cpp), never through a namespace-depth cap.
//
// Live 26.05 capture: a 60-level nested Scope chain composes completely —
// GetPrimAtPath is valid at depths 48, 49, and 60, and Traverse() visits all
// 60 prims. The faithful replacement for the cap is upstream's cycle
// detection; until then this red gates the truncation of valid scenes.

import { describe, expect, it } from 'vitest'
import { ArInMemoryResolver } from 'typescript-usd/ar/_internal'
import { Stage } from '../../src/index.ts'

const enc = (text: string) => new TextEncoder().encode(text)

const DEPTH = 60

function deepUsda(depth: number): string {
  let usda = '#usda 1.0\n'
  for (let i = 0; i < depth; i++) {
    usda += `${'    '.repeat(i)}def Scope "P${i}" {\n`
  }
  for (let i = depth - 1; i >= 0; i--) {
    usda += `${'    '.repeat(i)}}\n`
  }
  return usda
}

function pathAtDepth(depth: number): string {
  return `/${Array.from({ length: depth }, (_, i) => `P${i}`).join('/')}`
}

describe('deep namespace composition', () => {
  it('composes valid hierarchies beyond 48 levels', async () => {
    const stage = (await Stage.open('deep.usda', {
      resolverContext: _resolverContextForResolver(new ArInMemoryResolver({ 'deep.usda': enc(deepUsda(DEPTH)) })),
    }))!

    // Control: depths within the cap populate.
    expect(stage.getPrim(pathAtDepth(47))).toBeTruthy()
    expect(stage.getPrim(pathAtDepth(48))).toBeTruthy()

    // Live 26.05 capture: the native stage populates every level — depth 49
    // and depth 60 prims are valid, 60 prims total.
    expect(stage.getPrim(pathAtDepth(49))).toBeTruthy()
    expect(stage.getPrim(pathAtDepth(DEPTH))).toBeTruthy()
  })

  it('terminates ErrorArcCycle reference graphs through Pcp arc rejection', async () => {
    // testPcpMuseum_ErrorArcCycle.testenv/ErrorArcCycle: A references B and
    // B references A. primIndex.cpp:_CheckForCycle rejects the closing arc,
    // while the finite opinions preceding it still compose.
    const resolver = new ArInMemoryResolver({
      'root.usda': enc(`#usda 1.0
def "GroupRoot" (
    references = @./A.usda@</GroupA>
) {}
`),
      'A.usda': enc(`#usda 1.0
def "GroupA" (
    references = @./B.usda@</GroupB>
) {
    custom double A_attr
    def "ChildA" {}
}
`),
      'B.usda': enc(`#usda 1.0
def "GroupB" (
    references = @./A.usda@</GroupA>
) {
    custom double B_attr
}
`),
    })
    const stage = (await Stage.open('root.usda', { resolverContext: _resolverContextForResolver(resolver) }))!

    expect(stage.getPrim('/GroupRoot')).toBeDefined()
    expect(stage.getPrim('/GroupRoot/ChildA')).toBeDefined()
    expect(stage.get('/GroupRoot.A_attr')).toBeDefined()
    expect(stage.get('/GroupRoot.B_attr')).toBeDefined()
    expect([...stage.traverse()].filter(path => path !== '/' && !path.includes('.'))).toEqual([
      '/GroupRoot', '/GroupRoot/ChildA',
    ])
  })
})
