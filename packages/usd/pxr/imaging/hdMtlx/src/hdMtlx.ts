// Ported from OpenUSD 26.11.1: pxr/imaging/hdMtlx/hdMtlx.cpp,
//  pxr/imaging/hdMtlx/hdMtlx.h, pxr/usd/usdMtlx/utils.cpp
// Copyright 2018, 2021 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/imaging/hdMtlx/hdMtlx.{h,cpp} (OpenUSD 26.11.1), against
// the vendored MaterialX 1.39.5 (packages/materialx/PROVENANCE.md).
//
// Divergences (each also noted at its site):
// - UsdMtlxSearchPaths() (usd/usdMtlx/utils.cpp:157-233) is computed here:
//   this repository's usdMtlx has no search paths. The environment
//   variables are read the same way; the standard library directory that
//   upstream discovers at build time (PXR_MATERIALX_STDLIB_DIR) is the
//   MaterialX 1.39.5 libraries (@mtlx/libraries) mounted in @mtlx/format's
//   virtual file system at HdMtlxStdLibraryRoot.
// - SdfPath arguments and HdMtlxTexturePrimvarData's path sets are SdfPath
//   strings; its std::map / std::set members are a Map and Sets in insertion
//   order (consumers that need upstream's sorted order sort them).
// - VtValue arguments: a parameter value is a VtValue (typescript-usd/vt), or
//   a bare value as some data sources hand them out (materialNetworkInterface.ts).
//   HdMtlxConvertToString classifies a bare value by its JS type (see there).
// - The string parameter value is set on a MaterialX input as
//   InterfaceElement::setInputValue<std::string> does (MaterialXCore
//   Interface.h:664-673, Element.h:1017-1021): the type is set and the string
//   stored verbatim. The TS setInputValue reformats through its value types.
// - TRACE_FUNCTION_SCOPE is not ported (no trace collector here).
// - MTLX_COMBINED_VERSION is MaterialX 1.39.5 (>= 13900), so only the 1.39
//   branches are ported.

import {
  DISPLACEMENT_SHADER_TYPE_STRING,
  EMPTY_STRING,
  Exception as MxException,
  NodeGraph,
  SURFACE_SHADER_TYPE_STRING,
  createDocument,
  type Document,
  type Element,
  type Input,
  type Node,
  type NodeDef,
  type Output,
} from '@mtlx/core'
import {
  FilePath,
  FileSearchPath,
  VirtualFileSystem,
  XmlWriteOptions,
  getVirtualFileSystem,
  loadLibraries,
  readFromXmlString,
  setVirtualFileSystem,
  writeToXmlFile,
} from '@mtlx/format'
import { Debug as TfDebug, TfDiagnosticMgr, TfStreamFloat, Token as TfToken } from 'typescript-usd/tf'
import { Value as VtValue } from 'typescript-usd/vt'
import {
  Matrix3d as GfMatrix3d,
  Matrix4d as GfMatrix4d,
  Vec2f as GfVec2f,
  Vec3f as GfVec3f,
  Vec4f as GfVec4f,
} from 'typescript-usd/gf'
import { AssetPath as SdfAssetPath } from 'typescript-usd/sdf'
import { SdfPath } from 'typescript-usd/sdf/path'
import { Registry as SdrRegistry } from 'typescript-usd/sdr'
import { ResolvedPath as ArResolvedPath } from 'typescript-usd/ar'
import { _ArOpenAssetSync } from 'typescript-usd/ar/_internal'
import {
  MaterialNetwork2Interface as HdMaterialNetwork2Interface,
  type MaterialNetwork2 as HdMaterialNetwork2,
  type MaterialNode2 as HdMaterialNode2,
  type MaterialNetworkInterface as HdMaterialNetworkInterface,
  type MaterialNetworkInterfaceInputConnection as HdMaterialNetworkInterfaceInputConnection,
} from 'typescript-usd/hd'
import { HdMtlxDebugCodes } from './debugCodes.ts'
import { HdMtlxTokens } from './tokens.ts'
import { mountMaterialXLibraries } from '@mtlx/libraries'

/** Where the bundled MaterialX libraries are mounted in the virtual file
 *  system (the stand-in for PXR_MATERIALX_STDLIB_DIR). */
export const HdMtlxStdLibraryRoot = '/mtlx/libraries'

let _librariesMounted = false
function _MountStdLibraries(): void {
  if (_librariesMounted) return
  let vfs = getVirtualFileSystem()
  if (!vfs) {
    vfs = VirtualFileSystem.create('/mtlx')
    setVirtualFileSystem(vfs)
  }
  mountMaterialXLibraries(vfs, HdMtlxStdLibraryRoot)
  _librariesMounted = true
}

/** TfGetenv */
function _Getenv(name: string): string {
  return (globalThis as { process?: { env?: Record<string, string | undefined> } })
    .process?.env?.[name] ?? ''
}

/** usdMtlx/utils.cpp:156-164 (_GetSearchPathsFromEnvVar) */
function _GetSearchPathsFromEnvVar(name: string): string[] {
  const paths = _Getenv(name)
  // TfStringSplit(paths, ARCH_PATH_LIST_SEP)
  return paths !== '' ? paths.split(':') : []
}

/** usdMtlx/utils.cpp:209-233: UsdMtlxSearchPaths() =
 *  PXR_MTLX_PLUGIN_SEARCH_PATHS, then PXR_MTLX_STDLIB_SEARCH_PATHS, then
 *  the standard library directory. (The plugin resource library of
 *  utils.cpp:189-204 is not part of this repository.) */
function _UsdMtlxSearchPaths(): string[] {
  _MountStdLibraries()
  return [
    ..._GetSearchPathsFromEnvVar('PXR_MTLX_PLUGIN_SEARCH_PATHS'),
    ..._GetSearchPathsFromEnvVar('PXR_MTLX_STDLIB_SEARCH_PATHS'),
    HdMtlxStdLibraryRoot,
  ]
}

/** hdMtlx.cpp:76-85 */
function _ComputeSearchPaths(): FileSearchPath {
  const searchPaths = new FileSearchPath()
  for (const path of _UsdMtlxSearchPaths()) {
    searchPaths.append(new FilePath(path))
  }
  return searchPaths
}

