// Ported from OpenUSD 26.11.1:
//  pxr/usdImaging/usdImaging/selectionSceneIndex.cpp,
//  pxr/usdImaging/usdImaging/selectionSceneIndex.h
// Copyright 2022 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/usdImaging/usdImaging/selectionSceneIndex.{h,cpp}
// (OpenUSD 26.11.1).
//
// Not ported: the TF_DEBUG(USDIMAGING_SELECTION) diagnostics (usdImaging has
// no debug codes in this port), TRACE_* scopes and TF_DESCRIBE_SCOPE.
// _TraverseDescendants classifies each level serially (upstream uses
// WorkParallelForN for levels of at least _grainSize prims); the resulting
// node order is the same.

import {
  ConcatenatedVectorDataSource as HdConcatenatedVectorDataSource,
  ContainerDataSource as HdContainerDataSource,
  DataSourceLocatorSet as HdDataSourceLocatorSet,
  InstanceIndicesSchema as HdInstanceIndicesSchema,
  InstanceSchema as HdInstanceSchema,
  InstancedBySchema as HdInstancedBySchema,
  InstancerTopologySchema as HdInstancerTopologySchema,
  PrimTypeIsGprim as HdPrimTypeIsGprim,
  RetainedSmallVectorDataSource as HdRetainedSmallVectorDataSource,
  RetainedTypedSampledDataSource as HdRetainedTypedSampledDataSource,
  SelectionSchema as HdSelectionSchema,
  SelectionsSchema as HdSelectionsSchema,
  SingleInputFilteringSceneIndexBase as HdSingleInputFilteringSceneIndexBase,
  TypedSampledDataSource as HdTypedSampledDataSource,
  VectorDataSource as HdVectorDataSource,
  type AddedPrimEntry,
  type DataSourceBase as HdDataSourceBase,
  type DirtiedPrimEntry,
  type PathArrayDataSource as HdPathArrayDataSource,
  type PathDataSource as HdPathDataSource,
  type RemovedPrimEntry,
  type SceneIndexBase as HdSceneIndexBase,
  type SceneIndexPrim as HdSceneIndexPrim,
} from 'typescript-usd/hd'
import { SdfPath } from 'typescript-usd/sdf/path'
import { Tokens as UsdHydraTokens } from 'typescript-usd/usdHydra'
import { ValueTypes as VtValueTypes } from 'typescript-usd/vt'
import { TF_CODING_ERROR } from './tfDiagnostic.ts'
import { UsdImagingTokens } from './tokens.ts'
import { UsdImagingUsdPrimInfoSchema } from './usdPrimInfoSchema.ts'

// --- Path helpers (SdfPath API on the string paths of this port) ---

/** SdfPath::operator< (std::map<SdfPath, ...> / SdfPathSet ordering). */
function _PathLess(a: string, b: string): number {
  return SdfPath.compare(SdfPath.fromString(a), SdfPath.fromString(b))
}

/** SdfPath::HasPrefix */
function _HasPrefix(path: string, prefix: string): boolean {
  if (prefix === '/') return path.startsWith('/')
  if (!path.startsWith(prefix)) return false
  const c = path.charAt(prefix.length)
  return c === '' || c === '/' || c === '.' || c === '{'
}

/** SdfPath::AppendChild */
function _AppendChild(path: string, name: string): string {
  return path === '/' ? `/${name}` : `${path}/${name}`
}

/** SdfPath::GetNameToken */
function _GetNameToken(path: string): string {
  if (path === '/' || path === '') return ''
  return path.slice(path.lastIndexOf('/') + 1)
}

/** SdfPath::GetPrefixes for an absolute prim path: the path's ancestors,
 *  excluding the absolute root, and the path itself. */
function _GetPrefixes(path: string): string[] {
  const result: string[] = []
  if (path === '' || path === '/') return result
  const parts = path.split('/').slice(1)
  let current = ''
  for (const part of parts) {
    current += `/${part}`
    result.push(current)
  }
  return result
}

/** VtIntArray values may arrive as plain arrays or VtArray. */
function _ToArray<T>(v: unknown): T[] {
  if (Array.isArray(v)) return v as T[]
  const a = v as { toArray?: () => T[] } | undefined
  return a?.toArray ? a.toArray() : []
}

// The following struct's align with the selection Hydra schemata.

/** selectionSceneIndex.cpp:43-64: data for HdInstanceIndicesSchema.
 *
 *  Consider a piece of geometry within a prototype which is instanced.
 *  In particular, it has a data source for "instancedBy".
 *
 *  Note that the instancer instancing the geometry can have multiple
 *  prototypes, given as array.
 *
 *  To select particular instances of this geometry, we give the following
 *  information: */
interface _InstanceIndices {
  // The instancer.
  instancer: string
  // The index of the prototype within the prototypes of the above instancer.
  prototypeIndex: number
  // The selected instances.
  instanceIndices: number[]
}

/** selectionSceneIndex.cpp:66-76: data for HdInstanceIndicesVectorSchema.
 *
 *  Consider a piece of geometry within a prototype which is instanced by an
 *  instancer within a prototype which is instanced, ...
 *
 *  To select a particular instance of this geometry, we need to store
 *  _InstanceIndices at each level. We do this starting with the outermost
 *  instancer. */
