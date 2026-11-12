import { _resolverContextForResolver } from 'typescript-usd/usd/_internal'
// Stage.changeBlock — batched edits (mirrors SdfChangeBlock): edits made inside
// the block are coalesced into a SINGLE recomposition + a single ObjectsChanged
// notice, instead of one recompose per edit. The motivating case is an LOD grid
// where many tiles' `lod` variant selections change per frame.
import { describe, expect, it } from 'vitest'
import { Stage } from 'typescript-usd/usd'
import { ArInMemoryResolver } from 'typescript-usd/usd/_internal'
import { onObjectsChanged, type ObjectsChangedSummary } from '../support/objectsChanged.ts'

const resolverFor = (files: Record<string, string>) => new ArInMemoryResolver(
  Object.fromEntries(Object.entries(files).map(([name, text]) => [name, new TextEncoder().encode(text)])))

const tile = (n: string): string => `
def Xform "${n}" ( variants = { string lod = "a"
}
 prepend variantSets = "lod" )
{ variantSet "lod" = { "a" { def Scope "A" {}
 }
 "b" { def Scope "B" {}
 }
 }
 }
`
const GRID = `#usda 1.0\n${tile('T0')}${tile('T1')}${tile('T2')}`

describe('Stage.changeBlock', () => {
  it('coalesces N variant selections into ONE recompose, with correct final state', async () => {
    const files = { 'grid.usda': GRID }
    const stage = (await Stage.open('grid.usda', { resolverContext: _resolverContextForResolver(resolverFor(files)) }))!
    const has = (p: string): boolean => stage.getPrim(p) !== undefined
    const sel = (t: string, v: string): Promise<void> =>
      stage.getVariantSets(`/${t}`).getVariantSet('lod').setVariantSelection(v)

    let notices = 0
    onObjectsChanged(stage, () => { notices++ })

    // Unbatched: one recompose/notice per selection.
    await sel('T0', 'b'); await sel('T1', 'b'); await sel('T2', 'b')
    expect(notices).toBe(3)
    expect(has('/T0/B') && has('/T1/B') && has('/T2/B')).toBe(true)

    // Reset, then batch: three selections, ONE notice.
    await stage.changeBlock(async () => {
      await sel('T0', 'a'); await sel('T1', 'a'); await sel('T2', 'a')
    })
    notices = 0
    await stage.changeBlock(async () => {
      await sel('T0', 'b'); await sel('T1', 'b'); await sel('T2', 'b')
    })
    expect(notices).toBe(1)
    // All selections applied; the old variant's content is gone.
    expect(has('/T0/B') && has('/T1/B') && has('/T2/B')).toBe(true)
    expect(has('/T0/A') || has('/T1/A') || has('/T2/A')).toBe(false)
  })

  it('nested changeBlocks recompose once at the outermost close', async () => {
    const files = { 'grid.usda': GRID }
    const stage = (await Stage.open('grid.usda', { resolverContext: _resolverContextForResolver(resolverFor(files)) }))!
    let notices = 0
    onObjectsChanged(stage, () => { notices++ })
    await stage.changeBlock(async () => {
      await stage.getVariantSets('/T0').getVariantSet('lod').setVariantSelection('b')
      await stage.changeBlock(async () => {
        await stage.getVariantSets('/T1').getVariantSet('lod').setVariantSelection('b')
      })
      expect(notices).toBe(0) // inner close did NOT recompose
    })
    expect(notices).toBe(1)
  })

  it('returns the callback value', async () => {
    const files = { 'grid.usda': GRID }
    const stage = (await Stage.open('grid.usda', { resolverContext: _resolverContextForResolver(resolverFor(files)) }))!
    const r = await stage.changeBlock(() => 42)
    expect(r).toBe(42)
  })
})
