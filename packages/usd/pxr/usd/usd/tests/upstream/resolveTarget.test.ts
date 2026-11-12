// Ported from OpenUSD 26.11.1: pxr/usd/usd/testenv/testUsdResolveTarget.cpp
// Copyright 2022 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// OpenUSD v26.11.1 testUsdResolveTarget{,Py}, captured using native 26.11.1.
// Every arc/layer boundary is exercised, including expanded nodes with no specs.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { basename } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Stage, PrimCompositionQuery, AttributeQuery, ResolveTarget, EditTarget, type Attribute } from 'typescript-usd/usd'
import { Layer } from 'typescript-usd/sdf'
import { Interval } from 'typescript-usd/gf'
import { Mark as ErrorMark } from 'typescript-usd/tf'
import { readOracleFixture } from '../../../../testing/oracleFixture.ts'
import 'typescript-usd/usdGeom'
const fixture = new URL('./fixtures/resolveTarget/', import.meta.url)
interface TargetRow { arc:number; layer:string; kind:'upTo'|'strongerThan'; target:unknown }
const native = readOracleFixture(new URL('expected.json', fixture)) as {
  times:number[]; rows:(TargetRow & {attributes:Record<string,unknown>})[];
  editTargets:{arc:number;layer:string;upTo:unknown;strongerThan:unknown;values:unknown}[];
  nullQuery:unknown; clipRows:(TargetRow & {query:unknown})[]
}
const layerName = (layer: Layer | null | undefined) => !layer ? null : layer.identifier.startsWith('anon:') ? 'session' : basename(layer.identifier)
function targetSnapshot(target: ResolveTarget) {
  return {startNode:target.getStartNode()?.getPath().pathString ?? null,startLayer:layerName(target.getStartLayer()),
    stopNode:target.getStopNode()?.getPath().pathString ?? null,stopLayer:layerName(target.getStopLayer())}
}
function querySnapshot(attr: Attribute, target: ResolveTarget) {
  const q = new AttributeQuery(attr,target)
  return {default:q.get() ?? null,values:native.times.map((t:number)=>q.get(t) ?? null),
    samples:q.getTimeSamples(),interval:q.getTimeSamplesInInterval(new Interval(2,5)),
    bracket:q.getBracketingTimeSamples(2.5),numSamples:q.getNumTimeSamples(),
    hasValue:q.hasValue(),hasAuthoredValue:q.hasAuthoredValue(),hasAuthoredValueOpinion:q.hasAuthoredValueOpinion(),
    hasFallbackValue:q.hasFallbackValue(),fallbackValue:q.getFallbackValue() ?? null,varying:q.valueMightBeTimeVarying()}
}
async function open() { return (await Stage.open(fileURLToPath(new URL('root.usda',fixture))))! }

describe('UsdResolveTarget native arc/layer value resolution',()=>{
  it.each(native.rows)('resolves $kind arc $arc layer $layer within the exact boundary',async row=>{
    const stage=await open()
    try {
      const prim=stage.getPrim('/Parent/RefChild')!
      const arc=new PrimCompositionQuery(prim).getCompositionArcs()[row.arc]!
      const layer=arc.getTargetNode().getLayerStack().getLayers().find(layer=>layerName(layer as Layer)===row.layer) as Layer
      expect(layer).toBeDefined()
      const target=row.kind==='upTo'?arc.makeResolveTargetUpTo(layer):arc.makeResolveTargetStrongerThan(layer)
      expect(target.isNull()).toBe(false)
      expect(targetSnapshot(target)).toEqual(row.target)
      for(const [name,expected] of Object.entries(row.attributes)) {
        expect(querySnapshot(prim.getAttr(name)!,target),name).toEqual(expected)
      }
    } finally {stage.dispose()}
  })

  it.each(native.editTargets)('maps edit-target arc $arc to its strongest matching node',async row=>{
    const stage=await open()
    try {
      const prim=stage.getPrim('/Parent/RefChild')!,arc=new PrimCompositionQuery(prim).getCompositionArcs()[row.arc]!
      const layer=arc.getTargetNode().getLayerStack().getLayers().find(layer=>layerName(layer as Layer)===row.layer) as Layer
      const edit=new EditTarget(layer,arc.getTargetNode())
      const up=prim.makeResolveTargetUpToEditTarget(edit),strong=prim.makeResolveTargetStrongerThanEditTarget(edit)
      expect(targetSnapshot(up)).toEqual(row.upTo)
      expect(targetSnapshot(strong)).toEqual(row.strongerThan)
      expect(querySnapshot(prim.getAttr('foo')!,up)).toEqual(row.values)
    } finally {stage.dispose()}
  })

  it('treats a null resolve target as an unrestricted query',async()=>{
    const stage=await open()
    try {
      const target=new ResolveTarget()
      expect(target.isNull()).toBe(true)
      expect(target.getPrimIndex()).toBeNull()
      expect(querySnapshot(stage.get('/Parent/RefChild.bar')!,target)).toEqual(native.nullQuery)
      expect(stage.getPrim('/Parent/RefChild')!.makeResolveTargetUpToEditTarget(new EditTarget()).isNull()).toBe(true)
    } finally {stage.dispose()}
  })

  it('diagnoses a target for another prim without resolving that attribute unrestricted',async()=>{
    const stage=await open(), mark=new ErrorMark()
    try {
      const arc=new PrimCompositionQuery(stage.getPrim('/Parent')!).getCompositionArcs()[0]!
      const query=new AttributeQuery(stage.get('/Parent/RefChild.foo')!,arc.makeResolveTargetUpTo())
      expect(mark.isClean()).toBe(false)
      expect(query.get()).toBeUndefined()
      expect(query.get(1)).toBeUndefined()
      expect(query.hasValue()).toBe(false)
    } finally {mark.clear();mark.dispose();stage.dispose()}
  })
})

it.each(native.clipRows)('keeps offset clips inside $kind arc $arc layer $layer',async row=>{
  const stage=(await Stage.open(fileURLToPath(new URL('clipRoot.usda',fixture))))!
  try {
    const prim=stage.getPrim('/World/Child')!,arc=new PrimCompositionQuery(prim).getCompositionArcs()[row.arc]!
    const layer=arc.getTargetNode().getLayerStack().getLayers().find(layer=>layerName(layer as Layer)===row.layer) as Layer
    expect(layer).toBeDefined()
    const target=row.kind==='upTo'?arc.makeResolveTargetUpTo(layer):arc.makeResolveTargetStrongerThan(layer)
    expect(targetSnapshot(target)).toEqual(row.target)
    expect(querySnapshot(prim.getAttr('value')!,target)).toEqual(row.query)
  } finally {stage.dispose()}
})
