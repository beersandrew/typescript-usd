import { expect, it } from 'vitest'
import { fileURLToPath } from 'node:url'
import { basename } from 'node:path'
import { Layer, LayerTree } from 'typescript-usd/sdf'
import { Stage } from 'typescript-usd/usd'
import type { Layer as PcpLayer } from '../../src/index.ts'
import expectedFixture from '../fixtures/layerTree/expected.json' with { type: 'json' }
import { oraclePayload } from '../../../../testing/oracleFixture.ts'
const expected = oraclePayload(expectedFixture)

const path = (name: string) => fileURLToPath(new URL(`../fixtures/layerTree/${name}.usda`, import.meta.url))
function tree(t: LayerTree<PcpLayer> | null): unknown {
  if (!t) return null
  const layer=t.getLayer()!
  return {layer:layer.filePath.startsWith('anon:')?'~session~':basename(layer.filePath),offset:t.getOffset().offset,scale:t.getOffset().scale,children:t.getChildTrees().map(tree)}
}
function stack(stage: Stage) { return stage.getPrim('/World')!.computeExpandedPrimIndex().getRootNode().getLayerStack() }
function snapshot(stage: Stage) {
  const s=stack(stage)
  return {root:tree(s.getLayerTree()),session:tree(s.getSessionLayerTree()),layers:s.getLayers().map(l=>l.filePath.startsWith('anon:')?'~session~':basename(l.filePath))}
}
it('matches native nested/repeated offsets, session owner ordering, muting and retained tree snapshots',async()=>{
 const plain=(await Stage.open(path('root')))!
 try{expect(snapshot(plain)).toEqual(expected.plain)}finally{plain.dispose()}
 const stage=(await Stage.open(path('root'),{sessionLayerPath:path('session')}))!
 try{
  expect(snapshot(stage)).toEqual(expected.owned)
  const retained=stack(stage).getLayerTree()
  await stage.muteLayer(path('shared'))
  expect(snapshot(stage)).toEqual(expected.muted)
  expect(tree(retained)).toEqual(expected.retained)
  await stage.unmuteLayer(path('shared'))
  expect(snapshot(stage)).toEqual(expected.unmuted)
  await stage.muteLayer(path('session'))
  expect(snapshot(stage)).toEqual(expected.noSession)
  expect(stage.getCompositionErrors()).toEqual([])
 }finally{stage.dispose()}
})
it('copies constructor inputs and exposes immutable tree structure while retaining layer handles',async()=>{
 const root=(await Layer.findOrOpen(path('root')))!
 const children=[LayerTree.new(root!,[],{offset:5,scale:2})],offset={offset:4,scale:3}
 const t=LayerTree.new(root!,children,offset)
 children.length=0;offset.offset=99
 expect(tree(t)).toEqual(expected.constructed)
 expect(t.getLayer()).toBe(root)
 expect(Object.isFrozen(t.getChildTrees())).toBe(true)
 expect(Object.isFrozen(t.getOffset())).toBe(true)
})
