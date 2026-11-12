// Ported from OpenUSD 26.11.1: pxr/usd/usd/usdGenSchema.py
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// usdGenSchema — port of pxr/usd/usd/usdGenSchema.py (v26.05), the
// registry-output pipeline (upstream lives in the usd lib dir, same placement
// here). C++/Python class codegen is NOT ported (TS-class codegen is a later
// phase — RFC §5 F4); this module produces the two registry artifacts:
//
//   * generatedSchema.usda — ParseUsd (usdGenSchema.py:982) validations, then
//     _MakeFlattenedRegistryLayer (py:1633) + GenerateRegistry (py:1788):
//     every class prim flattened so it carries local + inherited property
//     specs with fallbacks; documentation/customData stripped except
//     userDocBrief + apiSchemaOverridePropertyNames; multiple-apply property
//     names templated with __INSTANCE_NAME__ (py:1679); the class's full
//     applied-API list authored as an explicit apiSchemas listOp (py:1868);
//     fallbackPrimTypes as root metadata (py:1923); doxygen tags stripped from
//     the exported text (py:1935).
//   * plugInfo.json content — GeneratePlugInfo (py:1531): the Types dict
//     (bases/alias/schemaIdentifier/schemaKind + apply-info + extraPlugInfo),
//     plugin Type 'resource' when codeless (py:1578).
//
// Registry generation opens the schema through Usd Stage, authors temporary
// mangled type names in its session layer, calls Stage.flatten(), repairs type
// names/documentation on the resulting Sdf Layer, then consumes that layer —
// the _MakeFlattenedRegistryLayer path from usdGenSchema.py:1633-1677.
//
// COMPOSITION NOTE (inheritPaths metadata): upstream reads the composed
// 'inheritPaths' list op on the USD prim; opinions from inherit-introduced
// nodes drop out because a class arc's map function only maps the class path
// itself, so root-class path items from base classes never translate. We
// mirror the surviving-opinion set by composing inheritPaths over the prim's
// OWN layer-stack specs only. Token-valued list ops (apiSchemas) need no path
// translation, so those compose over the whole prim stack, exactly
// UsdStage::_ComposeAuthoredAppliedSchemas.

import {
  Layer, findValueTypeName, sdfComposeListOpsStrongToWeak,
  sdfNormalizeListOp, ListOpValue as SdfListOpValue, RelationshipSpec,
} from 'typescript-usd/sdf'
import { Error as TfError, TfDiagnosticType, isValidIdentifier, makeValidIdentifier } from 'typescript-usd/tf'
import type { Info as PlugInfo, InfoTypeEntry as PlugInfoTypeEntry } from 'typescript-usd/plug'
import { ArInMemoryResolver, _resolverContextForResolver } from 'typescript-usd/ar/_internal'
import { UsdSchemaRegistry } from './schemaRegistry.ts'
import { Stage } from './stage.ts'
import { _sdfIsDictionary } from 'typescript-usd/sdf/_internal'
import { Array as VtArray } from 'typescript-usd/vt'

export interface UsdGenSchemaOptions {
  /** Resolver for sublayered base schemas (e.g. 'usdGeom/schema.usda').
   *  Mirrors upstream's ArDefaultResolver search over plugin resource paths. */
  resolveAsset?: (assetPath: string) => Promise<string>
  /** Text of <schema dir>/userDoc/schemaUserDoc.usda, when the schema ships
   *  one. Upstream opens it from beside the input file
   *  (usdGenSchema.py:1781-1786); here the caller supplies it. Its sublayer
   *  @../schema.usda@ resolves to the input schema. */
  userDocSchemaUsda?: string
}

export interface UsdGenSchemaResult {
  /** generatedSchema.usda text (usda, as upstream exports it). */
  generatedSchemaUsda: string
  /** plugInfo.json content (path fields omitted — no filesystem here). */
  plugInfo: PlugInfo
  /** True when the input opted into skipCodeGeneration (codeless). */
  isCodeless: boolean
  /** @internal GenerateCode's inputs (py:1365): parsed classes and gathered
   *  tokens, for usdGenSchemaCodegen.ts. Undefined when codeless. */
  _codegen?: UsdGenSchemaCodegenInput
}

/** @internal */
export interface UsdGenSchemaCodegenInput {
  libName: string
  libPrefix: string
  libraryPath: string
  classes: ClassInfo[]
  /** Reflected API schema classes, by usdPrimTypeName (py:994-1008). */
  reflectedClasses: Map<string, ClassInfo>
  tokens: TokenInfo[]
  /** Each class's GetSchemaAttributeNames(true): the parent's list followed
   *  by the local names (schemaClass.cpp template), resolved through the
   *  whole layer stack so base classes in other libraries contribute. */
  allSchemaAttributeNames: Map<string, string[]>
}

// ---- Tokens (usdGenSchema.py:74-115) ----

const API_SCHEMA_TYPE = 'apiSchemaType'
const NON_APPLIED = 'nonApplied'
const SINGLE_APPLY = 'singleApply'
const MULTIPLE_APPLY = 'multipleApply'
const API_SCHEMA_TYPE_TOKENS = [NON_APPLIED, SINGLE_APPLY, MULTIPLE_APPLY]
const PROPERTY_NAMESPACE_PREFIX = 'propertyNamespacePrefix'
const API_AUTO_APPLY = 'apiSchemaAutoApplyTo'
const API_CAN_ONLY_APPLY = 'apiSchemaCanOnlyApplyTo'
const API_ALLOWED_INSTANCE_NAMES = 'apiSchemaAllowedInstanceNames'
const API_SCHEMA_INSTANCES = 'apiSchemaInstances'
const FALLBACK_TYPES = 'fallbackTypes'
const INSTANCE_NAME_PLACEHOLDER = UsdSchemaRegistry.makeMultipleApplyNameTemplate('', '')
const USERDOC_BRIEF = 'userDocBrief'
const MAX_LENGTH_FOR_USERDOCBRIEF = 500

// ---- Small helpers ----

type Dict = Record<string, unknown>

function realFieldNames(layer: Layer, specPath: string): string[] {
  return layer.getFieldNames(specPath)
}

// A token[] customData entry (a VtArray once parsed) as a list of names.
function tokenList(v: unknown): string[] | undefined {
  if (v instanceof VtArray) return v.toArray().map(String)
  return Array.isArray(v) ? v.map(String) : undefined
}

function isDict(v: unknown): v is Dict {
  return _sdfIsDictionary(v)
}

// _ConvertDictionaryForJSON (py:132): a scene-description dictionary as a
// JSON-encodable object, VtArrays converted to plain lists.
function convertDictionaryForJSON(d: Dict): Dict {
  const result: Dict = {}
  for (const [k, v] of Object.entries(d)) {
    if (v instanceof VtArray) result[k] = v.toArray()
    else if (isDict(v)) result[k] = convertDictionaryForJSON(v)
    else result[k] = v
  }
  return result
}

// _GetSchemaDefException (py:385)
function schemaDefError(msg: string, path: string): Error {
  return new Error(
    `Invalid schema definition at <${path}>\n${msg}\n` +
    'See https://openusd.org/release/api/_usd__page__generating_schemas.html for more information.\n')
}

// _ProperCase (py:261): ProperCase each \W+-separated piece.
function properCase(s: string): string {
  if (s.length > 1) {
    return s.split(/[^A-Za-z0-9_]+/).filter(p => p.length > 0)
      .map(p => p[0]!.toUpperCase() + p.slice(1)).join('')
  }
  return s.toUpperCase()
}

// _CamelCase (py:272)
function camelCase(s: string): string {
  if (s.length > 1) {
    const p = properCase(s)
    return p[0]!.toLowerCase() + p.slice(1)
  }
  return s.toLowerCase()
}

// _MakeValidToken (py:1122)
function makeValidToken(tokenId: string, useLiteralIdentifier: boolean): string {
  if (tokenId.length > 0 && /[0-9]/.test(tokenId[0]!)) tokenId = '_' + tokenId
  if (!useLiteralIdentifier || tokenId.includes(':')) tokenId = camelCase(tokenId)
  if (!isValidIdentifier(tokenId)) tokenId = makeValidIdentifier(tokenId)
  return tokenId
}

// ---- Layer-stack model ----
//
// A schema.usda composes through sublayers plus root-prim inherits only. This
// private stage owns the recursive layer stack (strongest first), composes
// its prim indexes, then materializes a single flattened registry snapshot.

interface SpecRef {
  layer: Layer
  path: string
}

class SchemaStage {
  constructor(readonly layers: Layer[]) {}

  flattenedRegistryLayer: Layer | undefined

  get rootLayer(): Layer {
    return this.layers[0]!
  }

  layerRootPrimNames(layer: Layer): string[] {
    return (layer.getField('/', 'primChildren') as string[] | undefined) ?? []
  }

  // Own specs for a root prim across the layer stack, strongest first.
  ownSpecs(primName: string): SpecRef[] {
    const out: SpecRef[] = []
    for (const layer of this.layers) {
      if (layer.hasSpec(`/${primName}`)) out.push({ layer, path: `/${primName}` })
    }
    return out
  }

  primExists(primName: string): boolean {
    return this.ownSpecs(primName).length > 0
  }

