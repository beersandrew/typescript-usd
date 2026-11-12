// Ported from OpenUSD 26.11.1: pxr/usd/usd/stage.cpp
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// OpenUSD usd/stage.cpp:874–880: session tags follow the root display name.
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { Layer } from 'typescript-usd/sdf'
import { Stage } from 'typescript-usd/usd'
import { readOracleFixture } from '../../../../testing/oracleFixture.ts'

type Row = { kind: 'named' | 'anonymous' | 'inMemory'; tag: string; root: string; session: string; sessionAnonymous: boolean }
const rows = readOracleFixture(fileURLToPath(new URL('../fixtures/sessionNames/expected.json', import.meta.url))) as Row[]
describe('session layer names (pinned native OpenUSD)', () => {
  for (const row of rows) {
    it(`${row.kind}: ${row.tag || '(default)'}`, async () => {
      const stage = row.kind === 'inMemory' ? Stage.createNew() : await Stage.open(
        row.kind === 'anonymous' ? Layer.createAnonymous(row.tag) :
          Layer.createInMemory(`/session-name-fixture/${row.tag}`, '#usda 1.0\n'),
      )
      expect(stage.getRootLayer().getDisplayName()).toBe(row.root)
      expect(stage.getSessionLayer().getDisplayName()).toBe(row.session)
      expect(stage.getSessionLayer().isAnonymous()).toBe(row.sessionAnonymous)
      expect(stage.getSessionLayer()).not.toBe(stage.getRootLayer())
    })
  }
})
