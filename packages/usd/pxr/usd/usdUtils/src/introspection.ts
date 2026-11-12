// Ported from OpenUSD 26.11.1: pxr/usd/usdUtils/introspection.cpp,
//  pxr/usd/usdUtils/introspection.h
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/usd/usdUtils/introspection.{h,cpp} (OpenUSD 26.11.1).
//
// UsdUtilsComputeUsdStageStats: prim, model, instance, prototype and layer
// counts of a USD stage, collected into a dictionary.

import { Registry as KindRegistry, Tokens as KindTokens } from 'typescript-usd/kind'
import { ModelAPI as UsdModelAPI, PrimRange as UsdPrimRange, Stage as UsdStage, type Prim as UsdPrim } from 'typescript-usd/usd'

/** UsdUtilsUsdStageStatsKeys (introspection.h:30-56). */
export const UsdUtilsUsdStageStatsKeys = {
  approxMemoryInMb: 'approxMemoryInMb',
  totalPrimCount: 'totalPrimCount',
  modelCount: 'modelCount',
  instancedModelCount: 'instancedModelCount',
  assetCount: 'assetCount',
  prototypeCount: 'prototypeCount',
  totalInstanceCount: 'totalInstanceCount',
  usedLayerCount: 'usedLayerCount',
  primary: 'primary',
  prototypes: 'prototypes',
  primCounts: 'primCounts',
  activePrimCount: 'activePrimCount',
  inactivePrimCount: 'inactivePrimCount',
  pureOverCount: 'pureOverCount',
  instanceCount: 'instanceCount',
  primCountsByType: 'primCountsByType',
  untyped: 'untyped',
} as const

/** A VtDictionary of stats: counts and nested dictionaries of counts. */
export type UsdUtilsUsdStageStats = Record<string, unknown>

const Keys = UsdUtilsUsdStageStatsKeys

/**
 * UsdUtilsComputeUsdStageStats (introspection.h:58-107, introspection.cpp).
 *
 * With a root layer path (introspection.cpp:31-52): opens the layer on a
 * stage with all payloads loaded, adds its stats to `stats`, and resolves to
 * the stage (undefined when it cannot be opened). Upstream is synchronous;
 * opening is asynchronous here.
 *
 * With a stage (introspection.cpp:107-220): adds the stage's stats to
 * `stats` and returns the total number of prims on the stage, including
 * active, inactive, pure overs, prims inside prototypes etc.
 */
export function UsdUtilsComputeUsdStageStats(rootLayerPath: string, stats: UsdUtilsUsdStageStats): Promise<UsdStage | undefined>
export function UsdUtilsComputeUsdStageStats(stage: UsdStage, stats: UsdUtilsUsdStageStats): number
export function UsdUtilsComputeUsdStageStats(
  rootLayerPathOrStage: string | UsdStage, stats: UsdUtilsUsdStageStats,
): Promise<UsdStage | undefined> | number {
  return typeof rootLayerPathOrStage === 'string'
    ? computeUsdStageStatsFromPath(rootLayerPathOrStage, stats)
    : computeUsdStageStats(rootLayerPathOrStage, stats)
}

// introspection.cpp:31-52
async function computeUsdStageStatsFromPath(
  rootLayerPath: string, stats: UsdUtilsUsdStageStats,
): Promise<UsdStage | undefined> {
  // PLATFORM-DIVERGENCE(usdutils-stage-stats-no-malloc-tags): approxMemoryInMb
  // is reported only when TfMallocTag::IsInitialized() (introspection.cpp:35-48);
  // JavaScript exposes no allocator to tag, so the tag system is never
  // initialized and approxMemoryInMb is never reported.
  const stage = await UsdStage.open(rootLayerPath, { loadPayloads: true })
  if (!stage) return undefined
  computeUsdStageStats(stage, stats)
  return stage
}

interface Counts {
  totalPrimCount: number
  subTotalPrimCount: number
  modelCount: number
  instancedModelCount: number
  assetCount: number
  activePrimCount: number
  inactivePrimCount: number
  pureOverCount: number
  instanceCount: number
}

