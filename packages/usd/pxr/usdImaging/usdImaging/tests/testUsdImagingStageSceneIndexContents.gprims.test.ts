// Ported from OpenUSD 26.11.1:
//  pxr/usdImaging/usdImaging/testenv/testUsdImagingStageSceneIndexContents.cpp
// Copyright 2024 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Gprim and camera adapter data sources (meshAdapter, cubeAdapter,
// sphereAdapter, cylinderAdapter, coneAdapter, capsuleAdapter, planeAdapter,
// basisCurvesAdapter, nurbsCurvesAdapter, nurbsPatchAdapter, tetMeshAdapter,
// pointsAdapter, geomSubsetAdapter, cameraAdapter and
// their dataSource*.cpp) checked against the output of the OpenUSD 26.11.1
// reference build's testUsdImagingStageSceneIndexContents
// (pxr/usdImaging/usdImaging/testenv/testUsdImagingStageSceneIndexContents.cpp)
// for the scenes in fixtures/gprims (FIXTURES.md).
//
// The adapters are constructed directly (no UsdImagingAdapterRegistry). The
// expected HdDebugPrintDataSource text is parsed into a tree, and each prim's
// data source is walked into the same shape, values formatted as VtValue's
// stream output does. Values are compared token by token, numbers with a
// float tolerance (C++ prints float/double with 6 or more significant
// digits). The comparison is restricted to
// the data source entries these adapters own: the prim type, the gprim/camera
// schema container (mesh, cube, ..., camera, geomSubset) and the primvars the
// gprim data sources map from non-"primvars:" attributes (points, normals,
// widths, velocities, accelerations). Everything else comes from
// UsdImagingDataSourcePrim.
import { readdirSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  ContainerDataSource as HdContainerDataSource,
  SampledDataSource as HdSampledDataSource,
  type DataSourceBase as HdDataSourceBase,
  type DataSourceLocator as HdDataSourceLocator,
} from 'typescript-usd/hd'
import {
  PrimAllPrimsPredicate as UsdPrimAllPrimsPredicate,
  PrimRange as UsdPrimRange,
  Stage as UsdStage,
  TimeCode as UsdTimeCode,
} from 'typescript-usd/usd'
import { Array as VtArray, Value as VtValue } from 'typescript-usd/vt'
import { UsdImagingDataSourceStageGlobals } from '../src/dataSourceStageGlobals.ts'
import type { UsdImagingPrimAdapter } from '../src/primAdapter.ts'
import { UsdImagingBasisCurvesAdapter } from '../src/basisCurvesAdapter.ts'
import { UsdImagingCameraAdapter } from '../src/cameraAdapter.ts'
import { UsdImagingCapsuleAdapter } from '../src/capsuleAdapter.ts'
import { UsdImagingConeAdapter } from '../src/coneAdapter.ts'
import { UsdImagingCubeAdapter } from '../src/cubeAdapter.ts'
import { UsdImagingCylinderAdapter } from '../src/cylinderAdapter.ts'
import { UsdImagingGeomSubsetAdapter } from '../src/geomSubsetAdapter.ts'
import { UsdImagingMeshAdapter } from '../src/meshAdapter.ts'
import { UsdImagingNurbsCurvesAdapter } from '../src/nurbsCurvesAdapter.ts'
import { UsdImagingNurbsPatchAdapter } from '../src/nurbsPatchAdapter.ts'
import { UsdImagingPlaneAdapter } from '../src/planeAdapter.ts'
import { UsdImagingPointsAdapter } from '../src/pointsAdapter.ts'
import { UsdImagingSphereAdapter } from '../src/sphereAdapter.ts'
import { UsdImagingTetMeshAdapter } from '../src/tetMeshAdapter.ts'

const fixtures = new URL('./fixtures/gprims/', import.meta.url)