let _searchPaths: FileSearchPath | null = null
/** hdMtlx.cpp:87-92. Return the MaterialX search paths. In order, this
 *  includes:
 *  - Paths set in the environment variable 'PXR_MTLX_PLUGIN_SEARCH_PATHS'
 *  - Paths set in the environment variable 'PXR_MTLX_STDLIB_SEARCH_PATHS'
 *  - Path to the MaterialX standard library discovered at build time. */
export function HdMtlxSearchPaths(): FileSearchPath {
  _searchPaths ??= _ComputeSearchPaths()
  return _searchPaths
}

/** hdMtlx.cpp:94-101 */
function _ComputeStdLibraries(): Document {
  const libraryFolders: string[] = []
  const stdLibraries = createDocument()
  loadLibraries(libraryFolders, HdMtlxSearchPaths(), stdLibraries)
  return stdLibraries
}

let _stdLibraries: Document | null = null
/** hdMtlx.cpp:103-108. Return a MaterialX document with the stdlibraries
 *  loaded using the above search paths. */
export function HdMtlxStdLibraries(): Document {
  _stdLibraries ??= _ComputeStdLibraries()
  return _stdLibraries
}

/** hdMtlx.cpp:120-131 */
export function HdMtlxCreateNameFromPath(path: string): string {
  let pathName = path.replaceAll('/', '_')
  // Strip leading underscore from root
  if (pathName.startsWith('_')) {
    pathName = pathName.substring(1)
  }
  return pathName
}

// hdMtlx.cpp:43-54
const _tokens = {
  texcoord: 'texcoord',
  geompropvalue: 'geompropvalue',
  geomprop: 'geomprop',
  defaultInput: 'default',
  filename: 'filename',
  ND_surface: 'ND_surface',
  typeName: 'typeName',
  mtlx: 'mtlx',
  mtlxVersion: 'mtlx:version',
} as const

// hdMtlx.cpp:56-78
const _usdTypeTokens = {
  boolType: 'bool',
  intType: 'int',
  intarray: 'intarray',
  floatType: 'float',
  floatarray: 'floatarray',
  color3f: 'color3f',
  color3fArray: 'color3fArray',
  color4f: 'color4f',
  color4fArray: 'color4fArray',
  float2: 'float2',
  float2Array: 'float2Array',
  float3: 'float3',
  float3Array: 'float3Array',
  float4: 'float4',
  float4Array: 'float4Array',
  matrix3d: 'matrix3d',
  matrix4d: 'matrix4d',
  asset: 'asset',
  string: 'string',
  stringArray: 'stringArray',
} as const

// SdfFieldKeys->ColorSpace (sdf/schema.h)
const _SdfFieldKeysColorSpace = 'colorSpace'

/** TF_WARN (tf/diagnostic.h) */
function TF_WARN(message: string): void {
  TfDiagnosticMgr.GetInstance().postWarning(message)
}

/** TF_DEBUG(code).Msg(...): the message is only built when enabled. */
function TF_DEBUG(code: string, message: () => string): void {
  if (TfDebug.isEnabled(code)) {
    TfDebug.msg(code, message())
  }
}

/** hdMtlx.cpp:114-122. Return the MaterialX Node string with the namespace
 *  prepended when present */
function _GetMxNodeString(mxNodeDef: NodeDef): string {
  // If the nodedef is in a namespace, add it to the node string
  return mxNodeDef.hasNamespace()
    ? mxNodeDef.getNamespace() + ':' + mxNodeDef.getNodeString()
    : mxNodeDef.getNodeString()
}

/** `std::ostream << double` with the default flags (%g, precision 6), as
 *  hdMtlx.cpp streams the GfVec/GfMatrix components (a float component is
 *  widened to double). */
function _OstreamDouble(x: number): string {
  if (Number.isNaN(x)) return 'nan'
  if (!Number.isFinite(x)) return x < 0 ? '-inf' : 'inf'
  if (x === 0) return Object.is(x, -0) ? '-0' : '0'
  const exp = Math.floor(Math.log10(Math.abs(Number(x.toPrecision(6)))))
  if (exp < -4 || exp >= 6) {
    let [m, e] = x.toExponential(5).split('e') as [string, string]
    if (m.includes('.')) m = m.replace(/0+$/, '').replace(/\.$/, '')
    const en = Number(e)
    return `${m}e${en < 0 ? '-' : '+'}${String(Math.abs(en)).padStart(2, '0')}`
  }
  let f = x.toFixed(Math.max(0, 5 - exp))
  if (f.includes('.')) f = f.replace(/0+$/, '').replace(/\.$/, '')
  return f
}

/** The C++ type a parameter value holds, by VtValue::GetTypeName for a
 *  VtValue, and by JS type for a bare value (divergence: a bare JS number
 *  carries no int/float distinction and is taken as a float; TfStreamFloat
 *  prints an integral float as an int would be printed). */
function _HeldTypeName(value: unknown): string {
  if (value instanceof VtValue) {
    // VtValue().GetTypeName() is "void" upstream.
    if (value.IsEmpty()) return 'void'
    const name = value.getTypeName()
    return name === 'TfToken' ? 'token' : name
  }
  if (typeof value === 'boolean') return 'bool'
  if (typeof value === 'number') return 'float'
  if (typeof value === 'string') return 'string'
  if (value instanceof GfVec2f) return 'GfVec2f'
  if (value instanceof GfVec3f) return 'GfVec3f'
  if (value instanceof GfVec4f) return 'GfVec4f'
  if (value instanceof GfMatrix3d) return 'GfMatrix3d'
  if (value instanceof GfMatrix4d) return 'GfMatrix4d'
  if (value instanceof SdfAssetPath) return 'SdfAssetPath'
  if (value === undefined || value === null) return 'void'
  return (value as object).constructor?.name ?? typeof value
}

function _HeldValue<T>(value: unknown): T {
  return (value instanceof VtValue ? value.UncheckedGet<T>() : value) as T
}

/** hdMtlx.cpp:136-202. Converts the HdParameterValue to a string MaterialX
 *  can understand */
