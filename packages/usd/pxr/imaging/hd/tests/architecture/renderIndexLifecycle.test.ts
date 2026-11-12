import { describe, expect, it } from 'vitest'
import {
  Bprim as HdBprim, ChangeTracker as HdChangeTracker, RenderDelegate as HdRenderDelegate, RenderIndex as HdRenderIndex, Rprim as HdRprim,
  RetainedContainerDataSource as HdRetainedContainerDataSource, SceneIndexBase as HdSceneIndexBase, Sprim as HdSprim, Tokens as HdTokens,
  DirtyBits as HdDirtyBits, SceneIndexPrim as HdSceneIndexPrim,
} from '../../src/index.ts'

class Rprim extends HdRprim {
  getInitialDirtyBitsMask(): HdDirtyBits { return HdChangeTracker.AllDirty }
  sync(): void {}
}

class Delegate extends HdRenderDelegate {
  destroyed: string[] = []
  getSupportedRprimTypes(): string[] { return [HdTokens.mesh] }
  getSupportedSprimTypes(): string[] { return [] }
  getSupportedBprimTypes(): string[] { return [] }
  createRprim(_type: string, id: string): HdRprim { return new Rprim(id) }
  destroyRprim(prim: HdRprim): void { this.destroyed.push(prim.getId()) }
  createSprim(): HdSprim { throw new Error('unsupported') }
  destroySprim(): void {}
  createBprim(): HdBprim { throw new Error('unsupported') }
  destroyBprim(): void {}
  CommitResources(): void {}
}

class Scene extends HdSceneIndexBase {
  getPrim(path: string): HdSceneIndexPrim {
    return path === '/Mesh'
      ? { primType: HdTokens.mesh, dataSource: HdRetainedContainerDataSource.new([], []) }
      : { primType: '', dataSource: undefined }
  }
  getChildPrimPaths(path: string): string[] { return path === '/' ? ['/Mesh'] : [] }
  addAnotherMesh(): void {
    this._sendPrimsAdded([{ primPath: '/Late', primType: HdTokens.mesh }])
  }
}

describe('HdRenderIndex lifecycle', () => {
  it('destroys delegate prims and revokes its scene-index observer', () => {
    const delegate = new Delegate()
    const scene = new Scene()
    const index = HdRenderIndex.new(delegate)
    index.setSceneIndex(scene)

    index.destroy()
    scene.addAnotherMesh()

    expect(delegate.destroyed).toEqual(['/Mesh'])
    expect(index.getRprimIds()).toEqual([])
  })
})