type _InstanceIndicesVector = _InstanceIndices[]

/** selectionSceneIndex.cpp:78-87: data for HdSelectionSchema. */
interface _Selection {
  // In the future, this might contain further information such as which
  // highlighting mode is used or whether some subset of faces, ...
  // is selected.

  // Which nested instances of this piece of geometry are selected.
  nestedInstanceIndices: _InstanceIndicesVector
}

/** selectionSceneIndex.cpp:89-90: data for HdSelectionsSchema. */
type _Selections = _Selection[]

/** selectionSceneIndex.cpp:92-97: information shared between scene index and
 *  data sources. */
class _SelectionInfo {
  // The selection state by path in the scene index.
  readonly primToSelections = new Map<string, _Selections>()
}

/** selectionSceneIndex.cpp:99-114 */
function _InstanceIndicesToDs(i: _InstanceIndices): HdContainerDataSource {
  return new HdInstanceIndicesSchema.Builder()
    .setInstancer(
      HdRetainedTypedSampledDataSource.new<string>(i.instancer))
    .setPrototypeIndex(
      new HdRetainedTypedSampledDataSource<number>(i.prototypeIndex, VtValueTypes.int))
    .setInstanceIndices(
      HdRetainedTypedSampledDataSource.new<number[]>(i.instanceIndices))
    .build()
}

/** selectionSceneIndex.cpp:116-132 */
function _InstanceIndicesVectorToDs(v: _InstanceIndicesVector): HdVectorDataSource | undefined {
  if (v.length === 0) {
    return undefined
  }

  const r: HdDataSourceBase[] = []
  for (const i of v) {
    r.push(_InstanceIndicesToDs(i))
  }

  return HdRetainedSmallVectorDataSource.new(r)
}

/** selectionSceneIndex.cpp:134-144 */
function _SelectionToDs(s: _Selection): HdContainerDataSource {
  return new HdSelectionSchema.Builder()
    .setFullySelected(
      HdRetainedTypedSampledDataSource.new<boolean>(true))
    .setNestedInstanceIndices(
      _InstanceIndicesVectorToDs(s.nestedInstanceIndices))
    .build()
}

/** selectionSceneIndex.cpp:146-162 */
function _SelectionsToDs(s: _Selections): HdVectorDataSource | undefined {
  if (s.length === 0) {
    return undefined
  }

  const r: HdDataSourceBase[] = []
  for (const i of s) {
    r.push(_SelectionToDs(i))
  }

  return HdRetainedSmallVectorDataSource.new(r)
}

/** selectionSceneIndex.cpp:164-210: populate selections data source for prims
 *  using _SelectionInfo. */
class _PrimSource extends HdContainerDataSource {
  static new(
    inputPrimSource: HdContainerDataSource,
    selectionInfo: _SelectionInfo,
    primPath: string,
  ): _PrimSource {
    return new _PrimSource(inputPrimSource, selectionInfo, primPath)
  }

  constructor(
    private readonly _inputPrimSource: HdContainerDataSource,
    private readonly _selectionInfo: _SelectionInfo,
    private readonly _primPath: string,
  ) {
    super()
  }

  getNames(): string[] {
    const names = this._inputPrimSource.getNames()
    if (this._selectionInfo.primToSelections.has(this._primPath)) {
      names.push(HdSelectionsSchema.getSchemaToken())
    }
    return names
  }

  Get(name: string): HdDataSourceBase | undefined {
    const inputSrc = this._inputPrimSource.Get(name)
    if (name !== HdSelectionsSchema.getSchemaToken()) {
      return inputSrc
    }

    const it = this._selectionInfo.primToSelections.get(this._primPath)
    if (it === undefined) {
      return inputSrc
    }

    return HdConcatenatedVectorDataSource.concatenatedVectorDataSources(
      inputSrc instanceof HdVectorDataSource ? inputSrc : undefined,
      _SelectionsToDs(it))
  }
}

///////////////////////////////////////////////////////////////////////////////
//
// Code to convert USD paths to scene index paths and nested instance
// indices.

/** selectionSceneIndex.cpp:217-221 */
interface _PrimAndNestedInstanceIndices {
  prim: string
  nestedInstanceIndices: _InstanceIndicesVector
}

function _CopyPrimAndNestedInstanceIndices(p: _PrimAndNestedInstanceIndices): _PrimAndNestedInstanceIndices {
  return { prim: p.prim, nestedInstanceIndices: [...p.nestedInstanceIndices] }
}

/** selectionSceneIndex.cpp:223-245: safe accessor for vector data source. */
function _GetPath(dataSource: HdPathArrayDataSource | undefined, index: number): string {
  if (index < 0) {
    return ''
  }

  if (!dataSource) {
    return ''
  }

  const paths = _ToArray<string>(dataSource.getTypedValue(0.0))

  if (!(index < paths.length)) {
    return ''
  }

  return paths[index]!
}