// The plugInfo.json primTypeName entries (Cylinder and Capsule with
// includeSchemaFamily, which adds Cylinder_1 and Capsule_1).
const cylinder = new UsdImagingCylinderAdapter()
const capsule = new UsdImagingCapsuleAdapter()
const adapters: Record<string, UsdImagingPrimAdapter> = {
  Mesh: new UsdImagingMeshAdapter(),
  Cube: new UsdImagingCubeAdapter(),
  Sphere: new UsdImagingSphereAdapter(),
  Cylinder: cylinder,
  Cylinder_1: cylinder,
  Cone: new UsdImagingConeAdapter(),
  Capsule: capsule,
  Capsule_1: capsule,
  Plane: new UsdImagingPlaneAdapter(),
  BasisCurves: new UsdImagingBasisCurvesAdapter(),
  NurbsCurves: new UsdImagingNurbsCurvesAdapter(),
  NurbsPatch: new UsdImagingNurbsPatchAdapter(),
  TetMesh: new UsdImagingTetMeshAdapter(),
  Points: new UsdImagingPointsAdapter(),
  GeomSubset: new UsdImagingGeomSubsetAdapter(),
  Camera: new UsdImagingCameraAdapter(),
}

class _StageGlobals extends UsdImagingDataSourceStageGlobals {
  readonly timeVarying: [string, string][] = []
  getTime(): UsdTimeCode { return UsdTimeCode.EarliestTime() }
  flagAsTimeVarying(hydraPath: string, locator: HdDataSourceLocator): void {
    this.timeVarying.push([hydraPath, locator.toString()])
  }
  flagAsAssetPathDependent(_usdPath: string): void {}
}

interface Tree { [key: string]: Tree | string }

const _depth = (line: string | undefined): number =>
  line === undefined || line.startsWith('<') ? -1 : /^\t*/.exec(line)![0].length

/** Parses HdDebugPrintDataSource output (tab-indented "[name]" lines; a
 *  sampled value is one line one level deeper; an empty container has no
 *  lines below its name) into nested objects. */
function parseDebugPrint(lines: string[], level: number, i: { n: number }): Tree {
  const tree: Tree = {}
  while (i.n < lines.length && _depth(lines[i.n]) === level) {
    const name = /^\[(.*)\]$/.exec(lines[i.n]!.slice(level))![1]!
    i.n++
    if (_depth(lines[i.n]) !== level + 1) {
      tree[name] = {}
    } else if (_depth(lines[i.n + 1]) > level + 1) {
      tree[name] = parseDebugPrint(lines, level + 1, i)
    } else {
      tree[name] = lines[i.n]!.slice(level + 1)
      i.n++
    }
  }
  return tree
}

/** "<path> type = t" blocks of the stage scene index contents output. */
function parseContents(text: string): Map<string, { type: string, ds: Tree }> {
  const lines = text.split('\n')
  const prims = new Map<string, { type: string, ds: Tree }>()
  const i = { n: 0 }
  while (i.n < lines.length) {
    const m = /^<(.*)> type = (.*)$/.exec(lines[i.n]!)
    i.n++
    if (!m) continue
    prims.set(m[1]!, { type: m[2]!, ds: parseDebugPrint(lines, 1, i) })
  }
  return prims
}

/** VtValue stream output of a held value (bool as 0/1, GfVec as "(x, y)",
 *  VtArray as "[a, b]"). */
function formatValue(value: unknown): string {
  if (value instanceof VtValue) return value.IsEmpty() ? '' : formatValue(value.UncheckedGet())
  if (value instanceof VtArray) return `[${value.toArray().map(formatValue).join(', ')}]`
  if (Array.isArray(value)) return `(${value.map(formatValue).join(', ')})`
  if (typeof value === 'boolean') return value ? '1' : '0'
  if (value && typeof value === 'object' && 'data' in value && 'dimension' in value) {
    return `(${(value as { data: readonly number[] }).data.map(formatValue).join(', ')})`
  }
  return String(value)
}

/** The data source as the tree HdDebugPrintDataSource prints. */
function walk(ds: HdDataSourceBase | undefined): Tree | string {
  if (ds instanceof HdContainerDataSource) {
    const tree: Tree = {}
    for (const name of ds.getNames()) {
      const child = ds.Get(name)
      if (child) tree[name] = walk(child)
    }
    return tree
  }
  if (ds instanceof HdSampledDataSource) return formatValue(ds.GetValue(0))
  return ds ? 'UNKNOWN' : 'NULL'
}

const _number = /-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?|-?inf|nan/g
/** Compares printed values: identical text after replacing numbers, and
 *  numbers equal to a float tolerance. */
