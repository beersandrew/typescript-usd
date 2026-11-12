// Ported from OpenUSD 26.11.1: pxr/usd/usdSemantics/labelsAPI.cpp,
//  pxr/usd/usdSemantics/labelsQuery.cpp
// Copyright 2016, 2024 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// typescript-usd own check of UsdSemanticsLabelsAPI/LabelsQuery against native
// OpenUSD 26.11.1 captures (fixtures/labels, FIXTURES.md; labelsAPI.cpp, labelsQuery.cpp).
import {beforeAll,afterAll,describe,it,expect} from 'vitest'
import {fileURLToPath} from 'node:url'
import {readFileSync} from 'node:fs'
import {Stage,TimeCode,SchemaRegistry} from 'typescript-usd/usd'
import {Interval} from 'typescript-usd/gf'
import {Array as VtArray} from 'typescript-usd/vt'
import {LabelsAPI,LabelsQuery,Tokens} from 'typescript-usd/usdSemantics'
const native=JSON.parse(readFileSync(new URL('./fixtures/labels/expected.json',import.meta.url),'utf8')).payload
let stage:Stage
beforeAll(async()=>{stage=(await Stage.open(fileURLToPath(new URL('./fixtures/labels/stage.usda',import.meta.url))))!})
afterAll(()=>stage.dispose())
const times:Record<string,TimeCode|Interval>={default:TimeCode.Default(),earliest:TimeCode.EarliestTime(),at2:new TimeCode(2),closed:new Interval(1,3),open:new Interval(1,3,false,false),before:new Interval(-10,0),after:new Interval(4,10),full:Interval.getFullInterval()}

describe('native labels schema registration and taxonomy inheritance',()=>{
 for(const row of native.schemas)it(row.path,()=>{
  const prim=stage.getPrim(row.path)!
  expect(prim.getAppliedSchemas()).toEqual(row.applied)
  expect(prim.hasAPI('SemanticsLabelsAPI','style')).toBe(row.hasAPI)
  expect(LabelsAPI.get(prim,'style').isValid()).toBe(row.valid)
  expect(LabelsAPI.getDirectTaxonomies(prim)).toEqual(row.direct)
  expect(LabelsAPI.computeInheritedTaxonomies(prim)).toEqual(row.inherited)
  expect(LabelsAPI.getAll(prim).map(api=>api.getName())).toEqual(row.direct)
 })
 it('registers the native multi-apply property template and token names',()=>{
  expect(SchemaRegistry.isMultipleApplyAPISchema('SemanticsLabelsAPI')).toBe(true)
  expect(LabelsAPI.getSchemaAttributeNames()).toEqual(native.attributeNames)
  expect(LabelsAPI.getSchemaAttributeNames(true,'style')).toEqual(native.instanceAttributeNames)
  expect({semanticsLabels:Tokens.semanticsLabels,template:Tokens.semanticsLabels_MultipleApplyTemplate_,schema:Tokens.SemanticsLabelsAPI}).toEqual(native.tokens)
 })
 for(const row of native.paths)it(`native path recognition ${row.path}`,()=>expect(LabelsAPI.isSemanticsLabelsAPIPath(row.path) !== undefined).toBe(row.valid))
})

describe('native sparse schema authoring',()=>{
 for(const row of native.authoring)it(row.name,()=>{
  const authored=Stage.createNew()
  try{
   const prim=authored.definePrim('/Authoring/'+row.name)
   expect(LabelsAPI.canApply(prim,'style')).toBe(row.canApply)
   const api=LabelsAPI.apply(prim,'style')
   const attr=api.createLabelsAttr(row.default===null?undefined:row.default,row.sparse)!
   expect(api.isValid()).toBe(row.valid)
   expect(api.getName()).toBe('style')
   expect(attr.typeName).toBe(row.type)
   expect(Array.from(attr.getValue() as VtArray<string>)).toEqual(row.value)
   expect(attr.hasAuthoredValue()).toBe(row.authored)
   expect(!!authored.getRootLayer().getAttributeAtPath(prim.path+'.semantics:labels:style')).toBe(row.spec)
   expect(attr.isCustom()).toBe(row.custom)
  }finally{authored.dispose()}
 })
})

describe('native labels queries',()=>{
 for(const [timeName,time] of Object.entries(times))for(const taxonomy of ['style','category','category:detail','absent'])it(`${taxonomy} @ ${timeName}`,()=>{
  const query=new LabelsQuery(taxonomy,time)
  for(const row of native.rows.filter((r:any)=>r.time===timeName&&r.taxonomy===taxonomy)){
   const prim=stage.getPrim(row.path)!
   const direct=query.computeUniqueDirectLabels(prim),inherited=query.computeUniqueInheritedLabels(prim)
   expect(direct).toBeInstanceOf(VtArray)
   expect(Array.from(direct),row.path).toEqual(row.direct)
   expect(Array.from(inherited),row.path).toEqual(row.inherited)
   expect(query.hasDirectLabel(prim,'red'),row.path).toBe(row.hasDirect)
   expect(query.hasInheritedLabel(prim,'red'),row.path).toBe(row.hasInherited)
  }
  expect(query.getTaxonomy()).toBe(taxonomy)
 })
 it('populates every ancestor in bottom-up order as in TestAncestorPopulation',()=>{
  const query=new LabelsQuery('style',TimeCode.Default())
  for(const row of native.rows.filter((r:any)=>r.time==='default'&&r.taxonomy==='style').reverse())expect(Array.from(query.computeUniqueInheritedLabels(stage.getPrim(row.path)!))).toEqual(row.inherited)
 })
 it('retains the native per-query snapshot and refreshes in a new query',async()=>{
  const copy=(await Stage.open(fileURLToPath(new URL('./fixtures/labels/stage.usda',import.meta.url))))!
  try{
   const prim=copy.getPrim('/World/Group/Child')!,query=new LabelsQuery('category',TimeCode.Default())
   expect(Array.from(query.computeUniqueInheritedLabels(prim))).toEqual(native.cache.before)
   LabelsAPI.get(prim,'category').getLabelsAttr()!.set(['changed'])
   expect(Array.from(query.computeUniqueInheritedLabels(prim))).toEqual(native.cache.old)
   expect(Array.from(new LabelsQuery('category',TimeCode.Default()).computeUniqueInheritedLabels(prim))).toEqual(native.cache.fresh)
  }finally{copy.dispose()}
 })
 for(const row of native.invalid)it(`rejects native invalid constructor ${row.taxonomy}/${row.emptyInterval}`,()=>{
  const fn=()=>new LabelsQuery(row.taxonomy,row.emptyInterval?new Interval():TimeCode.Default())
  if(row.raised)expect(fn).toThrow();else expect(fn).not.toThrow()
 })
})