export function HdMtlxConvertToString(hdParameterValue: VtValue | unknown): string {
  const heldType = _HeldTypeName(hdParameterValue)
  if (heldType === 'bool') {
    return _HeldValue<boolean>(hdParameterValue) ? 'true' : 'false'
  }
  else if (heldType === 'int' || heldType === 'float') {
    // valStream << hdParameterValue: VtStreamOut (vt/streamOut.cpp:58-62)
    // streams a float through TfStreamFloat, an int as an int.
    const v = _HeldValue<number>(hdParameterValue)
    return heldType === 'float' ? TfStreamFloat(v) : String(v)
  }
  else if (heldType === 'GfVec2f') {
    const value = _HeldValue<GfVec2f>(hdParameterValue).data
    return _OstreamDouble(value[0]!) + ', ' + _OstreamDouble(value[1]!)
  }
  else if (heldType === 'GfVec3f') {
    const value = _HeldValue<GfVec3f>(hdParameterValue).data
    return _OstreamDouble(value[0]!) + ', ' + _OstreamDouble(value[1]!) + ', ' +
      _OstreamDouble(value[2]!)
  }
  else if (heldType === 'GfVec4f') {
    const value = _HeldValue<GfVec4f>(hdParameterValue).data
    return _OstreamDouble(value[0]!) + ', ' + _OstreamDouble(value[1]!) + ', ' +
      _OstreamDouble(value[2]!) + ', ' + _OstreamDouble(value[3]!)
  }
  else if (heldType === 'GfMatrix3d') {
    const value = _HeldValue<GfMatrix3d>(hdParameterValue)
    let valStream = ''
    for (let i = 0; i < 3; ++i) {
      valStream += _OstreamDouble(value.getElement(i, 0)) + ', ' +
        _OstreamDouble(value.getElement(i, 1)) + ', ' +
        _OstreamDouble(value.getElement(i, 2)) + ',  '
    }
    return valStream
  }
  else if (heldType === 'GfMatrix4d') {
    const value = _HeldValue<GfMatrix4d>(hdParameterValue)
    let valStream = ''
    for (let i = 0; i < 4; ++i) {
      valStream += _OstreamDouble(value.getElement(i, 0)) + ', ' +
        _OstreamDouble(value.getElement(i, 1)) + ', ' +
        _OstreamDouble(value.getElement(i, 2)) + ', ' +
        _OstreamDouble(value.getElement(i, 3)) + ',  '
    }
    return valStream
  }
  else if (heldType === 'SdfAssetPath') {
    return _HeldValue<SdfAssetPath>(hdParameterValue).getAssetPath()
  }
  else if (heldType === 'string') {
    return _HeldValue<string>(hdParameterValue)
  }
  else if (heldType === 'token') {
    return _HeldValue<string>(hdParameterValue)
  }
  else {
    TF_WARN(`Unsupported Parameter Type '${heldType}'`)
    return EMPTY_STRING
  }
}

/** hdMtlx.h:46-53. Storing MaterialX-Hydra texture and primvar information */
export class HdMtlxTexturePrimvarData {
  /** Mx-Hd texture name mapping */
  mxHdTextureMap: Map<string, Set<string>> = new Map()
  /** Paths to HdTexture Nodes */
  hdTextureNodes: Set<string> = new Set()
  /** Paths to HdPrimvar nodes */
  hdPrimvarNodes: Set<string> = new Set()
}

/** hdMtlx.cpp:204-215 */
function _UsesTexcoordNode(mxNodeDef: NodeDef): boolean {
  const impl = mxNodeDef.getImplementation()
  if (impl && impl instanceof NodeGraph) {
    const nodegraph = impl
    if (nodegraph.getNodes(_tokens.texcoord).length !== 0) {
      return true
    }
  }
  return false
}

/** hdMtlx.cpp:217-239. Returns the geompropvalue/geompropvalueuniform node
 *  within the given nodeDef's implementation nodegraph, or null if the
 *  implementation is not a nodegraph or contains no such node. */
function _GetWrappedGeompropValueNode(mxNodeDef: NodeDef | null): Node | null {
  if (!mxNodeDef) {
    return null
  }
  const impl = mxNodeDef.getImplementation()
  if (!impl || !(impl instanceof NodeGraph)) {
    return null
  }
  const nodegraph = impl
  for (const node of nodegraph.getNodes()) {
    const category = node.getCategory()
    if (category === 'geompropvalue' ||
      category === 'geompropvalueuniform') {
      return node
    }
  }
  return null
}

/** hdMtlx.cpp:241-258. Returns the name of the node input that the wrapped
 *  geompropvalue binds to the given internal input via 'interfacename'. If
 *  there is no wrapper binding (native geompropvalue nodes, or anything
 *  else), falls back to the internal input name itself, which is the name
 *  native geompropvalue nodes use directly. */
function _GetPrimvarInputName(mxNodeDef: NodeDef | null, geompropInputName: string): TfToken {
  const geompropNode = _GetWrappedGeompropValueNode(mxNodeDef)
  if (geompropNode) {
    const input = geompropNode.getInput(geompropInputName)
    if (input && input.getInterfaceName() !== '') {
      return TfToken(input.getInterfaceName())
    }
  }
  return TfToken(geompropInputName)
}

/** hdMtlx.cpp:260-264. Returns true if the given nodeDef's implementation is
 *  a nodegraph that contains a 'geompropvalue' or 'geompropvalueuniform'
 *  node, i.e. the node reads a primvar (for example UsdPrimvarReader). Native
 *  'geompropvalue' nodes are not detected here since their implementation is
 *  source code rather than a nodegraph. */
export function HdMtlxIsPrimvarReaderNodeDef(mxNodeDef: NodeDef | null): boolean {
  return _GetWrappedGeompropValueNode(mxNodeDef) !== null
}

/** hdMtlx.cpp:266-270. Returns the node input that carries the primvar name
 *  for a primvar-reading node. */
export function HdMtlxGetPrimvarNameInputName(mxNodeDef: NodeDef | null): TfToken {
  return _GetPrimvarInputName(mxNodeDef, _tokens.geomprop)
}

/** hdMtlx.cpp:272-276. Returns the node input that carries the fallback
 *  value for a primvar-reading node. */
export function HdMtlxGetPrimvarDefaultInputName(mxNodeDef: NodeDef | null): TfToken {
  return _GetPrimvarInputName(mxNodeDef, _tokens.defaultInput)
}