/** selectionSceneIndex.cpp:247-265: an instancer can have multiple
 *  prototypes stored in an array. Get the index of the given prototype in
 *  that array. */
function _GetIndexOfPrototype(schema: HdInstancerTopologySchema, prototype: string): number {
  const prototypesDs = schema.getPrototypes()
  if (!prototypesDs) {
    return 0
  }
  const prototypes = _ToArray<string>(prototypesDs.getTypedValue(0.0))
  for (let i = 0; i < prototypes.length; i++) {
    if (prototypes[i] === prototype) {
      return i
    }
  }
  return 0
}

/** selectionSceneIndex.cpp:267-279: all instances for the prototype. */
function _GetInstanceIndicesForPrototype(
  instancerTopologySchema: HdInstancerTopologySchema,
  prototypeIndex: number,
): number[] {
  const ds = instancerTopologySchema.getInstanceIndices().getElement(prototypeIndex)
  if (!ds) {
    return []
  }
  return [..._ToArray<number>(ds.getTypedValue(0.0))]
}

/** selectionSceneIndex.cpp:281-329: if the prim in the scene index at
 *  prototypePath is a prototype, return _InstanceIndices to select all
 *  instances of the prototype. If the prim is not a prototype,
 *  _InstanceIndices::instancer will be empty.
 *
 *  A prim is considered a prototype if its instancedBy data source
 *  identifies an instancer (that is a prim with an instancer topology data
 *  source) and the instancer's prototype paths includes the prim itself. */
function _ComputeAllInstanceIndicesForPrototype(
  prototypePath: string,
  sceneIndex: HdSceneIndexBase,
): _InstanceIndices {
  const primSource = sceneIndex.getPrim(prototypePath).dataSource
  const instancedBySchema = HdInstancedBySchema.getFromParent(primSource)
  const instancersDs = instancedBySchema.getPaths()
  if (!instancersDs) {
    return { instancer: '', prototypeIndex: 0, instanceIndices: [] }
  }

  const instancers = _ToArray<string>(instancersDs.getTypedValue(0.0))
  if (instancers.length === 0) {
    return { instancer: '', prototypeIndex: 0, instanceIndices: [] }
  }

  if (instancers.length > 1) {
    TF_CODING_ERROR('Expected at most one instancer')
  }

  const instancer = instancers[0]!
  const instancerTopologySchema = HdInstancerTopologySchema.getFromParent(
    sceneIndex.getPrim(instancer).dataSource)
  const prototypeIndex = _GetIndexOfPrototype(instancerTopologySchema, prototypePath)

  return {
    instancer,
    prototypeIndex,
    instanceIndices: _GetInstanceIndicesForPrototype(instancerTopologySchema, prototypeIndex),
  }
}

/** selectionSceneIndex.cpp:331-376: if a prim in the scene index at
 *  prototypePath is a prototype (see above), returns the nested instance
 *  indices to select all instances of the prototype.
 *
 *  That is, if the instancer instancing the prototype is itself in a
 *  prototype that is instances, and so on... include the instance indices
 *  for each level of nesting. */
function _ComputeAllNestedInstanceIndicesForPrototype(
  prototypePath: string,
  sceneIndex: HdSceneIndexBase,
): _InstanceIndicesVector {
  const result: _InstanceIndices[] = []

  let path = prototypePath

  while (true) {
    const instanceIndices = _ComputeAllInstanceIndicesForPrototype(path, sceneIndex)

    path = instanceIndices.instancer

    if (path === '') {
      result.reverse()
      return result
    }
    result.push(instanceIndices)
  }
}

/** selectionSceneIndex.cpp:378-418 */
function _ComputePiPropagatedPathsAndNestedInstanceIndices(
  primSource: HdContainerDataSource | undefined,
  sceneIndex: HdSceneIndexBase,
): _PrimAndNestedInstanceIndices[] {
  const result: _PrimAndNestedInstanceIndices[] = []

  const schema = UsdImagingUsdPrimInfoSchema.getFromParent(primSource)
  const propagatedPrototypesDs = schema.getPiPropagatedPrototypes()
  if (!propagatedPrototypesDs) {
    return result
  }

  for (const name of propagatedPrototypesDs.getNames()) {
    // HdPathDataSource::Cast
    const ds = propagatedPrototypesDs.Get(name)
    const propagatedPrototypeDs = ds instanceof HdTypedSampledDataSource
      ? ds as HdPathDataSource : undefined
    if (!propagatedPrototypeDs) {
      continue
    }

    const propagatedPrototype: string = propagatedPrototypeDs.getTypedValue(0.0)

    result.push({
      prim: propagatedPrototype,
      nestedInstanceIndices: _ComputeAllNestedInstanceIndicesForPrototype(
        propagatedPrototype, sceneIndex),
    })
  }

  return result
}

/** selectionSceneIndex.cpp:420-460: compute prototype path and a container
 *  data source conforming to HdInstanceIndicesSchema given the instance
 *  schema of an instance prim and the instancer topology schema of the
 *  corresponding instancer prim. */
