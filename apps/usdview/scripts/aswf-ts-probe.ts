// Inventory the installed packed library using the viewer's HTTP resolver seam.
// This does not initialize a GPU or imply that an accepted scene renders correctly.
import { readFile } from 'node:fs/promises'
import { resolve, sep } from 'node:path'
import { Stage } from 'typescript-usd/usd'
import 'typescript-usd/usdGeom'
import 'typescript-usd/usdMtlx'
import { createHttpResolverContext } from '../src/http-resolver'
import { stormCoverageWarnings } from '../src/storm-coverage'
import { defaultDisplaySettings } from '../src/display-settings'

const renderableGeometry = new Set(['Mesh', 'Cube', 'Sphere', 'Cylinder', 'Cone', 'Capsule', 'Plane', 'Points', 'BasisCurves'])

const [repository, relative] = process.argv.slice(2) as [string, string]
const root = resolve(repository), origin = 'https://aswf-assessment.invalid/'
const requested: string[] = [], missing: string[] = []
const fetchAsset: typeof fetch = async input => {
  const url = new URL(String(input))
  const path = resolve(root, decodeURIComponent(url.pathname.slice(1)))
  if (url.origin !== new URL(origin).origin || !path.startsWith(root + sep)) throw new Error(`Asset outside pinned repository: ${url.href}`)
  requested.push(url.pathname.slice(1))
  try { return new Response(await readFile(path)) }
  catch { missing.push(url.pathname.slice(1)); return new Response('', { status: 404 }) }
}
const count = (map: Record<string, number>, key: string) => { map[key] = (map[key] ?? 0) + 1 }
const started = performance.now()
let stage: Stage | undefined
const result: Record<string, unknown> = { status: 'error', compositionDiagnostics: 'Public Stage.getCompositionErrors plus caught errors and stderr.' }
try {
  const url = new URL(relative, origin).href
  stage = await Stage.open(url, { resolverContext: createHttpResolverContext(url, undefined, fetchAsset) })
  result.status = 'opened'
  const types: Record<string, number> = {}, schemes: Record<string, number> = {}, shaders: Record<string, number> = {}, primvars: Record<string, number> = {}
  const variants: unknown[] = [], assets: unknown[] = [], unsupported: string[] = []
  let animated = 0, primCount = 0
  for (const path of stage.traverse()) {
    const prim = stage.getPrim(path)!
    primCount++; count(types, prim.typeName || '(untyped)')
    if (prim.typeName === 'Mesh') {
      const scheme = String(prim.getAttr('subdivisionScheme')?.getValue())
      count(schemes, scheme)
    }
    if (prim.typeName === 'Shader') count(shaders, String(prim.getAttr('info:id')?.getValue()))
    for (const name of stage.getVariantSets(path).getNames()) {
      const vs = stage.getVariantSets(path).getVariantSet(name)
      variants.push({ path, name, selection: vs.getVariantSelection(), choices: vs.getVariantNames() })
    }
    for (const name of prim.getPropertyNames()) {
      const attr = prim.getAttr(name)
      if (!attr || attr.isRelationship) continue
      if (attr.getTimeSampleKeys().length) animated++
      if (name.startsWith('primvars:')) count(primvars, `${name}|${attr.typeName}|${attr.getMetadata('interpolation')}`)
      if (['asset','asset[]'].includes(attr.typeName ?? '')) assets.push({ property: `${path}.${name}`, value: String(attr.getValue()) })
    }
  }
  Object.assign(result, { primCount, types, subdivisionSchemes: schemes, shaderIds: shaders, primvars, animatedAttributeCount: animated,
    timeRange: [stage.startTimeCode ?? null, stage.endTimeCode ?? null], variantSets: variants, assetAttributes: assets, usedLayers: stage.getUsedLayers().map(layer => layer.identifier) })
  if (![...renderableGeometry].some(type => types[type])) unsupported.push('No supported geometry prims')
  const compositionErrors = stage.getCompositionErrors().map(error => error.toString())
  result.compositionErrors = compositionErrors
  unsupported.push(...compositionErrors.map(error => `Incomplete composition: ${error}`))
  // What the viewer's faithful Storm stack diagnoses as not drawn yet
  // (src/storm-coverage.ts), at the default display settings.
  unsupported.push(...stormCoverageWarnings(stage, defaultDisplaySettings()))
  result.capabilityCheck = { status: unsupported.length ? 'diagnosed' : 'accepted', reasons: unsupported,
    scope: 'CPU preflight only; GPU upload, texture decode and rendering not exercised' }
} catch (error) {
  result.error = error instanceof Error ? error.message : String(error)
  result.errorType = error instanceof Error ? error.name : typeof error
  if (result.status === 'opened') result.assessmentError = true
} finally { stage?.dispose() }
Object.assign(result, { requestedAssets: requested, missingAssets: missing, elapsedMs: Math.round(performance.now()-started) })
console.log('ASWF_RESULT=' + JSON.stringify(result))
