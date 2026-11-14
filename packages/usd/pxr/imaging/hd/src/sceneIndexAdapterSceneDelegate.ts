// Ported from OpenUSD 26.11.1:
//  pxr/imaging/hd/sceneIndexAdapterSceneDelegate.cpp,
//  pxr/imaging/hd/sceneIndexAdapterSceneDelegate.h, pxr/imaging/hd/material.h
// Copyright 2016, 2021 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/imaging/hd/sceneIndexAdapterSceneDelegate.{h,cpp}
// (OpenUSD 26.11.1). HdSceneIndexAdapterSceneDelegate observes the terminal
// scene index, inserts Hd{R,S,B}prims, instancers and tasks into the render
// index with itself as their scene delegate, translates dirty locators into
// dirty bits, and answers the HdSceneDelegate queries from the prim data
// sources.
//
// Deliberate divergences:
// - SdfPath ids are path strings and out-params are boxes / caller arrays, as
//   in sceneDelegate.ts. Schema handles are schema objects; C++'s
//   `if (schema)` is `schema.IsDefined()`.
// - The per-thread input prim cache (_inputPrimCache, a tbb map keyed by
//   std::thread::id, sceneIndexAdapterSceneDelegate.h:222-227) is a single
//   entry: JavaScript runs one thread. The std::atomic_* loads/stores of the
//   primvar descriptor caches are plain loads/stores for the same reason.
// - HdSampledDataSource::GetValue returns VtValue upstream; in this port
//   typed data sources return their typed value, and the pre-existing
//   usdImaging data sources return plain JavaScript values (flat number[] for
//   Vec2f/Vec3f arrays, number[16] row-major for Matrix4d). All conversion to
//   VtValue / Gf types lives in ONE place, the "Data source value conversion"
//   section of dataSource.ts (_ToVtValue / _GetTypedValue); every other
//   function follows upstream.
// - HdMaterialNetworkMap (material.ts) has no `terminals` member in this port;
//   _ToMaterialNetworkMap adds it on the returned object
//   (material.h HdMaterialNetworkMap::terminals). Node parameters and config
//   are Maps of VtValues (std::map<TfToken, VtValue> / VtDictionary upstream).
// - HdExtComputationPrimvarDescriptor (extComputationUtils.ts) stores the
//   interpolation as its token; the adapter groups descriptors by the
//   HdInterpolation enum as upstream does.

import type { HdExtComputationContextArg } from './extComputationContextInternal.ts'
import { Type as TfType, type Token as TfToken } from 'typescript-usd/tf'
import {
  Value as VtValue, Array as VtArray, Dictionary as VtDictionary,
  ValueTypes as VtValueTypes,
} from 'typescript-usd/vt'
import {
  Matrix4d as GfMatrix4d,
  Range1f as GfRange1f, Range2f as GfRange2f, Range3d as GfRange3d,
  Vec2d as GfVec2d, Vec2f as GfVec2f, Vec2i as GfVec2i,
  Vec3d as GfVec3d, Vec3i as GfVec3i,
  Vec4d as GfVec4d, Vec4f as GfVec4f,
} from 'typescript-usd/gf'
import { SubdivTags as PxOsdSubdivTags } from 'typescript-usd/pxOsd'
import { SdfPath } from 'typescript-usd/sdf/path'
import { SdfPathTable } from 'typescript-usd/sdf/pathTable'

import {
  HdContainerDataSource, HdDataSourceBase, HdSampledDataSource, HdVectorDataSource,
  _ToVtValue, _GetTypedValue, _SdfPathType, _GfRange1fType,
} from './dataSource.ts'
import { HdDataSourceLocator, HdDataSourceLocatorSet } from './dataSourceLocator.ts'
import {
  HdSceneDelegate, HdPrimvarDescriptor, HdVolumeFieldDescriptor,
  type HdIdVectorSharedPtr, type HdPrimvarDescriptorVector,
  type HdSyncRequestVector, type HdVolumeFieldDescriptorVector,
} from './sceneDelegate.ts'
import {
  HdSceneIndexNameRegistry, HdSceneIndexPrimView,
  type AddedPrimEntry, type DirtiedPrimEntry, type HdSceneIndexBase,
  type HdSceneIndexObserver, type HdSceneIndexPrim, type RemovedPrimEntry,
  type RenamedPrimEntry,
} from './sceneIndex.ts'
import type { HdRenderIndex } from './renderIndex.ts'
import { HdChangeTracker, type HdDirtyBits } from './changeTracker.ts'
import { HdDirtyBitsTranslator } from './dirtyBitsTranslator.ts'
import { HdMeshTopology } from './meshTopology.ts'
import { HdBasisCurvesTopology } from './basisCurvesTopology.ts'
import { HdCullStyle, HdDisplayStyle, HdReprSelector } from './displayStyle.ts'
import { HdInterpolation } from './enums.ts'
import { HdRenderBufferDescriptor } from './aov.ts'
import { HdMaterialNetwork, HdMaterialNetworkMap, HdMaterialNode, HdMaterialNode2, HdMaterialNode2Type } from './material.ts'
import {
  HdRenderSettingsRenderProduct, HdRenderSettingsRenderProductsType, HdRenderSettingsRenderVar,
} from './renderSettings.ts'
import { HdGeomSubsetType, type HdGeomSubset } from './geomSubset.ts'
import { HdCamera, HdCameraTokens } from './camera.ts'
import {
  HdCullStyleTokens, HdPrimTypeTokens, HdRenderSettingsPrimTokens,
  HdRenderTagTokens, HdTokens,
} from './tokens.ts'
import type { HdTupleType, HdFormat } from './types.ts'
import type {
  HdExtComputationInputDescriptor, HdExtComputationOutputDescriptor,
} from './extComputation.ts'
import type {
  HdExtComputationContext, HdExtComputationPrimvarDescriptor,
} from './extComputationUtils.ts'
import type { HdTimeSampleArray } from './timeSampleArray.ts'
import type { HdTask } from './task.ts'
import { TF_CODING_ERROR, TF_VERIFY, TF_WARN } from './tfDiagnostic.ts'
import {
  HdLegacyFlagTokens, HdLegacyPrimTypeIsVolumeField, HdSceneIndexEmulationTokens,
} from './dataSourceLegacyPrim.ts'

import { HdBasisCurvesSchema } from './basisCurvesSchema.ts'
import { HdCameraSchema, HdCameraSchemaTokens } from './cameraSchema.ts'
import { HdCapsuleSchemaTokens } from './capsuleSchema.ts'
import { HdCategoriesSchema } from './categoriesSchema.ts'
import { HdConeSchemaTokens } from './coneSchema.ts'
import { HdCoordSysBindingSchema } from './coordSysBindingSchema.ts'
import { HdCoordSysSchema, HdCoordSysSchemaTokens } from './coordSysSchema.ts'
import { HdCubeSchemaTokens } from './cubeSchema.ts'
import { HdCylinderSchemaTokens } from './cylinderSchema.ts'
import { HdDisplayFilterSchema, HdDisplayFilterSchemaTokens } from './displayFilterSchema.ts'
import { HdEnergyFilterSchema, HdEnergyFilterSchemaTokens } from './energyFilterSchema.ts'
import { HdExtComputationPrimvarSchema } from './extComputationPrimvarSchema.ts'
import { HdExtComputationPrimvarsSchema } from './extComputationPrimvarsSchema.ts'
import { HdExtComputationSchema } from './extComputationSchema.ts'
import { HdExtentSchema } from './extentSchema.ts'
import { HdGeomSubsetSchema, HdGeomSubsetSchemaTokens } from './geomSubsetSchema.ts'
import { HdImageShaderSchema, HdImageShaderSchemaTokens } from './imageShaderSchema.ts'
import { HdInstanceCategoriesSchema } from './instanceCategoriesSchema.ts'
import { HdInstancedBySchema } from './instancedBySchema.ts'
import { HdInstancerTopologySchema } from './instancerTopologySchema.ts'
import { HdIntegratorSchema, HdIntegratorSchemaTokens } from './integratorSchema.ts'
import { HdLegacyDisplayStyleSchema } from './legacyDisplayStyleSchema.ts'
import { HdLegacyTaskSchema } from './legacyTaskSchema.ts'
import { HdLightSchemaTokens } from './lightSchema.ts'
import { HdMaterialBindingsSchema } from './materialBindingsSchema.ts'
import { HdMaterialNodeParameterSchemaTokens } from './materialNodeParameterSchema.ts'
import { HdMaterialNetworkSchema } from './materialNetworkSchema.ts'
import { HdMaterialNodeSchema } from './materialNodeSchema.ts'
import { HdMaterialSchema } from './materialSchema.ts'
import { HdMeshSchema } from './meshSchema.ts'
import { HdPrimIdSchema } from './primIdSchema.ts'
import { HdPrimvarSchema, HdPrimvarSchemaTokens } from './primvarSchema.ts'
import { HdPrimvarsSchema, HdPrimvarsSchemaTokens } from './primvarsSchema.ts'
import { HdPurposeSchema } from './purposeSchema.ts'
import { HdRenderBufferSchema, HdRenderBufferSchemaTokens } from './renderBufferSchema.ts'
import { HdRenderProductSchema } from './renderProductSchema.ts'
import { HdRenderSettingsSchema } from './renderSettingsSchema.ts'
import { HdRenderVarSchema } from './renderVarSchema.ts'
import {
  HdMaterialNodeContainerSchema, HdMaterialNodeParameterContainerSchema,
  HdRenderProductVectorSchema, HdRenderVarVectorSchema, HdSampledDataSourceContainerSchema,
} from './schemaTypeDefs.ts'
import { HdSampleFilterSchema, HdSampleFilterSchemaTokens } from './sampleFilterSchema.ts'
import { HdSphereSchemaTokens } from './sphereSchema.ts'
import { HdVisibilitySchema } from './visibilitySchema.ts'
import { HdVolumeFieldBindingSchema } from './volumeFieldBindingSchema.ts'
import { HdVolumeFieldSchemaTokens } from './volumeFieldSchema.ts'
import { HdVolumeSchemaTokens } from './volumeSchema.ts'
import { HdXformSchema } from './xformSchema.ts'

// sceneIndexAdapterSceneDelegate.cpp:134-139: defined here to avoid adding a
// dependency on usdRiPxrImaging.
const _projectionPluginTokens = {
  projection: 'projection',
  resource: 'resource',
} as const

// systemMessages.h:31 HdSystemMessageTokens->dropCaches.
const _dropCachesToken = 'dropCaches'

// sceneIndexAdapterSceneDelegate.cpp:141-145: if the input prim is a
// datasource prim, we need some sensible default here... For now, we pass
// [0,0] to turn off multisampling.
const _fallbackStartTime = 0.0
const _fallbackEndTime = 0.0

// std::numeric_limits<float>::lowest() / max().
const _FLT_MAX = 3.4028234663852886e38

// ----------------------------------------------------------------------------
// Data source value conversion: _ToVtValue / _GetTypedValue live in
// dataSource.ts (the one divergence point for values).

// ----------------------------------------------------------------------------
// HdSceneIndexAdapterSceneDelegate private structs.

type _PrimvarDescriptorsArray = HdPrimvarDescriptorVector[]
type _ExtCmpPrimvarDescriptorsArray = HdExtComputationPrimvarDescriptor[][]

/** sceneIndexAdapterSceneDelegate.h:254-265 */
class _PrimCacheEntry {
  primType: TfToken = '' as TfToken
  primvarDescriptors: _PrimvarDescriptorsArray | null = null
  extCmpPrimvarDescriptors: _ExtCmpPrimvarDescriptorsArray | null = null
}

function _NewDescriptorsArray<T>(): T[][] {
  return Array.from({ length: HdInterpolation.HdInterpolationCount }, () => [] as T[])
}

function _ParentPath(path: string): string {
  return SdfPath.fromString(path).getParentPath().pathString
}

// HdDataSourceLocatorSet::operator== (dataSourceLocator.h): the same locators
// in the same order.
function _LocatorSetsEqual(a: HdDataSourceLocatorSet | undefined,
  b: HdDataSourceLocatorSet): boolean {
  if (!a) return false
  const la = [...a]
  const lb = [...b]
  if (la.length !== lb.length) return false
  for (let i = 0; i < la.length; ++i) {
    if (!la[i]!.Equals(lb[i]!)) return false
  }
  return true
}

// HdTaskSharedPtr / HdLegacyTaskFactory::Create / HdExtComputationCpuCallback
// shapes the adapter calls (legacyTaskFactory.h, extComputationCpuCallback.h).
interface _LegacyTaskFactory {
  create(delegate: HdSceneDelegate, id: string): HdTask | null | undefined
}
interface _ExtComputationCpuCallback {
  compute(context: HdExtComputationContextArg): void
}

// ----------------------------------------------------------------------------
// HdSceneIndexObserver interfaces

/** sceneIndexAdapterSceneDelegate.cpp:198-230 */
function _CreateTask(prim: HdSceneIndexPrim, delegate: HdSceneDelegate,
  indexPath: string): HdTask | null {
  const taskSchema = HdLegacyTaskSchema.getFromParent(prim.dataSource)
  const ds = taskSchema.getFactory()
  if (!ds) {
    TF_CODING_ERROR(
      `When adding task ${indexPath} in HdSceneIndexAdapterSceneDelegate: ` +
      'No factory data source in HdLegacyTaskSchema.')
    return null
  }
  const factory = _GetTypedValue<_LegacyTaskFactory | null | undefined>(ds, 0.0)
  if (!factory) {
    TF_CODING_ERROR(
      `When adding task ${indexPath} in HdSceneIndexAdapterSceneDelegate: ` +
      'No factory in HdLegacyTaskSchema.')
    return null
  }
  const task = factory.create(delegate, indexPath) ?? null
  if (!task) {
    TF_CODING_ERROR(
      `When adding task ${indexPath} in HdSceneIndexAdapterSceneDelegate: ` +
      'No task from factory in HdLegacyTaskSchema.')
  }
  return task
}

// ----------------------------------------------------------------------------

/** sceneIndexAdapterSceneDelegate.cpp:555-564 */
function _IsVisible(primSource: HdContainerDataSource | undefined): boolean {
  const visSchema = HdVisibilitySchema.getFromParent(primSource)
  if (visSchema.isDefined()) {
    const visDs = visSchema.getVisibility()
    if (visDs) {
      return _GetTypedValue<boolean>(visDs, 0.0)
    }
  }
  return true
}

/** sceneIndexAdapterSceneDelegate.cpp:566-580 */
function _GetBoundMaterialPath(ds: HdContainerDataSource | undefined,
  purpose: TfToken): string {
  const bindingsSchema = HdMaterialBindingsSchema.getFromParent(ds)
  if (bindingsSchema.isDefined()) {
    const bindingSchema = bindingsSchema.getMaterialBinding(purpose)
    if (bindingSchema.isDefined()) {
      const pathDs = bindingSchema.getPath()
      if (pathDs) {
        return _GetTypedValue<string>(pathDs, 0.0)
      }
    }
  }
  return ''
}

/** sceneIndexAdapterSceneDelegate.cpp:582-600 */
function _Union(a: readonly number[], b: readonly number[]): number[] {
  if (a.length === 0) {
    return [...b]
  }
  if (b.length === 0) {
    return [...a]
  }
  const out = [...a, ...b]
  out.sort((x, y) => x - y)
  return out.filter((v, i) => i === 0 || v !== out[i - 1])
}

