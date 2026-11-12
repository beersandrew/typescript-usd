import { expect,it } from 'vitest'
import { fileURLToPath } from 'node:url'
import { Stage } from 'typescript-usd/usd'
import { Layer } from 'typescript-usd/sdf'
import { Imageable } from 'typescript-usd/usdGeom'
import { CompositionReview } from '../src/composition-review'
import { exportStage } from '../src/stage-export'
import expected from './fixtures/export/expected.json'
import { createHttpResolverContext } from '../src/http-resolver'
import { createLocalFileContext } from '../src/local-file-resolver'
import overridesExpected from './fixtures/overrides/expected.json'

function plain(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(plain)
  if (value && typeof value === 'object' && Symbol.iterator in value) return Array.from(value as Iterable<unknown>, plain)
  if (value && typeof value === 'object' && 'data' in value && Array.isArray(value.data)) return plain(value.data)
  return value
}
function snapshot(stage: Stage) {
  const p=stage.getPrim('/World/Mesh')!,a=p.getAttr('xformOp:translate')!
  const sets=stage.getVariantSets(p.path)
  return {prims:[...stage.traverse()],variant:sets.getVariantSet('look').getVariantSelection(),variants:sets.getNames(),
    color:plain(p.getAttr('primvars:displayColor')!.getValue()),visibility:Imageable.computeVisibility(stage,p.path),
    timeSamples:a.getTimeSampleKeys(),sampleValues:[0,24].map(t=>plain(a.getValueAtTime(t))),start:stage.startTimeCode,end:stage.endTimeCode,
    upAxis:stage.getMetadata('upAxis'),metersPerUnit:stage.getMetadata('metersPerUnit'),compositionErrors:stage.getCompositionErrors().map(String)}
}
it('exports session and composed stage with native26.11 roundtrip values while preserving source and state',async()=>{
 const stage=(await Stage.open(fileURLToPath(new URL('./fixtures/export/source.usda',import.meta.url))))!
 const review=new CompositionReview(stage,()=>undefined),source=stage.getRootLayer().exportToString(),target=stage.getEditTarget()
 try {
  await review.apply({kind:'variant',path:expected.edit.path,set:expected.edit.variantSet,selection:expected.edit.selection},async()=>{})
  await review.apply({kind:'visibility',path:expected.edit.path,action:'hide'},async()=>{})
  expect(snapshot(stage)).toEqual(expected.live)
  const sessionBefore=stage.getSessionLayer().exportToString(),session=exportStage(stage,'session'),flat=exportStage(stage,'flattened')
  expect(session.fileName).toBe('source_session.usda');expect(flat.fileName).toBe('source_flattened.usda')
  const sessionLayer=Layer.createAnonymous('session.usda');expect(sessionLayer.importFromString(session.text)).toBe(true)
  const withSession=await Stage.open(stage.getRootLayer(),{sessionLayerPath:sessionLayer.identifier})
  const flattened=await Stage.open(Layer.createInMemory('exported.usda',flat.text))
  try {expect(snapshot(withSession)).toEqual(expected.sessionReopened);expect(snapshot(flattened)).toEqual(expected.flattened)}
  finally {withSession.dispose();flattened.dispose()}
  expect(stage.getRootLayer().exportToString()).toBe(source)
  expect(stage.getSessionLayer().exportToString()).toBe(sessionBefore)
  expect(stage.getEditTarget()).toBe(target)
  expect(snapshot(stage)).toEqual(expected.live)
 } finally {stage.dispose()}
})
it('rejects ephemeral mounted dependencies without confusing source comments with asset paths',async()=>{
 const stage=await Stage.open(Layer.createInMemory('local.usda','#usda 1.0\ndef Xform "World" {}'))
 try {
  stage.setEditTarget(stage.getSessionLayer())
  const input=stage.getPrim('/World')!.createAttribute('asset','asset')
  input.set('https://local-file.invalid/selected/texture.png');await stage.flushChanges()
  for(const kind of ['session','flattened'] as const)expect(()=>exportStage(stage,kind)).toThrow('dependencies from the selected local files')
  input.set('usdview-load:42:https://assets.example/texture.png');await stage.flushChanges()
  for(const kind of ['session','flattened','overrides'] as const)expect(()=>exportStage(stage,kind)).toThrow('temporary resolver addresses')
  input.set('https://assets.example/texture.png');await stage.flushChanges()
  expect(exportStage(stage,'flattened').warnings.join(' ')).toContain('not bundled')
  stage.getSessionLayer().setField('/','documentation','Loaded from https://local-file.invalid/example.usda')
  expect(exportStage(stage,'session').text).toContain('local-file.invalid')
 } finally {stage.dispose()}
})

