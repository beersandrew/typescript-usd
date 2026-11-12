// Portions ported from OpenUSD 26.11.1, including:
//  pxr/usd/usd/testenv/testUsdStage.py, pxr/usd/usd/stage.cpp
// Copyright 2016, 2017 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

import { _resolverContextForResolver } from 'typescript-usd/usd/_internal'
// Port of pxr/usd/usd/testenv/testUsdStage.py test_UsdStageTimeMetadata
// (:290) — stage timing metadata resolves across the SESSION and root layers,
// session strongest. Expected values were re-captured on the live 26.05
// reference build (UsdStage.Open(rootLayer, sessionLayer); the metadata
// getters have no Pcp-cache mode dependence).
//
// Governing upstream code:
// - GetStartTimeCode/GetEndTimeCode take the session layer's opinion over the
//   root layer's (pxr/usd/usd/stage.cpp:10028-10067).
// - GetTimeCodesPerSecond resolves session TCPS, root TCPS, session FPS, root
//   FPS, then the schema fallback 24 (stage.cpp:10090-10097, the
//   testenv's :398-413 ladder).
// - GetFramesPerSecond resolves session FPS, root FPS, then the schema
//   fallback 24 — it NEVER consults timeCodesPerSecond (stage.cpp:
//   10107-10113). The final it() asserts this at a root-TCPS-only state the
//   testenv sequence does not visit (supplemental to the 1:1 rows; the
//   mechanism is the same GetMetadata resolution the testenv exercises).
//
// Omitted upstream rows: the legacy startFrame/endFrame cases (kept upstream
// only for bug 123508's Sd migration; typescript-usd has no startFrame metadata) and
// the EditContext-on-sublayer authoring warnings (typescript-usd has no stage-level
// SetStartTimeCode/SetTimeCodesPerSecond surface yet — opinions are authored
// here directly on the layers, which is what those setters do upstream).
//
// typescript-usd divergence these reds gate (usd/src/stage.ts:265-298): every timing
// getter reads ONLY the root layer (session opinions are invisible), and
// getFramesPerSecond invents an FPS -> TCPS fallback upstream does not have.

import { describe, expect, it } from 'vitest'
import { ArInMemoryResolver } from 'typescript-usd/ar/_internal'
import type { Layer } from 'typescript-usd/sdf'
import { Stage } from '../../src/index.ts'
import { onObjectsChanged, type ObjectsChangedSummary } from '../support/objectsChanged.ts'

const enc = (text: string) => new TextEncoder().encode(text)

async function makeStage(): Promise<{ stage: Stage; root: Layer; session: Layer }> {
  const stage = (await Stage.open('stageTimeMetadata-root.usda', {
    resolverContext: _resolverContextForResolver(new ArInMemoryResolver({
      'stageTimeMetadata-root.usda': enc('#usda 1.0\n'),
    })),
  }))!
  // Upstream: Usd.Stage.Open(rootLayer, sessionLayer) — here the stage's own
  // anonymous session layer plays the CreateAnonymous session's role.
  return { stage, root: stage.getRootLayer(), session: stage.getSessionLayer() }
}