function _ComputeNiPrototypePathAndInstanceIndicesFromSchemas(
  instance: HdInstanceSchema,
  instancerTopology: HdInstancerTopologySchema,
): [string, _InstanceIndices] {
  let prototypePath = ''

  // Set instancer path.
  const result: _InstanceIndices = { instancer: '', prototypeIndex: 0, instanceIndices: [] }
  const instancerDs = instance.getInstancer()
  if (instancerDs) {
    result.instancer = instancerDs.getTypedValue(0.0)
  }

  const prototypeIndexDs = instance.getPrototypeIndex()
  if (prototypeIndexDs) {
    // Set prototype id, the index into the prototypes of the instancer.
    result.prototypeIndex = prototypeIndexDs.getTypedValue(0.0)

    // Use the index to get the prototype path from the instancer.
    prototypePath = _GetPath(
      instancerTopology.getPrototypes(),
      result.prototypeIndex)
  }

  const instanceIndexDs = instance.getInstanceIndex()
  if (instanceIndexDs) {
    // Note that an instance has a unique instance index, but
    // HdInstanceIndicesSchema can have a list of indices.
    // So we need to wrap it.
    result.instanceIndices = [instanceIndexDs.getTypedValue(0.0)]
  }

  return [prototypePath, result]
}

/** selectionSceneIndex.cpp:462-488: check whether the prim at the given path
 *  is an instance. If yes, return the prototype path and a container data
 *  source conforming to HdInstanceIndicesSchema. */
function _ComputeNiPrototypePathAndInstanceIndices(
  primSource: HdContainerDataSource | undefined,
  sceneIndex: HdSceneIndexBase,
): [string, _InstanceIndices] {
  // Extract instance information.
  const instanceSchema = HdInstanceSchema.getFromParent(primSource)

  const instancerPathDs = instanceSchema.getInstancer()
  if (!instancerPathDs) {
    return ['', { instancer: '', prototypeIndex: 0, instanceIndices: [] }]
  }

  // Extract information of instancer realizing this instance.
  const instancerPath = instancerPathDs.getTypedValue(0.0)
  const instancerTopologySchema = HdInstancerTopologySchema.getFromParent(
    sceneIndex.getPrim(instancerPath).dataSource)

  return _ComputeNiPrototypePathAndInstanceIndicesFromSchemas(
    instanceSchema, instancerTopologySchema)
}

/** selectionSceneIndex.cpp:490-543 */
function _TranslatePathToNiPrototype(
  primSource: HdContainerDataSource | undefined,
  sceneIndex: HdSceneIndexBase,
  primAndInstanceIndices: _PrimAndNestedInstanceIndices,
): boolean {
  const [prototypePath, instanceIndices] =
    _ComputeNiPrototypePathAndInstanceIndices(primSource, sceneIndex)

  if (prototypePath === '') {
    return false
  }

  // If we hit an instance, we need to replace the path to
  // the prototype (in the scene index) that this instance
  // is instancing. More precisely, the prototype that
  // was added by the prototype propagating scene index after
  // instancing aggregation.
  primAndInstanceIndices.prim = prototypePath

  if (instanceIndices.instancer !== '') {
    // If we hit an instance, record the instancing info such
    // as what instancer was added by instance aggregation to
    // realize this instance and what the instance index within
    // that instancer is.
    primAndInstanceIndices.nestedInstanceIndices.push(instanceIndices)
  }

  return true
}

/** selectionSceneIndex.cpp:545-552 */
function _Concat(a: _InstanceIndicesVector, b: _InstanceIndicesVector): _InstanceIndicesVector {
  return [...a, ...b]
}

/** selectionSceneIndex.cpp:554-583: if we hit a prototype instanced by a
 *  point instancer, the propagating scene index will have made a copy of the
 *  prototype. We need to select this copy as well. Add the copy to the
 *  entries. */
function _AddPiPropagatedPrototypes(
  primSource: HdContainerDataSource | undefined,
  sceneIndex: HdSceneIndexBase,
  primAndInstanceIndices: _PrimAndNestedInstanceIndices,
  newPrimAndInstanceIndices: _PrimAndNestedInstanceIndices[],
): void {
  const oldIndices = [...primAndInstanceIndices.nestedInstanceIndices]

  const propagatedPathsAndIndices =
    _ComputePiPropagatedPathsAndNestedInstanceIndices(primSource, sceneIndex)

  for (const propagatedPathAndIndices of propagatedPathsAndIndices) {
    newPrimAndInstanceIndices.push({
      prim: propagatedPathAndIndices.prim,
      nestedInstanceIndices: _Concat(oldIndices, propagatedPathAndIndices.nestedInstanceIndices),
    })
  }
}

/** selectionSceneIndex.cpp:585-616: given the instancing information to
 *  select a prim at primAndInstanceIndices.prim, compute the information to
 *  select the child at primName. */
