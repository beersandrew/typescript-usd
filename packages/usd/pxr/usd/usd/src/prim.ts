// Ported from OpenUSD 26.11.1: pxr/usd/usd/prim.cpp, pxr/usd/usd/prim.h
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

import { Type as TfType, TfDiagnosticMgr, TfDiagnosticType, Error as TfError } from 'typescript-usd/tf'
import { SdfPath } from 'typescript-usd/sdf/path'
import { UsdPrimTypeInfo } from './primTypeInfo.ts'
import {
  UsdSchemaRegistry,
  type UsdSchemaInfo,
  type UsdSchemaVersion,
  type UsdSchemaVersionPolicy,
} from './schemaRegistry.ts'
import type { UsdPrimDefinition } from './primDefinition.ts'
import { dictionaryLessThan } from 'typescript-usd/tf'
import { _isDictValue, _dictOverRecursive } from './primDefinition.ts'
import { UsdRel } from './relationship.ts'
import type { UsdVariantSet, UsdVariantSets } from './variantSets.ts'
import { UsdAttributeQuery } from './attributeQuery.ts'
import { UsdReferences } from './references.ts'
import { UsdInherits } from './inherits.ts'
import { UsdSpecializes } from './specializes.ts'
import { UsdAttributeLimits } from './attributeLimits.ts'
import {
  ListPositionBackOfPrependList, type UsdListPosition,
} from './common.ts'
import type { Stage } from './stage.ts'
import { UsdEditTarget } from './editTarget.ts'
import { UsdResolveTarget, _makeUsdResolveTarget } from './resolveTarget.ts'
import {
  PrimIndex as PcpPrimIndex, PrimIndexOutputs as PcpPrimIndexOutputs, pcpComputePrimIndex,
} from 'typescript-usd/pcp'
import type { UsdPrimData } from './primData.ts'
import { isPathInPrototype } from './instanceCache.ts'
import { usdEvaluateSpline, usdTransformSpline } from './interpolators.ts'
import type { Spline as TsSpline } from 'typescript-usd/ts'
import {
  AnimationBlock as SdfAnimationBlock, Layer, ValueBlock as SdfValueBlock, findValueTypeName,
} from 'typescript-usd/sdf'
import { _sdfHandOut } from 'typescript-usd/sdf/_internal'
import type { Value as VtValue } from 'typescript-usd/vt'
import { _usdGetTypedMetadata } from './typedMetadata.ts'

// A metadata map a read returns is the caller's (UsdMetadataValueMap is
// returned by value); its values are read-only, as every value read is.
function _handOutValues(map: Record<string, unknown>): Record<string, unknown> {
  for (const key in map) _sdfHandOut(map[key])
  return map
}
import { _makeUsdResolveInfo, UsdResolveInfo } from './resolveInfo.ts'
import { Interval as GfInterval } from 'typescript-usd/gf'
import { Registry as KindRegistry } from 'typescript-usd/kind'
import {
  usdInterpolateResolvedSamples, usdResolvedBracketingTimes, usdResolvedSampleTimes, usdResolvePropertyNames,
  type UsdAttributeResolveResult,
} from './resolver.ts'
import { _usdTimeCodeQuery, UsdTimeCode } from './timeCode.ts'
import type {
  PropertyStackEntry, PropertyStackWithLayerOffsetEntry,
} from './primCompositionQuery.ts'
import {
  asPrimPredicate, PrimAllPrimsPredicate, PrimDefaultPredicate,
  type UsdPrimPredicate,
} from './primFlags.ts'

interface UsdAttributeQueryProvider {
  _resolveAttribute(
    dataPrimPath: string, propertyName: string, time: 'default' | number | undefined,
    fallback: () => unknown, resolveTarget?: UsdResolveTarget, resultPrimPath?: string,
  ): UsdAttributeResolveResult
  _resolvePropertyField(dataPrimPath: string, propertyName: string, fieldName: string): unknown
  _resolvePropertyFieldTypeName(
    dataPrimPath: string, propertyName: string, fieldName: string,
  ): string | undefined
  _isPropertyCustom(dataPrimPath: string, propertyName: string): boolean
  _setPropertyMetadata(
    primPath: string, propertyName: string, fieldName: string, value: unknown,
  ): void
  _resolvePropertyPaths(
    dataPrimPath: string, propertyName: string,
    fieldName: 'connectionPaths' | 'targetPaths',
    resultPrimPath?: string,
    pcpErrors?: unknown[],
  ): string[] | undefined
  getPropertyStack(propPath: string, time?: 'default' | number): PropertyStackEntry[]
  getPropertyStackWithLayerOffsets(
    propPath: string, time?: 'default' | number,
  ): PropertyStackWithLayerOffsetEntry[]
  _flattenProperty(
    source: Attribute, destination: unknown, destinationName?: string,
  ): Attribute
}

export interface FindAttributeConnectionPathsOptions {
  traversalPredicate?: 'default' | 'allPrims'
  predicate?: ((attr: Attribute) => boolean) | undefined
  recurseOnSources?: boolean
}

export interface FindRelationshipTargetPathsOptions {
  traversalPredicate?: 'default' | 'allPrims'
  predicate?: ((rel: UsdRel) => boolean) | undefined
  recurseOnTargets?: boolean
}


// ---------------------------------------------------------------------------
// Schema-query helpers for Prim (ports of the static helpers in
// OpenUSD v26.08 pxr/usd/usd/prim.cpp).
// ---------------------------------------------------------------------------

// _IsSchemaInAppliedSchemas (prim.cpp:239): multiple-apply schemas match any
// applied instance ('Identifier:...'); single-apply match the identifier
// exactly; non-applied kinds never match.
function isSchemaInAppliedSchemas(
  appliedSchemas: readonly string[], schemaInfo: UsdSchemaInfo,
): boolean {
  if (schemaInfo.kind === 'multipleApplyAPI') {
    const prefix = `${schemaInfo.identifier}:`
    return appliedSchemas.some((applied) => applied.startsWith(prefix))
  }
  if (schemaInfo.kind === 'singleApplyAPI') {
    return appliedSchemas.includes(schemaInfo.identifier)
  }
  return false
}

// _IsSchemaInstanceInAppliedSchemas (prim.cpp:273): exact
// '<identifier>:<instanceName>' match, multiple-apply only.
function isSchemaInstanceInAppliedSchemas(
  appliedSchemas: readonly string[], schemaInfo: UsdSchemaInfo, instanceName: string,
): boolean {
  if (schemaInfo.kind !== 'multipleApplyAPI') return false
  return appliedSchemas.includes(`${schemaInfo.identifier}:${instanceName}`)
}

// The _FindSchemaInfosInFamily overload set (prim.cpp:112-170): family alone,
// (family, version, policy), or a type/identifier + policy — resolving the
// type/identifier to its family and version (parsing the identifier when it
// names no registered schema).
function findSchemaInfosForQuery(
  schemaFamilyOrTypeOrIdentifier: string | TfType,
  version?: UsdSchemaVersion,
  versionPolicy?: UsdSchemaVersionPolicy,
): UsdSchemaInfo[] {
  if (typeof schemaFamilyOrTypeOrIdentifier !== 'string') {
    // (TfType, policy) — prim.cpp:130.
    const info = UsdSchemaRegistry.findSchemaInfo(schemaFamilyOrTypeOrIdentifier)
    if (!info) return []
    return UsdSchemaRegistry.findSchemaInfosInFamily(info.family, info.version, versionPolicy)
  }
  if (version === undefined && versionPolicy === undefined) {
    // (family) — prim.cpp:112.
    return UsdSchemaRegistry.findSchemaInfosInFamily(schemaFamilyOrTypeOrIdentifier)
  }
  if (version !== undefined) {
    // (family, version, policy) — prim.cpp:119.
    return UsdSchemaRegistry.findSchemaInfosInFamily(
      schemaFamilyOrTypeOrIdentifier, version, versionPolicy)
  }
  // (identifier, policy) — prim.cpp:147: prefer the registered schema's
  // family/version, else parse the identifier.
  const info = UsdSchemaRegistry.findSchemaInfo(schemaFamilyOrTypeOrIdentifier)
  if (info) {
    return UsdSchemaRegistry.findSchemaInfosInFamily(info.family, info.version, versionPolicy)
  }
  const parsed = UsdSchemaRegistry.parseSchemaFamilyAndVersionFromIdentifier(
    schemaFamilyOrTypeOrIdentifier)
  if (!parsed) return []
  return UsdSchemaRegistry.findSchemaInfosInFamily(parsed[0], parsed[1], versionPolicy)
}

const VERSION_POLICIES: ReadonlySet<string> = new Set(
  ['all', 'greaterThan', 'greaterThanOrEqual', 'lessThan', 'lessThanOrEqual'])

// True when the argument spells a VersionPolicy (vs an instance name).
function _isVersionPolicy(v: unknown): v is UsdSchemaVersionPolicy {
  return typeof v === 'string' && VERSION_POLICIES.has(v)
}

// _GetFirstSchemaInFamilyPrimIsA (prim.cpp:176).
function firstSchemaInFamilyIsA(
  primSchemaType: TfType, infos: readonly UsdSchemaInfo[],
): UsdSchemaInfo | null {
  for (const info of infos) {
    if (primSchemaType.isA(info.type)) return info
  }
  return null
}

// _GetFirstSchemaInFamilyPrimHasAPI (prim.cpp:378) /
// _GetFirstSchemaInFamilyPrimHasAPIInstance (prim.cpp:402).
function firstSchemaInFamilyHasAPI(
  appliedSchemas: readonly string[],
  infos: readonly UsdSchemaInfo[],
  instanceName?: string,
): UsdSchemaInfo | null {
  if (appliedSchemas.length === 0) return null
  if (instanceName !== undefined && instanceName === '') {
    throw new Error('Instance name must be non-empty')
  }
  for (const info of infos) {
    const matched = instanceName === undefined
      ? isSchemaInAppliedSchemas(appliedSchemas, info)
      : isSchemaInstanceInAppliedSchemas(appliedSchemas, info, instanceName)
    if (matched) return info
  }
  return null
}

function kindIsA(kind: string, baseKind: string): boolean {
  return KindRegistry.isA(kind, baseKind)
}