/** hdMtlx.cpp:278-306 */
function _ConvertToMtlxType(usdTypeName: string): string {
  const _typeTable = new Map<string, string>([
    [_usdTypeTokens.boolType, 'boolean'],
    [_usdTypeTokens.intType, 'integer'],
    [_usdTypeTokens.intarray, 'integerarray'],
    [_usdTypeTokens.floatType, 'float'],
    [_usdTypeTokens.floatarray, 'floatarray'],
    [_usdTypeTokens.color3f, 'color3'],
    [_usdTypeTokens.color3fArray, 'color3array'],
    [_usdTypeTokens.color4f, 'color4'],
    [_usdTypeTokens.color4fArray, 'color4array'],
    [_usdTypeTokens.float2, 'vector2'],
    [_usdTypeTokens.float2Array, 'vector2array'],
    [_usdTypeTokens.float3, 'vector3'],
    [_usdTypeTokens.float3Array, 'vector3array'],
    [_usdTypeTokens.float4, 'vector4'],
    [_usdTypeTokens.float4Array, 'vector4array'],
    [_usdTypeTokens.matrix3d, 'matrix33'],
    [_usdTypeTokens.matrix4d, 'matrix44'],
    [_usdTypeTokens.asset, 'filename'],
    [_usdTypeTokens.string, 'string'],
    [_usdTypeTokens.stringArray, 'stringarray'],
  ])
  return _typeTable.get(usdTypeName) ?? ''
}

/** hdMtlx.cpp:308-326 */
function _GetMxInputType(
  mxNodeDef: NodeDef | null,
  mxInputName: string,
  usdTypeName: string = TfToken.Empty,
): string {
  // If given, use the usdTypeName to get the materialX input type
  if (usdTypeName !== '') {
    return _ConvertToMtlxType(usdTypeName)
  }

  // Otherwise look to the nodedef to get the input type
  let mxInputType = ''
  // Upstream dereferences mxNodeDef unconditionally (a terminal whose
  // NodeDef is not found reaches here with a null NodeDef).
  const mxInput = mxNodeDef!.getActiveInput(mxInputName)
  if (mxInput) {
    mxInputType = mxInput.getType()
  }
  return mxInputType
}

/** hdMtlx.cpp:328-340. NodeDef names may change between MaterialX versions,
 *  this function returns the nodeDef name appropriate for the version of
 *  MaterialX being used. */
export function HdMtlxGetNodeDefName(prevMxNodeDefName: string): string {
  let mxNodeDefName = prevMxNodeDefName
  // For nodeDef name changes between MaterialX v1.38 and the current version
  // (MTLX_COMBINED_VERSION >= 13900)
  // The normalmap nodeDef name changed in v1.39
  if (prevMxNodeDefName === 'ND_normalmap') {
    mxNodeDefName = 'ND_normalmap_float'
  }
  return mxNodeDefName
}

/** mx::loadLibrary(assetPath, doc) (MaterialXFormat/Util.cpp) as
 *  _GetNodeDef calls it: the document at the resolved implementation URI of
 *  an Sdr node, read and imported into `doc`. Divergence: the file is read
 *  through Ar (ar/src/prefetchedAssets.ts _ArOpenAssetSync: a host file, or
 *  an asset read ahead, as a stage reads ahead the mtlx sourceAsset of a
 *  custom node, usdMtlx/src/document.ts) rather than MaterialX's file I/O,
 *  which has no files in a browser; the document's source URI is the path,
 *  as readFromXmlFile stores it. A file that cannot be read or parsed adds
 *  nothing (upstream, readFromXmlFile throws out of _GetNodeDef). */
function _LoadLibraryAsset(assetPath: string, doc: Document): void {
  const asset = _ArOpenAssetSync(new ArResolvedPath(assetPath))
  if (!asset) return
  const libDoc = createDocument()
  libDoc.setSourceUri(assetPath)
  try {
    readFromXmlString(libDoc, new TextDecoder().decode(asset.getBuffer()))
  } catch {
    return
  }
  doc.importLibrary(libDoc)
}

/** hdMtlx.cpp:343-373 */
function _GetNodeDef(hdNodeType: string, mxDoc: Document | null): NodeDef | null {
  const stdLibraries = mxDoc ? mxDoc : HdMtlxStdLibraries()
  const mxNodeDef = stdLibraries.getNodeDef(hdNodeType)
  if (mxNodeDef) {
    return mxNodeDef
  }

  // If we were not able to find the nodeDef in the stdLibraries it
  // may have been implemented within an asset, stored on the sdrNode.
  const sdrNode = SdrRegistry.getInstance().getShaderNodeByIdentifierAndType(
    hdNodeType, _tokens.mtlx)
  if (!sdrNode) {
    return null
  }

  const assetPath = sdrNode.getResolvedImplementationURI()
  if (assetPath === '') {
    return null
  }

  // If we found an asset path load it to the stdLibraries and try and
  // get the nodeDef again.
  _LoadLibraryAsset(assetPath, stdLibraries)
  const nodeDefName = sdrNode.getImplementationName()
  return stdLibraries.getNodeDef(nodeDefName)
}

let _swizzleDoc: Document | null = null

/** hdMtlx.cpp:375-402. Between MaterialX versions nodeDef names may change or
 *  nodes may be removed. This function calls HdMtlxGetNodeDefName() to get
 *  the correct nodeDef name and returns a temporary nodeDef for nodes that
 *  have been removed.
 *
 *  Custom nodes may have their nodeDefs in a separate mtlx file; this
 *  additionally looks to the ImplementationURI stored on the sdr node to find
 *  this mtlx file and nodeDef (hdMtlx.h:60-69). */
export function HdMtlxGetNodeDef(
  hdNodeType: TfToken | string,
  mxDoc: Document | null = null,
): NodeDef | null {
  const nodeTypeStr = hdNodeType

  // For node removals between MaterialX v1.38 and the current version
  // (MTLX_COMBINED_VERSION >= 13900)
  // Swizzle nodes were deleted in v1.39, return a temporary NodeDef
  const match = /^ND_swizzle_([^_]+)_([^_]+)$/.exec(nodeTypeStr)
  if (match) {
    _swizzleDoc ??= createDocument()
    const swizzleDoc = _swizzleDoc
    const existing = swizzleDoc.getNodeDef(nodeTypeStr)
    if (existing) {
      return existing
    }
    const swizzleNodeDef = swizzleDoc.addNodeDef(
      nodeTypeStr, match[2]!, 'swizzle')
    swizzleNodeDef.addInput('in', match[1]!)
    swizzleNodeDef.addInput('channels', 'string')
    return swizzleNodeDef
  }
  const mxNodeDefName = HdMtlxGetNodeDefName(nodeTypeStr)
  return _GetNodeDef(mxNodeDefName, mxDoc)
}

