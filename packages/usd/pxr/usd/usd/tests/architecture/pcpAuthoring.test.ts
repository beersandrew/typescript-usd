/**
 * Instructive authoring evidence for the OpenUSD v26.08 stage change boundary.
 *
 * Value/property edits re-flatten synchronously from the retained prim index
 * (read-your-writes); structural edits schedule a coalesced full recompose (the
 * async-coalesced change-processing model — reads reflect after awaiting
 * flushChanges, notices coalesce per batch). These tests verify that path
 * end-to-end: define / set / over edits land, coalesce, and notify.
 */

import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { afterAll, describe, expect, it } from 'vitest'
import { Stage } from 'typescript-usd/usd'
import { onObjectsChanged, type ObjectsChangedSummary } from '../support/objectsChanged.ts'

const dirs: string[] = []
function fixture(usda: string): string {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'pcp-author-'))
  dirs.push(dir)
  const file = path.join(dir, 'root.usda')
  writeFileSync(file, usda)
  return file
}
afterAll(() => { for (const d of dirs) rmSync(d, { recursive: true, force: true }) })

const ROOT = `#usda 1.0
def "World" (kind = "group")
{
    float existing = 1.0
    def "Child" { float a = 2.0 ; }
}
`

describe('pcp authoring — deferred recompose lands edits', () => {
  it('sets an attribute value (await flush)', async () => {
    const stage = (await Stage.open(fixture(ROOT)))!
    stage.definePrim('/World').attr('existing').set(9.0)
    // Not yet reflected — pcp authoring is deferred.
    await stage.flushChanges()
    expect(stage.get('/World.existing')?.getValue()).toBeCloseTo(9.0)
  })

  it('defines a new prim (await flush)', async () => {
    const stage = (await Stage.open(fixture(ROOT)))!
    stage.definePrim('/World/NewKid', 'Xform')
    await stage.flushChanges()
    expect(stage.has('/World/NewKid')).toBe(true)
    expect(stage.getPrim('/World/NewKid')?.typeName).toBe('Xform')
  })

  it('batches the edits of a change block into one recompose + notice', async () => {
    const stage = (await Stage.open(fixture(ROOT)))!
    let notices = 0
    onObjectsChanged(stage, () => { notices += 1 })
    await stage.changeBlock(() => {
      stage.definePrim('/World').attr('existing').set(3.0)
      stage.definePrim('/World/Extra', 'Scope')
      stage.definePrim('/World/Child').attr('a').set(7.0)
    })
    expect(notices).toBe(1)
    expect(stage.get('/World.existing')?.getValue()).toBeCloseTo(3.0)
    expect(stage.get('/World/Child.a')?.getValue()).toBeCloseTo(7.0)
    expect(stage.has('/World/Extra')).toBe(true)
  })

  it('matches the inline engine after flush', async () => {
    const file = fixture(ROOT)
    const inline = (await Stage.open(file))!
    inline.definePrim('/World').attr('existing').set(42.0)

    const pcp = (await Stage.open(file))!
    pcp.definePrim('/World').attr('existing').set(42.0)
    await pcp.flushChanges()

    expect(pcp.get('/World.existing')?.getValue())
      .toBeCloseTo(inline.get('/World.existing')!.getValue() as number)
  })
})
