// Ported from OpenUSD 26.11.1: pxr/usd/pcp/primIndex.cpp
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// OpenUSD v26.08 pxr/usd/pcp/primIndex.cpp:1188-1203 and
// pxr/usd/pcp/primIndex.cpp:1671-1694 append each rejected arc diagnostic to
// one PcpPrimIndexOutputs instance. These live-corpus cases guard exact error
// multiplicity and ensure accepted relocate compositions do not invent errors.
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { ErrorType as PcpErrorType, Cache as PcpCache } from 'typescript-usd/pcp'
import { Stage } from '../../src/index.ts'

const museum = (name: string): string => fileURLToPath(new URL(
  `../../../pcp/tests/upstream/fixtures/compositionResults/testPcpMuseum_${name}.testenv/${name}/`,
  import.meta.url,
))

function cacheOf(stage: Stage): PcpCache {
  return (stage as unknown as { _pcpCache: PcpCache })._pcpCache
}

describe('OpenUSD v26.08 Pcp museum composition diagnostics', () => {
  it('reports one unresolved internal payload path', async () => {
    const stage = (await Stage.open(`${museum('BasicPayload')}root.usda`))!
    const errors = cacheOf(stage).findPrimIndex('/PrimWithInternalPayload')!.localErrors
      .filter(error => error.errorType === PcpErrorType.UnresolvedPrimPath)
    expect(errors).toHaveLength(1)
  })

  it('does not reject the valid TrickyMultipleRelocations5 composition', async () => {
    const stage = (await Stage.open(`${museum('TrickyMultipleRelocations5')}root.usda`))!
    const cache = cacheOf(stage)
    const errors = ['/Group/Model', '/Group/Model_Renamed']
      .flatMap(path => cache.findPrimIndex(path)?.localErrors ?? [])
    expect(errors).toEqual([])
  })
})