/** InterfaceElement::setInputValue<std::string> (MaterialXCore
 *  Interface.h:664-673) with ValueElement::setValue<std::string>
 *  (Element.h:1017-1021): the value string is stored as given. */
function _SetInputValueString(mxNode: Node, name: string, value: string, type: string): Input {
  let input = mxNode.getInput(name)
  if (!input) {
    input = mxNode.addInput(name)
  }
  input.setType(type !== '' ? type : 'string')
  input.setValueString(value)
  return input
}

/** hdMtlx.cpp:404-447 */
function _AddParameterInputs(
  netInterface: HdMaterialNetworkInterface,
  hdNodeName: string,
  mxNodeDef: NodeDef | null,
  mxNode: Node,
): void {
  // For each hdNode parameter add the corresponding input to the mxNode
  const hdNodeParamNames = netInterface.getAuthoredNodeParameterNames(hdNodeName)

  for (const paramName of hdNodeParamNames) {
    const mxInputName: string = paramName

    // Skip Colorspace and typeName parameters, these are already
    // captured in the paramData. Note: these inputs are of the form:
    //  'colorSpace:inputName' and 'typeName:inputName'
    const csResult = SdfPath.stripPrefixNamespace(mxInputName, _SdfFieldKeysColorSpace)
    if (csResult[1]) {
      continue
    }
    const tnResult = SdfPath.stripPrefixNamespace(mxInputName, _tokens.typeName)
    if (tnResult[1]) {
      continue
    }

    // Get the MaterialX Parameter info
    const paramData = netInterface.getNodeParameterData(hdNodeName, paramName)
    const mxInputValue = HdMtlxConvertToString(paramData.value)

    // Set the input value, and colorspace on the mxNode
    const mxInputType = _GetMxInputType(mxNodeDef, mxInputName, paramData.typeName)
    const mxInput = _SetInputValueString(mxNode, mxInputName, mxInputValue, mxInputType)
    if (paramData.colorSpace !== '') {
      mxInput.setColorSpace(paramData.colorSpace)
    }
  }
}

/** hdMtlx.cpp:449-524. Add a MaterialX version of the hdNode to the
 *  mxDoc/mxNodeGraph */
function _AddMaterialXNode(
  netInterface: HdMaterialNetworkInterface,
  hdNodeName: string,
  mxDoc: Document,
  mxNodeGraph: NodeGraph,
  _connectionName: string,
  mxHdData: HdMtlxTexturePrimvarData | null,
): Node | null {
  // Get the mxNode information
  const hdNodeType = netInterface.getNodeType(hdNodeName)
  let mxNodeDef = HdMtlxGetNodeDef(hdNodeType, mxDoc)
  if (!mxNodeDef) {
    TF_WARN(`NodeDef not found for Node '${hdNodeType}'`)
    // Instead of returning here, use a ND_surface definition so that the
    // rest of the network can be processed without errors.
    // This allows networks that might have non mtlx nodes next to
    // the terminal node to come through, and those nodes will be kept
    // out of the shader compile in hdPrman.
    mxNodeDef = mxDoc.getNodeDef(_tokens.ND_surface)!
  }

  const hdNodePath = hdNodeName
  const mxNodeName = HdMtlxCreateNameFromPath(hdNodePath)
  const mxNodeCategory = _GetMxNodeString(mxNodeDef)
  const mxNodeType = mxNodeDef.getType()
  const mxNodeDefString =
    (mxNodeDef.getName() === _tokens.ND_surface)
      ? hdNodeType
      : mxNodeDef.getName()

  // Add the mxNode to the mxNodeGraph
  let mxNode = mxNodeGraph.getNode(mxNodeName)
  if (!mxNode) {
    mxNode = mxNodeGraph.addNode(mxNodeCategory, mxNodeName, mxNodeType)
    if (mxNode.getNodeDef()) {
      mxNode.setNodeDefString(mxNodeDefString)
    }
  }

  // Add the hdNode parameters as inputs to the mxNode
  _AddParameterInputs(netInterface, hdNodeName, mxNodeDef, mxNode)

  // The rest of this function is populating mxHdData
  if (!mxHdData) {
    return mxNode
  }

  // Texture based nodes: found by having filename input(s)
  for (const mxInput of mxNodeDef.getActiveInputs()) {
    if (mxInput.getType() === _tokens.filename) {
      // Save the corresponding Mx and Hydra names for ShaderGen
      let names = mxHdData.mxHdTextureMap.get(mxNodeName)
      if (!names) {
        names = new Set()
        mxHdData.mxHdTextureMap.set(mxNodeName, names)
      }
      names.add(mxInput.getName())
      // Save the node path to adjust parameters after for ShaderGen
      mxHdData.hdTextureNodes.add(hdNodePath)
    }
  }

  // Primvar nodes:
  // Save the node path so the primvarName can be declared in ShaderGen.
  // This covers native 'geompropvalue' nodes as well as nodes (such as
  // UsdPrimvarReader) whose implementation wraps a geompropvalue node.
  if (mxNodeCategory === _tokens.geompropvalue ||
    HdMtlxIsPrimvarReaderNodeDef(mxNodeDef)) {
    mxHdData.hdPrimvarNodes.add(hdNodePath)
  }

  // Nodes using texcoords: either a stdlib texture coordinate node or a
  // custom node using a texture coordinate node
  // Save the node path so the textureCoord name can be declared in ShaderGen
  if (mxNodeCategory === _tokens.texcoord || _UsesTexcoordNode(mxNodeDef)) {
    mxHdData.hdPrimvarNodes.add(hdNodePath)
  }
  return mxNode
}