function _AppendNameToSceneIndexPrimsAndInstanceIndices(
  primAndInstanceIndicesIn: _PrimAndNestedInstanceIndices,
  primName: string,
  sceneIndex: HdSceneIndexBase,
  result: _PrimAndNestedInstanceIndices[],
): void {
  // Passed by value upstream.
  const primAndInstanceIndices = _CopyPrimAndNestedInstanceIndices(primAndInstanceIndicesIn)

  primAndInstanceIndices.prim = _AppendChild(primAndInstanceIndices.prim, primName)
  const prim = primAndInstanceIndices.prim

  const primSource = sceneIndex.getPrim(prim).dataSource

  if (!_TranslatePathToNiPrototype(primSource, sceneIndex, primAndInstanceIndices)) {
    _AddPiPropagatedPrototypes(primSource, sceneIndex, primAndInstanceIndices, result)
  }
  result.push(primAndInstanceIndices)
}

/** selectionSceneIndex.cpp:618-822: given a usd proxy path, computes the
 *  corresponding paths in the scene index and the necessary instancing
 *  information.
 *
 *  Example 1:
 *
 *    def PointInstancer "MyInstancer"
 *    {
 *        point3f[] positions = [(3, 0, 0), (-3, 0, 0)]
 *        int[] protoIndices = [0, 0]
 *        rel prototypes = [
 *            </MyPrototype>
 *        ]
 *    }
 *
 *    def Xform "MyPrototype" {
 *        def Cube "Cube"
 *        {
 *        }
 *    }
 *
 *  The NI and PI prototype propagating scene indices turn this into:
 *
 *    /MyInstancer
 *        primType: instancer
 *        dataSource:
 *            instancerTopology:
 *                prototypes: [ /MyPrototypes/ForInstancer52...82 ]
 *                ...
 *            ...
 *    /MyPrototype
 *        primType: ""
 *        dataSource:
 *            __usdPrimInfo:
 *                piPropagatedPrototypes:
 *                    ForInstacner52...82: /MyPrototype/ForInstancer52...82
 *                ...
 *            ...
 *    /MyPrototype/Cube
 *        primType: cube
 *    /MyPrototype/ForInstancer52...82
 *        primType: ""
 *        dataSource:
 *            instancedBy:
 *                paths: [/MyInstancer]
 *                prototypeRoots: [/MyPrototype/ForInstancer52...82]
 *            ...
 *    /MyPrototype/ForInstancer52...82/Cube
 *        primType: cube
 *        dataSource:
 *            instancedBy:
 *                paths: [/MyInstancer]
 *                prototypeRoots: [/MyPrototype/ForInstancer52...82]
 *            ...
 *
 *  Assume that the UsdPrim /MyPrototype/Cube was selected.
 *
 *  We start with /MyPrototype. Note that it has piPropagatedPrototypes
 *  information. Thus, at this point,
 *  std::vector<_PrimAndNestedInstanceIndice> contains the following
 *  selection information:
 *    prim: /MyPrototype:
 *        nestedInstanceIndices: []
 *    prim: /MyPrototype/ForInstancer52...82:
 *        nestedInstanceIndices: [
 *            instancer: /MyInstancer
 *            prototypeIndex: 0
 *            instanceIndices: [ 0, 1 ]
 *          ]
 *
 *  We then process Cube from /MyPrototype/Cube and append it to the above
 *  selection information. Note that neither /MyPrototype/Cube nor
 *  /MyPrototype/ForInstancer52...82/Cube has any piPropagatedPrototypes
 *  information, so this just becomes:
 *
 *    prim: /MyPrototype/Cube:
 *        nestedInstanceIndices: []
 *    prim: /MyPrototype/ForInstancer52...82/Cube:
 *        nestedInstanceIndices: [
 *            instancer: /MyInstancer
 *            prototypeIndex: 0
 *            instance indices: [ 0, 1 ]
 *          ]
 *
 *  Example 2:
 *
 *    def Xform "MyPrototype"
 *    {
 *       def Cube "cube"
 *       {
 *       }
 *    }
 *
 *    def Xform "Instance1"
 *    (
 *       instanceable = true
 *       references = </MyPrototype>
 *    )
 *    {
 *       double3 xformOp:translate = (0, 4, 0)
 *       uniform token[] xformOpOrder = ["xformOp:translate"]
 *    }
 *
 *  The NI and PI prototype propagating scene indices turn this into:
 *
 *    /Instance1
 *        primType: ""
 *        dataSource:
 *            instance:
 *                instancer: /UsdNiPropagatedPrototypes/NoPrimvars_NoMaterialBindings/__Prototype_1/UsdNiInstancer
 *                prototypeIndex: 0
 *                instanceIndex: 0
 *            ...
 *    /UsdNiPropagatedPrototypes
 *    /UsdNiPropagatedPrototypes/NoPrimvars_NoMaterialBindings
 *    /UsdNiPropagatedPrototypes/NoPrimvars_NoMaterialBindings/__Prototype_1
 *        primType: ""
 *    /UsdNiPropagatedPrototypes/NoPrimvars_NoMaterialBindings/__Prototype_1/UsdNiInstancer
 *        primType: instancer
 *        dataSource:
 *            instancerTopology:
 *                instanceLocations: [ /Instance1 ]
 *                prototypes: [ /UsdNiPropagatedPrototypes/NoPrimvars_NoMaterialBindings/__Prototype_1/UsdNiInstancer/UsdNiPrototype ]
 *                ...
 *            ...
 *    /UsdNiPropagatedPrototypes/NoPrimvars_NoMaterialBindings/__Prototype_1/UsdNiInstancer/UsdNiPrototype
 *        primType: ""
 *    /UsdNiPropagatedPrototypes/NoPrimvars_NoMaterialBindings/__Prototype_1/UsdNiInstancer/UsdNiPrototype/cube
 *        primType: cube
 *
 *  Assume we select /Instance1/Cube in USD.
 *
 *  We start with /Instance1. The prim at that path has an instance data
 *  source. Thus, /Instance1 is translated into the following
 *  std::vector<_PrimAndNestedInstanceIndice>:
 *
 *    prim: /UsdNiPropagatedPrototypes/NoPrimvars_NoMaterialBindings/__Prototype_1/UsdNiInstancer/UsdNiPrototype
 *        nestedInstanceIndices: [
 *            instancer: /UsdNiPropagatedPrototypes/NoPrimvars_NoMaterialBindings/__Prototype_1/UsdNiInstancer
 *            prototypeIndex: 0
 *            instanceIndices: [ 0 ]
 *
 *  Next, we process Cube from /Instance1/Cube. Since
 *  /UsdNiPropagatedPrototypes/NoPrimvars_NoMaterialBindings/__Prototype_1/UsdNiInstancer/UsdNiPrototype/cube
 *  has no pi propagated or instance data source, we simply append "Cube":
 *
 *    prim: /UsdNiPropagatedPrototypes/NoPrimvars_NoMaterialBindings/__Prototype_1/UsdNiInstancer/UsdNiPrototype/Cube
 *        nestedInstanceIndices: [
 *            instancer: /UsdNiPropagatedPrototypes/NoPrimvars_NoMaterialBindings/__Prototype_1/UsdNiInstancer
 *            prototypeIndex: 0
 *            instanceIndices: [ 0 ] */