// _UpdateCountsHelper (introspection.cpp:54-105). The size_t* out-params
// are fields of `counts`; totalPrimCount, modelCount, instancedModelCount
// and assetCount are shared between the primary and prototype passes, as
// upstream passes the same pointers to both.
function updateCountsHelper(
  prim: UsdPrim | undefined,
  seenAssetNames: Set<string>,
  shared: Pick<Counts, 'totalPrimCount' | 'modelCount' | 'instancedModelCount' | 'assetCount'>,
  sub: Pick<Counts, 'subTotalPrimCount' | 'activePrimCount' | 'inactivePrimCount' | 'pureOverCount' | 'instanceCount'>,
  primCountsByType: Map<string, number>,
): void {
  if (!prim) return

  ++shared.totalPrimCount
  ++sub.subTotalPrimCount

  if (prim.isModel()) {
    const modelAPI = new UsdModelAPI(prim)
    // UsdModelAPI::GetKind(&kind) is true when kind is authored; an
    // unauthored kind is empty and is no component.
    const kind = modelAPI.getKind()
    // Only count if it is a component model.
    if (kind !== '' && KindRegistry.isA(kind, KindTokens.component)) {
      ++shared.modelCount
      if (prim.isInstance()) ++shared.instancedModelCount

      // UsdModelAPI::GetAssetName(&assetName) (modelAPI.cpp:168-172) is true
      // when assetInfo holds a string "name" (_GetAssetInfoByKey).
      const assetName = modelAPI.getAssetInfo()['name']
      if (typeof assetName === 'string') {
        if (!seenAssetNames.has(assetName)) {
          seenAssetNames.add(assetName)
          ++shared.assetCount
        }
      }
    }
  }

  sub.instanceCount += prim.isInstance() ? 1 : 0
  sub.activePrimCount += prim.isActive ? 1 : 0
  sub.inactivePrimCount += !prim.isActive ? 1 : 0
  sub.pureOverCount += !prim.hasDefiningSpecifier() ? 1 : 0

  const typeName = prim.typeName === '' ? Keys.untyped : prim.typeName
  primCountsByType.set(typeName, (primCountsByType.get(typeName) ?? 0) + 1)
}

const newSubCounts = () => ({
  subTotalPrimCount: 0, activePrimCount: 0, inactivePrimCount: 0, pureOverCount: 0, instanceCount: 0,
})

const primCountsDict = (sub: ReturnType<typeof newSubCounts>): UsdUtilsUsdStageStats => ({
  [Keys.totalPrimCount]: sub.subTotalPrimCount,
  [Keys.activePrimCount]: sub.activePrimCount,
  [Keys.inactivePrimCount]: sub.inactivePrimCount,
  [Keys.pureOverCount]: sub.pureOverCount,
  [Keys.instanceCount]: sub.instanceCount,
})

// UsdUtilsComputeUsdStageStats(const UsdStageWeakPtr&, VtDictionary*)
// (introspection.cpp:107-220).
function computeUsdStageStats(stage: UsdStage, stats: UsdUtilsUsdStageStats): number {
  const usedLayerCount = stage.getUsedLayers().length - (stage.hasSessionLayer() ? 1 : 0)

  stats[Keys.usedLayerCount] = usedLayerCount

  const shared = { totalPrimCount: 0, modelCount: 0, instancedModelCount: 0, assetCount: 0 }
  let prototypeCount = 0
  let totalInstanceCount = 0

  const primary = newSubCounts()
  const primCountsByType = new Map<string, number>()

  const seenAssetNames = new Set<string>()
  for (const path of stage.traverseAll()) {
    updateCountsHelper(stage.getPrim(path), seenAssetNames, shared, primary, primCountsByType)
  }
  totalInstanceCount = primary.instanceCount

  const prototypes = stage.getPrototypes()
  prototypeCount = prototypes.length
  if (prototypeCount > 0) {
    const prototypesCounts = newSubCounts()
    const prototypesPrimCountsByType = new Map<string, number>()

    for (const prototypePrim of prototypes) {
      for (const prim of UsdPrimRange.fromPrim(prototypePrim)) {
        updateCountsHelper(prim, seenAssetNames, shared, prototypesCounts, prototypesPrimCountsByType)
      }
    }

    totalInstanceCount += prototypesCounts.instanceCount

    stats[Keys.prototypes] = {
      [Keys.primCounts]: primCountsDict(prototypesCounts),
      [Keys.primCountsByType]: Object.fromEntries(prototypesPrimCountsByType),
    }
  }

  stats[Keys.totalPrimCount] = shared.totalPrimCount
  stats[Keys.modelCount] = shared.modelCount
  stats[Keys.instancedModelCount] = shared.instancedModelCount
  stats[Keys.assetCount] = shared.assetCount
  stats[Keys.prototypeCount] = prototypeCount
  stats[Keys.totalInstanceCount] = totalInstanceCount

  stats[Keys.primary] = {
    [Keys.primCounts]: primCountsDict(primary),
    [Keys.primCountsByType]: Object.fromEntries(primCountsByType),
  }

  return shared.totalPrimCount
}