/** hdMtlx.cpp:526-567 */
function _AddNodeInput(
  netInterface: HdMaterialNetworkInterface,
  conn: HdMaterialNetworkInterfaceInputConnection,
  inputName: string,
  mxDoc: Document,
  mxCurrNode: Node,
  mxNextNode: Node,
): Input | null {
  // Get the input if it exits, otherwise add it below
  let mxInput = mxCurrNode.getInput(inputName)
  if (mxInput) {
    return mxInput
  }

  // If the currNode is connected to a multi-output node, the input on the
  // currNode needs to set the output type and the output name.
  if (mxNextNode.isMultiOutputType()) {
    const hdNextType = netInterface.getNodeType(conn.upstreamNodeName)
    const mxNextNodeDef = HdMtlxGetNodeDef(hdNextType, mxDoc)
    if (!mxNextNodeDef) {
      TF_WARN(`Could not find nodedef for node of type '${hdNextType}'\n`)
      return mxInput
    }
    // Add input with the connected ouptut type and set the output name
    // (upstream dereferences the output unconditionally).
    const mxConnOutput = mxNextNodeDef.getOutput(conn.upstreamOutputName)!
    TF_DEBUG(HdMtlxDebugCodes.HDMTLX_DOCUMENT, () =>
      `Adding input '${inputName}' of type '${mxConnOutput.getType()}' from ` +
      `multi output node <${conn.upstreamNodeName}>\n`)
    mxInput = mxCurrNode.addInput(inputName, mxConnOutput.getType())
    mxInput.setConnectedOutput(mxConnOutput)
  }
  else {
    TF_DEBUG(HdMtlxDebugCodes.HDMTLX_DOCUMENT, () => `Adding input '${inputName}'\n`)
    mxInput = mxCurrNode.addInput(inputName, mxNextNode.getType())
  }

  return mxInput
}

/** hdMtlx.cpp:569-605 */
function _AddNodeGraphOutput(
  netInterface: HdMaterialNetworkInterface,
  conn: HdMaterialNetworkInterfaceInputConnection,
  outputPrefix: string,
  mxDoc: Document,
  mxNodeGraph: NodeGraph,
  mxNextNode: Node,
): Output | null {
  let mxOutput: Output | null = null
  const outputName = outputPrefix + '_' + conn.upstreamOutputName

  // If the mxNodeGraph output is connected to a multi-output node, the
  // output on the mxNodegraph needs to get the output type from that
  // connected node and indicate the output name.
  if (mxNextNode.isMultiOutputType()) {
    const hdNextType = netInterface.getNodeType(conn.upstreamNodeName)
    const mxNextNodeDef = HdMtlxGetNodeDef(hdNextType, mxDoc)
    if (!mxNextNodeDef) {
      TF_WARN(`Could not find nodedef for node of type '${hdNextType}'\n`)
      return mxOutput
    }
    // Add output with the connected Ouptut type and set the output name
    // (upstream dereferences the output unconditionally).
    const mxConnOutput = mxNextNodeDef.getOutput(conn.upstreamOutputName)!
    mxOutput = mxNodeGraph.addOutput(outputName, mxConnOutput.getType())
    mxOutput.setOutputString(mxConnOutput.getName())
  }
  else {
    mxOutput = mxNodeGraph.addOutput(outputName, mxNextNode.getType())
  }

  mxOutput.setConnectedNode(mxNextNode)
  return mxOutput
}

/** A C++ out-parameter (`T *`). */
interface _Ref<T> { value: T }

/** hdMtlx.cpp:607-674. Recursively traverse the material n/w and gather the
 *  nodes in the MaterialX NodeGraph and Document */
function _GatherUpstreamNodes(
  netInterface: HdMaterialNetworkInterface,
  hdConnection: HdMaterialNetworkInterfaceInputConnection,
  mxDoc: Document,
  mxNodeGraph: _Ref<NodeGraph | null>,
  mxUpstreamNode: _Ref<Node | null>,
  connectionName: string,
  mxHdData: HdMtlxTexturePrimvarData | null,
): void {
  const hdNodeName = hdConnection.upstreamNodeName
  if (netInterface.getNodeType(hdNodeName) === '') {
    TF_WARN(`Could not find the connected Node '${hdNodeName}'`)
    return
  }

  // Initilize the mxNodeGraph if needed
  if (!mxNodeGraph.value) {
    const nodeGraphName = mxDoc.createValidChildName(
      SdfPath.fromString(hdNodeName).getParentPath().name)
    mxNodeGraph.value = mxDoc.addNodeGraph(nodeGraphName)
  }
  const nodeGraph = mxNodeGraph.value

  // Add the node to the mxNodeGraph/mxDoc.
  const mxCurrNode =
    _AddMaterialXNode(netInterface, hdNodeName, mxDoc,
      nodeGraph, connectionName, mxHdData)
  if (!mxCurrNode) {
    return
  }

  TF_DEBUG(HdMtlxDebugCodes.HDMTLX_DOCUMENT, () =>
    `Adding node <${hdNodeName}> of type '${mxCurrNode.getNodeDefString()}' ` +
    `to the nodegraph <${nodeGraph.getName()}>\n`)

  // Continue traversing the upsteam connections to create the mxNodeGraph
  const hdConnectionNames = netInterface.getNodeInputConnectionNames(hdNodeName)
  for (const connName of hdConnectionNames) {
    const inputConnections = netInterface.getNodeInputConnection(hdNodeName, connName)
    for (const currConn of inputConnections) {
      // Gather the nodes uptream from the mxCurrNode
      _GatherUpstreamNodes(
        netInterface, currConn, mxDoc, mxNodeGraph,
        mxUpstreamNode, connName, mxHdData)

      // Upstream tests the out-parameter pointer here (`if
      // (!mxUpstreamNode)`), which is never null, and then dereferences the
      // node it points to. Divergence: a null node (only possible when the
      // first gathered connection names a missing node) is skipped rather
      // than dereferenced.
      const mxNextNode = mxUpstreamNode.value
      if (!mxNextNode) {
        continue
      }

      // Connect mxCurrNode to the mxUpstreamNode
      const mxInput =
        _AddNodeInput(netInterface, currConn, connName, mxDoc,
          mxCurrNode, mxNextNode)!
      TF_DEBUG(HdMtlxDebugCodes.HDMTLX_DOCUMENT, () =>
        `Connecting node '${mxNextNode.getName()}' to input '${mxInput.getName()}'\n`)
      mxInput.setConnectedNode(mxNextNode)
    }
  }

  mxUpstreamNode.value = mxCurrNode
}

