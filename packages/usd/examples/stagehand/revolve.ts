// Stagehand recipe computations for OpenExec (W13 spike). Not an upstream
// port: this is our own schema, registered the way OpenUSD's execGeom
// registers UsdGeomXformable (pxr/exec/execGeom/xformable.cpp:50), so the
// same design can move to C++ and swift-usd.
//
// StagehandRevolveAPI.computePoints revolves stagehand:revolve:profile
// ((radius, height) pairs, bottom to top) around +Y in
// stagehand:revolve:segments steps. Faces wind counter-clockwise seen from
// outside (rightHanded), matching the baked spike in threads/grow/W13.

import { Type as TfType } from 'typescript-usd/tf'
import { ValueTypes as VtValueTypes } from 'typescript-usd/vt'
import { Vec2f as GfVec2f, Vec3f as GfVec3f } from 'typescript-usd/gf'
import type { VdfContext } from 'typescript-usd/vdf'
import { VdfReadIterator, Vdf_SetSizeof } from 'typescript-usd/vdf'
import {
  AttributeValue, EXEC_REGISTER_COMPUTATIONS_FOR_SCHEMA, ExecTypeRegistry,
} from 'typescript-usd/exec'

const T = VtValueTypes

export const StagehandTokens = {
  computePoints: 'computePoints',
  computeFaceVertexCounts: 'computeFaceVertexCounts',
  computeFaceVertexIndices: 'computeFaceVertexIndices',
  profile: 'stagehand:revolve:profile',
  segments: 'stagehand:revolve:segments',
} as const

/** std::vector<GfVec3f> and std::vector<int>, as upstream's exec tests register them. */
export const StdVectorGfVec3fType = TfType.define('std::vector<GfVec3f>')
export const StdVectorIntType = TfType.define('std::vector<int>')
Vdf_SetSizeof(StdVectorGfVec3fType, 24)
Vdf_SetSizeof(StdVectorIntType, 24)
ExecTypeRegistry.registerType(StdVectorGfVec3fType, [] as GfVec3f[])
ExecTypeRegistry.registerType(StdVectorIntType, [] as number[])

function readProfile(ctx: VdfContext): GfVec2f[] {
  const it = new VdfReadIterator<GfVec2f>(T.GfVec2f, ctx, StagehandTokens.profile)
  const out: GfVec2f[] = []
  for (; !it.isAtEnd(); it.increment()) out.push(it.deref())
  return out
}

function readSegments(ctx: VdfContext): number {
  return Math.max(3, ctx.getInputValue<number>(T.int, StagehandTokens.segments))
}

/** The revolved points: one ring of `segments` points per profile pair. */
export function revolvePoints(profile: readonly GfVec2f[], segments: number): GfVec3f[] {
  const points: GfVec3f[] = []
  for (const p of profile) {
    const r = p.get(0), y = p.get(1)
    for (let k = 0; k < segments; ++k) {
      const a = 2 * Math.PI * k / segments
      points.push(new GfVec3f(r * Math.cos(a), y, -r * Math.sin(a)))
    }
  }
  return points
}

/** Quads between neighbouring rings, outward facing. */
export function revolveIndices(rings: number, segments: number): number[] {
  const idx: number[] = []
  for (let j = 0; j + 1 < rings; ++j) {
    for (let k = 0; k < segments; ++k) {
      const a = j * segments + k
      const b = j * segments + (k + 1) % segments
      idx.push(a, b, b + segments, a + segments)
    }
  }
  return idx
}

/** How many times computePoints has run (tests check OpenExec's caching). */
export const computePointsRuns = { count: 0 }

// The TfType name: usdGenSchema prefixes the class with libraryPrefix (here
// the default, "Stagehand"); the schema identifier stays StagehandRevolveAPI.
EXEC_REGISTER_COMPUTATIONS_FOR_SCHEMA('StagehandStagehandRevolveAPI', (self) => {
  self.primComputation(StagehandTokens.computePoints)
    .Callback(StdVectorGfVec3fType, (ctx: VdfContext) => {
      ++computePointsRuns.count
      return revolvePoints(readProfile(ctx), readSegments(ctx))
    })
    .inputs(
      AttributeValue(T.GfVec2f, StagehandTokens.profile),
      AttributeValue(T.int, StagehandTokens.segments),
    )

  self.primComputation(StagehandTokens.computeFaceVertexCounts)
    .Callback(StdVectorIntType, (ctx: VdfContext) => {
      const rings = readProfile(ctx).length
      return new Array<number>(Math.max(0, rings - 1) * readSegments(ctx)).fill(4)
    })
    .inputs(
      AttributeValue(T.GfVec2f, StagehandTokens.profile),
      AttributeValue(T.int, StagehandTokens.segments),
    )

  self.primComputation(StagehandTokens.computeFaceVertexIndices)
    .Callback(StdVectorIntType, (ctx: VdfContext) =>
      revolveIndices(readProfile(ctx).length, readSegments(ctx)))
    .inputs(
      AttributeValue(T.GfVec2f, StagehandTokens.profile),
      AttributeValue(T.int, StagehandTokens.segments),
    )
})
