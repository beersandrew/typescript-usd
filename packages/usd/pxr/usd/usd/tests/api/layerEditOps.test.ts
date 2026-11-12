import { _resolverContextForResolver } from 'typescript-usd/usd/_internal'
// eraseField / spec removal (SdfPrimSpec name children) and AUTOMATIC change
// processing: direct layer edits recompose the stage without any explicit
// call — the LayersDidChange model. flushChanges() is the supported awaitable
// seam for callers needing the recomposed (async) stage immediately.
import { describe, expect, it } from 'vitest'
import { Stage } from 'typescript-usd/usd'
import { sdfChangeBlock } from 'typescript-usd/sdf'
import { ArInMemoryResolver } from 'typescript-usd/usd/_internal'
import { onObjectsChanged, type ObjectsChangedSummary } from '../support/objectsChanged.ts'

const resolverFor = (files: Record<string, string>) => new ArInMemoryResolver(
  Object.fromEntries(Object.entries(files).map(([name, text]) => [name, new TextEncoder().encode(text)])))

const ROOT = `#usda 1.0
def Xform "World" {
  def Sphere "Ball" {
    double radius = 5
  }
}
`

// Change processing is purely microtask-driven — drain the queue.
const tick = async () => {
  for (let i = 0; i < 200; i++) await Promise.resolve()
}

describe('Layer.eraseField', () => {
  it('removes an authored field; absent fields are a no-op', async () => {
    const files = { 'root.usda': ROOT }
    const stage = (await Stage.open('root.usda', { resolverContext: _resolverContextForResolver(resolverFor(files)) }))!
    const root = stage.getRootLayer()
    expect(root.getField('/World/Ball.radius', 'default')).toBe(5)
    root.eraseField('/World/Ball.radius', 'default')
    expect(root.getField('/World/Ball.radius', 'default')).toBeUndefined()
    root.eraseField('/World/Ball.radius', 'nope') // no throw
  })
})

describe('Layer spec removal (SdfPrimSpec name children)', () => {
  it('removes the spec and its descendants', async () => {
    const files = { 'root.usda': ROOT }
    const stage = (await Stage.open('root.usda', { resolverContext: _resolverContextForResolver(resolverFor(files)) }))!
    const root = stage.getRootLayer()
    root.getPrimAtPath('/World')!.getNameChildren().erase('Ball')
    expect(root.getField('/World/Ball', 'typeName')).toBeUndefined()
    expect(root.getField('/World/Ball.radius', 'default')).toBeUndefined()
  })
})

describe('automatic change processing', () => {
  it('direct layer edits recompose the stage with a notice — no explicit call', async () => {
    const files = { 'root.usda': ROOT }
    const stage = (await Stage.open('root.usda', { resolverContext: _resolverContextForResolver(resolverFor(files)) }))!
    let notices = 0
    onObjectsChanged(stage, () => { notices += 1 })

    stage.getRootLayer().setField('/World/Ball.radius', 'default', 9)
    expect(stage.getPrim('/World/Ball')?.getAttr('radius')?.getValue()).toBe(9)
    expect(notices).toBe(1)
  })

  it('a burst of edits in one SdfChangeBlock sends one notice', async () => {
    const files = { 'root.usda': ROOT }
    const stage = (await Stage.open('root.usda', { resolverContext: _resolverContextForResolver(resolverFor(files)) }))!
    let notices = 0
    onObjectsChanged(stage, () => { notices += 1 })

    const root = stage.getRootLayer()
    sdfChangeBlock(() => {
      root.setField('/World/Ball.radius', 'default', 7)
      root.setField('/World/Ball.note', 'default', 'hi')
      root.setField('/World/Ball.note', 'typeName', 'string')
    })
    expect(stage.getPrim('/World/Ball')?.getAttr('radius')?.getValue()).toBe(7)
    expect(notices).toBe(1)
  })

  it('flushChanges makes the recompose awaitable after edits', async () => {
    const files = { 'root.usda': ROOT }
    const stage = (await Stage.open('root.usda', { resolverContext: _resolverContextForResolver(resolverFor(files)) }))!
    stage.getRootLayer().getPrimAtPath('/World')!.getNameChildren().erase('Ball')
    await stage.flushChanges()
    expect(stage.getPrim('/World/Ball')).toBeUndefined()
  })

  it("the stage's own authoring does not double-recompose", async () => {
    const files = { 'root.usda': ROOT }
    const stage = (await Stage.open('root.usda', { resolverContext: _resolverContextForResolver(resolverFor(files)) }))!
    let notices = 0
    onObjectsChanged(stage, () => { notices += 1 })

    stage.definePrim('/World/Ball').attr('radius').set(11) // incremental path
    await tick()
    expect(notices).toBe(1) // the authored notice only; no trailing recompose notice
    expect(stage.getPrim('/World/Ball')?.getAttr('radius')?.getValue()).toBe(11)
  })
})