// UsdPrim: a handle to a prim's Usd_PrimData and, for an instance proxy, the
// proxy prim path (prim.h). An instance proxy's data is the corresponding
// prim in the instance's prototype.
export class Prim {
  readonly path: string
  // The prim data's path: the prototype prim for an instance proxy.
  private readonly _dataPath: string

  constructor(
    private readonly _stage: Stage,
    private readonly _primData: UsdPrimData,
    proxyPrimPath = '',
  ) {
    this.path = proxyPrimPath || _primData.path
    this._dataPath = _primData.path
  }

  /** @internal */ get _prim(): UsdPrimData { return this._primData }

  // UsdObject::IsValid: false once the prim's data is destroyed.
  isValid(): boolean { return !this._primData._isDead() }

  // UsdPrim::IsPseudoRoot (OpenUSD 26.11.1 prim.cpp:1964-1968).
  isPseudoRoot(): boolean { return this.path === '/' }

  // UsdPrim::GetParent (OpenUSD 26.11.1 prim.h:1548-1553): the parent prim
  // through Usd_MoveToParent, which for an instance proxy moves the proxy
  // path to its parent (the instance, once the parent is the prototype);
  // stage.getPrim resolves the parent path the same way. The pseudo-root
  // has no parent: an invalid prim (undefined).
  getParent(): Prim | undefined {
    if (this.isPseudoRoot()) return undefined
    return this._stage.getPrim(SdfPath.fromString(this.path).getParentPath().pathString)
  }

  // The stage this read handle was fetched from (UsdPrim::GetStage). Only
  // handles obtained through Stage.getPrim carry it.
  getStage(): Stage {
    // UsdObject::GetStage dereferences the prim data handle (object.h:708),
    // which raises UsdExpiredPrimAccessError for an expired prim
    // (primDataHandle.h:69-79, primData.cpp:272-278). The message omits
    // Usd_DescribePrimData's trailing stage description.
    if (this._primData._isDead()) {
      throw new TfError(`Used expired prim <${this.path}>`)
    }
    return this._stage
  }

  /** @internal Used by property operations that accept read or authoring handles. */
  _getStage(): Stage | undefined { return this._stage }

  get typeName(): string {
    return this._primData.getTypeName()
  }

  /** @internal VtValue-equivalent type identity for unregistered metadata. */
  _getMetadataValueTypeName(fieldName: string): string | undefined {
    return this._stage?._resolvePrimFieldTypeName(this._dataPath, fieldName)
  }

  // The prim's cached type info (UsdPrim::GetPrimTypeInfo): the interned
  // (typeName, mappedTypeName, authoredAppliedAPISchemas) triple. The
  // authored applied schemas are the composed apiSchemas listOp result the
  // node fields carry; mappedTypeName is the stage-level fallbackPrimTypes
  // substitution stamped on the pseudo-root node at compose time
  // (UsdStage::_ComposePrimTypeInfoImpl, stage.cpp:3503-3526).
  getPrimTypeInfo(): UsdPrimTypeInfo {
    return this._primData.getPrimTypeInfo()
  }

  // The prim's (possibly composed) prim definition (UsdPrim::GetPrimDefinition).
  getPrimDefinition(): UsdPrimDefinition {
    return this.getPrimTypeInfo().getPrimDefinition()
  }

  // The prim's composed applied API schemas — built-ins + auto-applied +
  // authored, i.e. the prim DEFINITION's list, not the authored listOp alone
  // (UsdPrim::GetAppliedSchemas, prim.cpp:1362).
  getAppliedSchemas(): string[] {
    return this.getPrimDefinition().getAppliedAPISchemas()
  }

  // True iff this prim's schema type is or derives from the queried schema
  // (UsdPrim::IsA — TfType.IsA over the registered hierarchy, NOT an exact
  // typeName compare). Accepts a TfType, a registered schema identifier, or
  // (family, version) — the upstream overload set (prim.cpp:90-107).
  isA(schemaTypeNameOrType: string | TfType, schemaVersion?: UsdSchemaVersion): boolean {
    const info = typeof schemaTypeNameOrType === 'string' && schemaVersion !== undefined
      ? UsdSchemaRegistry.findSchemaInfoInFamily(schemaTypeNameOrType, schemaVersion)
      : UsdSchemaRegistry.findSchemaInfo(schemaTypeNameOrType)
    // _IsA (prim.cpp:79).
    if (!info) return false
    return this.getPrimTypeInfo().getSchemaType().isA(info.type)
  }

  // True iff this prim's schema type belongs to the queried schema FAMILY
  // (UsdPrim::IsInFamily, prim.cpp:192-224). Call shapes mirror upstream's
  // overloads:
  //   isInFamily(family)                       — any version of the family
  //   isInFamily(typeOrIdentifier, policy)     — version filtered by policy
  //   isInFamily(family, version, policy)      — explicit version + policy
  isInFamily(
    schemaFamilyOrTypeOrIdentifier: string | TfType,
    versionOrPolicy?: UsdSchemaVersion | UsdSchemaVersionPolicy,
    versionPolicy?: UsdSchemaVersionPolicy,
  ): boolean {
    const infos = typeof versionOrPolicy === 'number'
      ? findSchemaInfosForQuery(schemaFamilyOrTypeOrIdentifier, versionOrPolicy, versionPolicy)
      : findSchemaInfosForQuery(schemaFamilyOrTypeOrIdentifier, undefined, versionOrPolicy)
    return firstSchemaInFamilyIsA(this.getPrimTypeInfo().getSchemaType(), infos) !== null
  }

  // The version of the queried family's schema this prim IsA, or undefined
  // when the prim is not in the family (UsdPrim::GetVersionIfIsInFamily —
  // upstream's out-param + bool collapses to `version | undefined`).
  getVersionIfIsInFamily(schemaFamily: string): UsdSchemaVersion | undefined {
    const info = firstSchemaInFamilyIsA(
      this.getPrimTypeInfo().getSchemaType(), findSchemaInfosForQuery(schemaFamily))
    return info?.version
  }

  // True when the queried API schema is applied on this prim, per the
  // COMPOSED prim definition's applied list (UsdPrim::HasAPI,
  // prim.cpp:291-372). Accepts a TfType, an identifier (a bare multi-apply
  // identifier matches ANY instance; 'Identifier:instance' matches exactly —
  // the TS spelling of upstream's instanceName overloads), or
  // (family, version[, instanceName]).
  hasAPI(
    schemaNameOrType: string | TfType,
    versionOrInstanceName?: UsdSchemaVersion | string,
    instanceName?: string,
  ): boolean {
    let info: UsdSchemaInfo | null
    let instance: string | undefined
    if (typeof schemaNameOrType === 'string' && typeof versionOrInstanceName === 'number') {
      // (family, version[, instanceName]) — prim.cpp:356-372.
      info = UsdSchemaRegistry.findSchemaInfoInFamily(schemaNameOrType, versionOrInstanceName)
      instance = instanceName
    } else if (typeof schemaNameOrType === 'string') {
      // Identifier form, with the instance name either as the second arg or
      // embedded as 'Identifier:instance'.
      instance = typeof versionOrInstanceName === 'string' ? versionOrInstanceName : undefined
      let identifier = schemaNameOrType
      if (instance === undefined) {
        const delim = identifier.indexOf(':')
        if (delim !== -1) {
          instance = identifier.slice(delim + 1)
          identifier = identifier.slice(0, delim)
        }
      }
      info = UsdSchemaRegistry.findSchemaInfo(identifier)
    } else {
      info = UsdSchemaRegistry.findSchemaInfo(schemaNameOrType)
      instance = typeof versionOrInstanceName === 'string' ? versionOrInstanceName : undefined
    }
    if (!info) return false
    const appliedSchemas = this.getAppliedSchemas()
    if (appliedSchemas.length === 0) return false
    // _HasAPI / _HasAPIInstance (prim.cpp:291-327).
    return instance === undefined
      ? isSchemaInAppliedSchemas(appliedSchemas, info)
      : isSchemaInstanceInAppliedSchemas(appliedSchemas, info, instance)
  }

  // True iff an applied API schema of the queried FAMILY is present,
  // version-filtered and (for multiple-apply schemas) instance-filtered
  // (UsdPrim::HasAPIInFamily, prim.cpp:430-502). Call shapes mirror
  // upstream's overloads:
  //   hasAPIInFamily(family)                                — any version
  //   hasAPIInFamily(family, instanceName)                  — any version, one instance
  //   hasAPIInFamily(typeOrIdentifier, policy[, instance])  — policy filter
  //   hasAPIInFamily(family, version, policy[, instance])   — explicit version
  hasAPIInFamily(
    schemaFamilyOrTypeOrIdentifier: string | TfType,
    versionOrPolicyOrInstanceName?: UsdSchemaVersion | UsdSchemaVersionPolicy | string,
    versionPolicyOrInstanceName?: UsdSchemaVersionPolicy | string,
    instanceName?: string,
  ): boolean {
    let infos: UsdSchemaInfo[]
    let instance: string | undefined
    if (typeof versionOrPolicyOrInstanceName === 'number') {
      // (family, version, policy[, instance]).
      infos = findSchemaInfosForQuery(
        schemaFamilyOrTypeOrIdentifier, versionOrPolicyOrInstanceName,
        versionPolicyOrInstanceName as UsdSchemaVersionPolicy | undefined)
      instance = instanceName
    } else if (_isVersionPolicy(versionOrPolicyOrInstanceName)) {
      // (typeOrIdentifier, policy[, instance]).
      infos = findSchemaInfosForQuery(
        schemaFamilyOrTypeOrIdentifier, undefined, versionOrPolicyOrInstanceName)
      instance = versionPolicyOrInstanceName as string | undefined
    } else {
      // (family[, instanceName]).
      infos = findSchemaInfosForQuery(schemaFamilyOrTypeOrIdentifier)
      instance = versionOrPolicyOrInstanceName as string | undefined
    }
    return firstSchemaInFamilyHasAPI(this.getAppliedSchemas(), infos, instance) !== null
  }

  // The version of the queried family's applied API schema, or undefined when
  // none is applied (UsdPrim::GetVersionIfHasAPIInFamily). With no instance
  // name, matches any instance; multiple applied versions report the highest
  // (the family list is ordered highest→lowest).
  getVersionIfHasAPIInFamily(
    schemaFamily: string,
    instanceName?: string,
  ): UsdSchemaVersion | undefined {
    const info = firstSchemaInFamilyHasAPI(
      this.getAppliedSchemas(), findSchemaInfosForQuery(schemaFamily), instanceName)
    return info?.version
  }