function _ComputeSceneIndexPrimsAndInstanceIndices(
  usdPath: string,
  sceneIndex: HdSceneIndexBase,
): _PrimAndNestedInstanceIndices[] {
  const root: _PrimAndNestedInstanceIndices = { prim: '/', nestedInstanceIndices: [] }

  let result: _PrimAndNestedInstanceIndices[] = [root]

  // Iterate through elements of path and build up path in scene index,
  // replacing the path if we hit a native instance.
  for (const usdPrefix of _GetPrefixes(usdPath)) {
    const primName = _GetNameToken(usdPrefix)

    const newResult: _PrimAndNestedInstanceIndices[] = []

    for (const primAndIndices of result) {
      _AppendNameToSceneIndexPrimsAndInstanceIndices(
        primAndIndices, primName, sceneIndex, newResult)
    }

    result = newResult
  }

  return result
}

/** selectionSceneIndex.cpp:824-831 */
function _IsGenerativeProcedural(prim: HdSceneIndexPrim): boolean {
  // Technically, generative procedurals do not need to have this type.
  // The generativeProceduralResolvingSceneIndex can be configured to
  // look for specific types.
  return prim.primType === UsdHydraTokens.hydraGenerativeProcedural
}

/** selectionSceneIndex.cpp:833-846 */
class _Node {
  prim = ''
  skipped = false
  niPrototype = ''
  niInstancer = ''
  niPrototypeIndex = 0
  niInstanceIndices: number[] = []
  supportsSelection = false
  piPropagatedSeeds: _PrimAndNestedInstanceIndices[] = []
  childPrims: string[] = []
  childBegin = 0
  childEnd = 0
}

/** selectionSceneIndex.cpp:848-910 */
function _ClassifyNodes(
  begin: number,
  end: number,
  seed: _PrimAndNestedInstanceIndices,
  sceneIndex: HdSceneIndexBase,
  nodes: _Node[],
): void {
  for (let i = begin; i < end; ++i) {
    const node = nodes[i]!

    if (_GetNameToken(node.prim) === UsdImagingTokens.niPropagatedPrototypesScope) {
      //
      // Do not descend into the NI propagated prototypes here.
      //
      // That is: the fact that the user selects a namespace ancestor
      // of a NI propagated prototype is accidental. The relevant
      // information for populating the selection schema of the
      // geometry in a NI propagated prototype is which corresponding
      // instances are selected. See HYD-3646.
      //
      node.skipped = true
      continue
    }

    const prim = sceneIndex.getPrim(node.prim)

    const [prototypePath, instanceIndices] =
      _ComputeNiPrototypePathAndInstanceIndices(prim.dataSource, sceneIndex)
    const isNativeInstance = prototypePath !== ''

    if (isNativeInstance) {
      node.niPrototype = prototypePath
      node.niInstancer = instanceIndices.instancer
      node.niPrototypeIndex = instanceIndices.prototypeIndex
      node.niInstanceIndices = instanceIndices.instanceIndices
    } else {
      const primAndNestedInstanceIndices = _CopyPrimAndNestedInstanceIndices(seed)
      primAndNestedInstanceIndices.prim = node.prim

      // Check if this prim is the prototype of a point instancer.
      // If yes, note the corresponding propagated prototype to add to
      // the seeds below.
      _AddPiPropagatedPrototypes(
        prim.dataSource,
        sceneIndex,
        primAndNestedInstanceIndices,
        node.piPropagatedSeeds)

      node.supportsSelection = HdPrimTypeIsGprim(prim.primType) ||
        _IsGenerativeProcedural(prim)
    }

    node.childPrims = sceneIndex.getChildPrimPaths(node.prim)
  }
}