/** sceneIndexAdapterSceneDelegate.cpp:602-675 */
function _GatherGeomSubsets(parentPath: string, sceneIndex: HdSceneIndexBase,
  materialBindingPurpose: TfToken,
  topology: HdMeshTopology | HdBasisCurvesTopology): void {
  TF_VERIFY(topology)
  const subsets: HdGeomSubset[] = []
  // Not all direct children are subsets, but all subsets are direct children.
  // XXX: Both UsdImagingStageSceneIndex and HdLegacyGeomSubsetSceneIndex
  // should report child prim paths in authored order.
  for (const childPath of sceneIndex.getChildPrimPaths(parentPath)) {
    const child = sceneIndex.getPrim(childPath)
    // XXX lets keep track of subsets we see instead of doing this
    if (child.primType !== HdPrimTypeTokens.geomSubset ||
      !child.dataSource) {
      continue
    }
    const schema = HdGeomSubsetSchema.getFromParent(child.dataSource)
    if (!schema.isDefined()) {
      continue
    }
    const typeDs = schema.getType()
    if (!typeDs) {
      continue
    }
    const type = _GetTypedValue<TfToken>(typeDs, 0.0)
    const indicesDs = schema.getIndices()
    const indices: number[] = indicesDs
      ? _GetTypedValue<number[]>(indicesDs, 0.0) ?? []
      : []
    if (!_IsVisible(child.dataSource)) {
      if (topology instanceof HdMeshTopology) {
        if (type === HdGeomSubsetSchemaTokens.typeFaceSet) {
          topology.setInvisibleFaces(
            _Union(topology.getInvisibleFaces(), indices))
        } else if (type === HdGeomSubsetSchemaTokens.typePointSet) {
          topology.setInvisiblePoints(
            _Union(topology.getInvisiblePoints(), indices))
        }
      } else if (topology instanceof HdBasisCurvesTopology) {
        if (type === HdGeomSubsetSchemaTokens.typeCurveSet) {
          topology.setInvisibleCurves(
            _Union(topology.getInvisibleCurves(), indices))
        } else if (type === HdGeomSubsetSchemaTokens.typePointSet) {
          topology.setInvisiblePoints(
            _Union(topology.getInvisiblePoints(), indices))
        }
      }
      continue
    }
    const materialId = _GetBoundMaterialPath(
      child.dataSource, materialBindingPurpose)
    if (materialId === '') {
      continue
    }
    subsets.push({
      // XXX: Hard-coded face type since it is the only one supported.
      type: HdGeomSubsetType.TypeFaceSet,
      id: childPath,
      materialId,
      indices,
    })
  }

  if (topology instanceof HdMeshTopology) {
    topology.setGeomSubsets(subsets)
  }
}

/** sceneIndexAdapterSceneDelegate.cpp:744-764 */
function _IsLegacyInstancer(prim: HdSceneIndexPrim): boolean {
  if (prim.primType !== HdPrimTypeTokens.instancer) {
    return false
  }

  const container =
    HdInstancerTopologySchema.getFromParent(prim.dataSource).getContainer()
  if (!container) {
    return false
  }
  const ds = container.Get(HdLegacyFlagTokens.isLegacyInstancer)
  if (!(ds instanceof HdSampledDataSource)) {
    return false
  }
  return Boolean(_GetTypedValue<boolean>(ds, 0.0))
}

// HdMaterialNodeParameterContainerSchema, HdMaterialNodeContainerSchema,
// HdSampledDataSourceContainerSchema and the other generic container /
// vector schemas (schemaTypeDefs.h) as the members the adapter reads.
/** sceneIndexAdapterSceneDelegate.cpp:1105-1148 */
function _GetHdParamsFromDataSource(
  containerSchema: HdMaterialNodeParameterContainerSchema,
): Map<TfToken, VtValue> {
  const hdParams = new Map<TfToken, VtValue>()
  if (!containerSchema.isDefined()) {
    return hdParams
  }

  const pNames = containerSchema.getNames()
  for (const pName of pNames) {
    const paramSchema = containerSchema.Get(pName)
    if (!paramSchema.isDefined()) {
      continue
    }

    // Parameter Value
    const paramValueDS = paramSchema.GetValue()
    if (paramValueDS) {
      hdParams.set(pName, _ToVtValue(paramValueDS, 0))
    }
    // ColorSpace Metadata
    const colorSpaceDS = paramSchema.getColorSpace()
    if (colorSpaceDS) {
      const cspName = SdfPath.joinIdentifier(
        HdMaterialNodeParameterSchemaTokens.colorSpace, pName) as TfToken
      const colorSpaceToken = _GetTypedValue<TfToken>(colorSpaceDS, 0)
      if (colorSpaceToken) {
        hdParams.set(cspName, VtValue.create(colorSpaceToken, VtValueTypes.token))
      }
    }
    // TypeName Metadata
    const typeNameDs = paramSchema.getTypeName()
    if (typeNameDs) {
      const typName = SdfPath.joinIdentifier(
        HdMaterialNodeParameterSchemaTokens.typeName, pName) as TfToken
      const typeNameToken = _GetTypedValue<TfToken>(typeNameDs, 0)
      if (typeNameToken) {
        hdParams.set(typName, VtValue.create(typeNameToken, VtValueTypes.token))
      }
    }
  }
  return hdParams
}

/** sceneIndexAdapterSceneDelegate.cpp:1150-1241 */
function _Walk(nodePath: string,
  nodesSchema: HdMaterialNodeContainerSchema,
  renderContexts: readonly TfToken[], visitedSet: Set<string>,
  netHd: HdMaterialNetwork): void {
  if (visitedSet.has(nodePath)) {
    return
  }

  visitedSet.add(nodePath)

  const nodePathTk = nodePath as TfToken

  const nodeSchema = nodesSchema.Get(nodePathTk)

  if (!nodeSchema.isDefined()) {
    return
  }

  let nodeId = '' as TfToken
  const idDs = nodeSchema.getNodeIdentifier()
  if (idDs) {
    nodeId = _GetTypedValue<TfToken>(idDs, 0)
  }

  // check for render-specific contexts
  if (renderContexts.length > 0) {
    const idsDs = nodeSchema.getRenderContextNodeIdentifiers()
    if (idsDs) {
      for (const name of renderContexts) {
        if (name === '' && nodeId !== '') {
          // The universal renderContext was requested, so
          // use the universal nodeId if we found one above.
          break
        }
        const ds = idsDs.Get(name)
        if (ds instanceof HdSampledDataSource) {
          const v = _GetTypedValue<TfToken>(ds, 0)
          if (v) {
            nodeId = v
            break
          }
        }
      }
    }
  }

  const vectorContainerSchema = nodeSchema.getInputConnections()
  if (vectorContainerSchema.isDefined()) {
    const connsNames = vectorContainerSchema.getNames()
    for (const connName of connsNames) {
      const vectorSchema = vectorContainerSchema.Get(connName)

      if (!vectorSchema.isDefined()) {
        continue
      }

      for (let i = 0; i < vectorSchema.getNumElements(); i++) {
        const connSchema = vectorSchema.getElement(i)
        if (!connSchema.isDefined()) {
          continue
        }

        const p = _GetTypedValue<TfToken>(connSchema.getUpstreamNodePath()!, 0)
        const n = _GetTypedValue<TfToken>(connSchema.getUpstreamNodeOutputName()!, 0)
        _Walk(p, nodesSchema, renderContexts, visitedSet, netHd)

        netHd.relationships.push({
          inputId: p,
          inputName: n,
          outputId: nodePath,
          outputName: connName,
        })
      }
    }
  }

  const n = new HdMaterialNode()
  n.identifier = nodeId
  n.path = nodePath
  n.parameters = _GetHdParamsFromDataSource(nodeSchema.getParameters())
  netHd.nodes.push(n)
}

/** sceneIndexAdapterSceneDelegate.cpp:1243-1254. Note: expects a valid data
 *  source handle. */
function _ToDictionary(schema: HdSampledDataSourceContainerSchema): VtDictionary {
  const dict = new VtDictionary()
  for (const name of schema.getNames()) {
    const valueDs = schema.Get(name)
    if (valueDs) {
      dict.set(name, _ToVtValue(valueDs, 0))
    }
  }
  return dict
}

/** HdMaterialNetworkMap with the upstream terminals member (material.h). */
export type HdSceneIndexAdapterMaterialNetworkMap = HdMaterialNetworkMap & {
  terminals: string[]
}

const _includeDisconnectedNodesToken = 'includeDisconnectedNodes'

/** sceneIndexAdapterSceneDelegate.cpp:1256-1329 */
function _ToMaterialNetworkMap(
  netSchema: HdMaterialNetworkSchema,
  renderContexts: readonly TfToken[],
): HdSceneIndexAdapterMaterialNetworkMap {
  // Some legacy render delegates may require all shading nodes
  // to be included regardless of whether they are reachable via
  // a terminal. While 100% accuracy in emulation would require that
  // behavior to be enabled by default, it is generally not desireable
  // as it leads to a lot of unnecessary data duplication across
  // terminals.
  //
  // A renderer which wants this behavior can configure its networks
  // with an "includeDisconnectedNodes" data source.
  let includeDisconnectedNodes = false
  const netContainer = netSchema.getContainer()
  if (netContainer) {
    const ds = netContainer.Get(_includeDisconnectedNodesToken)
    if (ds instanceof HdSampledDataSource) {
      includeDisconnectedNodes = Boolean(_GetTypedValue<boolean>(ds, 0.0))
    }
  }

  // Convert HdDataSource with material data to HdMaterialNetworkMap
  const matHd = Object.assign(new HdMaterialNetworkMap(), { terminals: [] as string[] })

  // List of visited nodes to facilitate network traversal
  const visitedNodes = new Set<string>()

  const nodesSchema = netSchema.getNodes()
  const terminalsSchema = netSchema.getTerminals()
  const names = terminalsSchema.getNames()

  const config = netSchema.getConfig()
  if (config.isDefined()) {
    matHd.config = new Map(_ToDictionary(config))
  }

  for (const name of names) {
    visitedNodes.clear()

    // Extract connections one by one
    const connSchema = terminalsSchema.Get(name)
    if (!connSchema.isDefined()) {
      continue
    }

    // Keep track of the terminals
    const pathTk = _GetTypedValue<TfToken>(connSchema.getUpstreamNodePath()!, 0)
    if (!pathTk) {
      // Allow setting terminals to an empty string to disable them.
      continue
    }
    const path = pathTk as string
    matHd.terminals.push(path)

    // Continue walking the network
    let netHd = matHd.map.get(name)
    if (!netHd) {
      netHd = new HdMaterialNetwork()
      matHd.map.set(name, netHd)
    }
    _Walk(path, nodesSchema, renderContexts, visitedNodes, netHd)

    // see "includeDisconnectedNodes" above
    if (includeDisconnectedNodes && nodesSchema.isDefined()) {
      for (const nodeName of nodesSchema.getNames()) {
        _Walk(nodeName, nodesSchema, renderContexts, visitedNodes, netHd)
      }
    }
  }

  return matHd
}

const _HdMaterialNetworkMapType = TfType.declare('HdMaterialNetworkMap')

/** sceneIndexAdapterSceneDelegate.cpp:1355-1365 + TfStringTokenize: the
 *  non-empty ':'-separated parts. */
function _ToTokenVector(paramName: string): TfToken[] {
  return paramName.split(':').filter(s => s.length > 0) as TfToken[]
}

/** sceneIndexAdapterSceneDelegate.cpp:1367-1381: if paramName has no ":",
 *  return empty locator. Otherwise, split about ":" to create locator. */
function _ParamNameToLocator(paramName: TfToken): HdDataSourceLocator {
  if (!paramName.includes(':')) {
    return HdDataSourceLocator.EmptyLocator
  }

  const parts = _ToTokenVector(paramName)

  return new HdDataSourceLocator(...parts)
}

function _LocatorIsEmpty(locator: HdDataSourceLocator): boolean {
  return locator.getElementCount() === 0
}

const _HdCameraProjectionType = TfType.declare('HdCamera::Projection')
const _GfVec4dVectorType = TfType.declare('std::vector<GfVec4d>')

// ----------------------------------------------------------------------------
// Render settings (sceneIndexAdapterSceneDelegate.cpp:1506-1700).

/** sceneIndexAdapterSceneDelegate.cpp:1511-1531 */
function _ToRenderVar(varSchema: HdRenderVarSchema): HdRenderSettingsRenderVar {
  const v = new HdRenderSettingsRenderVar()
  let h: HdDataSourceBase | undefined
  if ((h = varSchema.getPath())) {
    v.varPath = _GetTypedValue<string>(h, 0)
  }
  if ((h = varSchema.getDataType())) {
    v.dataType = _GetTypedValue<TfToken>(h, 0)
  }
  if ((h = varSchema.getSourceName())) {
    v.sourceName = _GetTypedValue<string>(h, 0)
  }
  if ((h = varSchema.getSourceType())) {
    v.sourceType = _GetTypedValue<TfToken>(h, 0)
  }
  const settings = varSchema.getNamespacedSettings()
  if (settings) {
    v.namespacedSettings = _ToDictionary(new HdSampledDataSourceContainerSchema(settings))
  }
  return v
}

/** sceneIndexAdapterSceneDelegate.cpp:1533-1549 */
function _ToRenderVars(
  varsSchema: HdRenderVarVectorSchema,
): HdRenderSettingsRenderVar[] {
  const numVars = varsSchema.getNumElements()

  const vars: HdRenderSettingsRenderVar[] = []

  for (let idx = 0; idx < numVars; idx++) {
    const varSchema = varsSchema.getElement(idx)
    if (varSchema.isDefined()) {
      vars.push(_ToRenderVar(varSchema))
    }
  }

  return vars
}

/** sceneIndexAdapterSceneDelegate.cpp:1551-1555 */
function _ToRange2f(v: GfVec4f): GfRange2f {
  return new GfRange2f(new GfVec2f(v.get(0), v.get(1)), new GfVec2f(v.get(2), v.get(3)))
}

/** sceneIndexAdapterSceneDelegate.cpp:1557-1602. */
function _ToRenderProduct(
  productSchema: HdRenderProductSchema,
): HdRenderSettingsRenderProduct {
  const prod = new HdRenderSettingsRenderProduct()

  let h: HdDataSourceBase | undefined
  if ((h = productSchema.getPath())) {
    prod.productPath = _GetTypedValue<string>(h, 0)
  }
  if ((h = productSchema.getType())) {
    prod.type = _GetTypedValue<TfToken>(h, 0)
  }
  if ((h = productSchema.getName())) {
    prod.name = _GetTypedValue<TfToken>(h, 0)
  }
  if ((h = productSchema.getResolution())) {
    prod.resolution = _GetTypedValue<GfVec2i>(h, 0, VtValueTypes.GfVec2i)
  }
  const renderVars = productSchema.getRenderVars()
  if (renderVars.isDefined()) {
    prod.renderVars = _ToRenderVars(renderVars)
  }
  if ((h = productSchema.getCameraPrim())) {
    prod.cameraPath = _GetTypedValue<string>(h, 0)
  }
  if ((h = productSchema.getPixelAspectRatio())) {
    prod.pixelAspectRatio = _GetTypedValue<number>(h, 0)
  }
  if ((h = productSchema.getAspectRatioConformPolicy())) {
    prod.aspectRatioConformPolicy = _GetTypedValue<TfToken>(h, 0)
  }
  if ((h = productSchema.getApertureSize())) {
    prod.apertureSize = _GetTypedValue<GfVec2f>(h, 0, VtValueTypes.GfVec2f)
  }
  if ((h = productSchema.getDataWindowNDC())) {
    prod.dataWindowNDC = _ToRange2f(_GetTypedValue<GfVec4f>(h, 0, VtValueTypes.GfVec4f))
  }
  if ((h = productSchema.getDisableMotionBlur())) {
    prod.disableMotionBlur = _GetTypedValue<boolean>(h, 0)
  }
  if ((h = productSchema.getDisableDepthOfField())) {
    prod.disableDepthOfField = _GetTypedValue<boolean>(h, 0)
  }
  const settings = productSchema.getNamespacedSettings()
  if (settings) {
    prod.namespacedSettings = _ToDictionary(new HdSampledDataSourceContainerSchema(settings))
  }
  return prod
}

