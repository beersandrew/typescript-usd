// Portions ported from OpenUSD 26.11.1, including:
//  pxr/imaging/hd/renderIndex.cpp
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

import { describe, expect, it } from 'vitest'
import {
  Bprim as HdBprim, ChangeTracker as HdChangeTracker, RenderDelegate as HdRenderDelegate, RenderIndex as HdRenderIndex,
  RetainedContainerDataSource as HdRetainedContainerDataSource, Rprim as HdRprim, SceneIndexBase as HdSceneIndexBase, Sprim as HdSprim, Tokens as HdTokens,
  DirtyBits as HdDirtyBits, SceneIndexPrim as HdSceneIndexPrim,
} from '../../src/index.ts'

class Rprim extends HdRprim {
  getInitialDirtyBitsMask(): HdDirtyBits { return HdChangeTracker.AllDirty }
  sync(): void {}
}
class Sprim extends HdSprim {
  getInitialDirtyBitsMask(): HdDirtyBits { return HdChangeTracker.AllDirty }
  sync(): void {}
}
class Bprim extends HdBprim {
  getInitialDirtyBitsMask(): HdDirtyBits { return HdChangeTracker.AllDirty }
  sync(): void {}
}
class Delegate extends HdRenderDelegate {
  created: string[] = []
  destroyed: string[] = []
  getSupportedRprimTypes(): string[] { return [HdTokens.mesh] }
  getSupportedSprimTypes(): string[] { return [HdTokens.material] }
  getSupportedBprimTypes(): string[] { return ['openvdbAsset'] }
  createRprim(_type: string, id: string): HdRprim { this.created.push(id); return new Rprim(id) }
  destroyRprim(prim: HdRprim): void { this.destroyed.push(prim.getId()) }
  createSprim(_type: string, id: string): HdSprim { this.created.push(id); return new Sprim(id) }
  destroySprim(prim: HdSprim): void { this.destroyed.push(prim.getId()) }
  createBprim(_type: string, id: string): HdBprim { this.created.push(id); return new Bprim(id) }
  destroyBprim(prim: HdBprim): void { this.destroyed.push(prim.getId()) }
  CommitResources(): void {}
}
class Scene extends HdSceneIndexBase {
  constructor(private readonly entries: Array<[string, string]>) { super() }
  getPrim(path: string): HdSceneIndexPrim {
    const type = this.entries.find(([p]) => p === path)?.[1]
    return type
      ? { primType: type, dataSource: HdRetainedContainerDataSource.new([], []) }
      : { primType: '', dataSource: undefined }
  }
  getChildPrimPaths(path: string): string[] {
    return path === '/' ? this.entries.map(([p]) => p) : []
  }
  add(path: string, type: string): void {
    this._sendPrimsAdded([{ primPath: path, primType: type }])
  }
}

describe('HdRenderIndex terminal scene ownership', () => {
  // pxr/imaging/hd/renderIndex.cpp:153-189 and 355-413: the render index owns
  // delegate-created prims and destroys them at its population boundary.
  it('releases every old delegate prim and repopulates on scene replacement', () => {
    const delegate = new Delegate()
    const first = new Scene([
      ['/R', HdTokens.mesh], ['/S', HdTokens.material], ['/B', 'openvdbAsset'],
    ])
    const second = new Scene([['/R2', HdTokens.mesh]])
    const index = HdRenderIndex.new(delegate)
    index.setSceneIndex(first)
    index.setSceneIndex(second)
    expect(delegate.destroyed.sort()).toEqual(['/B', '/R', '/S'])
    expect(index.getRprimIds()).toEqual(['/R2'])
    expect(index.getSprimIds()).toEqual([])
  })

  it('does not retain the replaced scene as an observer', () => {
    const delegate = new Delegate()
    const first = new Scene([])
    const second = new Scene([])
    const index = HdRenderIndex.new(delegate)
    index.setSceneIndex(first)
    index.setSceneIndex(second)
    first.add('/Late', HdTokens.mesh)
    expect(delegate.created).not.toContain('/Late')
  })

  it('releases delegate prims exactly once across replacement and destroy', () => {
    const delegate = new Delegate()
    const index = HdRenderIndex.new(delegate)
    index.setSceneIndex(new Scene([['/Old', HdTokens.mesh]]))
    index.setSceneIndex(new Scene([['/New', HdTokens.mesh]]))
    index.destroy()
    index.destroy()
    expect(delegate.destroyed.filter(id => id === '/Old')).toHaveLength(1)
    expect(delegate.destroyed.filter(id => id === '/New')).toHaveLength(1)
  })
})