describe('testUsdStage (test_UsdStageTimeMetadata)', () => {
  it('control: root-only opinions resolve through every timing getter', async () => {
    // The rows of the testenv sequence whose opinions live in the ROOT layer
    // only (no session opinion in play). Live capture: 50/60, fps 60, tcps 48.
    const { stage, root } = await makeStage()
    expect(stage.hasAuthoredTimeRange()).toBe(false)
    expect(stage.timeCodesPerSecond).toBe(24)
    expect(stage.getFramesPerSecond()).toBe(24)
    root.setField('/', 'startTimeCode', 50)
    root.setField('/', 'endTimeCode', 60)
    root.setField('/', 'framesPerSecond', 60)
    expect(stage.startTimeCode).toBe(50)
    expect(stage.endTimeCode).toBe(60)
    expect(stage.hasAuthoredTimeRange()).toBe(true)
    expect(stage.getFramesPerSecond()).toBe(60)
    root.setField('/', 'timeCodesPerSecond', 48)
    expect(stage.timeCodesPerSecond).toBe(48)
  })

  it('start/endTimeCode: session layer opinions win over root', async () => {
    const { stage, root, session } = await makeStage()
    expect(stage.hasAuthoredTimeRange()).toBe(false)

    // testUsdStage.py:323-328 — authored on the root layer.
    root.setField('/', 'startTimeCode', 50)
    root.setField('/', 'endTimeCode', 60)
    expect.soft(stage.startTimeCode).toBe(50)
    expect.soft(stage.endTimeCode).toBe(60)
    expect.soft(stage.hasAuthoredTimeRange()).toBe(true)

    // testUsdStage.py:336-346 — the session layer's opinion is STRONGER than
    // the root layer's (stage.cpp:10028-10067). Live capture: 70/80.
    session.setField('/', 'startTimeCode', 70)
    session.setField('/', 'endTimeCode', 80)
    expect.soft(stage.startTimeCode).toBe(70)
    expect.soft(stage.endTimeCode).toBe(80)
    expect.soft(stage.hasAuthoredTimeRange()).toBe(true)

    // Clearing the stronger session opinions reveals the root opinions.
    session.eraseField('/', 'startTimeCode')
    session.eraseField('/', 'endTimeCode')
    expect.soft(stage.startTimeCode).toBe(50)
    expect.soft(stage.endTimeCode).toBe(60)
    expect.soft(stage.hasAuthoredTimeRange()).toBe(true)

    // Session-only opinion (root cleared). Live capture: still 70/80.
    session.setField('/', 'startTimeCode', 70)
    session.setField('/', 'endTimeCode', 80)
    root.eraseField('/', 'startTimeCode')
    root.eraseField('/', 'endTimeCode')
    expect.soft(stage.startTimeCode).toBe(70)
    expect.soft(stage.endTimeCode).toBe(80)
    expect.soft(stage.hasAuthoredTimeRange()).toBe(true)

  })

  it('live root/session timing edits retain Stage identity and emit info-only root notices', async () => {
    const { stage, root, session } = await makeStage()
    const identity = stage
    const notices: Array<{ resynced: string[]; changed: string[] }> = []
    onObjectsChanged(stage, notice => notices.push({
      resynced: [...notice.resyncedPaths],
      changed: [...notice.changedInfoOnlyPaths],
    }))

    root.setField('/', 'startTimeCode', 50)
    root.setField('/', 'endTimeCode', 60)
    session.setField('/', 'startTimeCode', 70)
    session.setField('/', 'endTimeCode', 80)
    await stage.flushChanges()

    expect(stage).toBe(identity)
    expect(stage.startTimeCode).toBe(70)
    expect(stage.endTimeCode).toBe(80)
    // OpenUSD v26.08: each layer metadata edit is its own round of change
    // processing with an info-only notice for the pseudo-root.
    expect(notices).toEqual(Array(4).fill({ resynced: [], changed: ['/'] }))

    notices.length = 0
    session.eraseField('/', 'startTimeCode')
    session.eraseField('/', 'endTimeCode')
    await stage.flushChanges()
    expect(stage).toBe(identity)
    expect(stage.startTimeCode).toBe(50)
    expect(stage.endTimeCode).toBe(60)
    expect(notices).toEqual(Array(2).fill({ resynced: [], changed: ['/'] }))
  })

  it('getFramesPerSecond: session opinion wins, schema fallback 24', async () => {
    const { stage, session } = await makeStage()
    // testUsdStage.py:377-379 — unauthored: the schema fallback.
    expect.soft(stage.getFramesPerSecond()).toBe(24)

    // testUsdStage.py:380-383 — authored ONLY in the session layer.
    session.setField('/', 'framesPerSecond', 48)
    expect.soft(stage.getFramesPerSecond()).toBe(48)

    // testUsdStage.py:385-386.
    session.eraseField('/', 'framesPerSecond')
    expect.soft(stage.getFramesPerSecond()).toBe(24)
  })

  it('getTimeCodesPerSecond: session TCPS, root TCPS, session FPS, root FPS, 24', async () => {
    const { stage, root, session } = await makeStage()
    // testUsdStage.py:388-393 — unauthored fallback, then session-only TCPS.
    expect.soft(stage.timeCodesPerSecond).toBe(24)
    session.setField('/', 'timeCodesPerSecond', 48)
    expect.soft(stage.timeCodesPerSecond).toBe(48)

    // testUsdStage.py:398-413 — the resolution ladder. Live capture:
    // 4 -> 3 -> 2 -> 1 -> 24.
    session.setField('/', 'timeCodesPerSecond', 4)
    session.setField('/', 'framesPerSecond', 2)
    root.setField('/', 'timeCodesPerSecond', 3)
    root.setField('/', 'framesPerSecond', 1)
    expect.soft(stage.timeCodesPerSecond).toBe(4)
    session.eraseField('/', 'timeCodesPerSecond')
    expect.soft(stage.timeCodesPerSecond).toBe(3)
    root.eraseField('/', 'timeCodesPerSecond')
    expect.soft(stage.timeCodesPerSecond).toBe(2)
    session.eraseField('/', 'framesPerSecond')
    expect.soft(stage.timeCodesPerSecond).toBe(1)
    root.eraseField('/', 'framesPerSecond')
    expect.soft(stage.timeCodesPerSecond).toBe(24)
  })

  it('getFramesPerSecond never falls back to timeCodesPerSecond', async () => {
    const { stage, root } = await makeStage()
    // stage.cpp:10107-10113: FPS resolves session, root, then the schema
    // fallback 24 — an authored TCPS is NOT consulted. Live capture with
    // root timeCodesPerSecond=48 and no framesPerSecond anywhere:
    // GetTimeCodesPerSecond()==48, GetFramesPerSecond()==24.
    root.setField('/', 'timeCodesPerSecond', 48)
    expect.soft(stage.timeCodesPerSecond).toBe(48)
    expect.soft(stage.getFramesPerSecond()).toBe(24)
  })
})