/** sceneIndexAdapterSceneDelegate.cpp:1604-1620 */
function _ToRenderProducts(
  productsSchema: HdRenderProductVectorSchema,
): HdRenderSettingsRenderProduct[] {
  const numProducts = productsSchema.getNumElements()

  const products: HdRenderSettingsRenderProduct[] = []

  for (let idx = 0; idx < numProducts; idx++) {
    const productSchema = productsSchema.getElement(idx)
    if (productSchema.isDefined()) {
      products.push(_ToRenderProduct(productSchema))
    }
  }

  return products
}

/** sceneIndexAdapterSceneDelegate.cpp:1622-1700 */
function _GetRenderSettings(prim: HdSceneIndexPrim, key: TfToken): VtValue {
  const rsSchema = HdRenderSettingsSchema.getFromParent(prim.dataSource)
  if (!rsSchema.isDefined()) {
    return VtValue.getEmpty()
  }

  if (key === HdRenderSettingsPrimTokens.namespacedSettings) {
    return VtValue.createDictionary(_ToDictionary(rsSchema.getNamespacedSettings()))
  }

  if (key === HdRenderSettingsPrimTokens.active) {
    const activeDS = rsSchema.getActive()
    if (activeDS) {
      return VtValue.create(_GetTypedValue<boolean>(activeDS, 0), VtValueTypes.bool)
    }
  }

  if (key === HdRenderSettingsPrimTokens.renderProducts) {
    const products = rsSchema.getRenderProducts()
    if (products.isDefined()) {
      return VtValue.take(_ToRenderProducts(products), HdRenderSettingsRenderProductsType)
    }
  }

  if (key === HdRenderSettingsPrimTokens.includedPurposes) {
    const purposesDS = rsSchema.getIncludedPurposes()
    if (purposesDS) {
      return _ToVtValue(purposesDS, 0)
    }
  }

  if (key === HdRenderSettingsPrimTokens.materialBindingPurposes) {
    const purposesDS = rsSchema.getMaterialBindingPurposes()
    if (purposesDS) {
      return _ToVtValue(purposesDS, 0)
    }
  }

  if (key === HdRenderSettingsPrimTokens.renderingColorSpace) {
    const colorSpaceDS = rsSchema.getRenderingColorSpace()
    if (colorSpaceDS) {
      return VtValue.create(_GetTypedValue<TfToken>(colorSpaceDS, 0), VtValueTypes.token)
    }
  }

  if (key === HdRenderSettingsPrimTokens.unionedSamplingInterval) {
    const unionedSamplingIntervalDS = rsSchema.getUnionedSamplingInterval()
    if (unionedSamplingIntervalDS) {
      return VtValue.create(
        _GetTypedValue<GfVec2d>(unionedSamplingIntervalDS, 0, VtValueTypes.GfVec2d),
        VtValueTypes.GfVec2d)
    }
  }

  if (key === HdRenderSettingsPrimTokens.camera) {
    const cameraDS = rsSchema.getCamera()
    if (cameraDS) {
      return VtValue.create(_GetTypedValue<string>(cameraDS, 0), _SdfPathType)
    }
  }

  if (key === HdRenderSettingsPrimTokens.disableDepthOfField) {
    const disableDepthOfFieldDS = rsSchema.getDisableDepthOfField()
    if (disableDepthOfFieldDS) {
      return VtValue.create(_GetTypedValue<boolean>(disableDepthOfFieldDS, 0), VtValueTypes.bool)
    }
  }

  if (key === HdRenderSettingsPrimTokens.disableMotionBlur) {
    const disableMotionBlurDS = rsSchema.getDisableMotionBlur()
    if (disableMotionBlurDS) {
      return VtValue.create(_GetTypedValue<boolean>(disableMotionBlurDS, 0), VtValueTypes.bool)
    }
  }

  return VtValue.getEmpty()
}

function _MaterialNode2FromSchema(nodeSchema: HdMaterialNodeSchema): VtValue {
  const hdNode2 = new HdMaterialNode2()
  const nodeTypeDS = nodeSchema.getNodeIdentifier()
  if (nodeTypeDS) {
    hdNode2.nodeTypeId = _GetTypedValue<TfToken>(nodeTypeDS, 0)
  }

  hdNode2.parameters = _GetHdParamsFromDataSource(nodeSchema.getParameters())

  return VtValue.take(hdNode2, HdMaterialNode2Type)
}

interface _TerminalSchemaClass {
  getFromParent(parent: HdContainerDataSource | undefined): {
    isDefined(): boolean
    getResource(): HdMaterialNodeSchema
  }
}

/** sceneIndexAdapterSceneDelegate.cpp:1702-1728 */
function _GetRenderTerminalResource(TerminalSchema: _TerminalSchemaClass,
  prim: HdSceneIndexPrim): VtValue {
  // Get Render Terminal Resource as a HdMaterialNodeSchema
  const schema = TerminalSchema.getFromParent(prim.dataSource)
  if (!schema.isDefined()) {
    return VtValue.getEmpty()
  }
  const nodeSchema = schema.getResource()
  if (!nodeSchema.isDefined()) {
    return VtValue.getEmpty()
  }

  // Convert Terminal Resource with material node data to a HdMaterialNode2
  return _MaterialNode2FromSchema(nodeSchema)
}

/** sceneIndexAdapterSceneDelegate.cpp:1730-1748 */
export function Hd_InterpolationAsEnum(interpolationToken: TfToken): HdInterpolation {
  if (interpolationToken === HdPrimvarSchemaTokens.constant) {
    return HdInterpolation.HdInterpolationConstant
  } else if (interpolationToken === HdPrimvarSchemaTokens.uniform) {
    return HdInterpolation.HdInterpolationUniform
  } else if (interpolationToken === HdPrimvarSchemaTokens.varying) {
    return HdInterpolation.HdInterpolationVarying
  } else if (interpolationToken === HdPrimvarSchemaTokens.vertex) {
    return HdInterpolation.HdInterpolationVertex
  } else if (interpolationToken === HdPrimvarSchemaTokens.faceVarying) {
    return HdInterpolation.HdInterpolationFaceVarying
  } else if (interpolationToken === HdPrimvarSchemaTokens.instance) {
    return HdInterpolation.HdInterpolationInstance
  }

  return -1 as HdInterpolation
}

function _IsValidInterpolation(interpolation: HdInterpolation): boolean {
  // `desc.interpolation >= HdInterpolationCount` on the unsigned-compared
  // enum also rejects HdInterpolation(-1).
  return interpolation >= 0 && interpolation < HdInterpolation.HdInterpolationCount
}

/** sceneIndexAdapterSceneDelegate.cpp:1871-1905 */
export function HdPrimvarDescriptorFromSchema(name: TfToken,
  primvar: HdPrimvarSchema): HdPrimvarDescriptor {
  const desc = new HdPrimvarDescriptor()

  desc.name = name

  // interpolation
  const interpolationDataSource = primvar.getInterpolation()
  if (!interpolationDataSource) {
    // Using "Count" as invalid here...
    desc.interpolation = HdInterpolation.HdInterpolationCount
    return desc
  }
  const interpolationToken = _GetTypedValue<TfToken>(interpolationDataSource, 0.0)
  desc.interpolation = Hd_InterpolationAsEnum(interpolationToken)

  // role
  const roleDataSource = primvar.getRole()
  if (roleDataSource) {
    desc.role = _GetTypedValue<TfToken>(roleDataSource, 0.0)
  }

  // elementSize
  const elementSizeDs = primvar.getElementSize()
  if (elementSizeDs) {
    desc.elementSize = _GetTypedValue<number>(elementSizeDs, 0.0)
  }

  // indexed
  desc.indexed = primvar.isIndexed()

  return desc
}

/** The HdInterpolation token HdExtComputationPrimvarDescriptor stores in
 *  this port (see the header). */
const _interpolationTokens = [
  'constant', 'uniform', 'varying', 'vertex', 'faceVarying', 'instance',
]

/** sceneIndexAdapterSceneDelegate.cpp:1980-2023. Returns the descriptor and
 *  its HdInterpolation (HdInterpolationCount when invalid). */
function _ExtComputationPrimvarDescriptorFromSchema(name: TfToken,
  primvar: HdExtComputationPrimvarSchema,
): { desc: HdExtComputationPrimvarDescriptor, interpolation: HdInterpolation } {
  const desc: HdExtComputationPrimvarDescriptor = {
    name,
    sourceComputationId: '',
    sourceComputationOutputName: '',
  }

  const interpolationDataSource = primvar.getInterpolation()
  if (!interpolationDataSource) {
    // Using "Count" as invalid here...
    return { desc, interpolation: HdInterpolation.HdInterpolationCount }
  }

  const interpolationToken = _GetTypedValue<TfToken>(interpolationDataSource, 0.0)
  const interpolation = Hd_InterpolationAsEnum(interpolationToken)
  if (_IsValidInterpolation(interpolation)) {
    desc.interpolation = _interpolationTokens[interpolation]!
  }

  const roleDataSource = primvar.getRole()
  if (roleDataSource) {
    desc.role = _GetTypedValue<TfToken>(roleDataSource, 0.0)
  }

  const sourceComputationDs = primvar.getSourceComputation()
  if (sourceComputationDs) {
    desc.sourceComputationId = _GetTypedValue<string>(sourceComputationDs, 0.0)
  }

  const sourceComputationOutputDs = primvar.getSourceComputationOutputName()
  if (sourceComputationOutputDs) {
    desc.sourceComputationOutputName =
      _GetTypedValue<TfToken>(sourceComputationOutputDs, 0.0)
  }

  const valueTypeDs = primvar.GetValueType()
  if (valueTypeDs) {
    desc.valueType = _GetTypedValue<HdTupleType>(valueTypeDs, 0.0)
  }

  return { desc, interpolation }
}

/** sceneIndexAdapterSceneDelegate.cpp:1980-2023 */
export function HdExtComputationPrimvarDescriptorFromSchema(name: TfToken,
  primvar: HdExtComputationPrimvarSchema): HdExtComputationPrimvarDescriptor {
  return _ExtComputationPrimvarDescriptorFromSchema(name, primvar).desc
}

// Upstream's Sample* virtuals come in (maxSampleCount, times, values) and
// (startTime, endTime, maxSampleCount, times, values) shapes; sceneDelegate.ts
// adds the HdTimeSampleArray template shapes (sa, capacity) and
// (startTime, endTime, sa, capacity) (sceneDelegate.h:1125-1300), which call
// the virtual with the interval when one is given.
function _DispatchSample<T>(
  args: readonly unknown[],
  interval: (start: number, end: number, max: number, times: number[], values: T[]) => number,
): number | void {
  if (args.length === 3) {
    return interval(_fallbackStartTime, _fallbackEndTime, args[0] as number,
      args[1] as number[], args[2] as T[])
  }
  if (args.length === 5) {
    return interval(args[0] as number, args[1] as number, args[2] as number,
      args[3] as number[], args[4] as T[])
  }
  const withInterval = args.length === 4
  const start = withInterval ? args[0] as number : _fallbackStartTime
  const end = withInterval ? args[1] as number : _fallbackEndTime
  const sa = (withInterval ? args[2] : args[0]) as HdTimeSampleArray<T>
  const capacity = (withInterval ? args[3] : args[1]) as number
  const run = (max: number): number => {
    const times: number[] = []
    const values: T[] = []
    const n = interval(start, end, max, times, values)
    for (let i = 0; i < Math.min(n, max); ++i) {
      sa.times[i] = times[i]!
      sa.values[i] = values[i]!
    }
    return n
  }
  sa.resize(capacity)
  const authoredSamples = run(capacity)
  if (authoredSamples > capacity) {
    sa.resize(authoredSamples)
    const authoredSamplesSecondAttempt = run(authoredSamples)
    // Number of samples should be consistent through multiple invocations
    // of the sampling function.
    TF_VERIFY(authoredSamples === authoredSamplesSecondAttempt)
  }
  sa.count = authoredSamples
}

// ----------------------------------------------------------------------------

/**
 * sceneIndexAdapterSceneDelegate.h:42-304. Scene delegate answering the
 * HdSceneDelegate API from a (terminal) scene index.
 */
