// Ported from OpenUSD 26.11.1: pxr/usd/sdf/primSpec.cpp, pxr/usd/usd/stage.cpp
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Local regression, unscored: session property authoring through the public API.
// OpenUSD v26.08 usd/stage.cpp:4622-4645, 5053-5065; sdf/primSpec.cpp:932-970.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { ArInMemoryResolver } from 'typescript-usd/ar/_internal'
import { _resolverContextForResolver } from 'typescript-usd/usd/_internal'
import { Stage } from '../../src/index.ts'
import { onObjectsChanged, type ObjectsChangedSummary } from '../support/objectsChanged.ts'
import { readOracleFixture } from '../../../../testing/oracleFixture.ts'

const fixture = fileURLToPath(new URL('../fixtures/sessionTranslationNotice/root.usda', import.meta.url))
const reference = readOracleFixture(fileURLToPath(new URL('../fixtures/sessionTranslationNotice/reference.json', import.meta.url)))

describe('session translation notice scope (OpenUSD oracle)', () => {
  it('sends the first-opinion property resync and ancestor info, then value-only edits', async () => {
    const stage = (await Stage.open('root.usda', {
      resolverContext: _resolverContextForResolver(new ArInMemoryResolver({ 'root.usda': new Uint8Array(readFileSync(fixture)) })),
    }))!
    stage.setEditTarget(stage.getSessionLayer()!)
    const notices: ObjectsChangedSummary[] = []
    onObjectsChanged(stage, n => notices.push(n))
    for (const step of reference.steps) {
      notices.length = 0
      stage.getPrim('/World/Box')!.attr('xformOp:translate').set(step.value)
      await stage.flushChanges()
      expect(notices.map(n => ({ resyncedPaths: n.resyncedPaths, changedInfoOnlyPaths: n.changedInfoOnlyPaths })))
        .toEqual(step.notices)
      expect(stage.getPrim('/World/Box')!.attr('xformOp:translate').get()).toEqual(step.value)
    }
  })
})