/** selectionSceneIndex.cpp:912-957 */
function _TraverseDescendants(
  seed: _PrimAndNestedInstanceIndices,
  sceneIndex: HdSceneIndexBase,
): _Node[] {
  const nodes: _Node[] = [new _Node()]
  nodes[0]!.prim = seed.prim

  let levelBegin = 0
  let levelEnd = nodes.length

  while (levelBegin < levelEnd) {
    // Upstream classifies levels of at least _grainSize (32) prims with
    // WorkParallelForN; serial here.
    _ClassifyNodes(levelBegin, levelEnd, seed, sceneIndex, nodes)

    for (let i = levelBegin; i < levelEnd; ++i) {
      const childPrims = nodes[i]!.childPrims
      nodes[i]!.childPrims = []

      const childBegin = nodes.length
      for (const childPrim of childPrims) {
        const child = new _Node()
        child.prim = childPrim
        nodes.push(child)
      }
      nodes[i]!.childBegin = childBegin
      nodes[i]!.childEnd = nodes.length
    }

    levelBegin = levelEnd
    levelEnd = nodes.length
  }

  return nodes
}

/** std::tuple<SdfPath, SdfPath, int> operator< */
function _NiInstanceSignatureLess(
  a: [string, string, number], b: [string, string, number],
): number {
  const c0 = _PathLess(a[0], b[0])
  if (c0 !== 0) return c0
  const c1 = _PathLess(a[1], b[1])
  if (c1 !== 0) return c1
  return a[2] - b[2]
}

/** selectionSceneIndex.cpp:959-1064: for each seed, traverses the name space
 *  children and collects them recursively as follows:
 *  - If it is just a normal prim, add it to the result.
 *  - It it is a normal prim but also the prototype of a point instancer,
 *    add the corresponding propagated prototype to the result.
 *  - If it is a native instance, aggregate them by prototype and instancer
 *    and add the prototype to the result with the respective instance
 *    indices.
 *
 *  Traversal is wavefront (serial in depth, parallel in breadth). This
 *  allows us to parallelize while still skipping descending into propagated
 *  native prototypes. */
function _ExpandToDescendants(
  seeds: _PrimAndNestedInstanceIndices[],
  sceneIndex: HdSceneIndexBase,
): _PrimAndNestedInstanceIndices[] {
  const result: _PrimAndNestedInstanceIndices[] = []

  // Breadth first recursion as described above.
  let i = 0
  while (i < seeds.length) {
    // std::map<NiInstanceSignature, VtIntArray>: (propagated native
    // prototype, instancer, prototype index) -> instance indices. Iterated
    // in key order below.
    const niInstanceSignatureToInstanceIndices =
      new Map<string, { sig: [string, string, number], indices: number[] }>()

    const seed = _CopyPrimAndNestedInstanceIndices(seeds[i]!)
    const nodes = _TraverseDescendants(seed, sceneIndex)
    const stack: number[] = [0]

    while (stack.length > 0) {
      const node = nodes[stack.pop()!]!

      for (let ci = node.childEnd; ci > node.childBegin; --ci) {
        stack.push(ci - 1)
      }

      if (node.skipped) {
        continue
      }

      if (node.niPrototype !== '') {
        // Aggregate native instances.
        const sig: [string, string, number] =
          [node.niPrototype, node.niInstancer, node.niPrototypeIndex]
        const key = JSON.stringify(sig)
        let entry = niInstanceSignatureToInstanceIndices.get(key)
        if (!entry) {
          entry = { sig, indices: [] }
          niInstanceSignatureToInstanceIndices.set(key, entry)
        }
        for (const index of node.niInstanceIndices) {
          entry.indices.push(index)
        }
        continue
      }

      for (const piPropagatedSeed of node.piPropagatedSeeds) {
        seeds.push(piPropagatedSeed)
      }

      if (node.supportsSelection) {
        const primAndNestedInstanceIndices = _CopyPrimAndNestedInstanceIndices(seed)
        primAndNestedInstanceIndices.prim = node.prim
        result.push(primAndNestedInstanceIndices)
      }
    }

    // Process aggregated native instances.
    const sorted = [...niInstanceSignatureToInstanceIndices.values()]
      .sort((a, b) => _NiInstanceSignatureLess(a.sig, b.sig))
    for (const it of sorted) {
      const primAndNestedInstanceIndices = _CopyPrimAndNestedInstanceIndices(seed)
      const [niPropagatedPrototype, instancer, prototypeIndex] = it.sig

      primAndNestedInstanceIndices.prim = niPropagatedPrototype
      primAndNestedInstanceIndices.nestedInstanceIndices.push({
        instancer,
        prototypeIndex,
        instanceIndices: it.indices,
      })

      seeds.push(primAndNestedInstanceIndices)
    }

    ++i
  }

  return result
}