/** hdMtlx.cpp:676-717 */
function _CreateNodeGraphFromTerminalNodeConnections(
  netInterface: HdMaterialNetworkInterface,
  terminalNodeName: string,
  terminalNodeConnectionNames: readonly string[],
  mxDoc: Document,
  mxShaderNode: Node,
  mxHdData: HdMtlxTexturePrimvarData | null,
): void {
  const mxNodeGraph: _Ref<NodeGraph | null> = { value: null }
  for (const connName of terminalNodeConnectionNames) {

    const nodeGraphOutput: string = connName
    const inputConnections = netInterface.getNodeInputConnection(terminalNodeName, connName)
    for (const currConn of inputConnections) {

      // Gather the nodes uptream from the
      const mxUpstreamNode: _Ref<Node | null> = { value: null }
      _GatherUpstreamNodes(
        netInterface, currConn, mxDoc, mxNodeGraph,
        mxUpstreamNode, nodeGraphOutput, mxHdData)

      if (!mxUpstreamNode.value) {
        continue
      }

      // Connect NodeGraph Output to the ShaderNode input
      const mxOutput =
        _AddNodeGraphOutput(netInterface, currConn, nodeGraphOutput,
          mxDoc, mxNodeGraph.value!, mxUpstreamNode.value)

      // (upstream dereferences the input unconditionally)
      const mxInput =
        _AddNodeInput(netInterface, currConn, connName, mxDoc,
          mxShaderNode, mxUpstreamNode.value)!
      TF_DEBUG(HdMtlxDebugCodes.HDMTLX_DOCUMENT, () =>
        `Connecting NodeGraph output '${mxOutput!.getName()}' to input ` +
        `'${mxInput.getName()}'\n`)
      mxInput.setConnectedOutput(mxOutput)
    }
  }
}

/** hdMtlx.cpp:719-730 (netInterface, hdTerminalNodeName): get the terminal
 *  name used in the MaterialX document based on the Hydra terminal node.
 *  hdMtlx.cpp:732-742 (mxTerminalType): based on the MaterialX terminal
 *  node type. */
export function HdMtlxGetMxTerminalName(
  netInterface: HdMaterialNetworkInterface,
  hdTerminalNodeName: TfToken | string,
): string
export function HdMtlxGetMxTerminalName(mxTerminalType: string): string
export function HdMtlxGetMxTerminalName(
  netInterfaceOrType: HdMaterialNetworkInterface | string,
  hdTerminalNodeName?: TfToken | string,
): string {
  if (typeof netInterfaceOrType !== 'string') {
    const netInterface = netInterfaceOrType
    const terminalNodeDef =
      HdMtlxGetNodeDef(netInterface.getNodeType(hdTerminalNodeName!))
    if (!terminalNodeDef) {
      return HdMtlxTokens.surfaceshaderName
    }
    return HdMtlxGetMxTerminalName(terminalNodeDef.getType())
  }

  const terminalType = netInterfaceOrType
  if (terminalType === SURFACE_SHADER_TYPE_STRING) {
    return HdMtlxTokens.surfaceshaderName
  } else if (terminalType === DISPLACEMENT_SHADER_TYPE_STRING) {
    return HdMtlxTokens.displacementshaderName
  }
  // default to Surface
  return HdMtlxTokens.surfaceshaderName
}

/** hdMtlx.cpp:744-767. Creates and returns a MaterialX Document from the
 *  given HdMaterialNetwork2, collecting the hdTextureNodes and
 *  hdPrimvarNodes as the network is traversed as well as the Texture name
 *  mapping between MaterialX and Hydra. */
export function HdMtlxCreateMtlxDocumentFromHdNetwork(
  hdNetwork: HdMaterialNetwork2,
  _hdMaterialXNode: HdMaterialNode2,
  hdMaterialXNodePath: string,
  materialPath: string,
  libraries: Document,
  mxHdData: HdMtlxTexturePrimvarData | null = null,
): Document {
  // XXX Unfortunate but necessary to cast away constness even though
  // hdNetwork isn't modified.
  const netInterface = new HdMaterialNetwork2Interface(materialPath, hdNetwork)

  const terminalNodeName = TfToken(hdMaterialXNodePath)

  return HdMtlxCreateMtlxDocumentFromHdMaterialNetworkInterface(
    netInterface,
    terminalNodeName,
    netInterface.getNodeInputConnectionNames(terminalNodeName),
    libraries,
    mxHdData)
}

/** VtValue::IsHolding<std::string>() on a config value (a VtValue, or a bare
 *  JS string as some data sources hand out). */
function _IsHoldingString(value: unknown): value is VtValue | string {
  if (value instanceof VtValue) return value.getTypeName() === 'string'
  return typeof value === 'string'
}

/** hdMtlx.cpp:769-908. Implementation that uses the material network
 *  interface. */