it('saves native26.11 override wrapper with original-root sublayer, metadata and review range', async()=>{
 const stage=(await Stage.open(fileURLToPath(new URL('./fixtures/export/source.usda',import.meta.url))))!
 const review=new CompositionReview(stage,()=>undefined)
 try {
  await review.apply({kind:'variant',path:expected.edit.path,set:expected.edit.variantSet,selection:'blue'},async()=>{})
  await review.apply({kind:'visibility',path:expected.edit.path,action:'hide'},async()=>{})
  const rootBefore=stage.getRootLayer().exportToString(),sessionBefore=stage.getSessionLayer().exportToString()
  const result=exportStage(stage,'overrides',{start:3,end:18})
  const layer=Layer.createAnonymous('downloaded.usda');layer.importFromString(result.text)
  expect(layer.getSubLayerPaths()).toEqual([stage.getRootLayer().realPath])
  const reopened=await Stage.open(layer)
  try {
   const actual=snapshot(reopened)
   expect({...actual,start:0,end:24}).toEqual(expected.live)
   expect(actual.start).toBe(overridesExpected.start);expect(actual.end).toBe(overridesExpected.end)
   expect(reopened.getMetadata('defaultPrim')).toBe(overridesExpected.defaultPrim)
  } finally {reopened.dispose()}
  expect(result.fileName).toBe('source_overrides.usda')
  expect(stage.getRootLayer().exportToString()).toBe(rootBefore)
  expect(stage.getSessionLayer().exportToString()).toBe(sessionBefore)
 } finally {stage.dispose()}
})
it('exports anonymous root rather than its session and rejects nonportable local root wrappers',async()=>{
 const root=Layer.createAnonymous('root.usda');root.importFromString('#usda 1.0\ndef Xform "Root" {}')
 const stage=await Stage.open(root)
 try {
  stage.setEditTarget(stage.getSessionLayer());stage.definePrim('/SessionOnly','Xform');await stage.flushChanges()
  const result=exportStage(stage,'overrides'),copy=Layer.createAnonymous('copy.usda');copy.importFromString(result.text)
  const reopened=await Stage.open(copy)
  try {expect([...reopened.traverse()]).toEqual(overridesExpected.anonymousPaths)} finally {reopened.dispose()}
 } finally {stage.dispose()}
 const local=await Stage.open(Layer.createInMemory('https://local-file.invalid/selected/root.usda','#usda 1.0\ndef Xform "Root" {}'))
 try {expect(()=>exportStage(local,'overrides')).toThrow('dependencies from the selected local files')}
 finally {local.dispose()}
})
it('matches native metadata copying without duplicating original root sublayers',async()=>{
 const rootPath=fileURLToPath(new URL('./fixtures/usd-workflow/native-audit/fixtures/root.usda',import.meta.url))
 const stage=(await Stage.open(rootPath))!
 try {
  const review=new CompositionReview(stage,()=>undefined)
  await review.apply({kind:'variant',path:'/World/Shape',set:'shape',selection:'large'},async()=>{})
  await review.apply({kind:'visibility',path:'/World/Shape',action:'hide'},async()=>{})
  const actual=Layer.createAnonymous('wrapper.usda');actual.importFromString(exportStage(stage,'overrides').text)
  const oracle=(await Layer.findOrOpen(fileURLToPath(new URL('./fixtures/usd-workflow/native-audit/fixtures/overrides.usda',import.meta.url))))!
  // usdview saved the absolute root path of the checkout it was captured in
 // (recorded in the fixture as the placeholder <checkout>/); rebase it onto this checkout.
 const capturedCheckout='<checkout>/',checkout=fileURLToPath(new URL('../',import.meta.url))
 expect(actual.getSubLayerPaths()).toEqual(oracle.getSubLayerPaths().map(path=>path.startsWith(capturedCheckout)?checkout+path.slice(capturedCheckout.length):path))
  for(const key of ['customLayerData','defaultPrim','startTimeCode','endTimeCode','framesPerSecond','timeCodesPerSecond','metersPerUnit','upAxis'])expect(actual.getField('/',key)).toEqual(oracle.getField('/',key))
  expect(actual.getSpecPaths().sort()).toEqual(oracle.getSpecPaths().sort())
 } finally {stage.dispose()}
})

it('exports a public HTTP root address and reopens through a fresh host context',async()=>{
 const url='https://assets.example/scenes/root.usda',download='https://downloads.example/overrides.usda'
 const source='#usda 1.0\n(defaultPrim = "World")\ndef Xform "World" {}'
 let exported=''
 const fetcher:typeof fetch=async input=>new Response(String(input)===url?source:exported)
 const stage=(await Stage.open(url,{resolverContext:createHttpResolverContext(url,undefined,fetcher)}))!
 try {
  expect(stage.getRootLayer().realPath).not.toBe(url)
  stage.setEditTarget(stage.getSessionLayer());stage.getPrim('/World')!.createAttribute('visibility','token').set('invisible');await stage.flushChanges()
  exported=exportStage(stage,'overrides').text
  const layer=Layer.createAnonymous('check.usda');layer.importFromString(exported)
  expect(layer.getSubLayerPaths()).toEqual([url]);expect(exported).not.toContain('usdview-load:')
  const reopened=(await Stage.open(download,{resolverContext:createHttpResolverContext(download,undefined,fetcher)}))!
  try {expect(Imageable.computeVisibility(reopened,'/World')).toBe('invisible');expect(reopened.getCompositionErrors()).toEqual([])} finally {reopened.dispose()}
 } finally {stage.dispose()}
})
it('rejects a real browser local-file context root even when its resolved identity is encoded',async()=>{
 const mount=await createLocalFileContext(new File(['#usda 1.0\ndef Xform "World" {}'],'root.usda'))
 const stage=(await Stage.open(mount.url,{resolverContext:mount.context}))!
 try {
  expect(stage.getRootLayer().realPath).not.toBe(mount.url)
  expect(()=>exportStage(stage,'overrides')).toThrow('dependencies from the selected local files')
 } finally {stage.dispose()}
})