  // The prim flags composed by Usd_PrimData::_ComposeAndCacheFlags.
  get isActive(): boolean { return this._primData.isActive() }
  get isDefined(): boolean { return this._primData.isDefined() }
  get isAbstract(): boolean { return this._primData.isAbstract() }
  get isLoaded(): boolean { return this._primData.isLoaded() }
  hasDefiningSpecifier(): boolean { return this._primData.hasDefiningSpecifier() }
  hasClassSpecifier(): boolean { return this._primData.hasClassSpecifier() }

  getFilteredChildren(predicate: UsdPrimPredicate): Prim[] {
    if (!this._stage) return []
    const pred = asPrimPredicate(predicate)
    const includeProxies = pred.includeInstanceProxies || this.isInstanceProxy()
    return this._stage.getAllChildPrimPaths(
      this.path, { instanceProxies: includeProxies })
      .map(path => this._stage!.getPrim(path))
      .filter((prim): prim is Prim => prim !== undefined && pred.evaluate(prim))
  }

  getChildren(): Prim[] {
    return this.getFilteredChildren(PrimDefaultPredicate)
  }

  // UsdPrim::GetNextSibling (prim.cpp:1944-1948).
  getNextSibling(): Prim | undefined {
    return this.getFilteredNextSibling(PrimDefaultPredicate)
  }

  // UsdPrim::GetFilteredNextSibling (prim.cpp:1950-1962): the next sibling
  // in the parent's child order that passes the predicate; siblings of an
  // instance proxy are traversed as instance proxies
  // (Usd_CreatePredicateForTraversal, primData.h:483-496).
  getFilteredNextSibling(predicate: UsdPrimPredicate): Prim | undefined {
    if (!this._stage || this._primData.isPseudoRoot()) return undefined
    const slash = this.path.lastIndexOf('/')
    const parent = this._stage.getPrim(slash <= 0 ? '/' : this.path.slice(0, slash))
    if (!parent) return undefined
    let pred = asPrimPredicate(predicate)
    if (this.isInstanceProxy()) pred = pred.traverseInstanceProxies(true)
    const siblingPaths = this._stage.getAllChildPrimPaths(
      parent.path, { instanceProxies: pred.includeInstanceProxies })
    for (let i = siblingPaths.indexOf(this.path) + 1; i > 0 && i < siblingPaths.length; i++) {
      const sibling = this._stage.getPrim(siblingPaths[i]!)
      if (sibling && pred.evaluate(sibling)) return sibling
    }
    return undefined
  }

  // UsdPrim::GetSpecifier (prim.h:152) -> UsdStage::_GetSpecifier
  // (stage.cpp:6468-6475): the composed specifier, with fallback 'over'.
  // The pseudo-root and prototype prims are always 'def'
  // (_GetPrimSpecifierImpl, stage.cpp:6803-6809).
  getSpecifier(): 'def' | 'over' | 'class' {
    if (this._primData.isPseudoRoot() || this._primData.isPrototype()) return 'def'
    const specifier = this._stage._resolvePrimMetadata(this._dataPath, 'specifier')
    return specifier === 'def' || specifier === 'class' ? specifier : 'over'
  }

  // UsdPrim::GetPrimAtPath / GetObjectAtPath / GetPropertyAtPath /
  // GetAttributeAtPath / GetRelationshipAtPath (prim.cpp:2154-2180): the
  // path is made absolute against this prim's path, then looked up on the
  // stage.
  getPrimAtPath(path: string): Prim | undefined {
    const absolute = this.#makeAbsolutePath(path)
    if (absolute === undefined) return undefined
    const object = this._stage.getObjectAtPath(absolute)
    return object instanceof Prim ? object : undefined
  }

  getObjectAtPath(path: string): Prim | Attribute | UsdRel | undefined {
    const absolute = this.#makeAbsolutePath(path)
    return absolute === undefined ? undefined : this._stage.getObjectAtPath(absolute)
  }

  getPropertyAtPath(path: string): Attribute | UsdRel | undefined {
    const object = this.getObjectAtPath(path)
    return object instanceof Prim ? undefined : object
  }

  getAttributeAtPath(path: string): Attribute | undefined {
    const object = this.getObjectAtPath(path)
    return object instanceof Attribute ? object : undefined
  }

  getRelationshipAtPath(path: string): UsdRel | undefined {
    const object = this.getObjectAtPath(path)
    return object instanceof UsdRel ? object : undefined
  }