export function HdMtlxCreateMtlxDocumentFromHdMaterialNetworkInterface(
  netInterface: HdMaterialNetworkInterface,
  terminalNodeName: TfToken | string,
  terminalNodeConnectionNames: readonly (TfToken | string)[],
  libraries: Document,
  mxHdData?: HdMtlxTexturePrimvarData | null,
): Document
export function HdMtlxCreateMtlxDocumentFromHdMaterialNetworkInterface(
  netInterface: HdMaterialNetworkInterface | null,
  terminalNodeName: TfToken | string,
  terminalNodeConnectionNames: readonly (TfToken | string)[],
  libraries: Document,
  mxHdData?: HdMtlxTexturePrimvarData | null,
): Document | null
export function HdMtlxCreateMtlxDocumentFromHdMaterialNetworkInterface(
  netInterface: HdMaterialNetworkInterface | null,
  terminalNodeName: TfToken | string,
  terminalNodeConnectionNames: readonly (TfToken | string)[],
  libraries: Document,
  mxHdData: HdMtlxTexturePrimvarData | null = null,
): Document | null {
  // TRACE_FUNCTION_SCOPE("Create Mtlx Document from HdMaterialNetwork")
  if (!netInterface) {
    return null
  }

  TF_DEBUG(HdMtlxDebugCodes.HDMTLX_DOCUMENT, () =>
    `Create Mtlx Document for terminal <${terminalNodeName}>\n`)

  // Initialize a MaterialX Document
  const mxDoc = createDocument()
  // (MTLX_COMBINED_VERSION >= 13900)
  mxDoc.setDataLibrary(libraries)

  // Get the version of the MaterialX document if specified, otherwise
  // default to v1.38. Note that we should always default to 1.38 to handle
  // the case where older USD files have not made use of this config schema.
  let materialXVersionString = '1.38'
  const materialXVersionValue = netInterface.getMaterialConfigValue(_tokens.mtlxVersion)
  const funcName = 'HdMtlxCreateMtlxDocumentFromHdMaterialNetworkInterface'
  if (_IsHoldingString(materialXVersionValue)) {
    materialXVersionString = materialXVersionValue instanceof VtValue
      ? materialXVersionValue.Get<string>()
      : materialXVersionValue
    TF_DEBUG(HdMtlxDebugCodes.HDMTLX_VERSION_UPGRADE, () =>
      `[${funcName}] : MaterialX document version : '${materialXVersionString}'\n`)
  } else {
    TF_DEBUG(HdMtlxDebugCodes.HDMTLX_VERSION_UPGRADE, () =>
      `[${funcName}] : MaterialX document version : '${materialXVersionString}' ` +
      '(Using default)\n')
  }
  mxDoc.setVersionString(materialXVersionString)

  // Create the terminal shader and material nodes
  const hdTerminalType = netInterface.getNodeType(terminalNodeName)
  const terminalNodeDef = HdMtlxGetNodeDef(hdTerminalType, mxDoc)
  if (!terminalNodeDef) {
    TF_WARN(`Unsupported terminal node type '${hdTerminalType}' cannot find the ` +
      'associated NodeDef.')
  }

  const mxTerminalCategory =
    (terminalNodeDef) ? _GetMxNodeString(terminalNodeDef) : ''
  const mxTerminalType = (terminalNodeDef)
    ? terminalNodeDef.getType() : SURFACE_SHADER_TYPE_STRING
  const mxTerminalName = HdMtlxGetMxTerminalName(mxTerminalType)
  const mxShaderNode = mxDoc.addNode(
    mxTerminalCategory, mxTerminalName, mxTerminalType)

  const materialName = SdfPath.fromString(netInterface.getMaterialPrimPath()).name
  const mxMaterial = mxDoc.addMaterialNode(
    mxDoc.createValidChildName(materialName), mxShaderNode)

  TF_DEBUG(HdMtlxDebugCodes.HDMTLX_DOCUMENT, () =>
    `Create MaterialX Material '${materialName}' with terminal ` +
    `'${mxTerminalName}' of type '${mxTerminalType}'\n`)

  // Create the NodeGraph
  _CreateNodeGraphFromTerminalNodeConnections(
    netInterface, terminalNodeName, terminalNodeConnectionNames,
    mxDoc, mxShaderNode, mxHdData)

  // Add terminal shader node inputs
  _AddParameterInputs(
    netInterface, terminalNodeName, terminalNodeDef, mxShaderNode)

  if (TfDebug.isEnabled(HdMtlxDebugCodes.HDMTLX_VERSION_UPGRADE)) {
    const filename =
      mxMaterial.getName() + '_' + mxTerminalName + '_before.mtlx'
    TF_DEBUG(HdMtlxDebugCodes.HDMTLX_VERSION_UPGRADE, () =>
      `[${funcName}] : MaterialX document before upgrade: '${filename}'\n`)
    writeToXmlFile(mxDoc, new FilePath(filename))
  }

  // Potentially upgrade the MaterialX document to the "current" version,
  // using the MaterialX upgrade mechanism.
  try {
    mxDoc.upgradeVersion()
  } catch (exception) {
    if (!(exception instanceof MxException)) throw exception
    TF_DEBUG(HdMtlxDebugCodes.HDMTLX_VERSION_UPGRADE, () =>
      `[${funcName}] : MaterialX document failed upgrade.\nException: ` +
      `${exception.message}\n`)
  }

  if (TfDebug.isEnabled(HdMtlxDebugCodes.HDMTLX_VERSION_UPGRADE)) {
    const filename =
      mxMaterial.getName() + '_' + mxTerminalName + '_after.mtlx'
    TF_DEBUG(HdMtlxDebugCodes.HDMTLX_VERSION_UPGRADE, () =>
      `[${funcName}] : MaterialX document after upgrade: '${filename}'\n\n`)
    writeToXmlFile(mxDoc, new FilePath(filename))
  }
  else if (TfDebug.isEnabled(HdMtlxDebugCodes.HDMTLX_WRITE_DOCUMENT) ||
    TfDebug.isEnabled(HdMtlxDebugCodes.HDMTLX_WRITE_DOCUMENT_WITHOUT_INCLUDES)) {
    const filename =
      mxMaterial.getName() + '_' + mxTerminalName + '.mtlx'
    TF_DEBUG(HdMtlxDebugCodes.HDMTLX_WRITE_DOCUMENT, () =>
      `[${funcName}] : MaterialX document: '${filename}'\n\n`)
    TF_DEBUG(HdMtlxDebugCodes.HDMTLX_WRITE_DOCUMENT_WITHOUT_INCLUDES, () =>
      `[${funcName}] : MaterialX document: '${filename}'\n\n`)

    const mxWriteOptions = new XmlWriteOptions()
    if (TfDebug.isEnabled(HdMtlxDebugCodes.HDMTLX_WRITE_DOCUMENT_WITHOUT_INCLUDES)) {
      mxWriteOptions.elementPredicate = (elem: Element): boolean => {
        // skip writing all includes for brevity
        return !elem.hasSourceUri()
      }
    }
    writeToXmlFile(mxDoc, new FilePath(filename), mxWriteOptions)
  }

  // Validate the MaterialX Document.
  {
    // TRACE_FUNCTION_SCOPE("Validate created Mtlx Document")
    // MaterialX appends each message line with a trailing newline
    // (MaterialXCore Element.cpp validateRequire).
    const message: string[] = []
    if (!mxDoc.validate(message)) {
      TF_WARN('Validation warnings for generated MaterialX file.\n' +
        message.map((line) => line + '\n').join('') + '\n')
    } else {
      TF_DEBUG(HdMtlxDebugCodes.HDMTLX_DOCUMENT, () =>
        `Mtlx Document for terminal <${terminalNodeName}> ` +
        'validated by MaterialX.\n\n')
    }
  }
  return mxDoc
}