  // Composed inheritPaths over the prim's own specs (see COMPOSITION NOTE).
  composedInheritPaths(primName: string): string[] {
    const ops: SdfListOpValue<string>[] = []
    for (const ref of this.ownSpecs(primName)) {
      const op = sdfNormalizeListOp<string>(ref.layer.getField(ref.path, 'inheritPaths'))
      if (op) {
        ops.push(op)
        if (op.isExplicit) break
      }
    }
    return sdfComposeListOpsStrongToWeak(ops)
  }

  // Full prim stack: own specs, then each inherited class's stack (weaker).
  primStack(primName: string, guard?: Set<string>): SpecRef[] {
    const seen = guard ?? new Set<string>([primName])
    const out = [...this.ownSpecs(primName)]
    for (const inhPath of this.composedInheritPaths(primName)) {
      const parent = inhPath.replace(/^\//, '')
      if (seen.has(parent)) continue
      seen.add(parent)
      out.push(...this.primStack(parent, seen))
    }
    return out
  }

  // _FindAllInherits (py:448): all inherit paths, transitively.
  findAllInherits(primName: string, guard?: Set<string>): string[] {
    const seen = guard ?? new Set<string>([primName])
    const inherits = [...this.composedInheritPaths(primName)]
    const out = [...inherits]
    for (const path of inherits) {
      const target = path.replace(/^\//, '')
      if (seen.has(target)) continue
      seen.add(target)
      if (this.primExists(target)) out.push(...this.findAllInherits(target, seen))
    }
    return out
  }

  // _MakeFlattenedRegistryLayer (usdGenSchema.py:1633-1677): materialize
  // every generated class from its complete prim/property stacks exactly
  // once. All registry generation reads this snapshot, never local layer
  // specs independently.
  flattenRegistryPrims(classes: readonly ClassInfo[]): ReadonlyMap<string, FlatPrim> {
    if (!this.flattenedRegistryLayer) {
      throw new Error('usdGenSchema: flattened registry layer has not been built')
    }
    return new Map(classes.map(cls => [
      cls.primName, flatPrimFromLayer(this.flattenedRegistryLayer!, cls),
    ]))
  }
}

// Strongest opinion for a field over a spec stack.
function composedField(stack: readonly SpecRef[], field: string): unknown {
  for (const ref of stack) {
    const v = ref.layer.getField(ref.path, field)
    if (v !== undefined) return v
  }
  return undefined
}

// Dictionary-valued fields compose per-key, stronger keys winning, nested
// dictionaries merging recursively (VtDictionaryOverRecursive).
function composedDict(stack: readonly SpecRef[], field: string): Dict {
  let out: Dict = {}
  // Weak-to-strong: stronger writes over weaker.
  for (let i = stack.length - 1; i >= 0; i--) {
    const v = stack[i]!.layer.getField(stack[i]!.path, field)
    if (isDict(v)) out = dictOver(out, v)
  }
  return out
}

function dictOver(weaker: Dict, stronger: Dict): Dict {
  const out: Dict = { ...weaker }
  for (const [k, v] of Object.entries(stronger)) {
    out[k] = isDict(v) && isDict(out[k]) ? dictOver(out[k] as Dict, v) : v
  }
  return out
}

// Token list op composed over a spec stack, stopping at an explicit op —
// UsdStage::_ComposeAuthoredAppliedSchemas.
function composedTokenListOp(stack: readonly SpecRef[], field: string): string[] {
  const ops: SdfListOpValue<string>[] = []
  for (const ref of stack) {
    const op = sdfNormalizeListOp<string>(ref.layer.getField(ref.path, field))
    if (op) {
      ops.push(op)
      if (op.isExplicit) break
    }
  }
  return sdfComposeListOpsStrongToWeak(ops)
}

// Union of property names over a prim stack, strongest-first first-seen.
function composedPropertyNames(stack: readonly SpecRef[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const ref of stack) {
    const props = ref.layer.getField(ref.path, 'properties') as string[] | undefined
    for (const p of props ?? []) {
      if (!seen.has(p)) { seen.add(p); out.push(p) }
    }
  }
  return out
}

// Property spec stack (strongest first) for one property over a prim stack.
function propertyStack(stack: readonly SpecRef[], propName: string): SpecRef[] {
  const out: SpecRef[] = []
  for (const ref of stack) {
    const propPath = `${ref.path}.${propName}`
    if (ref.layer.hasSpec(propPath)) out.push({ layer: ref.layer, path: propPath })
  }
  return out
}

// ---- Library metadata (py:155-251) ----

function getLibMetadata(layer: Layer): Dict {
  if (!layer.hasSpec('/GLOBAL')) {
    throw new Error(
      'Code generation requires a "/GLOBAL" prim with customData to define at '
      + 'least libraryName. GLOBAL prim not found.')
  }
  const customData = layer.getField('/GLOBAL', 'customData')
  if (!isDict(customData) || Object.keys(customData).length === 0) {
    throw new Error(
      'customData is either empty or not defined on /GLOBAL prim. At least '
      + '"libraryName" entries in customData are required for code generation.')
  }
  return customData
}

function getLibName(layer: Layer): string {
  const libData = getLibMetadata(layer)
  if (typeof libData['libraryName'] !== 'string') {
    throw new Error(
      'Code generation requires that "libraryName" be defined in customData '
      + 'on /GLOBAL prim.')
  }
  return libData['libraryName']
}

function getLibPath(layer: Layer): string {
  if (skipCodeGenForLayer(layer)) return ''
  const libData = getLibMetadata(layer)
  if (typeof libData['libraryPath'] !== 'string') {
    throw new Error(
      'Code generation requires that "libraryPath" be defined in customData '
      + 'on /GLOBAL prim or the schema must be declared codeless, by '
      + 'specifying skipCodeGeneration=true. The format for libraryPath is '
      + '"path/to/lib".')
  }
  return libData['libraryPath']
}

function getLibPrefix(layer: Layer): string {
  const libData = getLibMetadata(layer)
  return typeof libData['libraryPrefix'] === 'string'
    ? libData['libraryPrefix']
    : properCase(getLibName(layer))
}

function skipCodeGenForLayer(layer: Layer): boolean {
  // Sublayers may not carry lib metadata; ignore errors (py:225).
  try {
    return getLibMetadata(layer)['skipCodeGeneration'] === true
  } catch {
    return false
  }
}

function useLiteralIdentifierForLayer(layer: Layer): boolean {
  const v = getLibMetadata(layer)['useLiteralIdentifier']
  return v === undefined ? true : v !== false
}

function skipCodeGenForSchemaLib(stage: SchemaStage): boolean {
  return stage.layers.some(skipCodeGenForLayer)
}

// ---- Field validation (_ValidateFields, py:743) ----

// Children fields are spec structure, not "info" — upstream's ListInfoKeys
// never surfaces them.
const CHILDREN_FIELDS = new Set([
  'primChildren', 'properties', 'variantChildren', 'variantSetChildren',
])
const VALIDATE_INCLUDE_LIST = ['inheritPaths', 'customData', 'specifier']

function validateFields(layer: Layer, specPath: string, errors: string[]): boolean {
  const invalid = realFieldNames(layer, specPath).filter(key =>
    !CHILDREN_FIELDS.has(key) &&
    UsdSchemaRegistry.isDisallowedField(key) &&
    !VALIDATE_INCLUDE_LIST.includes(key))
  if (invalid.length === 0) return true
  for (const key of invalid) {
    if (key === 'targetPaths') {
      errors.push(`Relationship targets on <${specPath}> cannot be specified in a schema.`)
    } else if (key === 'connectionPaths') {
      errors.push(`Attribute connections on <${specPath}> cannot be specified in a schema.`)
    } else {
      errors.push(`Fallback values for '${key}' on <${specPath}> cannot be specified in a schema.`)
    }
  }
  return false
}

// ---- Names (_ExtractNames, py:440) ----

function extractNames(spec: SpecRef, primName: string, customData: Dict): {
  usdPrimTypeName: string
  className: string
  cppClassName: string
  baseFileName: string
} {
  const className = typeof customData['className'] === 'string'
    ? customData['className']
    : properCase(primName)
  return {
    usdPrimTypeName: primName,
    className,
    cppClassName: getLibPrefix(spec.layer) + className,
    baseFileName: typeof customData['fileName'] === 'string'
      ? customData['fileName']
      : camelCase(className),
  }
}

// _GetDefiningLayerAndPrim (py:137)
function getDefiningLayerAndPrim(
  stage: SchemaStage,
  schemaName: string,
): { layer: Layer; spec: SpecRef | null } {
  // SchemaBase is not actually defined in the core schema file (py:142).
  if (schemaName === 'SchemaBase') {
    return { layer: stage.layers[stage.layers.length - 1]!, spec: null }
  }
  for (const layer of stage.layers) {
    for (const primName of stage.layerRootPrimNames(layer)) {
      if (primName === schemaName) {
        return { layer, spec: { layer, path: `/${primName}` } }
      }
    }
  }
  throw new Error(`Could not find the defining layer for schema: ${schemaName}`)
}

// _GetNameAndGeneratedSchemaPropNameForPropInfo (py:285)
function propNames(
  sdfPropName: string,
  propertyNamespacePrefix: string | null,
): { name: string; generatedSchemaPropName: string } {
  if (propertyNamespacePrefix) {
    const generatedSchemaPropName =
      UsdSchemaRegistry.makeMultipleApplyNameTemplate(propertyNamespacePrefix, sdfPropName)
    const name = camelCase(
      UsdSchemaRegistry.makeMultipleApplyNameInstance(generatedSchemaPropName, '_MultipleApplyTemplate_'))
    return { name, generatedSchemaPropName }
  }
  // Property names camelCase irrespective of useLiteralIdentifier (py:305).
  return {
    name: sdfPropName.length > 0 ? makeValidToken(sdfPropName, false) : '',
    generatedSchemaPropName: sdfPropName,
  }
}

// _MakeMultipleApplySchemaNameTemplate (py:771)
function makeMultipleApplySchemaNameTemplate(apiSchemaName: string): string {
  const [typeName, instanceName] = UsdSchemaRegistry.getTypeNameAndInstance(apiSchemaName)
  return UsdSchemaRegistry.makeMultipleApplyNameTemplate(typeName, instanceName)
}

// ---- ClassInfo (py:484) ----

/** @internal Class description consumed by usdGenSchemaCodegen.ts. */
export interface ClassInfo {
  usdPrimTypeName: string
  className: string
  cppClassName: string
  /** customData fileName, else camelCase(className) (_ExtractNames, py:456-460). */
  baseFileName: string
  primName: string
  parentCppClassName: string
  /** The parent class's className and defining libraryName ('' for UsdSchemaBase). */
  parentClassName: string
  parentLibName: string
  /** The class's own documentation in schema.usda. */
  doc: string
  /** customData reflectedAPISchemas (py:597-607): API schemas whose
   *  properties the class re-exposes. */
  reflectedAPISchemas: string[]
  typeName: string
  customData: Dict
  isConcrete: boolean
  isTyped: boolean
  isApi: boolean
  isAppliedAPISchema: boolean
  isMultipleApply: boolean
  schemaKind: string
  apiSchemaType: string | null
  propertyNamespacePrefix: string | null
  apiAutoApply: string[] | undefined
  apiCanOnlyApply: string[] | undefined
  apiAllowedInstanceNames: string[] | undefined
  apiSchemaInstances: Dict | undefined
  fallbackPrimTypes: string[] | undefined
  allAppliedAPISchemas: string[]
  apiSchemaOverridePropertyNames: string[]
  family: string
  version: number
  /** Root-layer useLiteralIdentifier setting, carried for token gathering. */
  useLiteralIdentifier: boolean
  /** Local attribute token info, in authored order (GatherTokens input). */
  attrs: AttrTokenInfo[]
  /** Local relationship token info, in authored order. */
  rels: RelTokenInfo[]
}

/** @internal */
export interface RelTokenInfo {
  name: string
  generatedSchemaPropName: string
  /** PropInfo.tokenId (py:358): name with a '_' suffix when reserved. */
  tokenId: string
  /** '' for API schema overrides and suppressed accessors (py:362-371). */
  apiName: string
  /** customData apiGetImplementation: 'generated' or 'custom' (py:372). */
  apiGet: string
  custom: boolean
  doc: string
}

/** @internal */
export interface AttrTokenInfo extends RelTokenInfo {
  /** True for scalar `token`-typed attributes (fallbacks become tokens). */
  isTokenScalar: boolean
  fallback: unknown
  allowedTokens: string[] | undefined
  /** Sdf value type name, e.g. 'float3[]'. */
  typeName: string
  variability: 'varying' | 'uniform'
}

/** @internal A gathered token: C++-style identifier and its value. */
export interface TokenInfo {
  id: string
  value: string
}

function buildClassInfo(
  stage: SchemaStage,
  sdfPrim: SpecRef,
  primName: string,
  useLiteralIdentifier: boolean,
): ClassInfo {
  const primPath = `/${primName}`
  const specTypeName = (sdfPrim.layer.getField(sdfPrim.path, 'typeName') as string | undefined) ?? ''

  // First validate proper class naming (py:487).
  if (specTypeName !== primName && specTypeName !== '') {
    throw schemaDefError(
      "Code generation requires that every instantiable class's name must "
      + `match its declared type ('${specTypeName}' and '${primName}' do not match.)`,
      primPath)
  }

  // Composed inherits metadata (py:498) — see COMPOSITION NOTE.
  const inheritsList = stage.composedInheritPaths(primName)
  if (inheritsList.length > 1) {
    throw schemaDefError(
      'Schemas can only inherit from one other schema at most. '
      + `This schema inherits from ${inheritsList.length} (${inheritsList.join(', ')}).`,
      primPath)
  }

  const customData: Dict = isDict(sdfPrim.layer.getField(sdfPrim.path, 'customData'))
    ? { ...(sdfPrim.layer.getField(sdfPrim.path, 'customData') as Dict) }
    : {}

  const names = extractNames(sdfPrim, primName, customData)

  // Class parent's info (py:539).
  const parentClass = inheritsList.length > 0
    ? inheritsList[0]!.split('/').pop()!
    : 'SchemaBase'
  const { layer: parentLayer, spec: parentSpec } = getDefiningLayerAndPrim(stage, parentClass)
  getLibPath(parentLayer) // parentLibPath — validates parent layer metadata (py:542)
  let parentCustomData: Dict = {}
  let parentCppClassName = ''
  let parentClassName = ''
  let parentLibName = ''
  if (parentSpec !== null) {
    const pcd = parentSpec.layer.getField(parentSpec.path, 'customData')
    parentCustomData = isDict(pcd) ? pcd : {}
    const parentNames = extractNames(parentSpec, parentClass, parentCustomData)
    parentCppClassName = parentNames.cppClassName
    parentClassName = parentNames.className
    parentLibName = getLibName(parentLayer)
  } else if (names.cppClassName === 'UsdTyped' || names.cppClassName === 'UsdAPISchemaBase') {
    // Only Typed and APISchemaBase are allowed to have no inherits (py:549).
    parentCppClassName = 'UsdSchemaBase'
  }

  // Built-in API schemas metadata — the list op authored directly on the
  // class spec (py:566), and the full composed applied list (py:571).
  const apiSchemasMetadata = sdfNormalizeListOp<string>(sdfPrim.layer.getField(sdfPrim.path, 'apiSchemas'))
  const allAppliedAPISchemas = composedTokenListOp(stage.primStack(primName), 'apiSchemas')

  // Schema types may only PREPEND additional applied API schemas (py:578).
  // (The deprecated 'add' bucket folds into appendedItems in our parser; both
  // are non-prepend edits upstream rejects.)
  if (apiSchemasMetadata !== null) {
    if (apiSchemasMetadata.isExplicit ||
        (apiSchemasMetadata.explicitItems?.length ?? 0) > 0 ||
        (apiSchemasMetadata.appendedItems?.length ?? 0) > 0 ||
        (apiSchemasMetadata.deletedItems?.length ?? 0) > 0) {
      throw schemaDefError(
        "The 'apiSchemas' metadata list operation is only allowed to prepend "
        + 'API schemas.', primPath)
    }
  }

  // Do not inherit the type name of parent classes (py:588).
  let typeName = specTypeName
  if (inheritsList.length > 0) {
    for (const path of inheritsList) {
      const parentTypeName = parentLayer.getField(path, 'typeName') as string | undefined
      if (parentTypeName !== undefined && parentTypeName === typeName) typeName = ''
    }
  }

  const isConcrete = typeName !== ''
  const isTyped = stage.findAllInherits(primName).includes('/Typed')
  const isTypedBase = names.cppClassName === 'UsdTyped'
  const isAPISchemaBase = names.cppClassName === 'UsdAPISchemaBase'
  const fallbackPrimTypes = tokenList(customData[FALLBACK_TYPES])

  const isApi = !isTyped && !isConcrete && !isAPISchemaBase && !isTypedBase
  const apiSchemaType = typeof customData[API_SCHEMA_TYPE] === 'string'
    ? (customData[API_SCHEMA_TYPE] as string)
    : (isApi ? SINGLE_APPLY : null)
  const propertyNamespacePrefix = typeof customData[PROPERTY_NAMESPACE_PREFIX] === 'string'
    ? (customData[PROPERTY_NAMESPACE_PREFIX] as string)
    : null
  const apiAutoApply = tokenList(customData[API_AUTO_APPLY])
  const apiCanOnlyApply = tokenList(customData[API_CAN_ONLY_APPLY])
  const apiAllowedInstanceNames = tokenList(customData[API_ALLOWED_INSTANCE_NAMES])
  const apiSchemaInstances = isDict(customData[API_SCHEMA_INSTANCES])
    ? (customData[API_SCHEMA_INSTANCES] as Dict)
    : undefined

  // _InheritsOwnFamily (py:616).
  const ownFamily = UsdSchemaRegistry.parseSchemaFamilyAndVersionFromIdentifier(primName)?.[0]
  const inheritedFamilies = stage.findAllInherits(primName).map(p =>
    UsdSchemaRegistry.parseSchemaFamilyAndVersionFromIdentifier(p.split('/').pop()!)?.[0])
  if (ownFamily !== undefined && inheritedFamilies.includes(ownFamily)) {
    throw schemaDefError(
      'Invalid inheritance: A schema cannot directly or indirectly inherit '
      + 'from another schema in the same schema family.', primPath)
  }

  if (apiSchemaType !== MULTIPLE_APPLY) {
    if (propertyNamespacePrefix) {
      throw schemaDefError(
        `${PROPERTY_NAMESPACE_PREFIX} should only be used as a customData `
        + 'field on multiple-apply API schemas.', primPath)
    }
    if (apiAllowedInstanceNames && apiAllowedInstanceNames.length > 0) {
      throw schemaDefError(
        `${API_ALLOWED_INSTANCE_NAMES} should only be used as a customData `
        + 'field on multiple-apply API schemas.', primPath)
    }
    if (apiSchemaInstances && Object.keys(apiSchemaInstances).length > 0) {
      throw schemaDefError(
        `${API_SCHEMA_INSTANCES} should only be used as a customData field `
        + 'on multiple-apply API schemas.', primPath)
    }
  }

  if (isApi && (apiSchemaType === null || !API_SCHEMA_TYPE_TOKENS.includes(apiSchemaType))) {
    throw schemaDefError(
      `CustomData 'apiSchemaType' is ${apiSchemaType}. It must be one of `
      + `${API_SCHEMA_TYPE_TOKENS.join(', ')} for an API schema.`, primPath)
  }

  if (apiAutoApply && apiAutoApply.length > 0 && apiSchemaType !== SINGLE_APPLY) {
    throw schemaDefError(
      `${API_AUTO_APPLY} should only be used as a customData field on `
      + 'single-apply API schemas.', primPath)
  }

  const isAppliedAPISchema = apiSchemaType === SINGLE_APPLY || apiSchemaType === MULTIPLE_APPLY
  const isMultipleApply = apiSchemaType === MULTIPLE_APPLY

  if (apiCanOnlyApply && apiCanOnlyApply.length > 0 && !isAppliedAPISchema) {
    throw schemaDefError(
      `${API_CAN_ONLY_APPLY} should only be used as a customData field on `
      + 'applied API schemas.', primPath)
  }

  let schemaKind: string
  if (isApi) {
    schemaKind = !isAppliedAPISchema ? 'nonAppliedAPI'
      : isMultipleApply ? 'multipleApplyAPI' : 'singleApplyAPI'
  } else if (isTyped && !isTypedBase) {
    schemaKind = isConcrete ? 'concreteTyped' : 'abstractTyped'
  } else {
    schemaKind = 'abstractBase'
  }

  if (isConcrete && !isTyped) {
    throw schemaDefError(
      'Schema classes must either inherit Typed(IsA), or neither inherit '
      + 'typed nor provide a typename(API).', primPath)
  }

  if (!UsdSchemaRegistry.isAllowedSchemaIdentifier(primName)) {
    throw schemaDefError('Schema name is not an allowed schema identifier.', primPath)
  }

  const [family, version] =
    UsdSchemaRegistry.parseSchemaFamilyAndVersionFromIdentifier(primName)!

  if (isApi && primName !== 'APISchemaBase' && !family.endsWith('API')) {
    throw schemaDefError('API schemas must be named with an API suffix.', primPath)
  }

  if (isTyped && family.endsWith('API')) {
    throw schemaDefError('Typed schemas cannot be named with an API suffix.', primPath)
  }

  if (isApi && primName !== 'APISchemaBase' && parentCppClassName !== 'UsdAPISchemaBase') {
    if (isAppliedAPISchema) {
      throw schemaDefError(
        'Applied API schemas must explicitly inherit directly from '
        + 'APISchemaBase.', primPath)
    } else if (parentCustomData[API_SCHEMA_TYPE] !== NON_APPLIED) {
      throw schemaDefError(
        'Non-applied API schemas must inherit directly from APISchemaBase or '
        + 'another non-applied API schema.', primPath)
    }
  }

  if (!isApi && isAppliedAPISchema) {
    throw schemaDefError(
      'Non API schemas cannot have non-empty apiSchemaType value.', primPath)
  }

  if (fallbackPrimTypes && fallbackPrimTypes.length > 0 && !isConcrete) {
    throw schemaDefError(
      'fallbackPrimTypes can only be used as a customData field on concrete '
      + 'typed schema classes', primPath)
  }

  return {
    usdPrimTypeName: names.usdPrimTypeName,
    className: names.className,
    cppClassName: names.cppClassName,
    baseFileName: names.baseFileName,
    primName,
    parentCppClassName,
    parentClassName,
    parentLibName,
    doc: (sdfPrim.layer.getField(sdfPrim.path, 'documentation') as string | undefined) ?? '',
    reflectedAPISchemas: tokenList(customData['reflectedAPISchemas']) ?? [],
    typeName,
    customData,
    isConcrete,
    isTyped,
    isApi,
    isAppliedAPISchema,
    isMultipleApply,
    schemaKind,
    apiSchemaType,
    propertyNamespacePrefix,
    apiAutoApply,
    apiCanOnlyApply,
    apiAllowedInstanceNames,
    apiSchemaInstances,
    fallbackPrimTypes,
    allAppliedAPISchemas,
    apiSchemaOverridePropertyNames: [],
    family,
    version,
    useLiteralIdentifier,
    attrs: [],
    rels: [],
  }
}

// _GetAPISchemaOverridePropertyNames (py:802) — over the COMPOSED property
// set (inherited base-class properties included).
function getAPISchemaOverridePropertyNames(
  stage: SchemaStage,
  primName: string,
  propertyNamespacePrefix: string | null,
): string[] {
  const out: string[] = []
  const stack = stage.primStack(primName)
  for (const propName of composedPropertyNames(stack)) {
    const propStack = propertyStack(stack, propName)
    if (propStack.length === 0) continue
    const strongestCustomData = propStack[0]!.layer.getField(propStack[0]!.path, 'customData')
    if (!isDict(strongestCustomData) || strongestCustomData['apiSchemaOverride'] !== true) continue

    // Every weaker spec that defines this property must also declare it an
    // API schema override (py:833) — derived classes may not delete base
    // class properties through the override backdoor.
    for (const weaker of propStack.slice(1)) {
      const cd = weaker.layer.getField(weaker.path, 'customData')
      if (!isDict(cd) || cd['apiSchemaOverride'] !== true) {
        throw schemaDefError(
          'Invalid schema property definition encountered while processing '
          + `property /${primName}.${propName}.\n`
          + "Property declarations in schema classes cannot set "
          + "'apiSchemaOverride=true' on properties which exist in their "
          + 'inherited classes but are not already defined as API schemas overrides.',
          weaker.path)
      }
    }

    out.push(propertyNamespacePrefix
      ? UsdSchemaRegistry.makeMultipleApplyNameTemplate(propertyNamespacePrefix, propName)
      : propName)
  }
  return out
}

// ---- Class parsing (_GenerateClassInfo, py:861) ----

interface ClassSpecEntry {
  primName: string
  spec: SpecRef
}

function generateClassInfo(
  stage: SchemaStage,
  specs: readonly ClassSpecEntry[],
  useLiteralIdentifier: boolean,
): ClassInfo[] {
  const classes: ClassInfo[] = []
  const fieldErrors: string[] = []
  let hasInvalidFields = false

  for (const { primName, spec } of specs) {
    const specifier = spec.layer.getField(spec.path, 'specifier')
    if (specifier !== 'class') continue

    if (!validateFields(spec.layer, spec.path, fieldErrors)) hasInvalidFields = true

    const classInfo = buildClassInfo(stage, spec, primName, useLiteralIdentifier)

    // Multiple-apply property namespace prefix requirements (py:879).
    const ownPropNames =
      (spec.layer.getField(spec.path, 'properties') as string[] | undefined) ?? []
    if (classInfo.apiSchemaType === MULTIPLE_APPLY) {
      if (classInfo.propertyNamespacePrefix && ownPropNames.length === 0) {
        throw schemaDefError(
          'Multiple-apply schemas that have the propertyNamespacePrefix '
          + 'metadata fields must have at least one property', spec.path)
      }
      if (!classInfo.propertyNamespacePrefix && ownPropNames.length !== 0) {
        throw schemaDefError(
          'Multiple-apply schemas that do not have a propertyNamespacePrefix '
          + 'metadata field must have zero properties', spec.path)
      }

      // Templatize included API schema names (py:893).
      classInfo.allAppliedAPISchemas =
        classInfo.allAppliedAPISchemas.map(makeMultipleApplySchemaNameTemplate)
    }

    // Local property parsing: unique names + API names (py:917).
    const attrNames = new Set<string>()
    const relNames = new Set<string>()
    const attrApiNames: string[] = []
    const relApiNames: string[] = []
    for (const sdfPropName of ownPropNames) {
      const propPath = `${spec.path}.${sdfPropName}`
      if (!validateFields(spec.layer, propPath, fieldErrors)) hasInvalidFields = true

      // PropInfo naming (py:325): the placeholder name means an empty base name.
      const rawName = sdfPropName === INSTANCE_NAME_PLACEHOLDER ? '' : sdfPropName
      const { name, generatedSchemaPropName } = propNames(rawName, classInfo.propertyNamespacePrefix)
      const propCustomData = spec.layer.getField(propPath, 'customData')
      const isAPISchemaOverride =
        isDict(propCustomData) && propCustomData['apiSchemaOverride'] === true
      const apiName = isAPISchemaOverride
        ? ''
        : isDict(propCustomData) && typeof propCustomData['apiName'] === 'string'
          ? propCustomData['apiName']
          : camelCase(rawName)

      const isRel = spec.layer.getSpecType(propPath) === 'relationship'
      if (!isRel) {
        // AttrInfo requires a known Sdf value type (py:404).
        const attrTypeName = spec.layer.getField(propPath, 'typeName') as string | undefined
        const bare = attrTypeName?.replace(/^uniform |^varying /, '')
        if (bare === undefined || findValueTypeName(bare) === undefined) {
          throw schemaDefError(
            'Code generation requires that all attributes have a known type '
            + `(<${propPath}> has type '${attrTypeName}', which is not a member `
            + 'of Sdf.ValueTypeNames.)', propPath)
        }
        if (apiName !== '') {
          if (attrNames.has(name)) {
            throw new Error(
              'Schema Attribute names must be unique, irrespective of namespacing. '
              + `Duplicate name encountered: ${classInfo.usdPrimTypeName}.${name}`)
          }
          if (attrApiNames.includes(apiName)) {
            throw new Error(
              'Schema Attribute API names must be unique. '
              + `Duplicate apiName encountered: ${classInfo.usdPrimTypeName}.${apiName}`)
          }
          attrApiNames.push(apiName)
        }
        attrNames.add(name)
        classInfo.attrs.push({
          name,
          generatedSchemaPropName,
          tokenId: makeValidTokenId(name),
          apiName,
          apiGet: propApiGet(propCustomData),
          // schemaClass.cpp passes attr.custom, which PropInfo never defines,
          // so generated properties are always created non-custom.
          custom: false,
          doc: (spec.layer.getField(propPath, 'documentation') as string | undefined) ?? '',
          typeName: bare,
          variability: spec.layer.getField(propPath, 'variability') === 'uniform' ? 'uniform' : 'varying',
          isTokenScalar: bare === 'token',
          fallback: spec.layer.getField(propPath, 'default'),
          allowedTokens: spec.layer.getField(propPath, 'allowedTokens') as string[] | undefined,
        })
      } else {
        if (apiName !== '') {
          if (relNames.has(name)) {
            throw new Error(
              'Schema Relationship names must be unique, irrespective of namespacing. '
              + `Duplicate name encountered: ${classInfo.usdPrimTypeName}.${name}`)
          }
          if (relApiNames.includes(apiName)) {
            throw new Error(
              'Schema Relationship API names must be unique. '
              + `Duplicate apiName encountered: ${classInfo.usdPrimTypeName}.${apiName}`)
          }
          relApiNames.push(apiName)
        }
        relNames.add(name)
        classInfo.rels.push({
          name,
          generatedSchemaPropName,
          tokenId: makeValidTokenId(name),
          apiName,
          apiGet: propApiGet(propCustomData),
          // schemaClass.cpp passes attr.custom, which PropInfo never defines,
          // so generated properties are always created non-custom.
          custom: false,
          doc: (spec.layer.getField(propPath, 'documentation') as string | undefined) ?? '',
        })
      }
    }

    // Full flattened override-property list, template-prefixed for
    // multiple-apply schemas (py:968).
    classInfo.apiSchemaOverridePropertyNames = getAPISchemaOverridePropertyNames(
      stage, primName, classInfo.propertyNamespacePrefix)

    classes.push(classInfo)

    if (hasInvalidFields) {
      throw new Error(`Invalid fields specified in schema.\n${fieldErrors.join('\n')}`)
    }
  }

  return classes
}

// ---- ParseUsd (py:982) ----

interface ParsedSchema {
  libName: string
  skipCodeGen: boolean
  classes: ClassInfo[]
  /** classes + reflected-schema class infos — GatherTokens' input set. */
  tokenClasses: ClassInfo[]
  /** /GLOBAL customData libraryTokens (GatherTokens' library-wide input). */
  libTokens: Dict
}

function parseSchema(stage: SchemaStage): ParsedSchema {
  const rootLayer = stage.rootLayer

  // useLiteralIdentifier comes from the ROOT layer only (py:987).
  const useLiteralIdentifier = useLiteralIdentifierForLayer(rootLayer)

  const rootSpecs: ClassSpecEntry[] = stage.layerRootPrimNames(rootLayer).map(primName => ({
    primName,
    spec: { layer: rootLayer, path: `/${primName}` },
  }))
  const classes = generateClassInfo(stage, rootSpecs, useLiteralIdentifier)

  // Reflected API schemas (py:994): validate their defining specs too — the
  // classInfos they produce feed codegen only, but their validation errors
  // surface here exactly as upstream's second _GenerateClassInfo pass.
  const reflectedNames = new Set<string>()
  for (const { primName, spec } of rootSpecs) {
    const cd = spec.layer.getField(spec.path, 'customData')
    if (isDict(cd) && tokenList(cd['reflectedAPISchemas'])) {
      for (const n of tokenList(cd['reflectedAPISchemas'])!) reflectedNames.add(n)
    }
  }
  const rootNames = new Set(rootSpecs.map(e => e.primName))
  const reflectedSpecs: ClassSpecEntry[] = []
  for (const name of reflectedNames) {
    if (rootNames.has(name)) continue // already validated above
    const own = stage.ownSpecs(name)
    if (own.length > 0) reflectedSpecs.push({ primName: name, spec: own[0]! })
  }
  const reflectedClasses = reflectedSpecs.length > 0
    ? generateClassInfo(stage, reflectedSpecs, useLiteralIdentifier)
    : []

  // Applied-API inheritance compatibility across the module (py:1012).
  for (const classInfo of classes) {
    if (!classInfo.isApi || classInfo.parentCppClassName === 'UsdAPISchemaBase') continue
    const parentClassInfo = classes.find(c => c.cppClassName === classInfo.parentCppClassName)
    if (parentClassInfo) {
      if (parentClassInfo.isAppliedAPISchema !== classInfo.isAppliedAPISchema) {
        throw new Error(
          `API schema '${classInfo.cppClassName}' inherits from incompatible base `
          + `API schema '${parentClassInfo.cppClassName}'. Both must be either `
          + 'applied API schemas or non-applied API schemas.')
      }
      if (parentClassInfo.isMultipleApply !== classInfo.isMultipleApply) {
        throw new Error(
          `API schema '${classInfo.cppClassName}' inherits from incompatible base `
          + `API schema '${parentClassInfo.cppClassName}'. Both must be either `
          + 'single-apply or multiple-apply.')
      }
    }
    // Upstream falls back to a TfType lookup for out-of-module parents
    // (py:1032); parents outside the layer stack are unregistered contrived
    // types in this port's inputs, so the lookup contributes nothing here.
  }

  // ParseUsd's return-tuple accessors (py:1050): libraryPath is required for
  // code-full schema libs — validate even though the path itself feeds only
  // the unported codegen half.
  const libName = getLibName(rootLayer)
  void getLibPath(rootLayer)

  const libTokensRaw = getLibMetadata(rootLayer)['libraryTokens']

  return {
    libName,
    skipCodeGen: skipCodeGenForSchemaLib(stage),
    classes,
    tokenClasses: [...reflectedClasses, ...classes],
    libTokens: isDict(libTokensRaw) ? libTokensRaw : {},
  }
}

// ---- GatherTokens (py:1206) — the slice with observable behavior for the
//      registry outputs: _AddToken's one-to-one identifier→value guarantee
//      (py:1186). Tokens feed the unported tokens.h codegen; the VALIDATION
//      still runs for code-full schemas, exactly as upstream. ----

// C++ + Python reserved words (py:1148-1173); reserved ids get a '_' suffix.
const RESERVED_TOKEN_IDS = new Set([
  // C++ keywords
  'alignas', 'alignof', 'and', 'and_eq', 'asm', 'atomic_cancel',
  'atomic_commit', 'atomic_noexcept', 'auto', 'bitand', 'bitor', 'bool',
  'break', 'case', 'catch', 'char', 'char8_t', 'char16_t', 'char32_t',
  'class', 'compl', 'concept', 'const', 'consteval', 'constexpr',
  'constinit', 'const_cast', 'continue', 'co_await', 'co_return',
  'co_yield', 'decltype', 'default', 'delete', 'do', 'double',
  'dynamic_cast', 'else', 'enum', 'explicit', 'export', 'extern', 'false',
  'float', 'for', 'friend', 'goto', 'if', 'inline', 'int', 'long',
  'mutable', 'namespace', 'new', 'noexcept', 'not', 'not_eq', 'nullptr',
  'operator', 'or', 'or_eq', 'private', 'protected', 'public', 'reflexpr',
  'register', 'reinterpret_cast', 'requires', 'return', 'short', 'signed',
  'sizeof', 'static', 'static_assert', 'static_cast', 'struct', 'switch',
  'synchronized', 'template', 'this', 'thread_local', 'throw', 'true',
  'try', 'typedef', 'typeid', 'typename', 'union', 'unsigned', 'using',
  'virtual', 'void', 'volatile', 'wchar_t', 'while', 'xor', 'xor_eq',
  // Python keywords (keyword.kwlist)
  'False', 'None', 'True', 'as', 'assert', 'async', 'await', 'del',
  'elif', 'except', 'finally', 'from', 'global', 'import', 'in', 'is',
  'lambda', 'nonlocal', 'pass', 'raise', 'with', 'yield',
  // Not keywords, but treated as reserved (py:1168).
  'interface',
])

// _MakeValidTokenId (py:1164-1201).
function makeValidTokenId(tokenId: string, useLiteralIdentifier = false): string {
  if (!isValidIdentifier(tokenId)) {
    tokenId = makeValidToken(tokenId, useLiteralIdentifier)
  } else if (!useLiteralIdentifier) {
    // Without literal identifiers, valid ids still camelCase by convention.
    tokenId = camelCase(tokenId)
  }
  if (RESERVED_TOKEN_IDS.has(tokenId)) tokenId = tokenId + '_'
  return tokenId
}

// PropInfo.apiGet (py:372-375).
function propApiGet(customData: unknown): string {
  const v = isDict(customData) ? customData['apiGetImplementation'] : undefined
  return typeof v === 'string' ? v : 'generated'
}

function addToken(
  tokenDict: Map<string, string>,
  tokenId: string,
  value: string,
  useLiteralIdentifier: boolean,
): void {
  tokenId = makeValidTokenId(tokenId, useLiteralIdentifier)

  const existing = tokenDict.get(tokenId)
  if (existing !== undefined) {
    if (existing !== value) {
      throw new Error(
        'Token identifiers must map to exactly one token value. '
        + `One-to-Many mapping encountered: ${tokenId} maps to "${existing}" and "${value}"`)
    }
    return
  }
  tokenDict.set(tokenId, value)
}

function gatherTokens(classes: readonly ClassInfo[], libTokens: Dict): TokenInfo[] {
  const tokenDict = new Map<string, string>()
  const schemaIdentifierTokens = new Map<string, string>()

  for (const cls of classes) {
    // Schema identifier + family tokens (py:1214), kept separate.
    addToken(schemaIdentifierTokens, cls.usdPrimTypeName, cls.usdPrimTypeName, true)
    if (cls.version !== 0) {
      addToken(schemaIdentifierTokens, cls.family, cls.family, true)
    }

    for (const attr of cls.attrs) {
      addToken(tokenDict, attr.name, attr.generatedSchemaPropName, false)

      const addTokenForFallback =
        attr.isTokenScalar && typeof attr.fallback === 'string' && attr.fallback !== ''
      if (addTokenForFallback) {
        addToken(tokenDict, attr.fallback as string, attr.fallback as string,
          cls.useLiteralIdentifier)
      }
      for (const val of attr.allowedTokens ?? []) {
        if (addTokenForFallback && val === attr.fallback) continue
        if (val === '') continue
        addToken(tokenDict, val, val, cls.useLiteralIdentifier)
      }
    }

    // Relationship / schema / property-namespace tokens follow the literal
    // identifier pattern (py:1283).
    for (const rel of cls.rels) {
      addToken(tokenDict, rel.name, rel.generatedSchemaPropName, true)
    }
    const schemaTokens = isDict(cls.customData['schemaTokens'])
      ? (cls.customData['schemaTokens'] as Dict)
      : {}
    for (const [token, info] of Object.entries(schemaTokens)) {
      const value = isDict(info) && typeof info['value'] === 'string' ? info['value'] : token
      addToken(tokenDict, token, value, true)
    }
    if (cls.propertyNamespacePrefix) {
      addToken(tokenDict,
        makeValidToken(cls.propertyNamespacePrefix, cls.useLiteralIdentifier),
        cls.propertyNamespacePrefix, true)
    }
  }

  for (const [token, info] of Object.entries(libTokens)) {
    const value = isDict(info) && typeof info['value'] === 'string' ? info['value'] : token
    addToken(tokenDict, token, value, true)
  }

  // Schema identifier tokens take precedence over property tokens with the
  // same id (py:1317) — the moved token must still map to one value.
  for (const id of schemaIdentifierTokens.keys()) {
    const popped = tokenDict.get(id)
    if (popped !== undefined) {
      tokenDict.delete(id)
      addToken(schemaIdentifierTokens, id, popped, true)
    }
  }

  // Case-insensitive primary key, case-sensitive secondary key; schema
  // identifier tokens last (py:1353-1362).
  const sorted = (dict: Map<string, string>): TokenInfo[] =>
    [...dict].map(([id, value]) => ({ id, value })).sort((a, b) => {
      const la = a.id.toLowerCase(), lb = b.id.toLowerCase()
      if (la !== lb) return la < lb ? -1 : 1
      return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
    })
  return [...sorted(tokenDict), ...sorted(schemaIdentifierTokens)]
}

// ---- GeneratePlugInfo (py:1555) ----

function generatePlugInfo(classes: readonly ClassInfo[], libName: string, skipCodeGen: boolean): PlugInfo {
  const types: Record<string, PlugInfoTypeEntry> = {}
  for (const cls of classes) {
    const clsDict: Dict = {}
    // extraPlugInfo first so it can't stomp the generated entries (py:1623).
    if (isDict(cls.customData['extraPlugInfo'])) {
      Object.assign(clsDict, convertDictionaryForJSON(cls.customData['extraPlugInfo']))
    }
    clsDict['bases'] = [cls.parentCppClassName]
    clsDict['autoGenerated'] = true
    clsDict['schemaKind'] = cls.schemaKind

    // _UpdatePlugInfoWithAPISchemaApplyInfo (py:1522).
    if (cls.isAppliedAPISchema) {
      if (cls.apiAutoApply && cls.apiAutoApply.length > 0) {
        clsDict[API_AUTO_APPLY] = [...cls.apiAutoApply]
      }
      if (cls.apiCanOnlyApply && cls.apiCanOnlyApply.length > 0) {
        clsDict[API_CAN_ONLY_APPLY] = [...cls.apiCanOnlyApply]
      }
      if (cls.apiAllowedInstanceNames && cls.apiAllowedInstanceNames.length > 0) {
        clsDict[API_ALLOWED_INSTANCE_NAMES] = [...cls.apiAllowedInstanceNames]
      }
      if (cls.apiSchemaInstances) {
        const instancesDict: Dict = {}
        for (const [k, v] of Object.entries(cls.apiSchemaInstances)) {
          const canOnlyApply = isDict(v) ? tokenList(v[API_CAN_ONLY_APPLY]) : undefined
          if (canOnlyApply && canOnlyApply.length > 0) {
            instancesDict[k] = { [API_CAN_ONLY_APPLY]: canOnlyApply }
          }
        }
        if (Object.keys(instancesDict).length > 0) {
          clsDict[API_SCHEMA_INSTANCES] = instancesDict
        }
      }
    }

    if (cls.usdPrimTypeName !== cls.cppClassName) {
      clsDict['alias'] = { UsdSchemaBase: cls.usdPrimTypeName }
    }
    clsDict['schemaIdentifier'] = cls.usdPrimTypeName

    types[cls.cppClassName] = clsDict as PlugInfoTypeEntry
  }

  return {
    Plugins: [{
      Info: { Types: types },
      Name: libName,
      Type: skipCodeGen ? 'resource' : 'library',
    }],
  }
}

// ---- Flattened prim/property models (the _MakeFlattenedRegistryLayer +
//      GenerateRegistry data, py:1633/1788) ----

// Composition arc + structural fields never copied into the flattened output
// (upstream's flatten resolves arcs away; children lists are re-derived).
const FLATTEN_PRIM_FIELD_EXCLUDE = new Set([
  'specifier', 'typeName', 'primChildren', 'properties', 'primOrder',
  'inheritPaths', 'specializes', 'references', 'payload',
  'variantSetChildren', 'variantSetNames', 'variantSelection', 'relocates',
  'apiSchemas', 'customData', 'documentation', 'comment',
])

const FLATTEN_PROP_FIELD_EXCLUDE = new Set([
  'customData', 'comment',
])

interface FlatProperty {
  name: string
  isRelationship: boolean
  fields: Dict // composed spec fields (typeName, default, variability, ...)
  customData: Dict
  doc: string | undefined
}

interface FlatPrim {
  primName: string
  typeName: string | undefined
  metadata: Dict // composed generic metadata (propertyOrder, kind, ...)
  customData: Dict
  ownDoc: string | undefined // per the flatten doc-reset loop (py:1667)
  apiSchemas: string[] // the class's full applied-API list
  properties: FlatProperty[]
}

function flatPrimFromLayer(layer: Layer, cls: ClassInfo): FlatPrim {
  const primPath = `/${cls.primName}`
  const metadata: Dict = {}
  for (const field of realFieldNames(layer, primPath)) {
    if (FLATTEN_PRIM_FIELD_EXCLUDE.has(field)) continue
    metadata[field] = layer.getField(primPath, field)
  }
  const properties: FlatProperty[] = []
  const propertyNames = (layer.getField(primPath, 'properties') as string[] | undefined) ?? []
  for (const propName of propertyNames) {
    const propPath = `${primPath}.${propName}`
    const fields: Dict = {}
    for (const field of realFieldNames(layer, propPath)) {
      if (FLATTEN_PROP_FIELD_EXCLUDE.has(field) || field === 'documentation') continue
      fields[field] = layer.getField(propPath, field)
    }
    const customData = layer.getField(propPath, 'customData')
    properties.push({
      name: propName,
      isRelationship: layer.getSpecType(propPath) === 'relationship',
      fields,
      customData: isDict(customData) ? customData : {},
      doc: layer.getField(propPath, 'documentation') as string | undefined,
    })
  }
  const customData = layer.getField(primPath, 'customData')
  return {
    primName: cls.primName,
    typeName: (layer.getField(primPath, 'typeName') as string | undefined) || undefined,
    metadata,
    customData: isDict(customData) ? customData : {},
    ownDoc: layer.getField(primPath, 'documentation') as string | undefined,
    // ParseUsd templatizes built-in API instance names for multiple-apply
    // classes before GenerateRegistry authors the explicit composed list.
    apiSchemas: cls.allAppliedAPISchemas,
    properties,
  }
}

// _GetUserDocForSchemaObj (py:1743-1773). userDocBrief is the brief authored
// on the same-path object of the schemaUserDoc.usda stage, when there is one.
function briefUserDoc(customData: Dict, doc: string | undefined, userDocBrief?: string): string | undefined {
  if (userDocBrief !== undefined) return userDocBrief.trim()
  const authored = customData[USERDOC_BRIEF]
  if (typeof authored === 'string') return authored.trim()
  if (doc !== undefined && doc !== '') {
    // First sentence: split at ". " or ".\n" (the regex consumes the
    // delimiter, so re-append the period).
    const m = /\. |\.\n/.exec(doc)
    let workDoc = (m ? doc.slice(0, m.index) : doc).trim()
    if (workDoc.length > MAX_LENGTH_FOR_USERDOCBRIEF) {
      workDoc = workDoc.slice(0, MAX_LENGTH_FOR_USERDOCBRIEF) + '...'
    } else if (workDoc.length > 0 && !workDoc.endsWith('.')) {
      workDoc = workDoc + '.'
    }
    return workDoc
  }
  return undefined
}

// _RenamePropertiesWithInstanceablePrefix (py:1679), applied to the flat
// property list of a multiple-apply API schema.
function renamePropertiesWithInstanceablePrefix(prim: FlatPrim): void {
  if (prim.properties.length === 0) return
  const namespacePrefix = prim.customData[PROPERTY_NAMESPACE_PREFIX]
  if (typeof namespacePrefix !== 'string' || namespacePrefix === '') {
    throw schemaDefError(
      'propertyNamespacePrefix must exist as a metadata field on '
      + 'multiple-apply API schemas with properties', `/${prim.primName}`)
  }
  const originalNames = new Set(prim.properties.map(p => p.name))
  const newNames = new Set<string>()
  for (const prop of prim.properties) {
    const newPropName = prop.name === INSTANCE_NAME_PLACEHOLDER
      ? UsdSchemaRegistry.makeMultipleApplyNameTemplate(namespacePrefix, '')
      : UsdSchemaRegistry.makeMultipleApplyNameTemplate(namespacePrefix, prop.name)
    if (originalNames.has(newPropName) || newNames.has(newPropName)) {
      throw schemaDefError(
        `Prefixed property name '${newPropName}' already exists as property `
        + 'base name in the schema.', `/${prim.primName}`)
    }
    newNames.add(newPropName)
    prop.name = newPropName
  }
}

// _MakeFlattenedRegistryLayer (usdGenSchema.py:1633-1677). This deliberately
// goes through the same Usd Stage -> session-layer edits -> Stage.flatten ->
// Sdf Layer boundary as upstream. The temporary type names prevent an already
// loaded schema registry from supplying non-overridable builtin property
// qualities while the registry artifacts themselves are being generated.
async function makeFlattenedRegistryLayer(
  stageModel: SchemaStage,
  assets: ReadonlyMap<string, Uint8Array>,
): Promise<Layer> {
  const resolver = new ArInMemoryResolver(assets)
  const stage = await Stage.open('schema.usda', {
    resolverContext: _resolverContextForResolver(resolver),
  })
  // Usd.Stage.Open raises its posted errors in usdGenSchema.py:1661.
  if (!stage) throw new TfError('Failed to open layer @schema.usda@', TfDiagnosticType.RuntimeError)
  const manglePrefix = '__MANGLED_TO_AVOID_BUILTINS__'
  stage.setEditTarget(stage.getSessionLayer())
  for (const path of stage.getAllChildPrimPaths('/')) {
    const prim = stage.getPrim(path)
    if (prim?.typeName) stage._setPrimTypeName(path, manglePrefix + prim.typeName)
  }
  await stage.flushChanges()

  // pxr/usd/usd/usdGenSchema.py:1680 flattens with addSourceFileComment=False.
  const flattened = stage.flatten(false)
  for (const name of stageModel.layerRootPrimNames(flattened)) {
    const path = `/${name}`
    const typeName = flattened.getField(path, 'typeName')
    if (typeof typeName === 'string' && typeName.startsWith(manglePrefix)) {
      flattened.setField(path, 'typeName', typeName.slice(manglePrefix.length))
    }
  }

  // Flatten composes documentation like ordinary metadata, but schema docs
  // are intentionally local: derived schemas must not inherit base docs.
  // Mirror upstream's post-flatten repair over the stage's local layer stack.
  for (const sourceLayer of stage.getLayerStack()) {
    for (const name of stageModel.layerRootPrimNames(sourceLayer)) {
      const path = `/${name}`
      if (!flattened.hasSpec(path)) continue
      const doc = sourceLayer.getField(path, 'documentation')
      if (doc !== undefined) flattened.setField(path, 'documentation', doc)
      else flattened.eraseField(path, 'documentation')
    }
  }
  return flattened
}

// GenerateRegistry (py:1788): build the flattened registry layer and export
// it as generatedSchema.usda text.
function generateRegistry(
  stage: SchemaStage,
  classes: readonly ClassInfo[],
  userDocBriefAt: (path: string) => string | undefined = () => undefined,
): string {
  const classByName = new Map(classes.map(c => [c.usdPrimTypeName, c]))
  const flattenedPrims = stage.flattenRegistryPrims(classes)

  // Flattened output keeps only this module's classes, in the root layer's
  // authored order (py:1815-1821 deletes everything else).
  const keptNames = stage.layerRootPrimNames(stage.rootLayer)
    .filter(name => classByName.has(name))

  const flat = Layer.createAnonymous('generatedSchema.usda')
  // Layer comment (py:1920) — note upstream's literal double space.
  flat.setField('/', 'comment',
    'WARNING: THIS FILE IS GENERATED BY usdGenSchema.  DO NOT EDIT.')

  const allFallbackSchemaPrimTypes: Dict = {}

  for (const name of keptNames) {
    const cls = classByName.get(name)!
    const prim = flattenedPrims.get(cls.primName)!

    // Brief user doc gathering happens BEFORE customData is stripped
    // (py:1799), from the flattened docs/customData.
    const primBrief = briefUserDoc(prim.customData, prim.ownDoc, userDocBriefAt(`/${name}`))
    const propBriefs = new Map<string, string>()
    for (const prop of prim.properties) {
      const brief = briefUserDoc(prop.customData, prop.doc, userDocBriefAt(`/${name}.${prop.name}`))
      if (brief !== undefined) propBriefs.set(prop.name, brief)
    }

    // Multiple-apply API schemas get instanceable property names (py:1830).
    const family =
      UsdSchemaRegistry.parseSchemaFamilyAndVersionFromIdentifier(name)?.[0] ?? name
    if (family.endsWith('API')) {
      const apiSchemaType = typeof prim.customData[API_SCHEMA_TYPE] === 'string'
        ? prim.customData[API_SCHEMA_TYPE]
        : SINGLE_APPLY
      if (apiSchemaType === MULTIPLE_APPLY) {
        renamePropertiesWithInstanceablePrefix(prim)
      }

      // API schema classes may not carry other prim metadata (py:1839).
      const allowedAPIMetadata = ['specifier', 'customData', 'documentation']
      if (apiSchemaType === SINGLE_APPLY || apiSchemaType === MULTIPLE_APPLY) {
        allowedAPIMetadata.push('apiSchemas')
      }
      if (apiSchemaType === SINGLE_APPLY) {
        allowedAPIMetadata.push('propertyOrder', 'uiHints')
      }
      const authoredKeys = [
        'specifier',
        ...(prim.typeName !== undefined ? ['typeName'] : []),
        ...(Object.keys(prim.customData).length > 0 ? ['customData'] : []),
        ...(prim.apiSchemas.length > 0 ? ['apiSchemas'] : []),
        ...Object.keys(prim.metadata),
      ]
      const invalidMetadata = authoredKeys.filter(k => !allowedAPIMetadata.includes(k))
      if (invalidMetadata.length > 0) {
        throw schemaDefError(
          `Found invalid metadata fields [${invalidMetadata.join(', ')}] in `
          + `API schema definition. API schemas of type ${apiSchemaType} can `
          + `only provide prim metadata fallbacks for [${allowedAPIMetadata.join(', ')}]`,
          `/${name}`)
      }
    }

    // fallbackPrimTypes root metadata (py:1862): only prims with an authored
    // type name contribute.
    if (prim.typeName !== undefined) {
      const fallbackTypes = tokenList(prim.customData[FALLBACK_TYPES])
      if (fallbackTypes && fallbackTypes.length > 0) {
        allFallbackSchemaPrimTypes[name] = fallbackTypes
      }
    }

    // ---- author the flattened prim spec ----
    const primPath = `/${name}`
    flat.definePrimSpec(primPath, prim.typeName, 'class')

    // Generic composed metadata (propertyOrder, ...) — documentation and
    // customData are stripped/replaced below (py:1804/1877).
    for (const [field, value] of Object.entries(prim.metadata)) {
      flat.setField(primPath, field, value)
    }

    // The class's full applied-API list as an EXPLICIT list op (py:1868).
    if (prim.apiSchemas.length > 0) {
      flat.setField(primPath, 'apiSchemas', {
        isExplicit: true,
        explicitItems: [...prim.apiSchemas],
        prependedItems: [], appendedItems: [], deletedItems: [], orderedItems: [],
      })
    }

    // Output customData: apiSchemaOverridePropertyNames (sorted, py:1888) +
    // the prim's brief user doc (py:1894).
    const outCustomData: Dict = {}
    if (cls.apiSchemaOverridePropertyNames.length > 0) {
      outCustomData['apiSchemaOverridePropertyNames'] =
        [...cls.apiSchemaOverridePropertyNames].sort()
    }
    if (primBrief !== undefined) outCustomData[USERDOC_BRIEF] = primBrief
    if (Object.keys(outCustomData).length > 0) {
      flat.setField(primPath, 'customData', outCustomData)
    }

    // Properties (docs cleared, customData replaced by userDocBrief; brief
    // lookups for renamed multiple-apply properties resolve through the base
    // name, py:1903 — our briefs were keyed pre-rename, i.e. by base name).
    for (const prop of prim.properties) {
      const propPath = `${primPath}.${prop.name}`
      if (prop.isRelationship) {
        RelationshipSpec.new(flat.getPrimAtPath(primPath), prop.name,
          prop.fields['custom'] === true, (prop.fields['variability'] as 'varying' | 'uniform') ?? 'uniform')
      }
      for (const [field, value] of Object.entries(prop.fields)) {
        flat.setField(propPath, field, value)
      }
      // py:1925-1934: a renamed multiple-apply property is looked up by
      // primPath.AppendProperty(GetBaseName()), and UsdProperty::GetBaseName
      // is the LAST namespace component, so a namespaced original name (e.g.
      // physics:high) finds no brief while a plain one does.
      const lookupName = UsdSchemaRegistry.isMultipleApplyNameTemplate(prop.name)
        ? prop.name.slice(prop.name.lastIndexOf(':') + 1)
        : prop.name
      const brief = propBriefs.get(lookupName)
      if (brief !== undefined) {
        flat.setField(propPath, 'customData', { [USERDOC_BRIEF]: brief })
      }
    }
    if (prim.properties.length > 0) {
      flat.setField(primPath, 'properties', prim.properties.map(p => p.name))
    }
  }

  if (Object.keys(allFallbackSchemaPrimTypes).length > 0) {
    flat.setField('/', 'fallbackPrimTypes', allFallbackSchemaPrimTypes)
  }

  // Export + doxygen tag strip (py:1931-1938). The exported text escapes
  // '\' to '\\', which the upstream replacements account for.
  let layerSource = flat.toUsda()
  layerSource = layerSource.split('\\\\em ').join('')
  layerSource = layerSource.split('\\\\li').join('-')
  layerSource = layerSource.replace(/\\+ref \S+ /g, '')
  layerSource = layerSource.replace(/\\+section \S+ /g, '')

  return layerSource
}

// ---- Entry point ----

export async function usdGenSchema(
  schemaUsdaText: string,
  options?: UsdGenSchemaOptions,
): Promise<UsdGenSchemaResult> {
  // Build the layer stack: the root schema.usda plus its recursive sublayers
  // (upstream resolves these through ArDefaultResolver over plugin resource
  // paths, py:2018; here the resolveAsset callback plays that role).
  const layers: Layer[] = []
  const assets = new Map<string, Uint8Array>()
  const seen = new Set<string>()
  const addLayer = async (identifier: string, text: string): Promise<void> => {
    seen.add(identifier)
    assets.set(identifier, new TextEncoder().encode(text))
    const layer = Layer.createInMemory(identifier, text)
    layers.push(layer)
    const subs = (layer.getField('/', 'subLayers') as string[] | undefined) ?? []
    for (const sub of subs) {
      if (seen.has(sub)) continue
      if (!options?.resolveAsset) {
        throw new Error(
          `usdGenSchema: cannot resolve sublayer '@${sub}@' — no resolveAsset provided`)
      }
      await addLayer(sub, await options.resolveAsset(sub))
    }
  }
  await addLayer('schema.usda', schemaUsdaText)

  const stage = new SchemaStage(layers)
  const { libName, skipCodeGen, classes, tokenClasses, libTokens } = parseSchema(stage)
  stage.flattenedRegistryLayer = await makeFlattenedRegistryLayer(stage, assets)

  // _UpdateUserDocForRegistry (py:1775-1812): briefs authored in
  // userDoc/schemaUserDoc.usda, read from that file's composed stage.
  let userDocBriefAt: (path: string) => string | undefined = () => undefined
  if (options?.userDocSchemaUsda !== undefined) {
    const userDocId = 'userDoc/schemaUserDoc.usda'
    const userDocAssets = new Map(assets)
    userDocAssets.set(userDocId, new TextEncoder().encode(options.userDocSchemaUsda))
    const userDocStage = await Stage.open(userDocId, {
      resolverContext: _resolverContextForResolver(new ArInMemoryResolver(userDocAssets)),
    })
    if (!userDocStage) throw new TfError(`Failed to open layer @${userDocId}@`, TfDiagnosticType.RuntimeError)
    userDocBriefAt = (path) => {
      const dot = path.indexOf('.')
      const prim = userDocStage.getPrim(dot < 0 ? path : path.slice(0, dot))
      if (!prim) return undefined
      const customData = dot < 0
        ? prim.getMetadata('customData')
        : userDocStage.getPropertyAtPath(path)?.getMetadata('customData')
      const brief = (customData as Dict | undefined)?.[USERDOC_BRIEF]
      return typeof brief === 'string' ? brief : undefined
    }
  }

  // Tokens are gathered only for code-full schemas (py:2187); the gather's
  // one-to-one identifier→value validation is the observable part here.
  const tokens = skipCodeGen ? [] : gatherTokens(tokenClasses, libTokens)

  return {
    generatedSchemaUsda: generateRegistry(stage, classes, userDocBriefAt),
    plugInfo: generatePlugInfo(classes, libName, skipCodeGen),
    isCodeless: skipCodeGen,
    ...(skipCodeGen ? {} : {
      _codegen: {
        libName,
        libPrefix: getLibPrefix(stage.rootLayer),
        libraryPath: getLibPath(stage.rootLayer),
        classes,
        reflectedClasses: new Map(tokenClasses.filter(c => !classes.includes(c)).map(c => [c.usdPrimTypeName, c])),
        tokens,
        allSchemaAttributeNames: new Map(classes.map(c => [c.primName, allSchemaAttributeNames(stage, c.primName)])),
      },
    }),
  }
}

// GetSchemaAttributeNames(true) as the generated schemaClass.cpp computes
// it: the parent class's names, then the local attributes with a non-empty
// apiName, in authored order (template-prefixed for multiple-apply schemas).
function allSchemaAttributeNames(stage: SchemaStage, primName: string): string[] {
  if (primName === 'SchemaBase') return []
  const { spec } = getDefiningLayerAndPrim(stage, primName)
  if (spec === null) return []
  const parent = stage.composedInheritPaths(primName)[0]?.replace(/^\//, '')
  const inherited = parent !== undefined ? allSchemaAttributeNames(stage, parent) : []
  const cd = spec.layer.getField(spec.path, 'customData')
  const prefix = isDict(cd) && typeof cd[PROPERTY_NAMESPACE_PREFIX] === 'string'
    ? cd[PROPERTY_NAMESPACE_PREFIX] as string : null
  const local: string[] = []
  for (const sdfPropName of (spec.layer.getField(spec.path, 'properties') as string[] | undefined) ?? []) {
    const propPath = `${spec.path}.${sdfPropName}`
    if (spec.layer.getSpecType(propPath) === 'relationship') continue
    const rawName = sdfPropName === INSTANCE_NAME_PLACEHOLDER ? '' : sdfPropName
    const propCustomData = spec.layer.getField(propPath, 'customData')
    const apiName = isDict(propCustomData) && propCustomData['apiSchemaOverride'] === true
      ? ''
      : isDict(propCustomData) && typeof propCustomData['apiName'] === 'string'
        ? propCustomData['apiName'] as string
        : camelCase(rawName)
    if (apiName === '') continue
    local.push(propNames(rawName, prefix).generatedSchemaPropName)
  }
  return [...inherited, ...local]
}