  // SdfPath::MakeAbsolutePath(GetPath()); an empty or unparsable path gives
  // the empty path, which finds nothing.
  #makeAbsolutePath(path: string): string | undefined {
    if (!path) return undefined
    try {
      const absolute = SdfPath.fromString(path).makeAbsolutePath(SdfPath.fromString(this.path))
      return absolute.isEmpty() ? undefined : absolute.pathString
    } catch {
      return undefined
    }
  }

  getAllChildren(): Prim[] {
    return this.getFilteredChildren(PrimAllPrimsPredicate)
  }

  getFilteredDescendants(predicate: UsdPrimPredicate): Prim[] {
    const pred = asPrimPredicate(predicate)
    const result: Prim[] = []
    const visit = (prim: Prim): void => {
      for (const child of prim.getFilteredChildren(pred)) {
        result.push(child)
        visit(child)
      }
    }
    visit(this)
    return result
  }

  getDescendants(): Prim[] {
    return this.getFilteredDescendants(PrimDefaultPredicate)
  }

  getAllDescendants(): Prim[] {
    return this.getFilteredDescendants(PrimAllPrimsPredicate)
  }

  getMetadata(field: string): unknown
  /**
   * UsdObject::GetMetadata(const TfToken &key, VtValue *value) (object.h:285):
   * fills `value` with the metadatum held as its Sdf type and returns whether
   * there is a value (typedMetadata.ts).
   */
  getMetadata(field: string, value: VtValue): boolean
  getMetadata(field: string, value?: VtValue): unknown {
    if (value) {
      return _usdGetTypedMetadata(field, this.getMetadata(field),
        () => this._getMetadataValueTypeName(field), value)
    }
    return _sdfHandOut(this.#getMetadata(field))
  }
  #getMetadata(field: string): unknown {
    const authored = field.startsWith('__') ? undefined
      : this._stage._resolvePrimMetadata(this._dataPath, field)
    const fallback = this.getPrimDefinition()._getFallbackValue(field)
    if (authored === undefined) return fallback
    if (_isDictValue(authored) && _isDictValue(fallback)) {
      return _dictOverRecursive(authored, fallback)
    }
    return authored
  }

  setMetadata(field: string, value: unknown): boolean {
    if (!this._stage) return false
    this._stage._setPrimMetadata(this.path, field, value)
    return true
  }

  clearMetadata(field: string): boolean {
    if (!this._stage) return false
    this._stage._clearPrimMetadata(this.path, field)
    return true
  }

  getKind(): string {
    const kind = this.getMetadata('kind')
    return typeof kind === 'string' ? kind : ''
  }

  setKind(kind: string): boolean { return this.setMetadata('kind', kind) }

  // UsdPrim::SetSpecifier (prim.h:188-190).
  setSpecifier(specifier: 'def' | 'over' | 'class'): boolean {
    return this.setMetadata('specifier', specifier)
  }

  // UsdPrim::ClearTypeName (prim.h:208-210).
  clearTypeName(): boolean { return this.clearMetadata('typeName') }

  // UsdPrim::SetPropertyOrder (prim.h:458-460).
  setPropertyOrder(order: readonly string[]): void {
    this.setMetadata('propertyOrder', [...order])
  }

  // UsdPrim::SetChildrenReorder (prim.h:1531-1533).
  setChildrenReorder(order: readonly string[]): void {
    this.setMetadata('primOrder', [...order])
  }

  // UsdPrim::RemoveProperty (prim.cpp:1190-1195): removes the property's
  // spec at the current edit target.
  removeProperty(propName: string): boolean {
    return this.getStage()._removeProperty(`${this.path}.${propName}`)
  }

  // UsdObject::SetMetadataByDictKey (object.h:351-356).
  // valueType is the value's Sdf type name where the JS value does not carry
  // it (a GfTimeCode is a number: 'timecode', 'timecode[]').
  setMetadataByDictKey(key: string, keyPath: string, value: unknown, valueType?: string): boolean {
    this.getStage()._setPrimMetadataByDictKey(this.path, key, keyPath, value, valueType)
    return true
  }

  // UsdObject::GetMetadataByDictKey (object.h:336-343): the composed value
  // at the ':'-delimited keyPath within the dictionary-valued field.
  getMetadataByDictKey(key: string, keyPath: string): unknown {
    let value = this.getMetadata(key)
    for (const component of keyPath.split(':').filter(Boolean)) {
      if (!_isDictValue(value)) return undefined
      value = (value as Record<string, unknown>)[component]
    }
    return value
  }

  // UsdObject::ClearMetadataByDictKey (object.h:362-363).
  clearMetadataByDictKey(key: string, keyPath: string): boolean {
    this.getStage()._clearPrimMetadataByDictKey(this.path, key, keyPath)
    return true
  }

  isKind(
    baseKind: string,
    validation: 'modelHierarchy' | 'none' | 'KindValidationNone' = 'modelHierarchy',
  ): boolean {
    if (validation !== 'none' && validation !== 'KindValidationNone'
      && kindIsA(baseKind, 'model') && !this.isModel()) return false
    return kindIsA(this.getKind(), baseKind)
  }

  isModel(): boolean { return this._primData.isModel() }
  isGroup(): boolean { return this._primData.isGroup() }
  isComponent(): boolean { return this._primData.isComponent() }

  // The authored property names (UsdPrim::GetAuthoredPropertyNames), from
  // the prim's (source) prim index.
  get attrNames(): string[] {
    const index = this._primData.isPseudoRoot() || this._primData.isPrototype()
      ? null : this._primData._primIndex
    return index ? usdResolvePropertyNames(index) : []
  }

  // UsdPrim::HasAttribute (prim.cpp:1545-1549).
  hasAttribute(name: string): boolean { return this.getAttr(name)!.isValid() }

  // UsdPrim::HasVariantSets (prim.cpp:1774-1780): variant sets can't be
  // defined in schema fallbacks, so only authored variant sets count.
  hasVariantSets(): boolean { return this.hasAuthoredMetadata('variantSetNames') }

  // UsdPrim::GetVariantSets / GetVariantSet (prim.cpp:1782-1792).
  getVariantSets(): UsdVariantSets { return this.getStage().getVariantSets(this.path) }
  getVariantSet(variantSetName: string): UsdVariantSet {
    return this.getVariantSets().getVariantSet(variantSetName)
  }

  // UsdPrim::GetProperty (prim.cpp:1209-1221). The Attribute handle serves
  // attributes and relationships alike.
  getProperty(name: string): Attribute { return this.getAttr(name)! }

  // UsdPrim::HasProperty (prim.cpp:1223-1227): the property's defining spec
  // is an attribute or relationship spec.
  hasProperty(name: string): boolean {
    const specType = this._stage._getDefiningSpecType(this._dataPath, name)
    return specType === 'attribute' || specType === 'relationship'
  }

  // UsdPrim::GetProperties (prim.cpp:1399-1403).
  getProperties(predicate?: (name: string) => boolean): Attribute[] {
    return this.getPropertyNames(predicate).map(name => this.getAttr(name)!)
  }

  // UsdPrim::GetPropertiesInNamespace (prim.cpp:1412-1459): properties whose
  // names start with the namespace followed by the delimiter, in property
  // order. A list of namespaces is joined with the delimiter.
  getPropertiesInNamespace(namespaces: string | readonly string[]): Attribute[] {
    const ns = typeof namespaces === 'string' ? namespaces : SdfPath.joinIdentifier(namespaces)
    if (ns === '') return this.getProperties()
    const terminator = ns.length - (ns.endsWith(':') ? 1 : 0)
    return this.getProperties(name =>
      name.length > terminator && name.startsWith(ns) && name[terminator] === ':')
  }

  getAttr(name: string): Attribute | undefined {
    // UsdPrim::GetAttribute builds the attribute on the proxy prim path
    // (prim.cpp:1538-1542); values still resolve through the prototype's
    // prim data (_dataPath).
    const propPath = this.path === '/' ? `.${name}` : `${this.path}.${name}`
    // Hand the attr its owning prim's definition (lazily) so unauthored
    // values resolve to the schema fallback — the weakest value-resolution
    // step (stage.cpp:6215 ConsumeUsdFallback → Usd_GetFallbackValue).
    const fallbackSource = { name, def: (): UsdPrimDefinition => this.getPrimDefinition() }
    return new Attribute(propPath, fallbackSource, this._stage, this._dataPath, name, this.path)
  }

  // Search this prim subtree for authored attribute connections.  When
  // recurseOnSources is set, connected prims outside the original subtree
  // become additional traversal roots (prim.cpp:1581-1731).
  findAllAttributeConnectionPaths(
    options: FindAttributeConnectionPathsOptions = {},
  ): string[] {
    return this.#findAllTargetPaths(false, options.traversalPredicate, options.recurseOnSources,
      options.predicate && (name => options.predicate!(this._stage!.getPrim(name.primPath)!.getAttr(name.name)!)))
  }

  // UsdPrim::FindAllRelationshipTargetPaths (prim.cpp:1756-1772) through
  // UsdPrim_RelTargetFinder (prim.cpp:1709-1716): the same search over
  // authored relationship targets; recurseOnTargets makes targeted prims
  // outside the subtree additional traversal roots.
  findAllRelationshipTargetPaths(
    options: FindRelationshipTargetPathsOptions = {},
  ): string[] {
    return this.#findAllTargetPaths(true, options.traversalPredicate, options.recurseOnTargets,
      options.predicate && (name => options.predicate!(new UsdRel(this._stage!, name.primPath, name.name))))
  }

  // UsdPrim_TargetFinder (prim.cpp:1581-1707).
  #findAllTargetPaths(
    relationships: boolean, traversalPredicate: 'default' | 'allPrims' | undefined,
    recurse: boolean | undefined,
    predicate: ((prop: { primPath: string; name: string }) => boolean) | undefined,
  ): string[] {
    if (!this._stage) return []
    const allPrims = traversalPredicate === 'allPrims'
    const seenPrims = new Set<string>()
    const result = new Set<string>()
    const hasPrefix = (path: string, prefix: string): boolean =>
      path === prefix || path.startsWith(`${prefix}/`) || path.startsWith(`${prefix}.`)
    const owningPrimPath = (path: string): string => {
      const dot = path.indexOf('.')
      return dot < 0 ? path : path.slice(0, dot)
    }
    const visitPrim = (primPath: string): void => {
      if (seenPrims.has(primPath)) return
      const prim = this._stage!.getPrim(primPath)
      if (!prim) return
      seenPrims.add(primPath)
      for (const propName of prim.attrNames) {
        const prop = prim.getAttr(propName)
        if (!prop || prop.isRelationship !== relationships) continue
        if (predicate && !predicate({ primPath, name: propName })) continue
        for (const path of relationships ? prop.getTargets() : prop.getConnections()) {
          result.add(path)
          if (recurse && !hasPrefix(path, this.path)) {
            visitSubtree(owningPrimPath(path))
          }
        }
      }
    }
    const visitSubtree = (rootPath: string): void => {
      const stack = [rootPath]
      while (stack.length > 0) {
        const path = stack.pop()!
        visitPrim(path)
        const children = allPrims
          ? this._stage!.getAllChildPrimPaths(path)
          : this._stage!.getChildPrimPaths(path)
        for (let i = children.length - 1; i >= 0; --i) stack.push(children[i]!)
      }
    }
    visitSubtree(this.path)
    return [...result].sort()
  }

  // All property names — built-ins plus authored properties, dictionary
  // sorted and then reordered by resolved propertyOrder metadata
  // (OpenUSD v26.08 pxr/usd/usd/prim.cpp:1324-1360).
  // The optional predicate filters names before ordering
  // (UsdPrim::_GetPropertyNames, prim.cpp:1327-1360).
  getPropertyNames(predicate?: (name: string) => boolean): string[] {
    return this.#getPropertyNames(false, predicate)
  }

  // UsdPrim::GetAttributes (OpenUSD 26.11.1 prim.cpp:1525-1529) through
  // _GetAttributes (prim.cpp:1506-1523): the valid attributes among the
  // prim's property names, in property order.
  getAttributes(): Attribute[] {
    const attrs: Attribute[] = []
    for (const propName of this.getPropertyNames()) {
      const attr = this.getAttr(propName)
      if (attr?.isValid()) attrs.push(attr)
    }
    return attrs
  }

  // UsdPrim::GetAuthoredPropertyNames (prim.cpp:1371-1377): only names with
  // authored opinions, ordered the same way.
  getAuthoredPropertyNames(predicate?: (name: string) => boolean): string[] {
    return this.#getPropertyNames(true, predicate)
  }

  #getPropertyNames(onlyAuthored: boolean, predicate?: (name: string) => boolean): string[] {
    const names = new Set<string>(onlyAuthored ? [] : this.getPrimDefinition().getPropertyNames())
    for (const authored of this.attrNames) names.add(authored)
    if (predicate) for (const name of [...names]) if (!predicate(name)) names.delete(name)
    if (names.size === 0) return []
    const sorted = [...names].sort(
      (a, b) => (dictionaryLessThan(a, b) ? -1 : dictionaryLessThan(b, a) ? 1 : 0))
    const order = this.getMetadata('propertyOrder')
    if (!Array.isArray(order) || order.length === 0) return sorted
    const front: string[] = []
    const taken = new Set<string>()
    for (const name of order as string[]) {
      if (names.has(name) && !taken.has(name)) {
        front.push(name)
        taken.add(name)
      }
    }
    return [...front, ...sorted.filter((name) => !taken.has(name))]
  }

  getAllMetadata(): Record<string, unknown> {
    const keys = new Set<string>(Object.keys(this.getAllAuthoredMetadata()))
    for (const key of this.getPrimDefinition().listMetadataFields()) keys.add(key)
    const out: Record<string, unknown> = {}
    for (const key of [...keys].sort(
      (a, b) => (dictionaryLessThan(a, b) ? -1 : dictionaryLessThan(b, a) ? 1 : 0))) {
      const value = this.getMetadata(key)
      if (value !== undefined) out[key] = value
    }
    return out
  }

  // OpenUSD v26.08 pxr/usd/usd/object.cpp:120-124 returns composed authored
  // opinions without schema fallbacks. Stage owns the retained Pcp index needed
  // to enumerate authored fields.
  getAllAuthoredMetadata(): Record<string, unknown> {
    return _handOutValues(this._stage._getAllAuthoredPrimMetadata(this._dataPath))
  }

  hasAuthoredMetadata(field: string): boolean {
    return !field.startsWith('__') && this._stage._resolvePrimMetadata(this._dataPath, field) !== undefined
  }

  setTypeName(typeName: string): void {
    this.getStage()._setPrimTypeName(this.path, typeName)
  }

  attr(name: string): Attribute {
    return this.getAttr(name)!
  }

  createAttr(name: string, value?: unknown): Attribute {
    const attr = this.attr(name)
    if (value !== undefined) attr.set(value)
    return attr
  }

  rel(name: string): UsdRel {
    return new UsdRel(this.getStage(), this.path, name)
  }

  // UsdPrim::CreateAttribute (prim.cpp:1457-1474) and UsdAttribute::_Create
  // (attribute.cpp:486-524): author an attribute spec at the current edit
  // target, from the property's definition or an existing spec when there
  // is one, else with the given type, custom-ness and variability.
  createAttribute(
    name: string, typeName: string, custom = true, variability: 'varying' | 'uniform' = 'varying',
  ): Attribute {
    this.getStage()._createAttributeSpec(this.path, name, typeName, custom, variability)
    return this.attr(name)
  }

  // UsdPrim::CreateRelationship (prim.cpp:1539-1545) and
  // UsdRelationship::_Create (relationship.cpp:293-323).
  createRelationship(name: string, custom = true): UsdRel {
    this.getStage()._createRelationshipSpec(this.path, name, custom)
    return this.rel(name)
  }

  createRel(name: string, targets?: string[]): UsdRel {
    const relationship = this.rel(name)
    relationship.setTargets(targets ?? [])
    return relationship
  }

  getReferences(): UsdReferences {
    return new UsdReferences(this.getStage(), this.path, 'references')
  }

  getPayloads(): UsdReferences {
    return new UsdReferences(this.getStage(), this.path, 'payload')
  }

  // UsdPrim::HasAuthoredPayloads (prim.cpp:1861-1869): the HasPayload flag
  // Pcp computed for the prim data.
  hasAuthoredPayloads(): boolean {
    return this._primData.hasPayload()
  }

  // UsdPrim::HasAuthoredReferences (prim.cpp:1826-1829).
  hasAuthoredReferences(): boolean {
    return this.hasAuthoredMetadata('references')
  }

  // UsdPrim::GetInherits.
  getInherits(): UsdInherits {
    return new UsdInherits(this.getStage(), this.path)
  }

  // UsdPrim::HasAuthoredInherits (prim.cpp:1802-1805).
  hasAuthoredInherits(): boolean {
    return this.hasAuthoredMetadata('inheritPaths')
  }

  getSpecializes(): UsdSpecializes {
    return new UsdSpecializes(this.getStage(), this.path)
  }

  // UsdPrim::HasAuthoredSpecializes (prim.cpp:1814-1817).
  hasAuthoredSpecializes(): boolean {
    return this.hasAuthoredMetadata('specializes')
  }

  // OpenUSD v26.11.1 prim.cpp:2034-2104,2139-2152: find the strongest
  // node matching both the edit target's mapped path and its layer.
  makeResolveTargetUpToEditTarget(editTarget: UsdEditTarget): UsdResolveTarget {
    return this._makeResolveTargetFromEditTarget(editTarget, false)
  }

  makeResolveTargetStrongerThanEditTarget(editTarget: UsdEditTarget): UsdResolveTarget {
    return this._makeResolveTargetFromEditTarget(editTarget, true)
  }

  private _makeResolveTargetFromEditTarget(editTarget: UsdEditTarget, stronger: boolean): UsdResolveTarget {
    const index = this.computeExpandedPrimIndex()
    if (!index.isValid()) return new UsdResolveTarget()
    const mappedPath = editTarget.mapToSpecPath(index.getPath().pathString)
    const layer = editTarget.getLayer()
    if (!mappedPath || !layer) return new UsdResolveTarget()
    const node = [...index.getNodeRange()].find(node => node.getPath().pathString === mappedPath &&
      node.layerStack.layers.some(entry => entry.layer === layer))
    if (!node) return new UsdResolveTarget()
    return stronger ? _makeUsdResolveTarget(index, node.getRootNode(), null, node, layer)
      : _makeUsdResolveTarget(index, node, layer)
  }

  // UsdPrim::GetPrimIndex (prim.h:2152), Usd_PrimData::GetPrimIndex
  // (primData.cpp:82-87): return the cached index; prototype roots have none.
  getPrimIndex(): PcpPrimIndex {
    return this._primData.getPrimIndex() ?? new PcpPrimIndex()
  }

  // UsdPrim::ComputeExpandedPrimIndex (prim.cpp:1995-2022): recompute the
  // prim's index with culling disabled, so every node — including those that
  // contribute no opinions — is present.
  computeExpandedPrimIndex(): PcpPrimIndex {
    // Get the prim index path to compute from the index stored in the prim
    // data (prim.cpp:1998-2004).
    const cachedPrimIndex = this._primData._primIndex
    if (!cachedPrimIndex?.isValid()) return new PcpPrimIndex()

    const primIndexPath = cachedPrimIndex.getPath()
    const cache = this._stage._getPcpCache()
    if (!cache) return new PcpPrimIndex()

    const outputs = new PcpPrimIndexOutputs()
    const inputs = cache.getPrimIndexInputs().clone()
    inputs.cull = false
    pcpComputePrimIndex(primIndexPath, cache.getLayerStack(), inputs, outputs)

    // _ReportPcpErrors (prim.cpp:2016-2019) -> UsdStage::_ReportErrors
    // (stage.cpp:3277-3317): one TF_WARN per error.
    const fullContext = `(computing expanded prim index for <${this.path}> on stage ` +
      `@${this._stage.getRootLayer().identifier}@)`
    for (const error of outputs.allErrors) {
      const rootPath = error.rootSite.path
      TfDiagnosticMgr.GetInstance().postWarning(rootPath === '/'
        ? `${error.toString()} ${fullContext}`
        : `In <${rootPath}>: ${error.toString()} ${fullContext}`)
    }
    return outputs.primIndex
  }

  async setActive(active: boolean): Promise<void> {
    const stage = this.getStage()
    await stage._ownAuthoringAsync(async () => {
      stage.getEditTarget().getLayer()!.setField(this.path, 'active', active)
      await stage._recomposeForEdit()
    })
  }

  addAppliedSchema(schemaName: string): void {
    this.getStage().applyAPI(this.path, schemaName)
  }

  private _resolveAppliedSchemaArgs(
    funcName: string,
    schemaNameOrType: string | TfType,
    versionOrInstanceName?: UsdSchemaVersion | string,
    instanceName?: string,
  ): { info: UsdSchemaInfo; instance: string | undefined } {
    let info: UsdSchemaInfo | null
    let instance: string | undefined
    if (typeof schemaNameOrType !== 'string') {
      info = UsdSchemaRegistry.findSchemaInfo(schemaNameOrType)
      instance = typeof versionOrInstanceName === 'string' ? versionOrInstanceName : undefined
    } else if (typeof versionOrInstanceName === 'number') {
      info = UsdSchemaRegistry.findSchemaInfoInFamily(schemaNameOrType, versionOrInstanceName)
      instance = instanceName
    } else {
      instance = versionOrInstanceName
      let identifier = schemaNameOrType
      if (instance === undefined) {
        const delim = identifier.indexOf(':')
        if (delim !== -1) {
          instance = identifier.slice(delim + 1)
          identifier = identifier.slice(0, delim)
        }
      }
      info = UsdSchemaRegistry.findSchemaInfo(identifier)
    }
    if (!info) {
      throw new Error(
        `${funcName}: Cannot find a valid schema for '${String(schemaNameOrType)}'`)
    }
    return { info, instance }
  }

  private _isValidApplyToTarget(info: UsdSchemaInfo, instance: string): boolean {
    const canOnlyApplyTo =
      UsdSchemaRegistry.getAPISchemaCanOnlyApplyToTypeNames(info.identifier, instance)
    if (canOnlyApplyTo.length === 0) return true
    const primType = this.getPrimTypeInfo().getSchemaType()
    if (!primType.isUnknown()) {
      for (const allowedPrimTypeName of canOnlyApplyTo) {
        const allowedPrimType =
          UsdSchemaRegistry.getTypeFromSchemaTypeName(allowedPrimTypeName)
        if (primType.isA(allowedPrimType)) return true
      }
    }
    return false
  }

  canApplyAPI(
    schemaNameOrType: string | TfType,
    versionOrInstanceName?: UsdSchemaVersion | string,
    instanceName?: string,
  ): boolean {
    const { info, instance } = this._resolveAppliedSchemaArgs(
      'CanApplyAPI', schemaNameOrType, versionOrInstanceName, instanceName)
    if (instance === undefined) {
      if (info.kind !== 'singleApplyAPI') {
        throw new Error(
          `CanApplyAPI: Provided schema type ${info.identifier} is not a single-apply API schema.`)
      }
      return this._isValidApplyToTarget(info, '')
    }
    if (info.kind !== 'multipleApplyAPI') {
      throw new Error(
        `CanApplyAPI: Provided schema type ${info.identifier} is not a multiple-apply API schema.`)
    }
    if (instance === '') {
      throw new Error(
        `CanApplyAPI: for multiple apply API schema ${info.identifier}, a non-empty ` +
        'instance name must be provided.')
    }
    if (!UsdSchemaRegistry.isAllowedAPISchemaInstanceName(info.identifier, instance)) {
      return false
    }
    return this._isValidApplyToTarget(info, instance)
  }

  applyAPI(
    schemaNameOrType: string | TfType,
    versionOrInstanceName?: UsdSchemaVersion | string,
    instanceName?: string,
  ): boolean {
    const { info, instance } = this._resolveAppliedSchemaArgs(
      'ApplyAPI', schemaNameOrType, versionOrInstanceName, instanceName)
    if (instance === undefined) {
      if (info.kind !== 'singleApplyAPI') {
        throw new Error(
          `ApplyAPI: Provided schema type ${info.identifier} is not a single-apply API schema.`)
      }
      this.getStage().applyAPI(this.path, info.identifier)
      return true
    }
    if (info.kind !== 'multipleApplyAPI') {
      throw new Error(
        `ApplyAPI: Provided schema type ${info.identifier} is not a multiple-apply API schema.`)
    }
    if (instance === '') {
      throw new Error(
        `ApplyAPI: for multiple apply API schema ${info.identifier}, a non-empty ` +
        'instance name must be provided.')
    }
    this.getStage().applyAPI(this.path, `${info.identifier}:${instance}`)
    return true
  }

  removeAPI(
    schemaNameOrType: string | TfType,
    versionOrInstanceName?: UsdSchemaVersion | string,
    instanceName?: string,
  ): boolean {
    const { info, instance } = this._resolveAppliedSchemaArgs(
      'RemoveAPI', schemaNameOrType, versionOrInstanceName, instanceName)
    if (instance === undefined) {
      if (info.kind !== 'singleApplyAPI') {
        throw new Error(
          `RemoveAPI: Provided schema type ${info.identifier} is not a single-apply API schema.`)
      }
      this.getStage().removeAppliedSchema(this.path, info.identifier)
      return true
    }
    if (info.kind !== 'multipleApplyAPI') {
      throw new Error(
        `RemoveAPI: Provided schema type ${info.identifier} is not a multiple-apply API schema.`)
    }
    if (instance === '') {
      throw new Error(
        `RemoveAPI: for multiple apply API schema ${info.identifier}, a non-empty ` +
        'instance name must be provided.')
    }
    this.getStage().removeAppliedSchema(this.path, `${info.identifier}:${instance}`)
    return true
  }

  // ---- Native instancing queries (Prim instancing API) ----

  // True when this prim is an instance whose subtree lives in a prototype.
  isInstance(): boolean {
    return this._primData.isInstance()
  }

  // The instance's prototype root prim (UsdPrim::GetPrototype).
  getPrototype(): Prim | undefined {
    const prototype = this._primData.getPrototype()
    return prototype ? new Prim(this._stage, prototype) : undefined
  }

  // Resolved `instanceable` metadata (UsdPrim::IsInstanceable). True does
  // not imply isInstance() — instanceable without direct arcs is inert.
  isInstanceable(): boolean {
    return this.getMetadata('instanceable') === true
  }

  /**
   * @internal UsdPrim::_GetSourcePrimIndex (prim.h:2273-2279): private,
   * wrapped to Python for testing and debugging. A prototype answers the
   * prim index of the instance it currently borrows its composition from.
   */
  _getSourcePrimIndex(): PcpPrimIndex {
    return this._primData.getSourcePrimIndex()
  }

  // UsdPrim::SetInstanceable / ClearInstanceable / HasAuthoredInstanceable
  // (prim.h:2039-2053).
  setInstanceable(instanceable: boolean): boolean {
    return this.setMetadata('instanceable', instanceable)
  }

  clearInstanceable(): boolean {
    return this.clearMetadata('instanceable')
  }

  hasAuthoredInstanceable(): boolean {
    return this.hasAuthoredMetadata('instanceable')
  }

  // True when this prim exists at an instance-side path but reads its data
  // from a prototype (UsdPrim::IsInstanceProxy).
  isInstanceProxy(): boolean {
    return this._dataPath !== this.path
  }

  // The prototype-side prim an instance proxy corresponds to
  // (UsdPrim::GetPrimInPrototype).
  getPrimInPrototype(): Prim | undefined {
    if (!this.isInstanceProxy()) return undefined
    return new Prim(this._stage, this._primData)
  }

  // True when this prim IS a prototype root (UsdPrim::IsPrototype).
  isPrototype(): boolean {
    return !this.isInstanceProxy() && this._primData.isPrototype()
  }

  // True when this prim lives at or under a prototype root
  // (UsdPrim::IsInPrototype).
  isInPrototype(): boolean {
    return isPathInPrototype(this.path)
  }

  // UsdObject::GetDescription (object.cpp:375-381) for prims, which is
  // Usd_DescribePrimData (primData.cpp:219-268).
  getDescription(): string {
    const p = this._primData
    const isDead = p._isDead()
    const isInstance = p.isInstance()
    const isInstanceProxy = this.isInstanceProxy()
    const isInPrototype = isInstanceProxy ? isPathInPrototype(this.path) : p.isInPrototype()
    const isPrototype = p.isPrototype()
    const prototypeForInstance = isInstance && this._stage ? p.getPrototype() : undefined
    const typeName = p.getTypeName()
    let desc = (isDead ? 'expired ' : p.isActive() ? '' : 'inactive ')
      + (typeName ? `'${typeName}' ` : '')
      + (isInstance ? 'instance ' : isInstanceProxy ? 'instance proxy ' : '')
      + 'prim ' + (isInPrototype ? 'in prototype ' : '')
      + `<${isInstanceProxy ? this.path : p.path}> `
    if (!isDead) {
      if (isInstanceProxy || isInstance) {
        if (isInstance && !prototypeForInstance) {
          desc += 'with expired prototype'
        } else {
          desc += `with prototype <${isInstance ? prototypeForInstance!.path : p.path}> `
        }
      }
      if (isInstanceProxy || isPrototype || isInPrototype) {
        desc += `using prim index <${p.getSourcePrimIndex().getPath().pathString}> `
      }
      // UsdDescribe(const UsdStage *) (stage.cpp:10323-10334).
      const session = this._stage.getSessionLayer()
      desc += `on stage with rootLayer @${this._stage.getRootLayer().identifier}@`
        + (session ? `, sessionLayer @${session.identifier}@` : '')
    }
    return desc
  }
}