function sameValue(actual: string, expected: string): boolean {
  if (actual.replace(_number, '#') !== expected.replace(_number, '#')) return false
  const a = actual.match(_number) ?? [], e = expected.match(_number) ?? []
  return a.every((x, k) => {
    const y = e[k]!, nx = Number(x), ny = Number(y)
    if (Number.isNaN(nx) || Number.isNaN(ny)) return x === y
    return Math.abs(nx - ny) <= 1e-6 * Math.max(1, Math.abs(ny))
  })
}

/** Replaces the actual leaves that match the expected ones (see sameValue)
 *  by the expected text, so toEqual reports only real differences. */
function align(actual: Tree | string, expected: Tree | string): Tree | string {
  if (typeof actual === 'string' || typeof expected === 'string') {
    return typeof actual === 'string' && typeof expected === 'string' &&
      sameValue(actual, expected) ? expected : actual
  }
  const result: Tree = {}
  for (const [k, v] of Object.entries(actual)) {
    result[k] = k in expected ? align(v, expected[k]!) : v
  }
  return result
}

const ownedSchemaNames = ['mesh', 'cube', 'sphere', 'cylinder', 'cone', 'capsule', 'plane',
  'basisCurves', 'nurbsCurves', 'nurbsPatch', 'tetMesh', 'points', 'geomSubset', 'camera']
const customPrimvarNames = ['points', 'normals', 'widths', 'velocities', 'accelerations',
  'pointWeights']

// The Hydra prim types of the adapters above; prims of other types in the
// scenes (the upstream testenv scenes also hold lights) are not checked.
const ownedPrimTypes = new Set(['mesh', 'cube', 'sphere', 'cylinder', 'cone', 'capsule',
  'plane', 'basisCurves', 'nurbsCurves', 'nurbsPatch', 'tetMesh', 'points', 'geomSubset',
  'camera'])

/** The owned part of a prim's printed data source (see the header). */
function owned(ds: Tree): Tree {
  const result: Tree = {}
  for (const name of ownedSchemaNames) {
    if (name in ds) result[name] = ds[name]!
  }
  const primvars = ds['primvars']
  if (primvars && typeof primvars !== 'string') {
    const pv: Tree = {}
    for (const name of customPrimvarNames) {
      if (name in primvars) pv[name] = primvars[name]!
    }
    if (Object.keys(pv).length) result['primvars'] = pv
  }
  return result
}

async function run(usdaPath: string): Promise<Map<string, { type: string, ds: Tree }>> {
  const stage = await UsdStage.open(usdaPath)
  if (!stage) throw new Error(`cannot open ${usdaPath}`)
  const stageGlobals = new _StageGlobals()
  const prims = new Map<string, { type: string, ds: Tree }>()
  for (const prim of UsdPrimRange.stage(stage, UsdPrimAllPrimsPredicate)) {
    const adapter = adapters[prim.typeName]
    if (!adapter) continue
    for (const subprim of adapter.getImagingSubprims(prim)) {
      const path = subprim === '' ? prim.path : `${prim.path}.${subprim}`
      prims.set(path, {
        type: adapter.getImagingSubprimType(prim, subprim),
        ds: walk(adapter.getImagingSubprimData(prim, subprim, stageGlobals)) as Tree,
      })
    }
  }
  return prims
}

describe('testUsdImagingStageSceneIndexContents (gprim and camera adapters)', () => {
  for (const file of readdirSync(fixtures).filter(f => f.endsWith('.usda')).sort()) {
    const name = file.replace(/\.usda$/, '')
    const expected = parseContents(readFileSync(new URL(`${name}.contents.txt`, fixtures), 'utf8'))
    describe(file, async () => {
      const actual = await run(new URL(file, fixtures).pathname)
      for (const [path, prim] of expected) {
        if (!ownedPrimTypes.has(prim.type)) continue
        it(`${path} (${prim.type})`, () => {
          const a = actual.get(path)
          expect(a?.type).toBe(prim.type)
          const expectedOwned = owned(prim.ds)
          expect(align(owned(a!.ds), expectedOwned)).toEqual(expectedOwned)
        })
      }
    })
  }
})