/** selectionSceneIndex.h:25-74: a simple scene index adding
 *  HdSelectionsSchema to all prims selected with AddSelection. */
export class UsdImagingSelectionSceneIndex extends HdSingleInputFilteringSceneIndexBase {
  private readonly _selectionInfo: _SelectionInfo

  /** selectionSceneIndex.cpp:1070-1077 */
  static new(inputSceneIndex: HdSceneIndexBase): UsdImagingSelectionSceneIndex {
    return new UsdImagingSelectionSceneIndex(inputSceneIndex)
  }

  /** selectionSceneIndex.cpp:1079-1085 */
  private constructor(inputSceneIndex: HdSceneIndexBase) {
    super(inputSceneIndex)
    this._selectionInfo = new _SelectionInfo()
  }

  /** selectionSceneIndex.cpp:1089-1102 */
  getPrim(primPath: string): HdSceneIndexPrim {
    const result = this._getInputSceneIndex().getPrim(primPath)
    if (!result.dataSource) {
      return result
    }

    return {
      primType: result.primType,
      dataSource: _PrimSource.new(result.dataSource, this._selectionInfo, primPath),
    }
  }

  /** selectionSceneIndex.cpp:1104-1109 */
  getChildPrimPaths(primPath: string): string[] {
    return this._getInputSceneIndex().getChildPrimPaths(primPath)
  }

  /** selectionSceneIndex.cpp:1111-1162: given a path (including usd proxy
   *  path inside a native instance) of a USD prim, determine the
   *  corresponding prim in the Usd scene index (filtered by the
   *  UsdImagingNiPrototypePropagatingSceneIndex) and populate its selections
   *  data source. */
  addSelection(usdPath: string): void {
    // From the USD path, compute the corresponding selections for
    // the paths in the scene index - taking into account, e.g.,
    // that selecting a native instance in USD should translate into
    // selecting the prototype and its descendants and add to the
    // selections schema the index of the native instance.
    const primsAndIndices = _ExpandToDescendants(
      _ComputeSceneIndexPrimsAndInstanceIndices(
        usdPath,
        this._getInputSceneIndex()),
      this._getInputSceneIndex())

    // SdfPathSet
    const dirtiedPrims = new Set<string>()

    for (const primAndIndices of primsAndIndices) {
      const prim = primAndIndices.prim
      let selections = this._selectionInfo.primToSelections.get(prim)
      if (!selections) {
        selections = []
        this._selectionInfo.primToSelections.set(prim, selections)
      }
      selections.push({ nestedInstanceIndices: primAndIndices.nestedInstanceIndices })
      dirtiedPrims.add(prim)
    }

    if (dirtiedPrims.size === 0) {
      return
    }

    const entries: DirtiedPrimEntry[] = []
    for (const dirtiedPrim of [...dirtiedPrims].sort(_PathLess)) {
      entries.push({
        primPath: dirtiedPrim,
        dirtyLocators: new HdDataSourceLocatorSet([HdSelectionsSchema.getDefaultLocator()]),
      })
    }

    this._sendPrimsDirtied(entries)
  }

  /** selectionSceneIndex.cpp:1164-1195: reset the scene index selection
   *  state. */
  clearSelection(): void {
    if (this._selectionInfo.primToSelections.size === 0) {
      return
    }

    const entries: DirtiedPrimEntry[] = []
    if (this._isObserved()) {
      // std::map<SdfPath, _Selections> iteration order.
      for (const prim of [...this._selectionInfo.primToSelections.keys()].sort(_PathLess)) {
        entries.push({
          primPath: prim,
          dirtyLocators: new HdDataSourceLocatorSet([HdSelectionsSchema.getDefaultLocator()]),
        })
      }
    }

    this._selectionInfo.primToSelections.clear()

    if (entries.length > 0) {
      this._sendPrimsDirtied(entries)
    }
  }

  /** selectionSceneIndex.cpp:1197-1203 */
  protected _primsAdded(_sender: HdSceneIndexBase, entries: AddedPrimEntry[]): void {
    this._sendPrimsAdded(entries)
  }

  /** selectionSceneIndex.cpp:1205-1211 */
  protected _primsDirtied(_sender: HdSceneIndexBase, entries: DirtiedPrimEntry[]): void {
    this._sendPrimsDirtied(entries)
  }

  /** selectionSceneIndex.cpp:1225-1244 (with _DeletePrefix,
   *  selectionSceneIndex.cpp:1213-1223) */
  protected _primsRemoved(_sender: HdSceneIndexBase, entries: RemovedPrimEntry[]): void {
    if (this._selectionInfo.primToSelections.size > 0) {
      for (const entry of entries) {
        for (const prim of [...this._selectionInfo.primToSelections.keys()]) {
          if (_HasPrefix(prim, entry.primPath)) {
            this._selectionInfo.primToSelections.delete(prim)
          }
        }
      }
    }

    this._sendPrimsRemoved(entries)
  }
}