export class Attribute {
  constructor(
    private readonly _path: string,
    // The owning prim's definition + this attr's name, for schema-fallback
    // resolution of unauthored values (Usd_GetFallbackValue). Optional:
    // attrs constructed without it (no known owning prim) resolve no
    // fallbacks, as before.
    private readonly _fallbackSource?:
      { name: string; def: () => UsdPrimDefinition | undefined } | undefined,
    private readonly _queryProvider?: UsdAttributeQueryProvider | undefined,
    private readonly _dataPrimPath?: string | undefined,
    private readonly _propertyName?: string | undefined,
    private readonly _resultPrimPath?: string | undefined,
  ) {}

  /** @internal Property identity retained by UsdProperty-style operations. */
  _getStage(): Stage | undefined { return this._queryProvider as Stage | undefined }
  /** @internal */
  _getPrimPath(): string {
    if (this._dataPrimPath !== undefined) return this._dataPrimPath
    const dot = this._path.indexOf('.')
    return dot < 0 ? this._path : this._path.slice(0, dot)
  }
  /** @internal */
  _getName(): string {
    if (this._propertyName !== undefined) return this._propertyName
    const dot = this._path.indexOf('.')
    return dot < 0 ? '' : this._path.slice(dot + 1)
  }

  // UsdProperty::FlattenTo delegates to the source stage, which captures the
  // composed query result and authors it through the destination stage.
  flattenTo(destination: unknown, destinationName?: string): Attribute {
    if (!this._queryProvider) throw new Error(`Cannot flatten invalid property <${this._path}>`)
    return this._queryProvider._flattenProperty(this, destination, destinationName)
  }

