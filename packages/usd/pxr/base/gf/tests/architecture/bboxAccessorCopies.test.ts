// GfBBox3d returns its range and matrices by const reference in OpenUSD; here
// accessors return copies so callers cannot desynchronize the cached inverse.
import { describe, expect, it } from 'vitest'
import { BBox3d, Matrix4d, Range3d, Vec3d } from '../../src/index.ts'

describe('GfBBox3d accessors', () => {
  it('cannot be mutated through GetMatrix or GetRange', () => {
    const box = new BBox3d(new Range3d(new Vec3d(0, 0, 0), new Vec3d(1, 1, 1)), new Matrix4d(1))
    box.getMatrix().setTranslate(new Vec3d(5, 0, 0))
    box.getRange().setMax(new Vec3d(9, 9, 9))
    expect(Array.from(box.getMatrix().extractTranslation().data)).toEqual([0, 0, 0])
    expect(Array.from(box.getInverseMatrix().extractTranslation().data)).toEqual([0, 0, 0])
    expect(Array.from(box.getRange().getMax().data)).toEqual([1, 1, 1])
  })
})