export class HdSceneIndexAdapterSceneDelegate extends HdSceneDelegate
  implements HdSceneIndexObserver {
  private _inputSceneIndex: HdSceneIndexBase

  // A cache of the last prim accessed (single entry; see the header).
  private _inputPrimCache: { id: string, prim: HdSceneIndexPrim } | null = null

  // SdfPathTable<_PrimCacheEntry>: inserting a path implicitly inserts its
  // ancestors with a default-constructed entry; null stands for that default
  // entry until it is written.
  private _primCache = new SdfPathTable<_PrimCacheEntry | null>(null)

  private _didAddOrRemovePrimsSinceLastSync = false
  private _sceneDelegatesBuilt = false
  private _sceneDelegates: HdSceneDelegate[] = []
  /** PLATFORM-DIVERGENCE(hd-incremental-scene-delegates): the scene
   *  delegate each added prim names (HdSceneIndexEmulationTokens
   *  sceneDelegate), kept as prims are added and removed. Upstream
   *  rebuilds the set in Sync after any add or remove by reading every
   *  cached prim (sceneIndexAdapterSceneDelegate.cpp:2981-3019, a TBB
   *  parallel loop). Done serially here, that read costs about 5 ms per
   *  sync of a scene of a few thousand prims, in every frame that adds
   *  prims (usdimaging-sliced-prims-added adds some in many frames). The
   *  set is the same. */
  private readonly _delegateOf = new Map<string, HdSceneDelegate>()

  // Hint cache of all prim paths that have been populated with
  // geomSubset children. This is purely an optimization and
  // not authoritative -- it may have false positioves, such as
  // if subsets are removed later. These hints provide a way
  // to skip the expense of _GatherGeomSubsets() when no subsets
  // have been populated.
  private _geomSubsetParents = new Set<string>()

  // Cache for rprim locator set -> dirty bits translation.
  private _cachedLocatorSet: HdDataSourceLocatorSet | undefined = undefined
  private _cachedDirtyBits: HdDirtyBits = 0
  private _cachedPrimType: TfToken = '' as TfToken

  /** sceneIndexAdapterSceneDelegate.cpp:149-177 */
  constructor(inputSceneIndex: HdSceneIndexBase, parentIndex: HdRenderIndex,
    delegateID: string) {
    super(parentIndex, delegateID)
    this._inputSceneIndex = inputSceneIndex

    // The registered name is typically used in UI tools like the HSD.
    // Make it simple to read.
    const registeredName = `[Terminal SI] ${parentIndex.getInstanceName()}`

    HdSceneIndexNameRegistry.GetInstance().registerNamedSceneIndex(
      registeredName, inputSceneIndex)

    // XXX: note that we will likely want to move this to the Has-A observer
    // pattern we're using now...
    this._inputSceneIndex.addObserver(this)

    for (const primPath of new HdSceneIndexPrimView(inputSceneIndex)) {
      this._primAdded(primPath, inputSceneIndex.getPrim(primPath).primType as TfToken)
    }
  }

  /** sceneIndexAdapterSceneDelegate.cpp:179-182 (the destructor). Also
   *  removes this observer from the input scene index, which the C++
   *  observer weak pointer does implicitly. */
  destroy(): void {
    this.getRenderIndex()._RemoveSubtree(this.getDelegateID(), this)
    this._inputSceneIndex.removeObserver(this)
  }

  /** sceneIndexAdapterSceneDelegate.cpp:184-193 */
  private _getInputPrim(id: string): HdSceneIndexPrim {
    const entry = this._inputPrimCache
    if (entry && entry.id === id) {
      return entry.prim
    }
    const prim = this._inputSceneIndex.getPrim(id)
    this._inputPrimCache = { id, prim }
    return prim
  }

  private _findPrimCacheEntry(path: string): { found: boolean, entry: _PrimCacheEntry | null } {
    const found = this._primCache.find(SdfPath.fromString(path))
    if (!found) {
      return { found: false, entry: null }
    }
    return { found: true, entry: found.value ?? null }
  }

  // The writable entry at path (materializes an implicit ancestor's default).
  private _mutablePrimCacheEntry(path: string): _PrimCacheEntry {
    const key = SdfPath.fromString(path)
    let entry = this._primCache.get(key) ?? null
    if (!entry) {
      entry = new _PrimCacheEntry()
      this._primCache.set(key, entry)
    }
    return entry
  }

  private _getMaterialRenderContexts(): TfToken[] {
    return this.getRenderIndex().getRenderDelegate().getMaterialRenderContexts() as TfToken[]
  }

  // renderDelegate.cpp:93-97 HdRenderDelegate::GetMaterialBindingPurpose
  // returns HdTokens->preview; renderDelegate.ts does not declare it yet, so
  // the default applies when a render delegate does not provide it.
  private _getMaterialBindingPurpose(): TfToken {
    const renderDelegate = this.getRenderIndex().getRenderDelegate() as unknown as {
      getMaterialBindingPurpose?: () => string
    }
    return (renderDelegate.getMaterialBindingPurpose?.() ?? HdTokens.preview) as TfToken
  }

  // ------------------------------------------------------------------------
  // HdSceneIndexObserver interfaces

  /** sceneIndexAdapterSceneDelegate.cpp:232-344 */
  private _primAdded(primPath: string, primType: TfToken): void {
    const indexPath = primPath
    const renderIndex = this.getRenderIndex()
    const { found, entry: existingEntry } = this._findPrimCacheEntry(indexPath)

    // There are 3 possible cases here:
    // (1) The prim doesn't exist yet and we add the prim.
    // (2) The prim exists, but has the wrong type; we remove the prim
    //     and re-insert with the correct type.
    // (3) The prim exists, and has the right type; in this case, we don't
    //     remove the prim but we should invalidate all of its properties.
    //     Note that we make an exception for tasks - which we handle like (2).
    let isResync = false

    if (found) {
      const existingType = existingEntry?.primType ?? ''
      if (primType !== existingType || primType === HdPrimTypeTokens.task) {
        if (renderIndex.isRprimTypeSupported(existingType)) {
          renderIndex._RemoveRprim(indexPath)
        } else if (renderIndex.isSprimTypeSupported(existingType)) {
          renderIndex._RemoveSprim(existingType, indexPath)
        } else if (renderIndex.isBprimTypeSupported(existingType)) {
          renderIndex._RemoveBprim(existingType, indexPath)
        } else if (existingType === HdPrimTypeTokens.instancer) {
          renderIndex._RemoveInstancer(indexPath)
        } else if (existingType === HdPrimTypeTokens.geomSubset) {
          renderIndex.getChangeTracker()._MarkRprimDirty(
            _ParentPath(indexPath), HdChangeTracker.DirtyTopology)
        }
      } else {
        isResync = true
      }
    }

    if (!isResync) {
      if (renderIndex.isRprimTypeSupported(primType)) {
        renderIndex._InsertRprim(primType, this, indexPath)
      } else if (renderIndex.isSprimTypeSupported(primType)) {
        renderIndex._InsertSprim(primType, this, indexPath)
      } else if (renderIndex.isBprimTypeSupported(primType)) {
        renderIndex._InsertBprim(primType, this, indexPath)
      } else if (primType === HdPrimTypeTokens.instancer) {
        renderIndex._InsertInstancer(this, indexPath)
      } else if (primType === HdPrimTypeTokens.geomSubset) {
        renderIndex.getChangeTracker()._MarkRprimDirty(
          _ParentPath(indexPath), HdChangeTracker.DirtyTopology)
      } else if (primType === HdPrimTypeTokens.task) {
        const task = _CreateTask(this._getInputPrim(indexPath), this, indexPath)
        if (task) {
          renderIndex._InsertTask(this, indexPath, task)
        }
      }
    }

    // Make sure prim type is up-to-date and clear caches (or insert).
    const entry = this._mutablePrimCacheEntry(indexPath)
    entry.primType = primType
    entry.primvarDescriptors = null
    entry.extCmpPrimvarDescriptors = null

    if (isResync) {
      // For resyncs, we need to invalidate the prim.
      // Note that since this only runs if we don't insert the prim, we
      // don't have any duplicate IsRprimTypeSupported/etc calls here.
      const allDirty = new HdDataSourceLocatorSet([HdDataSourceLocator.EmptyLocator])
      if (renderIndex.isRprimTypeSupported(primType)) {
        const allDirtyRprim =
          HdDirtyBitsTranslator.rprimLocatorSetToDirtyBits(primType, allDirty)
        renderIndex.getChangeTracker()._MarkRprimDirty(indexPath, allDirtyRprim)
      } else if (renderIndex.isSprimTypeSupported(primType)) {
        const renderContexts = this._getMaterialRenderContexts()
        const allDirtySprim =
          HdDirtyBitsTranslator.sprimLocatorSetToDirtyBits(
            primType, allDirty, renderContexts)
        renderIndex.getChangeTracker()._MarkSprimDirty(indexPath, allDirtySprim)
      } else if (renderIndex.isBprimTypeSupported(primType)) {
        const allDirtyBprim =
          HdDirtyBitsTranslator.bprimLocatorSetToDirtyBits(primType, allDirty)
        renderIndex.getChangeTracker()._MarkBprimDirty(indexPath, allDirtyBprim)
      } else if (primType === HdPrimTypeTokens.instancer) {
        const allDirtyInst =
          HdDirtyBitsTranslator.instancerLocatorSetToDirtyBits(primType, allDirty)
        renderIndex.getChangeTracker()._MarkInstancerDirty(indexPath, allDirtyInst)
      } else if (primType === HdPrimTypeTokens.geomSubset) {
        renderIndex.getChangeTracker()._MarkRprimDirty(
          _ParentPath(indexPath), HdChangeTracker.DirtyTopology)
      }
    }

    // Keep hints for prim paths that have been seen with geomSubset children.
    if (primType === HdPrimTypeTokens.geomSubset) {
      this._geomSubsetParents.add(_ParentPath(primPath))
    }
  }

  /** sceneIndexAdapterSceneDelegate.cpp:346-370 */
  primsAdded(_sender: HdSceneIndexBase, entries: readonly AddedPrimEntry[]): void {
    TF_VERIFY(!this.getRenderIndex().isSyncAllInProgress(),
      'Unsafe scene index invalidation detected during SyncAll()')

    // Drop per-thread scene index input prim cache
    this._inputPrimCache = null

    for (const entry of entries) {
      this._primAdded(entry.primPath, entry.primType as TfToken)
      // hd-incremental-scene-delegates
      const ds = this._inputSceneIndex.getPrim(entry.primPath).dataSource?.Get(HdSceneIndexEmulationTokens.sceneDelegate)
      if (ds instanceof HdSampledDataSource) this._delegateOf.set(entry.primPath, _GetTypedValue<HdSceneDelegate>(ds, 0))
      else this._delegateOf.delete(entry.primPath)
    }
    if (entries.length > 0) {
      // Clear, rather than only flagging: these are raw pointers to
      // delegates we do not own, and an entry left here can outlive the
      // delegate it points at.
      this._sceneDelegates = []
      this._sceneDelegatesBuilt = false
      this._didAddOrRemovePrimsSinceLastSync = true
    }
  }

  /** sceneIndexAdapterSceneDelegate.cpp:372-442 */
  primsRemoved(_sender: HdSceneIndexBase, entries: readonly RemovedPrimEntry[]): void {
    const renderIndex = this.getRenderIndex()
    TF_VERIFY(!renderIndex.isSyncAllInProgress(),
      'Unsafe scene index invalidation detected during SyncAll()')

    // Drop per-thread scene index input prim cache
    this._inputPrimCache = null

    for (const entry of entries) {
      // Special case Remove("/"), since this is a common shutdown operation.
      // Note: _Clear is faster than _RemoveSubtree here.
      if (entry.primPath === '/') {
        renderIndex._Clear()
        this._primCache.clearInParallel()
        this._delegateOf.clear()
        continue
      }
      // hd-incremental-scene-delegates
      for (const path of this._delegateOf.keys()) {
        if (path === entry.primPath || path.startsWith(entry.primPath + '/') || path.startsWith(entry.primPath + '.')) this._delegateOf.delete(path)
      }

      // RenderIndex::_RemoveSubtree can be expensive, so if we're
      // getting a remove message for a single prim it's better to
      // spend some time detecting that and calling the single-prim remove.
      const { found, entry: cacheEntry } = this._findPrimCacheEntry(entry.primPath)

      if (!found) {
        continue
      }

      const primType = cacheEntry?.primType ?? ''

      if (!this._primCache.hasChild(SdfPath.fromString(entry.primPath))) {
        // The next item after entry.primPath is not a child, so we can
        // single-delete...
        if (renderIndex.isRprimTypeSupported(primType)) {
          renderIndex._RemoveRprim(entry.primPath)
        } else if (renderIndex.isSprimTypeSupported(primType)) {
          renderIndex._RemoveSprim(primType, entry.primPath)
        } else if (renderIndex.isBprimTypeSupported(primType)) {
          renderIndex._RemoveBprim(primType, entry.primPath)
        } else if (primType === HdPrimTypeTokens.instancer) {
          renderIndex._RemoveInstancer(entry.primPath)
        } else if (primType === HdPrimTypeTokens.geomSubset) {
          renderIndex.getChangeTracker()._MarkRprimDirty(
            _ParentPath(entry.primPath), HdChangeTracker.DirtyTopology)
        } else if (primType === HdPrimTypeTokens.task) {
          renderIndex._RemoveTask(entry.primPath)
        }
      } else {
        // Otherwise, there's a subtree and we need to call _RemoveSubtree.
        renderIndex._RemoveSubtree(entry.primPath, this)
      }
      this._primCache.erase(SdfPath.fromString(entry.primPath))
    }

    if (entries.length > 0) {
      // Clear, rather than only flagging: these are raw pointers to
      // delegates we do not own, and an entry left here can outlive the
      // delegate it points at.
      this._sceneDelegates = []
      this._sceneDelegatesBuilt = false
      this._didAddOrRemovePrimsSinceLastSync = true
    }
  }

  /** sceneIndexAdapterSceneDelegate.cpp:444-543 */
  primsDirtied(_sender: HdSceneIndexBase, entries: readonly DirtiedPrimEntry[]): void {
    const renderIndex = this.getRenderIndex()
    TF_VERIFY(!renderIndex.isSyncAllInProgress(),
      'Unsafe scene index invalidation detected during SyncAll()')

    // Drop per-thread scene index input prim cache
    this._inputPrimCache = null

    for (const entry of entries) {
      const indexPath = entry.primPath
      const { found, entry: cacheEntry } = this._findPrimCacheEntry(indexPath)
      if (!found) {
        // no need to do anything if our prim doesn't correspond to a
        // renderIndex entry
        continue
      }

      const primType = (cacheEntry?.primType ?? '') as TfToken

      if (renderIndex.isRprimTypeSupported(primType)) {
        let dirtyBits: HdDirtyBits = 0
        if (_LocatorSetsEqual(this._cachedLocatorSet, entry.dirtyLocators) &&
          primType === this._cachedPrimType) {
          dirtyBits = this._cachedDirtyBits
        } else {
          dirtyBits = HdDirtyBitsTranslator.rprimLocatorSetToDirtyBits(
            primType, entry.dirtyLocators)
          this._cachedLocatorSet = entry.dirtyLocators
          this._cachedPrimType = primType
          this._cachedDirtyBits = dirtyBits
        }
        if (dirtyBits !== HdChangeTracker.Clean) {
          renderIndex.getChangeTracker()._MarkRprimDirty(indexPath, dirtyBits)
        }
      } else if (renderIndex.isSprimTypeSupported(primType)) {
        const renderContexts = this._getMaterialRenderContexts()
        const dirtyBits =
          HdDirtyBitsTranslator.sprimLocatorSetToDirtyBits(
            primType, entry.dirtyLocators, renderContexts)
        if (dirtyBits !== HdChangeTracker.Clean) {
          renderIndex.getChangeTracker()._MarkSprimDirty(indexPath, dirtyBits)
        }
      } else if (renderIndex.isBprimTypeSupported(primType)) {
        const dirtyBits =
          HdDirtyBitsTranslator.bprimLocatorSetToDirtyBits(
            primType, entry.dirtyLocators)
        if (dirtyBits !== HdChangeTracker.Clean) {
          renderIndex.getChangeTracker()._MarkBprimDirty(indexPath, dirtyBits)
        }
      } else if (primType === HdPrimTypeTokens.instancer) {
        const dirtyBits =
          HdDirtyBitsTranslator.instancerLocatorSetToDirtyBits(
            primType, entry.dirtyLocators)
        if (dirtyBits !== HdChangeTracker.Clean) {
          renderIndex.getChangeTracker()._MarkInstancerDirty(indexPath, dirtyBits)
        }
      } else if (primType === HdPrimTypeTokens.geomSubset) {
        renderIndex.getChangeTracker()._MarkRprimDirty(
          _ParentPath(indexPath), HdChangeTracker.DirtyTopology)
      } else if (primType === HdPrimTypeTokens.task) {
        const dirtyBits =
          HdDirtyBitsTranslator.taskLocatorSetToDirtyBits(entry.dirtyLocators)
        if (dirtyBits !== HdChangeTracker.Clean) {
          renderIndex.getChangeTracker()._MarkTaskDirty(indexPath, dirtyBits)
        }
      }

      for (const loc of entry.dirtyLocators) {
        if (loc.getFirstElement() === HdPrimvarsSchemaTokens.primvars &&
          loc.getLastElement() !== HdPrimvarSchemaTokens.primvarValue &&
          loc.getLastElement() !== HdPrimvarSchemaTokens.indexedPrimvarValue &&
          loc.getLastElement() !== HdPrimvarSchemaTokens.indices) {
          // If we've invalidated a primvar/primvars, and it's *not* just
          // a value update, clear the cached primvar descriptors.
          if (cacheEntry) {
            cacheEntry.primvarDescriptors = null
          }
          break
        }
      }

      if (entry.dirtyLocators.intersects(
        HdExtComputationPrimvarsSchema.getDefaultLocator())) {
        if (cacheEntry) {
          cacheEntry.extCmpPrimvarDescriptors = null
        }
      }
    }
  }

  /** sceneIndexAdapterSceneDelegate.cpp:545-551, via
   *  HdSceneIndexObserver::ConvertPrimsRenamedToRemovedAndAdded
   *  (sceneIndexObserver.cpp:15-77). */
  primsRenamed(sender: HdSceneIndexBase, entries: readonly RenamedPrimEntry[]): void {
    const removed: RemovedPrimEntry[] = []
    const added: AddedPrimEntry[] = []
    for (const renamedEntry of entries) {
      if (renamedEntry.oldPrimPath !== renamedEntry.newPrimPath) {
        // remove existing
        removed.push({ primPath: renamedEntry.oldPrimPath })

        // add back based on traversal on input from new path
        const workQueue: string[] = [renamedEntry.newPrimPath]
        while (workQueue.length > 0) {
          const path = workQueue.pop()!
          const p = sender.getPrim(path)
          added.push({ primPath: path, primType: p.primType })
          const childPaths = sender.getChildPrimPaths(path)
          // insert backwards as we are pulling off the end.
          for (let i = childPaths.length - 1; i >= 0; --i) {
            workQueue.push(childPaths[i]!)
          }
        }
      }
    }
    this.primsRemoved(sender, removed)
    this.primsAdded(sender, added)
  }

  // ------------------------------------------------------------------------
  // Rprim API

  /** sceneIndexAdapterSceneDelegate.cpp:677-694 */
  override getMeshTopology(id: string): HdMeshTopology {
    // HdMeshTopology(const HdMeshSchema &) (meshTopology.cpp:116-138).
    const meshTopology = new HdMeshTopology(
      HdMeshSchema.getFromParent(this._getInputPrim(id).dataSource))

    if (this._geomSubsetParents.has(id)) {
      const purpose = this._getMaterialBindingPurpose()
      _GatherGeomSubsets(id, this._inputSceneIndex, purpose, meshTopology)
    }

    return meshTopology
  }

  /** sceneIndexAdapterSceneDelegate.cpp:696-718 */
  override getDoubleSided(id: string): boolean {
    const prim = this._getInputPrim(id)

    const meshSchema = HdMeshSchema.getFromParent(prim.dataSource)
    if (meshSchema.isDefined()) {
      const doubleSidedDs = meshSchema.getDoubleSided()
      if (doubleSidedDs) {
        return _GetTypedValue<boolean>(doubleSidedDs, 0.0)
      }
    } else if (prim.primType === HdPrimTypeTokens.basisCurves) {
      // TODO: We assume all basis curves are double-sided in Hydra. This is
      //       inconsistent with the USD schema, which allows sidedness to be
      //       declared on the USD gprim. Note however that sidedness only
      //       affects basis curves with authored normals (i.e., ribbons).
      return true
    }
    return false
  }

  /** sceneIndexAdapterSceneDelegate.cpp:720-742 */
  override getExtent(id: string): GfRange3d {
    const prim = this._getInputPrim(id)

    const extentSchema = HdExtentSchema.getFromParent(prim.dataSource)
    if (!extentSchema.isDefined()) {
      return new GfRange3d()
    }

    let min = new GfVec3d(0)
    let max = new GfVec3d(0)
    const minDs = extentSchema.getMin()
    if (minDs) {
      min = _GetTypedValue<GfVec3d>(minDs, 0, VtValueTypes.GfVec3d)
    }
    const maxDs = extentSchema.getMax()
    if (maxDs) {
      max = _GetTypedValue<GfVec3d>(maxDs, 0, VtValueTypes.GfVec3d)
    }

    return new GfRange3d(min, max)
  }

  /** sceneIndexAdapterSceneDelegate.cpp:766-793 */
  override getVisible(id: string): boolean {
    const prim = this._getInputPrim(id)

    if (_IsLegacyInstancer(prim)) {
      // For usdImaging delegate.
      // When changing the visibility of a USD point instancer, the
      // delegate does not properly update the visibility of the
      // corresponding Hydra instancer. It actually invis's a point
      // instancer by deleting all the prototype prims.
      return true
    }

    const visibilitySchema = HdVisibilitySchema.getFromParent(prim.dataSource)
    if (!visibilitySchema.isDefined()) {
      return true // default visible
    }

    const visDs = visibilitySchema.getVisibility()
    if (!visDs) {
      return true
    }
    return _GetTypedValue<boolean>(visDs, 0)
  }

  /** sceneIndexAdapterSceneDelegate.cpp:795-813 */
  override getRenderTag(id: string): TfToken {
    const prim = this._getInputPrim(id)

    const purposeSchema = HdPurposeSchema.getFromParent(prim.dataSource)
    if (!purposeSchema.isDefined()) {
      return HdRenderTagTokens.geometry as TfToken // default render tag.
    }

    const purposeDs = purposeSchema.getPurpose()
    if (!purposeDs) {
      return HdRenderTagTokens.geometry as TfToken
    }
    return _GetTypedValue<TfToken>(purposeDs, 0)
  }

  /** sceneIndexAdapterSceneDelegate.cpp:815-875 */
  override getSubdivTags(id: string): PxOsdSubdivTags {
    const prim = this._getInputPrim(id)

    const tags = new PxOsdSubdivTags()

    const meshSchema = HdMeshSchema.getFromParent(prim.dataSource)
    if (!meshSchema.isDefined()) {
      return tags
    }

    const subdivTagsSchema = meshSchema.getSubdivisionTags()
    if (!subdivTagsSchema.isDefined()) {
      return tags
    }

    const fvliDs = subdivTagsSchema.getFaceVaryingLinearInterpolation()
    if (fvliDs) {
      tags.setFaceVaryingInterpolationRule(_GetTypedValue<TfToken>(fvliDs, 0.0))
    }

    const ibDs = subdivTagsSchema.getInterpolateBoundary()
    if (ibDs) {
      tags.setVertexInterpolationRule(_GetTypedValue<TfToken>(ibDs, 0.0))
    }

    const tsrDs = subdivTagsSchema.getTriangleSubdivisionRule()
    if (tsrDs) {
      tags.setTriangleSubdivision(_GetTypedValue<TfToken>(tsrDs, 0.0))
    }

    const cniDs = subdivTagsSchema.getCornerIndices()
    if (cniDs) {
      tags.setCornerIndices(_GetTypedValue<number[]>(cniDs, 0.0))
    }

    const cnsDs = subdivTagsSchema.getCornerSharpnesses()
    if (cnsDs) {
      tags.setCornerWeights(_GetTypedValue<number[]>(cnsDs, 0.0))
    }

    const criDs = subdivTagsSchema.getCreaseIndices()
    if (criDs) {
      tags.setCreaseIndices(_GetTypedValue<number[]>(criDs, 0.0))
    }

    const crlDs = subdivTagsSchema.getCreaseLengths()
    if (crlDs) {
      tags.setCreaseLengths(_GetTypedValue<number[]>(crlDs, 0.0))
    }

    const crsDs = subdivTagsSchema.getCreaseSharpnesses()
    if (crsDs) {
      tags.setCreaseWeights(_GetTypedValue<number[]>(crsDs, 0.0))
    }

    return tags
  }

  /** sceneIndexAdapterSceneDelegate.cpp:877-938 */
  override getBasisCurvesTopology(id: string): HdBasisCurvesTopology {
    const prim = this._getInputPrim(id)

    const basisCurvesSchema = HdBasisCurvesSchema.getFromParent(prim.dataSource)

    const bcTopologySchema = basisCurvesSchema.GetTopology()

    // HdBasisCurvesTopology() (basisCurvesTopology.cpp:36-46).
    const defaultTopology = (): HdBasisCurvesTopology =>
      new HdBasisCurvesTopology(HdTokens.linear, '', HdTokens.nonperiodic, [])

    if (!bcTopologySchema.isDefined()) {
      return defaultTopology()
    }

    const curveVertexCountsDataSource = bcTopologySchema.getCurveVertexCounts()

    if (!curveVertexCountsDataSource) {
      return defaultTopology()
    }

    let curveIndices: number[] = []
    const curveIndicesDataSource = bcTopologySchema.getCurveIndices()
    if (curveIndicesDataSource) {
      curveIndices = _GetTypedValue<number[]>(curveIndicesDataSource, 0.0)
    }

    let basis: string = HdTokens.bezier
    const basisDataSource = bcTopologySchema.getBasis()
    if (basisDataSource) {
      basis = _GetTypedValue<TfToken>(basisDataSource, 0.0)
    }

    let type: string = HdTokens.linear
    const typeDataSource = bcTopologySchema.getType()
    if (typeDataSource) {
      type = _GetTypedValue<TfToken>(typeDataSource, 0.0)
    }

    let wrap: string = HdTokens.nonperiodic
    const wrapDataSource = bcTopologySchema.getWrap()
    if (wrapDataSource) {
      wrap = _GetTypedValue<TfToken>(wrapDataSource, 0.0)
    }

    const result = new HdBasisCurvesTopology(
      type, basis, wrap,
      _GetTypedValue<number[]>(curveVertexCountsDataSource, 0.0),
      curveIndices)

    if (this._geomSubsetParents.has(id)) {
      const purpose = this._getMaterialBindingPurpose()
      _GatherGeomSubsets(id, this._inputSceneIndex, purpose, result)
    }

    return result
  }

  /** sceneIndexAdapterSceneDelegate.cpp:940-958 */
  override getCategories(id: string): TfToken[] {
    const prim = this._getInputPrim(id)

    const categoriesSchema = HdCategoriesSchema.getFromParent(prim.dataSource)

    if (!categoriesSchema.isDefined()) {
      return []
    }

    return categoriesSchema.getIncludedCategoryNames()
  }

  /** sceneIndexAdapterSceneDelegate.cpp:960-998 */
  override getVolumeFieldDescriptors(volumeId: string): HdVolumeFieldDescriptorVector {
    const prim = this._getInputPrim(volumeId)

    const result: HdVolumeFieldDescriptorVector = []
    const bindingSchema = HdVolumeFieldBindingSchema.getFromParent(prim.dataSource)
    if (!bindingSchema.isDefined()) {
      return result
    }

    const names = bindingSchema.getContainer()!.getNames()
    for (const name of names) {
      const pathDs = bindingSchema.getVolumeFieldBinding(name)
      if (!pathDs) {
        continue
      }

      const desc = new HdVolumeFieldDescriptor()
      desc.fieldName = name as TfToken
      desc.fieldId = _GetTypedValue<string>(pathDs, 0)

      // XXX: Kind of a hacky way to get the prim type for the old API.
      const fieldPrim = this._inputSceneIndex.getPrim(desc.fieldId)
      if (!fieldPrim.dataSource) {
        continue
      }
      desc.fieldPrimType = fieldPrim.primType as TfToken

      result.push(desc)
    }

    return result
  }

  /** sceneIndexAdapterSceneDelegate.cpp:1000-1023 */
  override getVolumeParamValue(id: string, paramName: TfToken | string): VtValue {
    const prim = this._getInputPrim(id)
    if (!prim.dataSource) {
      return VtValue.getEmpty()
    }

    const volume = prim.dataSource.Get(HdVolumeSchemaTokens.volume)
    if (volume instanceof HdContainerDataSource) {
      const valueDs = volume.Get(paramName)
      if (valueDs instanceof HdSampledDataSource) {
        return _ToVtValue(valueDs, 0)
      }
    }

    return VtValue.getEmpty()
  }

  // ------------------------------------------------------------------------
  // Material API

  /** sceneIndexAdapterSceneDelegate.cpp:1025-1043 */
  override getMaterialId(id: string): string {
    const prim = this._getInputPrim(id)

    const materialBindings = HdMaterialBindingsSchema.getFromParent(prim.dataSource)
    const purpose = this._getMaterialBindingPurpose()
    const materialBinding = materialBindings.getMaterialBinding(purpose)
    const ds = materialBinding.getPath()
    if (ds) {
      return _GetTypedValue<string>(ds, 0.0)
    }
    return ''
  }

  /** sceneIndexAdapterSceneDelegate.cpp:1045-1071 */
  override getCoordSysBindings(id: string): HdIdVectorSharedPtr {
    const prim = this._getInputPrim(id)

    const coordSys = HdCoordSysBindingSchema.getFromParent(prim.dataSource)
    if (!coordSys.isDefined()) {
      return null
    }

    const idVec: string[] = []
    const names = coordSys.getContainer()!.getNames()
    for (const name of names) {
      const pathDs = coordSys.getCoordSysBinding(name)
      if (!pathDs) {
        continue
      }

      idVec.push(_GetTypedValue<string>(pathDs, 0))
    }

    return idVec
  }

  /** sceneIndexAdapterSceneDelegate.cpp:1331-1353. The VtValue holds an
   *  HdMaterialNetworkMap (with the upstream terminals member). */
  override getMaterialResource(id: string): VtValue {
    const prim = this._getInputPrim(id)

    const matSchema = HdMaterialSchema.getFromParent(prim.dataSource)
    if (!matSchema.isDefined()) {
      return VtValue.getEmpty()
    }

    // Query for a material network to match the requested render contexts
    const renderContexts = this._getMaterialRenderContexts()
    const netSchema = matSchema.getMaterialNetwork(renderContexts)
    if (!netSchema.isDefined()) {
      return VtValue.getEmpty()
    }

    return VtValue.take(_ToMaterialNetworkMap(netSchema, renderContexts),
      _HdMaterialNetworkMapType)
  }

  // ------------------------------------------------------------------------
  // Renderbuffer API

  /** sceneIndexAdapterSceneDelegate.cpp:1073-1103. dimensions is the
   *  [x, y, z] tuple aov.ts stores (GfVec3i upstream). */
  override getRenderBufferDescriptor(id: string): HdRenderBufferDescriptor {
    const prim = this._getInputPrim(id)
    const desc = new HdRenderBufferDescriptor()

    const rb = HdRenderBufferSchema.getFromParent(prim.dataSource)
    if (!rb.isDefined()) {
      return desc
    }

    const dim = rb.getDimensions()
    if (dim) {
      const v = _GetTypedValue<GfVec3i>(dim, 0, VtValueTypes.GfVec3i)
      desc.dimensions = [v.get(0), v.get(1), v.get(2)]
    }

    const fmt = rb.GetFormat()
    if (fmt) {
      desc.format = _GetTypedValue<HdFormat>(fmt, 0)
    }

    const ms = rb.getMultiSampled()
    if (ms) {
      desc.multiSampled = _GetTypedValue<boolean>(ms, 0)
    }

    return desc
  }

  // ------------------------------------------------------------------------
  // Camera / Light API

  /** sceneIndexAdapterSceneDelegate.cpp:1383-1479 */
  override getCameraParamValue(cameraId: string, paramName: TfToken | string): VtValue {
    const prim = this._getInputPrim(cameraId)
    if (!prim.dataSource) {
      return VtValue.getEmpty()
    }

    const cameraSchema = HdCameraSchema.getFromParent(prim.dataSource)

    if (!cameraSchema.isDefined()) {
      return VtValue.getEmpty()
    }

    // If paramName has a ":", say, "foo:bar", we translate to
    // a data source locator here and check whether there is a data source
    // at HdDataSourceLocator{"camera", "foo", "bar"} for the prim in the
    // scene index.
    const locator = _ParamNameToLocator(paramName as TfToken)
    if (!_LocatorIsEmpty(locator)) {
      const nsDs = HdContainerDataSource.Get(
        cameraSchema.getNamespacedProperties().getContainer(), locator)
      if (nsDs instanceof HdSampledDataSource) {
        return _ToVtValue(nsDs, 0.0)
      }

      const ds = HdContainerDataSource.Get(cameraSchema.getContainer(), locator)
      if (ds instanceof HdSampledDataSource) {
        return _ToVtValue(ds, 0.0)
      }

      // If there was no nested data source for the data source locator
      // we constructed, fall through to query for "foo:bar".
      //
      // This covers the case where emulation is active and we have
      // another HdSceneDelegate that was added to the HdRenderIndex.
      // We want to call GetCameraParamValue on that other scene
      // delegate with the same paramName that we were given (through
      // a HdLegacyPrimSceneIndex (feeding directly or indirectly
      // into the _inputSceneIndex) and the
      // Hd_DataSourceLegacyCameraParamValue data source).
    }

    let cameraSchemaToken: string = paramName
    if (paramName === HdCameraTokens.clipPlanes) {
      cameraSchemaToken = HdCameraSchemaTokens.clippingPlanes
    }

    const valueDs = cameraSchema.getContainer()!.Get(cameraSchemaToken)
    if (!(valueDs instanceof HdSampledDataSource)) {
      return VtValue.getEmpty()
    }

    const value = _ToVtValue(valueDs, 0)
    // Smooth out some incompatibilities between scene delegate and
    // datasource schemas...
    if (paramName === HdCameraSchemaTokens.projection) {
      let proj: string = HdCameraSchemaTokens.perspective
      if (value.IsHolding(VtValueTypes.token)) {
        proj = value.UncheckedGet<TfToken>()
      }
      return VtValue.create(proj === HdCameraSchemaTokens.perspective
        ? HdCamera.Perspective
        : HdCamera.Orthographic, _HdCameraProjectionType)
    } else if (paramName === HdCameraSchemaTokens.clippingRange) {
      let range = new GfVec2f(0)
      if (value.IsHolding(VtValueTypes.GfVec2f)) {
        range = value.UncheckedGet<GfVec2f>()
      }
      return VtValue.create(new GfRange1f(range.get(0), range.get(1)), _GfRange1fType)
    } else if (paramName === HdCameraTokens.clipPlanes) {
      const vec: GfVec4d[] = []
      if (value.isArrayValued() && value.getElementType() === VtValueTypes.GfVec4d) {
        const array = value.UncheckedGet<VtArray<GfVec4d>>()
        for (const p of array.toArray()) {
          vec.push(p)
        }
      }
      return VtValue.create(vec, _GfVec4dVectorType)
    } else {
      return value
    }
  }

  /** sceneIndexAdapterSceneDelegate.cpp:1481-1504 */
  override getLightParamValue(id: string, paramName: TfToken | string): VtValue {
    const prim = this._getInputPrim(id)
    if (!prim.dataSource) {
      return VtValue.getEmpty()
    }

    const light = prim.dataSource.Get(HdLightSchemaTokens.light)
    if (light instanceof HdContainerDataSource) {
      const valueDs = light.Get(paramName)
      if (valueDs instanceof HdSampledDataSource) {
        return _ToVtValue(valueDs, 0)
      }
    }

    return VtValue.getEmpty()
  }

  /** sceneIndexAdapterSceneDelegate.cpp:1752-1795 */
  private _getImageShaderValue(prim: HdSceneIndexPrim, key: TfToken): VtValue {
    const imageShaderSchema = HdImageShaderSchema.getFromParent(prim.dataSource)
    if (!imageShaderSchema.isDefined()) {
      return VtValue.getEmpty()
    }

    if (key === HdImageShaderSchemaTokens.enabled) {
      const enabledDs = imageShaderSchema.getEnabled()
      if (enabledDs) {
        return _ToVtValue(enabledDs, 0, VtValueTypes.bool)
      }
    } else if (key === HdImageShaderSchemaTokens.priority) {
      const priorityDs = imageShaderSchema.getPriority()
      if (priorityDs) {
        return _ToVtValue(priorityDs, 0, VtValueTypes.int)
      }
    } else if (key === HdImageShaderSchemaTokens.filePath) {
      const filePathDs = imageShaderSchema.getFilePath()
      if (filePathDs) {
        return _ToVtValue(filePathDs, 0, VtValueTypes.string)
      }
    } else if (key === HdImageShaderSchemaTokens.constants) {
      const constantsSchema = imageShaderSchema.getConstants()
      if (constantsSchema.isDefined()) {
        return VtValue.createDictionary(_ToDictionary(constantsSchema))
      }
    } else if (key === HdImageShaderSchemaTokens.materialNetwork) {
      const materialNetworkSchema = imageShaderSchema.getMaterialNetwork()
      if (materialNetworkSchema.isDefined()) {
        const renderContexts = this._getMaterialRenderContexts()
        return VtValue.take(
          _ToMaterialNetworkMap(materialNetworkSchema, renderContexts),
          _HdMaterialNetworkMapType)
      }
    }

    return VtValue.getEmpty()
  }

  // ------------------------------------------------------------------------
  // Primvar API

  /** sceneIndexAdapterSceneDelegate.cpp:1797-1833 */
  override getPrimvarDescriptors(id: string,
    interpolation: HdInterpolation): HdPrimvarDescriptorVector {
    const { found, entry } = this._findPrimCacheEntry(id)
    if (!found) {
      return []
    }

    const expected = entry?.primvarDescriptors
    if (expected) {
      return expected[interpolation] ?? []
    }

    const prim = this._getInputPrim(id)
    if (!prim.dataSource) {
      return []
    }

    const desired = this._computePrimvarDescriptors(prim.dataSource)
    if (!desired) {
      return []
    }

    this._mutablePrimCacheEntry(id).primvarDescriptors = desired
    return desired[interpolation] ?? []
  }

  /** sceneIndexAdapterSceneDelegate.cpp:1835-1869 */
  private _computePrimvarDescriptors(
    primDataSource: HdContainerDataSource | undefined,
  ): _PrimvarDescriptorsArray | null {
    if (!TF_VERIFY(primDataSource)) {
      return null
    }

    const descriptors = _NewDescriptorsArray<HdPrimvarDescriptor>()

    const primvars = HdPrimvarsSchema.getFromParent(primDataSource)
    if (primvars.isDefined()) {
      for (const name of primvars.getPrimvarNames()) {
        const primvar = primvars.getPrimvar(name)
        if (!primvar.isDefined()) {
          continue
        }

        const desc = HdPrimvarDescriptorFromSchema(name as TfToken, primvar)

        if (!_IsValidInterpolation(desc.interpolation)) {
          TF_WARN('HdSceneIndexAdapterSceneDelegate: Skipping primvar ' +
            `'${name}' due to invalid interpolation value ${desc.interpolation}`)
          continue
        }

        descriptors[desc.interpolation]!.push(desc)
      }
    }

    return descriptors
  }

  /** sceneIndexAdapterSceneDelegate.cpp:1908-1944 */
  override getExtComputationPrimvarDescriptors(id: string,
    interpolation: HdInterpolation): HdExtComputationPrimvarDescriptor[] {
    const { found, entry } = this._findPrimCacheEntry(id)
    if (!found) {
      return []
    }

    const expected = entry?.extCmpPrimvarDescriptors
    if (expected) {
      return expected[interpolation] ?? []
    }

    const prim = this._getInputPrim(id)
    if (!prim.dataSource) {
      return []
    }

    const desired = this._computeExtCmpPrimvarDescriptors(prim.dataSource)
    if (!desired) {
      return []
    }

    this._mutablePrimCacheEntry(id).extCmpPrimvarDescriptors = desired
    return desired[interpolation] ?? []
  }

  /** sceneIndexAdapterSceneDelegate.cpp:1946-1978 */
  private _computeExtCmpPrimvarDescriptors(
    primDataSource: HdContainerDataSource | undefined,
  ): _ExtCmpPrimvarDescriptorsArray | null {
    if (!TF_VERIFY(primDataSource)) {
      return null
    }

    const descriptors = _NewDescriptorsArray<HdExtComputationPrimvarDescriptor>()

    const primvars = HdExtComputationPrimvarsSchema.getFromParent(primDataSource)
    if (primvars.isDefined()) {
      for (const name of primvars.getExtComputationPrimvarNames()) {
        const primvar = primvars.getExtComputationPrimvar(name)
        if (!primvar.isDefined()) {
          continue
        }

        const { desc, interpolation } =
          _ExtComputationPrimvarDescriptorFromSchema(name as TfToken, primvar)

        if (!_IsValidInterpolation(interpolation)) {
          continue
        }

        descriptors[interpolation]!.push(desc)
      }
    }

    return descriptors
  }

  /** sceneIndexAdapterSceneDelegate.cpp:2025-2277 */
  override Get(id: string, key: TfToken | string): VtValue {
    const prim = this._getInputPrim(id)
    if (!prim.dataSource) {
      return VtValue.getEmpty()
    }
    const dataSource = prim.dataSource

    // simpleLight use of Get().
    if (prim.primType === HdPrimTypeTokens.simpleLight) {
      return this.getLightParamValue(id, key)
    }

    // camera use of Get().
    if (prim.primType === HdPrimTypeTokens.camera) {
      return this.getCameraParamValue(id, key)
    }

    // drawTarget use of Get().
    if (prim.primType === HdPrimTypeTokens.drawTarget) {
      const drawTarget = dataSource.Get(HdPrimTypeTokens.drawTarget)
      if (drawTarget instanceof HdContainerDataSource) {
        const valueDs = drawTarget.Get(key)
        if (valueDs instanceof HdSampledDataSource) {
          return _ToVtValue(valueDs, 0.0)
        }
      }

      return VtValue.getEmpty()
    }

    // volume field use of Get().
    if (HdLegacyPrimTypeIsVolumeField(prim.primType)) {
      const volumeField = dataSource.Get(HdVolumeFieldSchemaTokens.volumeField)
      if (!(volumeField instanceof HdContainerDataSource)) {
        return VtValue.getEmpty()
      }

      const valueDs = volumeField.Get(key)
      if (!(valueDs instanceof HdSampledDataSource)) {
        return VtValue.getEmpty()
      }

      return _ToVtValue(valueDs, 0)
    }

    // renderbuffer use of Get().
    if (prim.primType === HdPrimTypeTokens.renderBuffer) {
      const renderBuffer = dataSource.Get(HdRenderBufferSchemaTokens.renderBuffer)
      if (renderBuffer instanceof HdContainerDataSource) {
        const valueDs = renderBuffer.Get(key)
        if (valueDs instanceof HdSampledDataSource) {
          return _ToVtValue(valueDs, 0)
        }
      }

      return VtValue.getEmpty()
    }

    // renderSettings use of Get().
    if (prim.primType === HdPrimTypeTokens.renderSettings) {
      return _GetRenderSettings(prim, key as TfToken)
    }

    // integrator use of Get().
    if (prim.primType === HdPrimTypeTokens.integrator) {
      if (key === HdIntegratorSchemaTokens.resource) {
        return _GetRenderTerminalResource(HdIntegratorSchema, prim)
      }
      return VtValue.getEmpty()
    }

    // sampleFilter use of Get().
    if (prim.primType === HdPrimTypeTokens.sampleFilter) {
      if (key === HdSampleFilterSchemaTokens.resource) {
        return _GetRenderTerminalResource(HdSampleFilterSchema, prim)
      }
      return VtValue.getEmpty()
    }

    // displayFilter use of Get().
    if (prim.primType === HdPrimTypeTokens.displayFilter) {
      if (key === HdDisplayFilterSchemaTokens.resource) {
        return _GetRenderTerminalResource(HdDisplayFilterSchema, prim)
      }
      return VtValue.getEmpty()
    }

    // energyFilter use of Get().
    if (prim.primType === HdPrimTypeTokens.energyFilter) {
      if (key === HdEnergyFilterSchemaTokens.resource) {
        return _GetRenderTerminalResource(HdEnergyFilterSchema, prim)
      }
      // enabled, lpe, order are stored as flat attributes in the container.
      const ds = dataSource.Get(key)
      if (ds instanceof HdSampledDataSource) {
        return _ToVtValue(ds, 0.0)
      }
      return VtValue.getEmpty()
    }

    if (prim.primType === HdPrimTypeTokens.imageShader) {
      return this._getImageShaderValue(prim, key as TfToken)
    }

    // cube, sphere, cylinder, cone, capsule use of Get()
    // (sceneIndexAdapterSceneDelegate.cpp:2141-2194).
    const implicitSchemaToken =
      prim.primType === HdPrimTypeTokens.cube ? HdCubeSchemaTokens.cube
        : prim.primType === HdPrimTypeTokens.sphere ? HdSphereSchemaTokens.sphere
          : prim.primType === HdPrimTypeTokens.cylinder ? HdCylinderSchemaTokens.cylinder
            : prim.primType === HdPrimTypeTokens.cone ? HdConeSchemaTokens.cone
              : prim.primType === HdPrimTypeTokens.capsule ? HdCapsuleSchemaTokens.capsule
                : undefined
    if (implicitSchemaToken !== undefined) {
      const src = dataSource.Get(implicitSchemaToken)
      if (src instanceof HdContainerDataSource) {
        const valueSrc = src.Get(key)
        if (valueSrc instanceof HdSampledDataSource) {
          return _ToVtValue(valueSrc, 0)
        }
      }
    }

    if (prim.primType === HdPrimTypeTokens.coordSys) {
      const nameKey = SdfPath.joinIdentifier(
        [HdCoordSysSchema.getSchemaToken(), HdCoordSysSchemaTokens.name])
      if (key === nameKey) {
        const nameDs = HdCoordSysSchema.getFromParent(dataSource).getName()
        if (nameDs) {
          return _ToVtValue(nameDs, 0.0, VtValueTypes.token)
        }
      }
    }

    // "primvars" use of Get()
    const primvars = HdPrimvarsSchema.getFromParent(dataSource)
    if (primvars.isDefined()) {
      const result = this._getPrimvarFromContainer(primvars.getContainer(), key, null)
      if (!result.IsEmpty()) {
        return result
      }
    }

    // For tasks.
    const task = HdLegacyTaskSchema.getFromParent(dataSource)
    if (task.isDefined()) {
      if (key === HdTokens.params) {
        const ds = task.getParameters()
        if (ds instanceof HdSampledDataSource) {
          return _ToVtValue(ds, 0.0)
        }
      }
      if (key === HdTokens.collection) {
        const ds = task.getCollection()
        if (ds instanceof HdSampledDataSource) {
          return _ToVtValue(ds, 0.0)
        }
      }
      if (key === HdTokens.renderTags) {
        const ds = task.getRenderTags()
        if (ds instanceof HdSampledDataSource) {
          return _ToVtValue(ds, 0.0)
        }
      }
    }

    if (prim.primType === _projectionPluginTokens.projection) {
      if (key === _projectionPluginTokens.resource) {
        const projection = dataSource.Get(_projectionPluginTokens.projection)
        if (projection instanceof HdContainerDataSource) {
          const resourceDs = projection.Get(_projectionPluginTokens.resource)
          const resource = new HdMaterialNodeSchema(
            resourceDs instanceof HdContainerDataSource ? resourceDs : undefined)
          if (resource.isDefined()) {
            return _MaterialNode2FromSchema(resource)
          }
        }
      }
    }

    // Fallback for unknown prim conventions provided by emulated scene
    // delegate.
    const sdDs = dataSource.Get(HdSceneIndexEmulationTokens.sceneDelegate)
    if (sdDs instanceof HdSampledDataSource) {
      const delegate = _GetTypedValue<HdSceneDelegate | null>(sdDs, 0.0)
      if (delegate instanceof HdSceneDelegate) {
        return delegate.Get(id, key)
      }
    }

    return VtValue.getEmpty()
  }

  /** sceneIndexAdapterSceneDelegate.cpp:2279-2284 */
  override getIndexedPrimvar(id: string, key: TfToken | string,
    outIndices: { value: number[] } | null): VtValue {
    return this._getPrimvar(id, key, outIndices)
  }

  /** sceneIndexAdapterSceneDelegate.cpp:2286-2305 */
  private _getPrimvar(id: string, key: TfToken | string,
    outIndices: { value: number[] } | null): VtValue {
    if (outIndices) {
      outIndices.value = []
    }
    const prim = this._getInputPrim(id)
    if (!prim.dataSource) {
      return VtValue.getEmpty()
    }

    return this._getPrimvarFromContainer(
      HdPrimvarsSchema.getFromParent(prim.dataSource).getContainer(),
      key, outIndices)
  }

  /** sceneIndexAdapterSceneDelegate.cpp:2307-2336 (the
   *  _GetPrimvar(primvarsDataSource, key, outIndices) overload). */
  private _getPrimvarFromContainer(
    primvarsDataSource: HdContainerDataSource | undefined, key: TfToken | string,
    outIndices: { value: number[] } | null): VtValue {
    const primvars = new HdPrimvarsSchema(primvarsDataSource)
    if (primvars.isDefined()) {
      const primvar = primvars.getPrimvar(key)
      if (primvar.isDefined()) {
        if (outIndices) {
          const valueDataSource = primvar.getIndexedPrimvarValue()
          if (valueDataSource) {
            const indicesDataSource = primvar.getIndices()
            if (indicesDataSource) {
              outIndices.value = _GetTypedValue<number[]>(indicesDataSource, 0.0)
            }
            return _ToVtValue(valueDataSource, 0.0)
          }
        } else {
          const valueDataSource = primvar.getPrimvarValue()
          if (valueDataSource) {
            return _ToVtValue(valueDataSource, 0.0)
          }
        }
      }
    }

    return VtValue.getEmpty()
  }

  /** sceneIndexAdapterSceneDelegate.cpp:2338-2361 */
  override samplePrimvar(id: string, key: TfToken | string, maxSampleCount: number,
    sampleTimes: number[], sampleValues: VtValue[]): number
  override samplePrimvar(id: string, key: TfToken | string, startTime: number,
    endTime: number, maxSampleCount: number, sampleTimes: number[],
    sampleValues: VtValue[]): number
  override samplePrimvar(id: string, key: TfToken | string,
    sa: HdTimeSampleArray<VtValue>, capacity: number): void
  override samplePrimvar(id: string, key: TfToken | string, startTime: number,
    endTime: number, sa: HdTimeSampleArray<VtValue>, capacity: number): void
  override samplePrimvar(id: string, key: TfToken | string,
    ...args: unknown[]): number | void {
    return _DispatchSample<VtValue>(args, (start, end, max, times, values) =>
      this._samplePrimvar(id, key, start, end, max, times, values, null))
  }

  /** sceneIndexAdapterSceneDelegate.cpp:2363-2386 */
  override sampleIndexedPrimvar(id: string, key: TfToken | string,
    maxSampleCount: number, sampleTimes: number[], sampleValues: VtValue[],
    sampleIndices: number[][]): number
  override sampleIndexedPrimvar(id: string, key: TfToken | string,
    startTime: number, endTime: number, maxSampleCount: number,
    sampleTimes: number[], sampleValues: VtValue[], sampleIndices: number[][]): number
  override sampleIndexedPrimvar(id: string, key: TfToken | string,
    ...args: unknown[]): number {
    if (args.length === 4) {
      const [maxSampleCount, sampleTimes, sampleValues, sampleIndices] =
        args as [number, number[], VtValue[], number[][]]
      return this._samplePrimvar(id, key, _fallbackStartTime, _fallbackEndTime,
        maxSampleCount, sampleTimes, sampleValues, sampleIndices)
    }
    const [startTime, endTime, maxSampleCount, sampleTimes, sampleValues, sampleIndices] =
      args as [number, number, number, number[], VtValue[], number[][]]
    return this._samplePrimvar(id, key, startTime, endTime,
      maxSampleCount, sampleTimes, sampleValues, sampleIndices)
  }

  /** sceneIndexAdapterSceneDelegate.cpp:2388-2495 */
  private _samplePrimvar(id: string, key: TfToken | string,
    startTime: number, endTime: number, maxSampleCount: number,
    sampleTimes: number[], sampleValues: VtValue[],
    sampleIndices: number[][] | null): number {
    const prim = this._getInputPrim(id)

    let valueSource: HdSampledDataSource | undefined = undefined
    let indicesSource: HdDataSourceBase | undefined = undefined

    const primvars = HdPrimvarsSchema.getFromParent(prim.dataSource)
    if (primvars.isDefined()) {
      const primvar = primvars.getPrimvar(key)
      if (primvar.isDefined()) {
        if (sampleIndices) {
          valueSource = primvar.getIndexedPrimvarValue()
          indicesSource = primvar.getIndices()
        } else {
          valueSource = primvar.getPrimvarValue()
        }
      }
    }

    // NOTE: SamplePrimvar is used by some render delegates to get multiple
    //       samples from camera parameters. While this works from UsdImaging,
    //       it's not due to intentional scene delegate specification but
    //       by UsdImaging fallback behavior which goes directly to USD attrs
    //       in absence of a matching primvar.
    //       In order to support legacy uses of this, we will also check
    //       camera parameter datasources
    if (!valueSource && prim.primType === HdPrimTypeTokens.camera) {
      const cameraSchema = HdCameraSchema.getFromParent(prim.dataSource)
      if (cameraSchema.isDefined()) {
        // Ask for the key directly from the schema's container data source
        // as immediate child data source names match the legacy camera
        // parameter names (e.g. focalLength)
        // For a native data source, this will naturally have time samples.
        // For a emulated data source, we are accounting for the possibly
        // that it needs to call SamplePrimvar
        const ds = cameraSchema.getContainer()!.Get(key)
        valueSource = ds instanceof HdSampledDataSource ? ds : undefined
      }
    }

    if (!valueSource) {
      return 0
    }

    let times: number[] = []
    // XXX: If the input prim is a legacy prim, the scene delegate is
    // responsible for setting the shutter window. We can't query it, but
    // we pass the infinite window to accept all time samples from the
    // scene delegate.
    if (prim.dataSource!.Get(HdSceneIndexEmulationTokens.sceneDelegate)) {
      valueSource.GetContributingSampleTimesForInterval(-_FLT_MAX, _FLT_MAX, times)

      // XXX fallback to include a single sample
      if (times.length === 0) {
        times.push(0.0)
      }
    } else {
      const isVarying = valueSource.GetContributingSampleTimesForInterval(
        startTime, endTime, times)
      if (isVarying) {
        if (times.length === 0) {
          TF_CODING_ERROR('No contributing sample times returned for ' +
            `${id} ${key} even though ` +
            'GetContributingSampleTimesForInterval ' +
            'indicated otherwise.')
          times.push(0.0)
        }
      } else {
        times = [0.0]
      }
    }

    const authoredSamples = times.length
    if (authoredSamples > maxSampleCount) {
      times.length = maxSampleCount
    }

    for (let i = 0; i < times.length; ++i) {
      sampleTimes[i] = times[i]!
      sampleValues[i] = _ToVtValue(valueSource, times[i]!)
      if (sampleIndices) {
        if (indicesSource) {
          // Can assume indices source has same sample times as primvar
          // value source.
          sampleIndices[i] = _GetTypedValue<number[]>(indicesSource, times[i]!)
        } else {
          sampleIndices[i] = []
        }
      }
    }

    return authoredSamples
  }

  // ------------------------------------------------------------------------
  // Transform API

  /** sceneIndexAdapterSceneDelegate.cpp:2497-2517 */
  override getTransform(id: string): GfMatrix4d {
    let m = new GfMatrix4d()
    m.setIdentity()

    const prim = this._getInputPrim(id)

    const xformSchema = HdXformSchema.getFromParent(prim.dataSource)
    if (xformSchema.isDefined()) {
      const matrixSource = xformSchema.getMatrix()
      if (matrixSource) {
        m = _GetTypedValue<GfMatrix4d>(matrixSource, 0.0, VtValueTypes.GfMatrix4d)
      }
    }

    return m
  }

  /** sceneIndexAdapterSceneDelegate.cpp:2519-2523 */
  override getInstancerTransform(instancerId: string): GfMatrix4d {
    return this.getTransform(instancerId)
  }

  /** sceneIndexAdapterSceneDelegate.cpp:2525-2586 */
  override sampleTransform(id: string, maxSampleCount: number,
    sampleTimes: number[], sampleValues: GfMatrix4d[]): number
  override sampleTransform(id: string, startTime: number, endTime: number,
    maxSampleCount: number, sampleTimes: number[], sampleValues: GfMatrix4d[]): number
  override sampleTransform(id: string, sa: HdTimeSampleArray<GfMatrix4d>,
    capacity: number): void
  override sampleTransform(id: string, startTime: number, endTime: number,
    sa: HdTimeSampleArray<GfMatrix4d>, capacity: number): void
  override sampleTransform(id: string, ...args: unknown[]): number | void {
    return _DispatchSample<GfMatrix4d>(args, (start, end, max, times, values) =>
      this._sampleTransform(id, start, end, max, times, values))
  }

  /** sceneIndexAdapterSceneDelegate.cpp:2535-2586 */
  private _sampleTransform(id: string, startTime: number, endTime: number,
    maxSampleCount: number, sampleTimes: number[], sampleValues: GfMatrix4d[]): number {
    const prim = this._getInputPrim(id)

    const xformSchema = HdXformSchema.getFromParent(prim.dataSource)
    if (!xformSchema.isDefined()) {
      return 0
    }
    const matrixSource = xformSchema.getMatrix()
    if (!matrixSource) {
      return 0
    }

    const times: number[] = []
    // XXX: If the input prim is a legacy prim, the scene delegate is
    // responsible for setting the shutter window. We can't query it, but
    // we pass the infinite window to accept all time samples from the
    // scene delegate.
    if (prim.dataSource!.Get(HdSceneIndexEmulationTokens.sceneDelegate)) {
      matrixSource.GetContributingSampleTimesForInterval(-_FLT_MAX, _FLT_MAX, times)
    } else {
      matrixSource.GetContributingSampleTimesForInterval(startTime, endTime, times)
    }

    // XXX fallback to include a single sample
    if (times.length === 0) {
      times.push(0.0)
    }

    const authoredSamples = times.length
    if (authoredSamples > maxSampleCount) {
      times.length = maxSampleCount
    }

    for (let i = 0; i < times.length; ++i) {
      sampleTimes[i] = times[i]!
      sampleValues[i] = _GetTypedValue<GfMatrix4d>(matrixSource, times[i]!,
        VtValueTypes.GfMatrix4d)
    }

    return authoredSamples
  }

  /** sceneIndexAdapterSceneDelegate.cpp:2588-2604 */
  override sampleInstancerTransform(instancerId: string, maxSampleCount: number,
    sampleTimes: number[], sampleValues: GfMatrix4d[]): number
  override sampleInstancerTransform(instancerId: string, startTime: number,
    endTime: number, maxSampleCount: number, sampleTimes: number[],
    sampleValues: GfMatrix4d[]): number
  override sampleInstancerTransform(instancerId: string,
    sa: HdTimeSampleArray<GfMatrix4d>, capacity: number): void
  override sampleInstancerTransform(instancerId: string, startTime: number,
    endTime: number, sa: HdTimeSampleArray<GfMatrix4d>, capacity: number): void
  override sampleInstancerTransform(instancerId: string,
    ...args: unknown[]): number | void {
    return _DispatchSample<GfMatrix4d>(args, (start, end, max, times, values) =>
      this._sampleTransform(instancerId, start, end, max, times, values))
  }

  // ------------------------------------------------------------------------
  // Instancer API

  /** sceneIndexAdapterSceneDelegate.cpp:2606-2639 */
  override getInstanceCategories(instancerId: string): TfToken[][] {
    const result: TfToken[][] = []

    const prim = this._getInputPrim(instancerId)

    const instanceCategories = HdInstanceCategoriesSchema.getFromParent(prim.dataSource)
    if (instanceCategories.isDefined()) {
      const values = instanceCategories.getCategoriesValues()
      if (values instanceof HdVectorDataSource) {
        for (let i = 0, e = values.getNumElements(); i !== e; ++i) {
          const element = values.getElement(i)
          const value = new HdCategoriesSchema(
            element instanceof HdContainerDataSource ? element : undefined)
          if (value.isDefined()) {
            // TODO, deduplicate by address
            result.push(value.getIncludedCategoryNames())
          } else {
            result.push([])
          }
        }
      }
    }

    return result
  }

  /** sceneIndexAdapterSceneDelegate.cpp:2642-2659 */
  override getInstanceIndices(instancerId: string, prototypeId: string): number[] {
    let indices: number[] = []

    const prim = this._getInputPrim(instancerId)

    const instancerTopology = HdInstancerTopologySchema.getFromParent(prim.dataSource)
    if (instancerTopology.isDefined()) {
      indices = instancerTopology.computeInstanceIndicesForProto(prototypeId)
    }

    return indices
  }

  /** sceneIndexAdapterSceneDelegate.cpp:2661-2682 */
  override getInstancerPrototypes(instancerId: string): string[] {
    let prototypes: string[] = []

    const prim = this._getInputPrim(instancerId)

    const instancerTopology = HdInstancerTopologySchema.getFromParent(prim.dataSource)
    if (instancerTopology.isDefined()) {
      const protoDs = instancerTopology.getPrototypes()
      if (protoDs) {
        prototypes = [..._GetTypedValue<string[]>(protoDs, 0)]
      }
    }

    return prototypes
  }

  /** sceneIndexAdapterSceneDelegate.cpp:2684-2715 */
  override getInstancerId(id: string): string {
    let instancerId = ''

    const prim = this._getInputPrim(id)

    const instancedBy = HdInstancedBySchema.getFromParent(prim.dataSource)
    if (instancedBy.isDefined()) {
      let instancerIds: string[] = []
      const instancerIdsDs = instancedBy.getPaths()
      if (instancerIdsDs) {
        instancerIds = _GetTypedValue<string[]>(instancerIdsDs, 0)
      }

      // XXX: Right now the scene delegate can't handle multiple
      // instancers, so we rely on upstream ops to make the size <= 1.
      if (instancerIds.length > 1) {
        TF_CODING_ERROR(`Prim <${id}> has multiple instancer ids, using first.`)
      }

      if (instancerIds.length > 0) {
        instancerId = instancerIds[0]!
      }
    }

    return instancerId
  }

  // ------------------------------------------------------------------------
  // ExtComputation API

  /** sceneIndexAdapterSceneDelegate.cpp:2717-2730 */
  override getExtComputationSceneInputNames(computationId: string): TfToken[] {
    const prim = this._getInputPrim(computationId)
    const extComputation = HdExtComputationSchema.getFromParent(prim.dataSource)
    const inputValues = extComputation.getInputValues()
    return inputValues.getNames()
  }

  /** sceneIndexAdapterSceneDelegate.cpp:2732-2771 */
  override getExtComputationInput(computationId: string, input: TfToken | string): VtValue {
    const prim = this._getInputPrim(computationId)
    const extComputation = HdExtComputationSchema.getFromParent(prim.dataSource)
    if (!extComputation.isDefined()) {
      return VtValue.getEmpty()
    }

    if (input === HdTokens.dispatchCount) {
      const dispatchDs = extComputation.getDispatchCount()
      if (!dispatchDs) {
        return VtValue.getEmpty()
      }
      return _ToVtValue(dispatchDs, 0, VtValueTypes.uint64)
    }

    if (input === HdTokens.elementCount) {
      const elementDs = extComputation.getElementCount()
      if (!elementDs) {
        return VtValue.getEmpty()
      }
      return _ToVtValue(elementDs, 0, VtValueTypes.uint64)
    }

    const inputValues = extComputation.getInputValues()
    const valueDs = inputValues.Get(input)
    if (!valueDs) {
      return VtValue.getEmpty()
    }
    return _ToVtValue(valueDs, 0)
  }

  /** sceneIndexAdapterSceneDelegate.cpp:2773-2853 */
  override sampleExtComputationInput(computationId: string, input: TfToken | string,
    maxSampleCount: number, sampleTimes: number[], sampleValues: VtValue[]): number
  override sampleExtComputationInput(computationId: string, input: TfToken | string,
    startTime: number, endTime: number, maxSampleCount: number,
    sampleTimes: number[], sampleValues: VtValue[]): number
  override sampleExtComputationInput(computationId: string, input: TfToken | string,
    sa: HdTimeSampleArray<VtValue>, capacity: number): void
  override sampleExtComputationInput(computationId: string, input: TfToken | string,
    startTime: number, endTime: number, sa: HdTimeSampleArray<VtValue>,
    capacity: number): void
  override sampleExtComputationInput(computationId: string, input: TfToken | string,
    ...args: unknown[]): number | void {
    return _DispatchSample<VtValue>(args, (start, end, max, times, values) =>
      this._sampleExtComputationInput(computationId, input, start, end, max,
        times, values))
  }

  /** sceneIndexAdapterSceneDelegate.cpp:2786-2853 */
  private _sampleExtComputationInput(computationId: string, input: TfToken | string,
    startTime: number, endTime: number, maxSampleCount: number,
    sampleTimes: number[], sampleValues: VtValue[]): number {
    const prim = this._getInputPrim(computationId)
    const extComputation = HdExtComputationSchema.getFromParent(prim.dataSource)
    if (!extComputation.isDefined()) {
      return 0
    }

    const inputValues = extComputation.getInputValues()
    const valueDs = inputValues.Get(input)
    if (!valueDs) {
      return 0
    }

    let times: number[] = []
    // XXX: If the input prim is a legacy prim, the scene delegate is
    // responsible for setting the shutter window. We can't query it, but
    // we pass the infinite window to accept all time samples from the
    // scene delegate.
    if (prim.dataSource!.Get(HdSceneIndexEmulationTokens.sceneDelegate)) {
      valueDs.GetContributingSampleTimesForInterval(-_FLT_MAX, _FLT_MAX, times)

      // XXX fallback to include a single sample
      if (times.length === 0) {
        times.push(0.0)
      }
    } else {
      const isVarying = valueDs.GetContributingSampleTimesForInterval(
        startTime, endTime, times)
      if (isVarying) {
        if (times.length === 0) {
          TF_CODING_ERROR('No contributing sample times returned for ' +
            `${computationId} ${input} even though ` +
            'GetContributingSampleTimesForInterval ' +
            'indicated otherwise.')
          times.push(0.0)
        }
      } else {
        times = [0.0]
      }
    }

    const authoredSamples = times.length
    if (authoredSamples > maxSampleCount) {
      times.length = maxSampleCount
    }

    for (let i = 0; i < times.length; ++i) {
      sampleTimes[i] = times[i]!
      sampleValues[i] = _ToVtValue(valueDs, times[i]!)
    }

    return authoredSamples
  }

  /** sceneIndexAdapterSceneDelegate.cpp:2855-2891 */
  override getExtComputationInputDescriptors(
    computationId: string): HdExtComputationInputDescriptor[] {
    const result: HdExtComputationInputDescriptor[] = []

    const prim = this._getInputPrim(computationId)
    const extComputation = HdExtComputationSchema.getFromParent(prim.dataSource)
    const inputComputations = extComputation.getInputComputations()
    const names = inputComputations.getNames()
    for (const name of names) {
      const input = inputComputations.Get(name)
      if (!input.isDefined()) {
        continue
      }
      const desc: HdExtComputationInputDescriptor = {
        name,
        sourceComputationId: '',
        sourceComputationOutputName: '',
      }
      const srcDs = input.getSourceComputation()
      if (srcDs) {
        desc.sourceComputationId = _GetTypedValue<string>(srcDs, 0)
      }
      const srcNameDs = input.getSourceComputationOutputName()
      if (srcNameDs) {
        desc.sourceComputationOutputName = _GetTypedValue<TfToken>(srcNameDs, 0)
      }
      result.push(desc)
    }

    return result
  }

  /** sceneIndexAdapterSceneDelegate.cpp:2893-2924 */
  override getExtComputationOutputDescriptors(
    computationId: string): HdExtComputationOutputDescriptor[] {
    const result: HdExtComputationOutputDescriptor[] = []

    const prim = this._getInputPrim(computationId)
    const extComputation = HdExtComputationSchema.getFromParent(prim.dataSource)
    const outputs = extComputation.getOutputs()
    const names = outputs.getNames()
    for (const name of names) {
      const output = outputs.Get(name)
      if (!output.isDefined()) {
        continue
      }

      const desc: HdExtComputationOutputDescriptor = { name }
      const typeDs = output.GetValueType()
      if (typeDs) {
        desc.valueType = _GetTypedValue<HdTupleType>(typeDs, 0)
      }
      result.push(desc)
    }

    return result
  }

  /** sceneIndexAdapterSceneDelegate.cpp:2926-2942 */
  override getExtComputationKernel(computationId: string): string {
    const prim = this._getInputPrim(computationId)
    const extComputation = HdExtComputationSchema.getFromParent(prim.dataSource)
    if (extComputation.isDefined()) {
      const ds = extComputation.getGlslKernel()
      if (ds) {
        return _GetTypedValue<string>(ds, 0)
      }
    }
    return ''
  }

  /** sceneIndexAdapterSceneDelegate.cpp:2944-2965 */
  override invokeExtComputation(computationId: string,
    context: HdExtComputationContextArg): void {
    const prim = this._getInputPrim(computationId)
    const extComputation = HdExtComputationSchema.getFromParent(prim.dataSource)
    const ds = extComputation.getCpuCallback()
    if (!ds) {
      return
    }
    const callback = _GetTypedValue<_ExtComputationCpuCallback | null>(ds, 0.0)
    if (!callback) {
      return
    }
    callback.compute(context)
  }

  /** sceneIndexAdapterSceneDelegate.cpp:2967-2979 */
  override getTaskRenderTags(taskId: string): TfToken[] {
    const prim = this._getInputPrim(taskId)
    const task = HdLegacyTaskSchema.getFromParent(prim.dataSource)
    const ds = task.getRenderTags()
    if (!ds) {
      return []
    }
    return _GetTypedValue<TfToken[]>(ds, 0.0) ?? []
  }

  /** sceneIndexAdapterSceneDelegate.cpp:2981-3019 */
  override sync(request: HdSyncRequestVector | null): void {
    if (!request || request.IDs.length === 0) {
      return
    }

    if (!this._sceneDelegatesBuilt) {
      // hd-incremental-scene-delegates: the delegates of the added prims.
      this._sceneDelegates = [...new Set(this._delegateOf.values())]
      this._sceneDelegatesBuilt = true
    }

    for (const sd of this._sceneDelegates) {
      if (TF_VERIFY(sd)) {
        sd.sync(request)
      }
    }
  }

  /** sceneIndexAdapterSceneDelegate.cpp:3021-3051 */
  override postSyncCleanup(): void {
    // Only valid while _sceneDelegatesBuilt: these are raw pointers to
    // delegates we do not own, and unlike Sync() we must not rebuild here.
    if (this._sceneDelegatesBuilt) {
      for (const sd of this._sceneDelegates) {
        if (TF_VERIFY(sd)) {
          sd.postSyncCleanup()
        }
      }
    }

    // Cache eviction strategy:
    //
    // If prims were added or removed since the last sync, send a
    // "dropCaches" system message. This allows scene indexes to
    // reclaim storage associated with internal caches supporting
    // efficient scene population. If no prims were addded or removed,
    // leave caches in place in case they are supporting interactive
    // edit loops (PrimsDirtied).
    //
    // This caching strategy may continue to evolve in the future.
    if (this._didAddOrRemovePrimsSinceLastSync) {
      // HdSceneIndexBase::SystemMessage (sceneIndex.h:129-134) is not
      // declared by sceneIndex.ts yet; send it when the input provides it.
      const inputSceneIndex = this._inputSceneIndex as HdSceneIndexBase & {
        systemMessage?: (messageType: string, args: HdContainerDataSource | undefined) => void
      }
      inputSceneIndex.systemMessage?.(_dropCachesToken, undefined)
      this._didAddOrRemovePrimsSinceLastSync = false
    }
  }

  // ----------------------------------------------------------------------------

  /** sceneIndexAdapterSceneDelegate.cpp:3055-3103 */
  override getDisplayStyle(id: string): HdDisplayStyle {
    const prim = this._getInputPrim(id)
    const d = new HdDisplayStyle()
    let refineLevel = d.refineLevel
    let flatShadingEnabled = d.flatShadingEnabled
    let displacementEnabled = d.displacementEnabled
    let displayInOverlay = d.displayInOverlay
    let occludedSelectionShowsThrough = d.occludedSelectionShowsThrough
    let pointsShadingEnabled = d.pointsShadingEnabled
    let materialIsFinal = d.materialIsFinal
    const styleSchema = HdLegacyDisplayStyleSchema.getFromParent(prim.dataSource)
    if (styleSchema.isDefined()) {
      let ds: HdDataSourceBase | undefined
      if ((ds = styleSchema.getRefineLevel())) {
        refineLevel = _GetTypedValue<number>(ds, 0.0)
      }

      if ((ds = styleSchema.getFlatShadingEnabled())) {
        flatShadingEnabled = _GetTypedValue<boolean>(ds, 0.0)
      }

      if ((ds = styleSchema.getDisplacementEnabled())) {
        displacementEnabled = _GetTypedValue<boolean>(ds, 0.0)
      }

      if ((ds = styleSchema.getDisplayInOverlay())) {
        displayInOverlay = _GetTypedValue<boolean>(ds, 0.0)
      }

      if ((ds = styleSchema.getOccludedSelectionShowsThrough())) {
        occludedSelectionShowsThrough = _GetTypedValue<boolean>(ds, 0.0)
      }

      if ((ds = styleSchema.getPointsShadingEnabled())) {
        pointsShadingEnabled = _GetTypedValue<boolean>(ds, 0.0)
      }

      if ((ds = styleSchema.getMaterialIsFinal())) {
        materialIsFinal = _GetTypedValue<boolean>(ds, 0.0)
      }
    }

    // HdDisplayStyle's members are readonly in displayStyle.ts; the result
    // is built from the gathered values. Unlike the constructor, member
    // assignment does not clamp refineLevel (sceneDelegate.h:58-130).
    const result = new HdDisplayStyle(refineLevel, flatShadingEnabled,
      displacementEnabled, displayInOverlay, occludedSelectionShowsThrough,
      pointsShadingEnabled, materialIsFinal)
    if (result.refineLevel !== refineLevel) {
      (result as { refineLevel: number }).refineLevel = refineLevel
    }
    return result
  }

  /** sceneIndexAdapterSceneDelegate.cpp:3105-3124 */
  override getShadingStyle(id: string): VtValue {
    let result = VtValue.getEmpty()
    const prim = this._getInputPrim(id)
    const styleSchema = HdLegacyDisplayStyleSchema.getFromParent(prim.dataSource)
    if (styleSchema.isDefined()) {
      const ds = styleSchema.getShadingStyle()
      if (ds) {
        const st = _GetTypedValue<TfToken>(ds, 0.0)
        result = VtValue.create(st, VtValueTypes.token)
      }
    }

    return result
  }

  /** sceneIndexAdapterSceneDelegate.cpp:3126-3146 */
  override getReprSelector(id: string): HdReprSelector {
    let result = new HdReprSelector()
    const prim = this._getInputPrim(id)
    const styleSchema = HdLegacyDisplayStyleSchema.getFromParent(prim.dataSource)
    if (styleSchema.isDefined()) {
      const ds = styleSchema.getReprSelector()
      if (ds) {
        const ar = [..._GetTypedValue<TfToken[]>(ds, 0.0)]
        ar.length = HdReprSelector.MAX_TOPOLOGY_REPRS
        result = new HdReprSelector(ar[0] ?? '', ar[1] ?? '', ar[2] ?? '')
      }
    }

    return result
  }

  /** sceneIndexAdapterSceneDelegate.cpp:3148-3179 */
  override getCullStyle(id: string): HdCullStyle {
    let result = HdCullStyle.HdCullStyleDontCare
    const prim = this._getInputPrim(id)
    const styleSchema = HdLegacyDisplayStyleSchema.getFromParent(prim.dataSource)
    if (styleSchema.isDefined()) {
      const ds = styleSchema.getCullStyle()
      if (ds) {
        const ct = _GetTypedValue<TfToken>(ds, 0.0)
        if (ct === HdCullStyleTokens.nothing) {
          result = HdCullStyle.HdCullStyleNothing
        } else if (ct === HdCullStyleTokens.back) {
          result = HdCullStyle.HdCullStyleBack
        } else if (ct === HdCullStyleTokens.front) {
          result = HdCullStyle.HdCullStyleFront
        } else if (ct === HdCullStyleTokens.backUnlessDoubleSided) {
          result = HdCullStyle.HdCullStyleBackUnlessDoubleSided
        } else if (ct === HdCullStyleTokens.frontUnlessDoubleSided) {
          result = HdCullStyle.HdCullStyleFrontUnlessDoubleSided
        } else {
          result = HdCullStyle.HdCullStyleDontCare
        }
      }
    }

    return result
  }

  /** sceneIndexAdapterSceneDelegate.cpp:3181-3198 */
  override getPrimId(id: string): number {
    const prim = this._getInputPrim(id)

    const ds = HdPrimIdSchema.getFromParent(prim.dataSource).getPrimId()
    if (!ds) {
      TF_WARN(
        `No prim id for prim <${id}> of type '${prim.primType}' from terminal scene index.`)
      return -1
    }
    return _GetTypedValue<number>(ds, 0.0) | 0
  }

  // NOTE: The remaining scene delegate functions aren't used for emulation:
  // - GetScenePrimPath
  // - IsEnabled
}