  getPropertyStack(time: 'default' | number = 'default'): PropertyStackEntry[] {
    if (!this._queryProvider) return []
    return this._queryProvider.getPropertyStack(
      `${this._getPrimPath()}.${this._getName()}`, time)
  }

  getPropertyStackWithLayerOffsets(
    time: 'default' | number = 'default',
  ): PropertyStackWithLayerOffsetEntry[] {
    if (!this._queryProvider) return []
    return this._queryProvider.getPropertyStackWithLayerOffsets(
      `${this._getPrimPath()}.${this._getName()}`, time)
  }

  // The schema fallback for this attribute, or undefined when the owning
  // prim's definition provides none.
  #fallbackValue(): unknown {
    return this._fallbackSource?.def()?.getAttributeFallbackValue(this._fallbackSource.name)
  }

  // UsdObject::IsValid (object.h:127-137): an attribute object is valid
  // only while its prim is and its defining spec is an attribute spec, so
  // Prim.getAttr of a missing or relationship name gives an invalid object.
  isValid(): boolean {
    if (!this._queryProvider || this._dataPrimPath === undefined || this._propertyName === undefined) return false
    return (this._queryProvider as Stage)._getDefiningSpecType(this._dataPrimPath, this._propertyName) === 'attribute'
  }

  hasFallbackValue(): boolean { return this.#fallbackValue() !== undefined }
  getFallbackValue(): unknown { return _sdfHandOut(this.#fallbackValue()) }

  #resolve(time: 'default' | number | undefined): UsdAttributeResolveResult | undefined {
    if (!this._queryProvider || this._dataPrimPath === undefined ||
        this._propertyName === undefined) return undefined
    return this._queryProvider._resolveAttribute(
      this._dataPrimPath, this._propertyName, time, () => this.#fallbackValue(), undefined, this._resultPrimPath)
  }

  /** @internal AttributeQuery's stage _GetResolveInfoWithResolveTarget seam. */
  _getResolveInfoWithResolveTarget(target: UsdResolveTarget, time?: 'default' | number): UsdResolveInfo {
    const result = this._queryProvider && this._dataPrimPath !== undefined && this._propertyName !== undefined
      ? this._queryProvider._resolveAttribute(this._dataPrimPath, this._propertyName, time,
        () => this.#fallbackValue(), target, this._resultPrimPath) : { source: 'none' as const, valueIsBlocked: false }
    return _makeUsdResolveInfo(result)
  }

  getValue(): unknown { return _sdfHandOut(this.#getValue()) }
  #getValue(): unknown {
    // Authored default > schema fallback (fallback is the WEAKEST step;
    // UsdAttribute::Get at default time — stage.cpp:6215 ConsumeUsdFallback).
    const resolved = this.#resolve('default')
    if (resolved) return resolved.valueIsBlocked ? undefined : resolved.value
    return this.#fallbackValue()
  }

  // True when the attribute carries an AUTHORED opinion — a default value or
  // time samples; schema fallbacks do not count (UsdAttribute::HasAuthoredValue).
  hasAuthoredValue(): boolean {
    const resolved = this.#resolve(undefined)
    return resolved ? _makeUsdResolveInfo(resolved).hasAuthoredValue() : false
  }

  hasAuthoredValueOpinion(): boolean {
    const resolved = this.#resolve(undefined)
    if (resolved) return _makeUsdResolveInfo(resolved).hasAuthoredValueOpinion()
    return this.hasAuthoredValue()
  }

  hasValue(): boolean {
    const resolved = this.#resolve(undefined)
    // UsdAttribute::HasValue (attribute.cpp:181-187): any resolve-info source
    // other than none; a blocked value with no fallback has source none.
    if (resolved) return resolved.source !== 'none'
    return this.getValue() !== undefined
  }

  getResolveInfo(time?: 'default' | number): UsdResolveInfo {
    const resolved = this.#resolve(time) ?? {
      source: this.getValue() === undefined ? 'none' as const : 'default' as const,
      value: this.getValue(),
      valueIsBlocked: false,
    }
    return _makeUsdResolveInfo(resolved)
  }

  get typeName(): string {
    return (this.getField('typeName') as string | undefined) ?? ''
  }

  get isRelationship(): boolean {
    return this.typeName === 'rel'
  }

  // UsdProperty::IsCustom (OpenUSD v26.08 property.cpp:110-113).
  isCustom(): boolean {
    if (!this._queryProvider || this._dataPrimPath === undefined ||
        this._propertyName === undefined) return false
    return this._queryProvider._isPropertyCustom(this._dataPrimPath, this._propertyName)
  }

  // Generic composed-field read (e.g. 'bindMaterialAs' on a binding rel).
  getField(fieldName: string): unknown { return _sdfHandOut(this.#getField(fieldName)) }
  #getField(fieldName: string): unknown {
    if (fieldName === 'spline') return this.getSpline()
    const definition = this._fallbackSource?.def()
    const fallback = definition?._getFallbackValue(fieldName, this._getName())
    // UsdStage::_GetAttrTypeImpl/_GetAttrVariabilityImpl/_GetPropCustomImpl
    // (OpenUSD v26.11.1 stage.cpp:6697-6774): builtin
    // property definitions determine intrinsic fields ahead of authored specs.
    if (fallback !== undefined && ['custom', 'variability', 'typeName'].includes(fieldName)) return fallback
    const authored = this._queryProvider && this._dataPrimPath !== undefined && this._propertyName !== undefined
      ? this._queryProvider._resolvePropertyField(this._dataPrimPath, this._propertyName, fieldName)
      : undefined
    if (authored === undefined) return fallback
    return _isDictValue(authored) && _isDictValue(fallback) ? _dictOverRecursive(authored, fallback) : authored
  }

  /** @internal VtValue-equivalent type identity for unregistered metadata. */
  _getMetadataValueTypeName(fieldName: string): string | undefined {
    if (!this._queryProvider || this._dataPrimPath === undefined ||
        this._propertyName === undefined) return undefined
    return this._queryProvider._resolvePropertyFieldTypeName(
      this._dataPrimPath, this._propertyName, fieldName)
  }

  setMetadata(fieldName: string, value: unknown): boolean {
    if (!this._queryProvider || this._dataPrimPath === undefined ||
        this._propertyName === undefined) return false
    this._queryProvider._setPropertyMetadata(
      this._dataPrimPath, this._propertyName, fieldName, value)
    return true
  }

  // UsdProperty::SetDisplayGroup (property.cpp:72-75).
  setDisplayGroup(displayGroup: string): boolean {
    return this.setMetadata('displayGroup', displayGroup)
  }

  // UsdProperty::SetNestedDisplayGroups (property.cpp:104-107): the groups
  // joined with the namespace delimiter.
  setNestedDisplayGroups(nestedGroups: readonly string[]): boolean {
    return this.setDisplayGroup(nestedGroups.join(':'))
  }

  // UsdProperty::SetCustom (property.cpp:116-119).
  setCustom(isCustom: boolean): boolean { return this.setMetadata('custom', isCustom) }

  // UsdAttribute::SetVariability (attribute.cpp:46-49).
  setVariability(variability: 'varying' | 'uniform'): boolean {
    return this.setMetadata('variability', variability)
  }

  // UsdAttribute::SetTypeName (attribute.cpp:66-70).
  setTypeName(typeName: string): boolean { return this.setMetadata('typeName', typeName) }

  // Connection source paths authored via attr.connect / `.connect =` in USDA.
  getConnections(): string[]
  /**
   * UsdAttribute::GetConnections(SdfPathVector *sources) (attribute.cpp:686-690,
   * UsdProperty::_GetTargets, property.cpp:172-233): fills `sources` with the
   * composed connection paths and returns `isClean && hasTargetOpinions`, so
   * an authored list that composes to no paths is still true.
   */
  getConnections(sources: SdfPath[]): boolean
  getConnections(sources?: SdfPath[]): string[] | boolean {
    if (sources) {
      sources.length = 0
      if (!this._queryProvider || this._dataPrimPath === undefined ||
          this._propertyName === undefined) return false
      const pcpErrors: unknown[] = []
      const paths = this._queryProvider._resolvePropertyPaths(
        this._dataPrimPath, this._propertyName, 'connectionPaths', this._resultPrimPath,
        pcpErrors)
      for (const path of paths ?? []) sources.push(SdfPath.fromString(path))
      return pcpErrors.length === 0 && paths !== undefined
    }
    if (this._queryProvider && this._dataPrimPath !== undefined && this._propertyName !== undefined) {
      return this._queryProvider._resolvePropertyPaths(
        this._dataPrimPath, this._propertyName, 'connectionPaths', this._resultPrimPath) ?? []
    }
    return []
  }

  // Relationship target paths (only meaningful when isRelationship).
  getTargets(): string[] {
    if (this._queryProvider && this._dataPrimPath !== undefined && this._propertyName !== undefined) {
      return this._queryProvider._resolvePropertyPaths(
        this._dataPrimPath, this._propertyName, 'targetPaths', this._resultPrimPath) ?? []
    }
    return []
  }

  getDefaultValue(): unknown { return _sdfHandOut(this.#getDefaultValue()) }
  #getDefaultValue(): unknown {
    const resolved = this.#resolve('default')
    if (resolved) return resolved.valueIsBlocked ? undefined : resolved.value
    return this.#fallbackValue()
  }

  getDefaultValueResult(): { source: 'authored' | 'fallback'; value: unknown } {
    const resolved = this.#resolve('default')
    if (resolved?.source === 'default') return { source: 'authored', value: resolved.value }
    if (resolved) return { source: 'fallback', value: resolved.value ?? null }
    // Weakest resolution step: the prim definition's schema fallback
    // (UsdPrimDefinition::GetAttributeFallbackValue); null when none exists.
    return { source: 'fallback', value: this.#fallbackValue() ?? null }
  }

  getTimeSampleKeys(): number[] {
    const resolved = this.#resolve(undefined)
    return resolved ? usdResolvedSampleTimes(resolved) : []
  }

  // UsdStage::_HasSplineFromResolveInfo (stage.cpp:9638-9651): an authored
  // spline, or value clips that provide one.
  hasSpline(): boolean {
    const resolved = this.#resolve(undefined)
    return resolved?.source === 'spline' ||
      (resolved?.source === 'valueClips' && resolved.clipSpline !== undefined)
  }

  // UsdAttribute::ValueMightBeTimeVarying (attribute.cpp:203-207) is
  // UsdStage::_ValueMightBeTimeVarying (stage.cpp:9726-9733): the same
  // _ValueMightBeTimeVaryingFromResolveInfo over the attribute's resolve
  // info that an untargeted UsdAttributeQuery answers
  // (attributeQuery.cpp:318-323).
  valueMightBeTimeVarying(): boolean {
    return new UsdAttributeQuery(this).valueMightBeTimeVarying()
  }

  getSpline(): TsSpline | undefined {
    const resolved = this.#resolve(undefined)
    if (resolved?.source === 'valueClips') {
      // Clip times already carry the clip set's layer offset.
      return resolved.clipSpline?.()
    }
    return resolved?.source === 'spline'
      ? usdTransformSpline(resolved.spline, resolved.layerToStageOffset)
      : undefined
  }

  getTimeSamplesInInterval(interval: GfInterval): number[] {
    const min = interval.getMin(), max = interval.getMax()
    return this.getTimeSampleKeys().filter(time =>
      (time > min || time === min && interval.isMinClosed()) &&
      (time < max || time === max && interval.isMaxClosed()))
  }

  // UsdAttribute::GetUnionedTimeSamples{InInterval} merge the resolved,
  // increasing sample sequences returned for each attribute
  // (pxr/usd/usd/attribute.cpp:122-158).
  static getUnionedTimeSamples(attrs: readonly Attribute[]): number[] {
    return [...new Set(attrs.flatMap(attr => attr.getTimeSampleKeys()))]
      .sort((a, b) => a - b)
  }

  static getUnionedTimeSamplesInInterval(
    attrs: readonly Attribute[], interval: GfInterval,
  ): number[] {
    return [...new Set(attrs.flatMap(attr => attr.getTimeSamplesInInterval(interval)))]
      .sort((a, b) => a - b)
  }

  getBracketingTimeSamples(time: number): [number, number] | [] {
    const resolved = this.#resolve(undefined)
    return resolved ? usdResolvedBracketingTimes(resolved, time) : []
  }

  getValueAtTime(
    timeCode: number | UsdTimeCode,
    opts?: { interpolation?: 'linear' | 'held' },
  ): unknown {
    return _sdfHandOut(this.#getValueAtTime(timeCode, opts))
  }
  #getValueAtTime(
    timeCode: number | UsdTimeCode,
    opts?: { interpolation?: 'linear' | 'held' },
  ): unknown {
    const { time, isPreTime } = _usdTimeCodeQuery(timeCode)
    if (time === 'default') return this.getValue()
    const resolved = this.#resolve(time)
    if (resolved) {
      // At a numeric time a blocked default does not end resolution: the
      // resolve info records the block and its source falls back to the
      // schema fallback (stage.cpp:9086-9091, ProcessFallback :8951-8962),
      // and _GetValueFromResolveInfoImpl returns that fallback without
      // consulting ValueIsBlocked (stage.cpp:8040-8059). Only the default
      // time read clears the block (stage.cpp:7270-7283).
      if (resolved.source === 'spline') {
        return usdEvaluateSpline(
          resolved.spline, time, isPreTime, resolved.layerToStageOffset)
      }
      if (resolved.source === 'timeSamples') {
        if (resolved.valueEvaluator) return resolved.valueEvaluator(time, isPreTime)
        const value = usdInterpolateResolvedSamples(
          resolved, time, opts?.interpolation ?? resolved.interpolation, isPreTime, resolved.typeName)
        return value instanceof SdfValueBlock ? undefined : value
      }
      if (resolved.source === 'valueClips') {
        return isPreTime && resolved.valueEvaluator
          ? resolved.valueEvaluator(time, true)
          : resolved.value
      }
      return resolved.value
    }
    return this.getValue()
  }

  // The owning stage and prim path (UsdAttribute::GetStage / GetPrim), so an
  // attribute handle can be re-wrapped by schema helpers.
  getStage(): Stage {
    const stage = this._getStage()
    if (!stage) throw new Error(`Attribute <${this._path}>: this handle carries no stage`)
    return stage
  }

  get primPath(): string { return this._resultPrimPath ?? this._getPrimPath() }
  get name(): string { return this._getName() }
  // UsdObject::GetPrim (OpenUSD 26.11.1 prim.h:2805-2809): the owning prim
  // (the instance proxy prim for a property of one); undefined when this
  // handle carries no stage or the prim is gone.
  getPrim(): Prim | undefined { return this._getStage()?.getPrim(this.primPath) }
  // UsdObject::GetPath.
  getPath(): string { return this._path }

  // UsdAttribute::Set(value, time = UsdTimeCode::Default()) (attribute.h:
  // 537-553) through UsdStage::_SetValue (stage.cpp:2027-2036): the default
  // value at the default time (no time), a time sample at a numeric time; a
  // pre-time is a coding error. Authoring resolves the declared type once, in
  // the stage, which also rejects values for opaque attributes.
  set(value: unknown, time?: number | UsdTimeCode): void {
    if (time !== undefined) {
      const { time: t, isPreTime } = _usdTimeCodeQuery(time)
      if (isPreTime) {
        TfDiagnosticMgr.GetInstance().postError(new TfError(
          `Cannot set value on <${this._path}> at the pre-time ${Number(t).toFixed(6)}. ` +
          'Pre-time is meant only for retrieving values at the limit when approaching ' +
          'time from the left.', TfDiagnosticType.CodingError))
        return
      }
      if (t !== 'default') {
        this.setTimeSample(t, value)
        return
      }
    }
    this.getStage()._setAttrDefault(this.primPath, this.name, value, { rejectOpaque: true })
  }

  setTimeSample(time: number, value: unknown): void {
    if (value instanceof SdfAnimationBlock) {
      throw new Error('SdfAnimationBlock can only be authored at the default time')
    }
    this.getStage()._setAttrTimeSample(this.primPath, this.name, time, value, { rejectOpaque: true })
  }

  connect(sourcePath: string): void {
    this.getStage()._setAttrConnections(this.primPath, this.name, [sourcePath])
  }

  setConnections(paths: string[]): void {
    this.getStage()._setAttrConnections(this.primPath, this.name, paths)
  }

  addConnection(
    path: string, position: UsdListPosition = ListPositionBackOfPrependList,
  ): boolean {
    this.getStage()._addAttrConnection(this.primPath, this.name, path, position)
    return true
  }

  removeConnection(path: string): boolean {
    this.getStage()._removeAttrConnection(this.primPath, this.name, path)
    return true
  }

  clearConnections(): boolean {
    this.getStage()._clearAttrConnections(this.primPath, this.name)
    return true
  }

  hasColorSpace(): boolean {
    return typeof this.getField('colorSpace') === 'string'
  }

  getColorSpace(): string {
    const value = this.getField('colorSpace')
    return typeof value === 'string' ? value : ''
  }

  setColorSpace(colorSpace: string): boolean {
    return this.setMetadata('colorSpace', colorSpace)
  }

  // UsdAttribute::GetArraySizeConstraint and friends (attribute.cpp:435-459):
  // the composed arraySizeConstraint metadata, 0 when there is none.
  getArraySizeConstraint(): number {
    const value = this.getMetadata('arraySizeConstraint')
    return typeof value === 'bigint' ? Number(value) : typeof value === 'number' ? value : 0
  }

  setArraySizeConstraint(constraint: number): boolean {
    return this.setMetadata('arraySizeConstraint', constraint)
  }

  hasAuthoredArraySizeConstraint(): boolean {
    return this.hasMetadata('arraySizeConstraint')
  }

  clearArraySizeConstraint(): boolean {
    return this.clearMetadata('arraySizeConstraint')
  }

  getMetadata(fieldName: string): unknown
  /**
   * UsdObject::GetMetadata(const TfToken &key, VtValue *value) (object.h:285):
   * fills `value` with the metadatum held as its Sdf type and returns whether
   * there is a value (typedMetadata.ts).
   */
  getMetadata(fieldName: string, value: VtValue): boolean
  getMetadata(fieldName: string, value?: VtValue): unknown {
    if (value) {
      return _usdGetTypedMetadata(fieldName, this.getMetadata(fieldName),
        () => this._getMetadataValueTypeName(fieldName), value)
    }
    return _sdfHandOut(this.#getMetadata(fieldName))
  }
  #getMetadata(fieldName: string): unknown {
    // UsdStage::_GetMetadata's timeSamples special case returns an empty
    // sample map for an attribute with no samples (OpenUSD v26.11.1 stage.cpp:6593-6613).
    if (fieldName === 'timeSamples' && !this.isRelationship) return this.getField(fieldName) ?? {}
    return this.getField(fieldName)
  }

  // UsdObject::GetAllAuthoredMetadata applies to properties as well as prims
  // (OpenUSD v26.08 pxr/usd/usd/object.cpp:119-124).
  getAllAuthoredMetadata(): Record<string, unknown> {
    const stage = this.getStage()
    const result = stage._getAllAuthoredPropertyMetadata(
      this._getPrimPath(), this._getName(), this)
    result.custom ??= false
    if (this.isRelationship) return result
    result.typeName ??= this.typeName
    result.variability ??= this.getField('variability') ?? 'varying'
    return _handOutValues(result)
  }

  // UsdObject::GetAllMetadata includes property-definition fallbacks
  // (OpenUSD v26.08 pxr/usd/usd/stage.cpp:7101-7157).
  getAllMetadata(): Record<string, unknown> {
    const authored = this.getAllAuthoredMetadata()
    const definition = this._fallbackSource?.def()?.getPropertyDefinition(this._getName())
    if (!definition?.isValid()) return authored
    const result: Record<string, unknown> = {}
    const fields = new Set([...Object.keys(authored), ...definition.listMetadataFields()])
    for (const field of fields) {
      // Enumerate fallback fields, then resolve each against authored opinions;
      // schema defaults must not replace a stronger authored default.
      const value = this.getMetadata(field)
      if (value !== undefined) result[field] = value
    }
    return result
  }

  // UsdStage::_HasMetadata (stage.cpp:7021-7028) composes existence without
  // _GetMetadata's timeSamples special case, so an attribute with no
  // samples has no timeSamples metadata.
  hasMetadata(fieldName: string): boolean {
    return this.getField(fieldName) !== undefined
  }

  hasAuthoredMetadata(fieldName: string): boolean {
    // Required intrinsic fields are authored-metadata entries even for a
    // builtin property without a scene spec (stage.cpp:7112-7149).
    return fieldName in this.getAllAuthoredMetadata() || this.getStage()._hasAuthoredPropertyMetadata(
      this._getPrimPath(), this.name, fieldName)
  }

  clearMetadata(fieldName: string): boolean {
    this.getStage()._clearPropertyField(this.primPath, this.name, fieldName)
    return true
  }

  /** @internal Used by AttributeLimits to clear the composed dictionary. */
  _clearMetadata(fieldName: string): void {
    this.getStage()._clearPropertyField(this.primPath, this.name, fieldName)
  }

  getLimits(subDictKey: string): UsdAttributeLimits {
    return new UsdAttributeLimits(this, subDictKey)
  }

  getSoftLimits(): UsdAttributeLimits {
    return this.getLimits('soft')
  }

  getHardLimits(): UsdAttributeLimits {
    return this.getLimits('hard')
  }

  clear(): boolean {
    this.getStage()._replaceAttrValueOpinions(this.primPath, this.name)
    return true
  }

  // UsdProperty::GetBaseName (property.cpp:29-41): the name after the last
  // namespace delimiter.
  getBaseName(): string {
    const fullName = this.name
    const delim = fullName.lastIndexOf(':')
    if (delim === fullName.length - 1) return ''
    return delim < 0 ? fullName : fullName.slice(delim + 1)
  }

  // UsdProperty::GetNamespace (property.cpp:43-55).
  getNamespace(): string {
    const fullName = this.name
    const delim = fullName.lastIndexOf(':')
    if (delim === fullName.length - 1) return ''
    return delim < 0 ? '' : fullName.slice(0, delim)
  }

  // UsdProperty::SplitName (property.cpp:57-61).
  splitName(): string[] { return SdfPath.tokenizeIdentifier(this.name) }

  // UsdAttribute::GetRoleName (attribute.h): the role of the attribute's
  // value type name.
  getRoleName(): string { return findValueTypeName(this.typeName)?.role ?? '' }

  // UsdAttribute::ClearAtTime (attribute.cpp:323-327).
  clearAtTime(time: number | UsdTimeCode): boolean {
    const { time: t, isPreTime } = _usdTimeCodeQuery(time)
    if (isPreTime) {
      // UsdStage::_ClearValue (stage.cpp:2125-2131).
      TfDiagnosticMgr.GetInstance().postError(new TfError(
        `Cannot clear value on <${this._path}> at the pre-time ${Number(t).toFixed(6)}. ` +
        'Pre-time is meant only for retrieving values at the limit when approaching ' +
        'time from the left.', TfDiagnosticType.CodingError))
      return false
    }
    return this.getStage()._clearAttrValueAtTime(this.primPath, this.name, t)
  }

  // UsdAttribute::ClearDefault (attribute.cpp:329-333).
  clearDefault(): boolean {
    return this.clearAtTime(UsdTimeCode.Default())
  }

  // UsdAttribute::GetVariability (attribute.cpp:39-43): the composed
  // variability, varying when none is authored or defined.
  getVariability(): 'varying' | 'uniform' {
    return this.getField('variability') === 'uniform' ? 'uniform' : 'varying'
  }

  // UsdProperty::IsAuthoredAt (property.cpp:141-150): whether the edit
  // target's layer has a spec at this property's mapped path. A layer is
  // converted to an edit target for that layer, as UsdEditTarget's implicit
  // constructor does.
  isAuthoredAt(target: Layer | UsdEditTarget): boolean {
    const editTarget = target instanceof Layer ? new UsdEditTarget(target) : target
    if (!editTarget.isValid()) return false
    const mappedPath = editTarget.mapToSpecPath(this._path)
    return mappedPath !== '' && editTarget.getLayer()!.hasSpec(mappedPath)
  }

  block(): void {
    this.getStage()._replaceAttrValueOpinions(
      this.primPath, this.name, new SdfValueBlock())
  }

  blockAnimation(): void {
    this.getStage()._replaceAttrValueOpinions(
      this.primPath, this.name, new SdfAnimationBlock())
  }

  setSpline(spline: TsSpline): boolean {
    if (this.typeName !== 'double' && this.typeName !== 'float' &&
        this.typeName !== 'half' && this.typeName !== 'timecode' && this.typeName !== 'duration') {
      throw new Error(
        `Spline on attribute '${this.name}' is incompatible with type '${this.typeName}'`)
    }
    return this.setMetadata('spline', spline)
  }

  // UsdAttribute::Get(value, time = UsdTimeCode::Default()) (attribute.h:
  // 474-482): value resolution at the given time, the default time when none
  // is given (getValue), else at that time (getValueAtTime, which honors a
  // pre-time). The value is returned; undefined when there is none.
  get(time?: number | UsdTimeCode): unknown {
    return time === undefined ? this.getValue() : this.getValueAtTime(time)
  }
}
