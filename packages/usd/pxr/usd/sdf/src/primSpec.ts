// Ported from OpenUSD 26.11.1: pxr/usd/sdf/primSpec.cpp,
//  pxr/usd/sdf/primSpec.h
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of pxr/usd/sdf/primSpec.{h,cpp}: a prim's scene description in a
// layer, and SdfCreatePrimInLayer.

import { Error as TfError, TfDiagnosticType } from 'typescript-usd/tf'
import { SdfAllowed } from './allowed.ts'
import { sdfChangeBlock } from './changeManager.ts'
import { SdfChildrenProxy, SdfChildrenProxyPermission, SdfChildrenView } from './childrenView.ts'
import {
  Sdf_PrimChildPolicy, Sdf_PropertyChildPolicy, Sdf_VariantSetChildPolicy,
} from './childrenPolicies.ts'
import { Sdf_ChildrenUtils } from './childrenUtils.ts'
import type { Layer } from './layer.ts'
import { SdfMapEditProxy } from './mapEditProxy.ts'
import { SdfPath } from './path.ts'
import {
  sdfGetNameEditorProxy, sdfGetNameOrderProxy, sdfGetPathEditorProxy, sdfGetPayloadEditorProxy,
  sdfGetReferenceEditorProxy, type SdfNameEditorProxy, type SdfNameOrderProxy, type SdfPathEditorProxy,
  type SdfPayloadEditorProxy, type SdfReferenceEditorProxy,
} from './proxyTypes.ts'
import type { SdfAttributeSpec } from './attributeSpec.ts'
import type { SdfPropertySpec } from './propertySpec.ts'
import type { SdfRelationshipSpec } from './relationshipSpec.ts'
import { SdfSpec } from './spec.ts'
import type { SdfVariantSetSpec } from './variantSetSpec.ts'

export type SdfSpecifier = 'def' | 'over' | 'class'
export type SdfPermission = 'public' | 'private'

function codingError(message: string): never {
  throw new TfError(message, TfDiagnosticType.CodingError)
}

export class SdfPrimSpec extends SdfSpec {
  // SdfPrimSpec::New (primSpec.cpp:53-110): a new prim spec, a child of the
  // layer's pseudo-root or of a parent prim.
  static new(
    parent: Layer | SdfPrimSpec | undefined, name: string, specifier: SdfSpecifier,
    typeName = '',
  ): SdfPrimSpec | undefined {
    const parentPrim = parent instanceof SdfPrimSpec ? parent : parent?.getPseudoRoot()
    if (!parentPrim) {
      codingError(`Cannot create prim '${name}' because the parent prim is NULL`)
    }
    if (!SdfPrimSpec.isValidName(name)) {
      throw new TfError(`Cannot create prim '${parentPrim.getPath().pathString}/${name}' because ` +
        `'${name}' is not a valid name`)
    }
    return sdfChangeBlock(() => {
      const layer = parentPrim.getLayer()
      const childPath = parentPrim.getPath().appendChild(name)
      // Prim specs are inert when "over" with no type name.
      const inert = specifier === 'over' && typeName === ''
      if (!Sdf_ChildrenUtils.createSpec(Sdf_PrimChildPolicy, layer, childPath, 'prim', inert)) {
        return undefined
      }
      layer.setField(childPath.pathString, 'specifier', specifier)
      if (typeName !== '') layer.setField(childPath.pathString, 'typeName', typeName)
      return layer.getPrimAtPath(childPath)
    })
  }

  // _ValidateEdit: the pseudo-root's prim fields cannot be edited.
  protected _validateEdit(key: string): boolean {
    if (this._isPseudoRoot()) codingError(`Cannot edit ${key} on a pseudo-root`)
    return true
  }

  protected _isPseudoRoot(): boolean { return this.getSpecType() === 'pseudoRoot' }

  // Accessor helpers (accessorHelpers.h): the authored value or the schema
  // fallback.
  protected _getValueWithDefault<T>(key: string): T {
    const value = this.getField(key)
    return (value !== undefined ? value : this.getSchema().getFallback(key)) as T
  }

  protected _setValue(key: string, value: unknown): void {
    if (this._validateEdit(key)) this.setField(key, value)
  }

  protected _clearValue(key: string): void {
    if (this._validateEdit(key)) this.clearField(key)
  }

  protected _setDictionaryValue(key: string, name: string, value: unknown): void {
    if (!this._validateEdit(key)) return
    const proxy = new SdfMapEditProxy(this, key)
    if (value === undefined) proxy.erase(name)
    else proxy.set(name, value)
  }

  // ---- Name ----

  getName(): string { return this.getPath().name }
  getNameToken(): string { return this.getName() }

  canSetName(newName: string): SdfAllowed {
    if (this._isPseudoRoot()) return new SdfAllowed('The pseudo-root cannot be renamed')
    return Sdf_ChildrenUtils.canRename(Sdf_PrimChildPolicy, this, newName)
  }

  // SdfPrimSpec::SetName (primSpec.cpp:150-188).
  setName(name: string, _validate = true): boolean {
    return sdfChangeBlock(() => {
      const oldName = this.getNameToken()
      if (!Sdf_ChildrenUtils.rename(Sdf_PrimChildPolicy, this, name)) return false
      if (name === oldName) return true
      // Also update the parent's name children order, keeping this prim's
      // position.
      const parentPrim = this.getLayer().getPrimAtPath(this.getPath().getParentPath())
      if (parentPrim) {
        const ordering = parentPrim.getNameChildrenOrder()
        if (!ordering.empty()) {
          ordering.remove(name)
          ordering.replace(oldName, name)
        }
      }
      return true
    })
  }

  static isValidName(name: string): boolean {
    return Sdf_ChildrenUtils.isValidName(Sdf_PrimChildPolicy, name)
  }

  // ---- Namespace hierarchy ----

  getNameRoot(): SdfPrimSpec { return this.getLayer().getPseudoRoot() }

  getNameParent(): SdfPrimSpec | undefined {
    return this.getPath().isRootPrimPath() ? undefined
      : this.getLayer().getPrimAtPath(this.getPath().getParentPath())
  }

  getRealNameParent(): SdfPrimSpec | undefined {
    return this.getLayer().getPrimAtPath(this.getPath().getParentPath())
  }

  getNameChildren(): SdfChildrenProxy<SdfPrimSpec> {
    return new SdfChildrenProxy(this.getLayer(), this.getPath(), Sdf_PrimChildPolicy, 'prim',
      undefined, isPrimSpec)
  }

  setNameChildren(nameChildrenSpecs: readonly SdfPrimSpec[]): void {
    Sdf_ChildrenUtils.setChildren(Sdf_PrimChildPolicy, this.getLayer(), this.getPath(), nameChildrenSpecs)
  }

  insertNameChild(child: SdfPrimSpec, index = -1): boolean {
    return Sdf_ChildrenUtils.insertChild(Sdf_PrimChildPolicy, this.getLayer(), this.getPath(), child, index)
  }

  removeNameChild(child: SdfPrimSpec): boolean {
    if (child.getLayer() !== this.getLayer() || !child.getPath().getParentPath().equals(this.getPath())) {
      codingError(`Cannot remove child prim '${child.getPath().pathString}' from parent ` +
        `'${this.getPath().pathString}' because it is not a child of that prim`)
    }
    return Sdf_ChildrenUtils.removeChild(Sdf_PrimChildPolicy, this.getLayer(), this.getPath(), child.getNameToken())
  }

  getNameChildrenOrder(): SdfNameOrderProxy { return sdfGetNameOrderProxy(this, 'primOrder') }

  hasNameChildrenOrder(): boolean { return !this.getNameChildrenOrder().empty() }

  setNameChildrenOrder(names: readonly string[]): void { this.getNameChildrenOrder().assign(names) }

  insertInNameChildrenOrder(name: string, index = -1): void { this.getNameChildrenOrder().insert(index, name) }

  removeFromNameChildrenOrder(name: string): void { this.getNameChildrenOrder().remove(name) }

  removeFromNameChildrenOrderByIndex(index: number): void { this.getNameChildrenOrder().erase(index) }

  /** Applies the name children order to names; returns the reordered names. */
  applyNameChildrenOrder(names: readonly string[]): string[] {
    return this.getNameChildrenOrder().applyEditsToList(names)
  }

  // ---- Properties ----

  getProperties(): SdfChildrenProxy<SdfPropertySpec> {
    return new SdfChildrenProxy(this.getLayer(), this.getPath(), Sdf_PropertyChildPolicy, 'property',
      undefined, isPropertySpec)
  }

  setProperties(propertySpecs: readonly SdfPropertySpec[]): void {
    if (!this._validateEdit('properties')) return
    Sdf_ChildrenUtils.setChildren(Sdf_PropertyChildPolicy, this.getLayer(), this.getPath(), propertySpecs)
  }

  insertProperty(property: SdfPropertySpec, index = -1): boolean {
    if (!this._validateEdit('properties')) return false
    return Sdf_ChildrenUtils.insertChild(Sdf_PropertyChildPolicy, this.getLayer(), this.getPath(), property, index)
  }

  removeProperty(property: SdfPropertySpec): void {
    if (!this._validateEdit('properties')) return
    if (property.getLayer() !== this.getLayer() ||
        !property.getPath().getParentPath().equals(this.getPath())) {
      codingError(`Cannot remove property '${property.getPath().pathString}' from prim ` +
        `'${this.getPath().pathString}' because it does not belong to that prim`)
    }
    Sdf_ChildrenUtils.removeChild(Sdf_PropertyChildPolicy, this.getLayer(), this.getPath(), property.getNameToken())
  }

  getAttributes(): SdfChildrenView<SdfAttributeSpec> {
    return new SdfChildrenView(this.getLayer(), this.getPath(), Sdf_PropertyChildPolicy,
      (spec): spec is SdfAttributeSpec => spec.getSpecType() === 'attribute')
  }

  getRelationships(): SdfChildrenView<SdfRelationshipSpec> {
    return new SdfChildrenView(this.getLayer(), this.getPath(), Sdf_PropertyChildPolicy,
      (spec): spec is SdfRelationshipSpec => spec.getSpecType() === 'relationship')
  }

  getPropertyOrder(): SdfNameOrderProxy { return sdfGetNameOrderProxy(this, 'propertyOrder') }

  hasPropertyOrder(): boolean { return !this.getPropertyOrder().empty() }

  setPropertyOrder(names: readonly string[]): void {
    if (this._validateEdit('properties')) this.getPropertyOrder().assign(names)
  }

  insertInPropertyOrder(name: string, index = -1): void {
    if (this._validateEdit('properties')) this.getPropertyOrder().insert(index, name)
  }

  removeFromPropertyOrder(name: string): void {
    if (this._validateEdit('properties')) this.getPropertyOrder().remove(name)
  }

  removeFromPropertyOrderByIndex(index: number): void {
    if (this._validateEdit('properties')) this.getPropertyOrder().erase(index)
  }

  /** Applies the property order to names; returns the reordered names. */
  applyPropertyOrder(names: readonly string[]): string[] {
    return this._validateEdit('properties') ? this.getPropertyOrder().applyEditsToList(names) : [...names]
  }

  // ---- Lookup (paths relative to this prim) ----

  private _absolutePath(path: string | SdfPath, what: string): SdfPath {
    const sdfPath = typeof path === 'string' ? SdfPath.fromString(path) : path
    if (sdfPath.isEmpty()) codingError(`Cannot get ${what} at the empty path`)
    return sdfPath.makeAbsolutePath(this.getPath())
  }

  getObjectAtPath(path: string | SdfPath): SdfSpec | undefined {
    return this.getLayer().getObjectAtPath(this._absolutePath(path, 'object'))
  }

  getPrimAtPath(path: string | SdfPath): SdfPrimSpec | undefined {
    return this.getLayer().getPrimAtPath(this._absolutePath(path, 'prim'))
  }

  getPropertyAtPath(path: string | SdfPath): SdfPropertySpec | undefined {
    return this.getLayer().getPropertyAtPath(this._absolutePath(path, 'property'))
  }

  getAttributeAtPath(path: string | SdfPath): SdfAttributeSpec | undefined {
    return this.getLayer().getAttributeAtPath(this._absolutePath(path, 'attribute'))
  }

  getRelationshipAtPath(path: string | SdfPath): SdfRelationshipSpec | undefined {
    return this.getLayer().getRelationshipAtPath(this._absolutePath(path, 'relationship'))
  }

  // ---- Metadata ----

  getTypeName(): string { return this._getValueWithDefault('typeName') }

  // SdfPrimSpec::SetTypeName (primSpec.cpp:497-508).
  setTypeName(value: string): void {
    if (value === '' && this.getSpecifier() !== 'over') {
      codingError(`Cannot set empty type name on prim '${this.getPath().pathString}'`)
    }
    this._setValue('typeName', value)
  }

  getComment(): string { return this._getValueWithDefault('comment') }
  setComment(value: string): void { this._setValue('comment', value) }

  getDocumentation(): string { return this._getValueWithDefault('documentation') }
  setDocumentation(value: string): void { this._setValue('documentation', value) }

  getActive(): boolean { return this._getValueWithDefault('active') }
  setActive(value: boolean): void { this._setValue('active', value) }
  hasActive(): boolean { return this.hasField('active') }
  clearActive(): void { this._clearValue('active') }

  getHidden(): boolean { return this._getValueWithDefault('hidden') }
  setHidden(value: boolean): void { this.setField('hidden', value) }

  getKind(): string { return this._getValueWithDefault('kind') }
  setKind(value: string): void { this._setValue('kind', value) }
  hasKind(): boolean { return this.hasField('kind') }
  clearKind(): void { this._clearValue('kind') }

  getClipSetsList(): SdfNameEditorProxy { return sdfGetNameEditorProxy(this, 'clipSets') }
  hasClipSets(): boolean { return this.getClipSetsList().hasKeys() }

  getClips(): SdfMapEditProxy { return new SdfMapEditProxy(this, 'clips') }
  setClips(name: string, value: unknown): void { this._setDictionaryValue('clips', name, value) }

  getSymmetryFunction(): string { return this._getValueWithDefault('symmetryFunction') }
  setSymmetryFunction(functionName: string): void { this._setValue('symmetryFunction', functionName) }

  getSymmetryArguments(): SdfMapEditProxy { return new SdfMapEditProxy(this, 'symmetryArguments') }
  setSymmetryArgument(name: string, value: unknown): void {
    this._setDictionaryValue('symmetryArguments', name, value)
  }

  getSymmetricPeer(): string { return this._getValueWithDefault('symmetricPeer') }
  setSymmetricPeer(peerName: string): void { this._setValue('symmetricPeer', peerName) }

  getPrefix(): string { return this._getValueWithDefault('prefix') }
  setPrefix(value: string): void { this._setValue('prefix', value) }

  getSuffix(): string { return this._getValueWithDefault('suffix') }
  setSuffix(value: string): void { this._setValue('suffix', value) }

  getCustomData(): SdfMapEditProxy { return new SdfMapEditProxy(this, 'customData') }
  getAssetInfo(): SdfMapEditProxy { return new SdfMapEditProxy(this, 'assetInfo') }
  setCustomData(name: string, value: unknown): void { this._setDictionaryValue('customData', name, value) }
  setAssetInfo(name: string, value: unknown): void { this._setDictionaryValue('assetInfo', name, value) }

  getSpecifier(): SdfSpecifier { return this._getValueWithDefault('specifier') }
  setSpecifier(value: SdfSpecifier): void { this._setValue('specifier', value) }

  getPermission(): SdfPermission { return this._getValueWithDefault('permission') }
  setPermission(value: SdfPermission): void { this._setValue('permission', value) }

  getPrefixSubstitutions(): Record<string, unknown> {
    return { ...this._getValueWithDefault<Record<string, unknown>>('prefixSubstitutions') }
  }
  setPrefixSubstitutions(value: Record<string, unknown>): void { this._setValue('prefixSubstitutions', value) }

  getSuffixSubstitutions(): Record<string, unknown> {
    return { ...this._getValueWithDefault<Record<string, unknown>>('suffixSubstitutions') }
  }
  setSuffixSubstitutions(value: Record<string, unknown>): void { this._setValue('suffixSubstitutions', value) }

  setInstanceable(instanceable: boolean): void { this._setValue('instanceable', instanceable) }
  getInstanceable(): boolean { return this._getValueWithDefault('instanceable') }
  hasInstanceable(): boolean { return this.hasField('instanceable') }
  clearInstanceable(): void { this._clearValue('instanceable') }

  // ---- Composition arcs ----

  getPayloadList(): SdfPayloadEditorProxy { return sdfGetPayloadEditorProxy(this, 'payload') }
  hasPayloads(): boolean { return this.getPayloadList().hasKeys() }
  clearPayloadList(): void { if (this._validateEdit('payload')) this.getPayloadList().clearEdits() }

  getInheritPathList(): SdfPathEditorProxy { return sdfGetPathEditorProxy(this, 'inheritPaths') }
  hasInheritPaths(): boolean { return this.getInheritPathList().hasKeys() }
  clearInheritPathList(): void { if (this._validateEdit('inheritPaths')) this.getInheritPathList().clearEdits() }

  getSpecializesList(): SdfPathEditorProxy { return sdfGetPathEditorProxy(this, 'specializes') }
  hasSpecializes(): boolean { return this.getSpecializesList().hasKeys() }
  clearSpecializesList(): void { if (this._validateEdit('specializes')) this.getSpecializesList().clearEdits() }

  getReferenceList(): SdfReferenceEditorProxy { return sdfGetReferenceEditorProxy(this, 'references') }
  hasReferences(): boolean { return this.getReferenceList().hasKeys() }
  clearReferenceList(): void { if (this._validateEdit('references')) this.getReferenceList().clearEdits() }

  // ---- Variants ----

  getVariantSetNameList(): SdfNameEditorProxy { return sdfGetNameEditorProxy(this, 'variantSetNames') }
  hasVariantSetNames(): boolean { return this.getVariantSetNameList().hasKeys() }

  getVariantNames(name: string): string[] {
    // Neither the pseudo root nor variants can have variant sets.
    if (this._isPseudoRoot() || !this.getPath().isPrimPath()) return []
    const variants = this.getLayer().getField(
      this.getPath().appendVariantSelection(name, '').pathString, 'variantChildren')
    return Array.isArray(variants) ? variants.map(String) : []
  }

  getVariantSets(): SdfChildrenProxy<SdfVariantSetSpec> {
    return new SdfChildrenProxy(this.getLayer(), this.getPath(), Sdf_VariantSetChildPolicy, 'variant sets',
      SdfChildrenProxyPermission.CanErase, isVariantSetSpec)
  }

  removeVariantSet(name: string): void {
    if (this._validateEdit('variantSetChildren')) this.getVariantSets().erase(name)
  }

  getVariantSelections(): SdfMapEditProxy<string> {
    return new SdfMapEditProxy<string>(this._isPseudoRoot() ? undefined : this, 'variantSelection')
  }

  setVariantSelection(variantSetName: string, variantName: string): void {
    if (!this._validateEdit('variantSelection')) return
    const proxy = this.getVariantSelections()
    if (!proxy.isValid()) return
    if (variantName === '') proxy.erase(variantSetName)
    else sdfChangeBlock(() => proxy.set(variantSetName, variantName))
  }

  blockVariantSelection(variantSetName: string): void {
    if (!this._validateEdit('variantSelection')) return
    const proxy = this.getVariantSelections()
    if (proxy.isValid()) sdfChangeBlock(() => proxy.set(variantSetName, ''))
  }

}

function isPrimSpec(spec: SdfSpec): spec is SdfPrimSpec { return spec instanceof SdfPrimSpec }

function isPropertySpec(spec: SdfSpec): spec is SdfPropertySpec {
  const specType = spec.getSpecType()
  return specType === 'attribute' || specType === 'relationship'
}

function isVariantSetSpec(spec: SdfSpec): spec is SdfVariantSetSpec {
  return spec.getSpecType() === 'variantSet'
}

// _IsValidPath (primSpec.cpp:789-822): a prim or prim variant selection path
// that names no variant set.
function isValidPrimPath(path: SdfPath): boolean {
  if (!path.isAbsoluteRootOrPrimPath() && !path.isPrimVariantSelectionPath()) return false
  if (path.containsPrimVariantSelection()) {
    for (let p = path.makeAbsolutePath(SdfPath.absoluteRootPath); !p.isAbsoluteRootPath() && !p.isEmpty();
      p = p.getParentPath()) {
      const [variantSet, variant] = p.getVariantSelection()
      if (variantSet !== '' && variant === '') return false
    }
  }
  return true
}

// _FindOrCreateVariantSpec (primSpec.cpp:740-787).
function findOrCreateVariantSpec(layer: Layer, vsPath: SdfPath): boolean {
  const primSpec = layer.getPrimAtPath(vsPath.getParentPath())
  if (!primSpec) return false
  const [variantSetName, variantName] = vsPath.getVariantSelection()
  let variantSet = primSpec.getVariantSets().get(variantSetName)
  // Create a new variant set spec and add it to the variant set list.
  if (!variantSet) {
    variantSet = sdfVariantSetSpecNew(primSpec, variantSetName)
    if (variantSet) primSpec.getVariantSetNameList().prepend(variantSetName)
  }
  if (!variantSet) {
    throw new TfError(`Failed to create variant set for '${vsPath.pathString}' in @${layer.identifier}@`)
  }
  if (variantSet.getVariants().has(variantName)) return true
  return !!sdfVariantSpecNew(variantSet, variantName)
}

// The variant set and variant spec constructors, registered by their modules.
let sdfVariantSetSpecNew: (owner: SdfPrimSpec, name: string) => SdfVariantSetSpec | undefined
let sdfVariantSpecNew: (owner: SdfVariantSetSpec, name: string) => unknown

/** @internal */
export function _sdfRegisterVariantSpecConstructors(
  variantSetNew: typeof sdfVariantSetSpecNew, variantNew: typeof sdfVariantSpecNew,
): void {
  sdfVariantSetSpecNew = variantSetNew
  sdfVariantSpecNew = variantNew
}

/** @internal Sdf_UncheckedCreatePrimInLayer (primSpec.cpp:868-911). */
export function _sdfUncheckedCreatePrimInLayer(layer: Layer, primPath: SdfPath): boolean {
  if (layer.hasSpec(primPath.pathString)) return true
  const ancestors: SdfPath[] = []
  let path = primPath
  do {
    ancestors.push(path)
    path = path.getParentPath()
  } while (!layer.hasSpec(path.pathString))
  // Create each prim from root-most to the prim at primPath.
  while (ancestors.length > 0) {
    const ancPath = ancestors.pop()!
    if (ancPath.isPrimVariantSelectionPath()) {
      if (!findOrCreateVariantSpec(layer, ancPath)) return false
    } else if (!Sdf_ChildrenUtils.createSpec(Sdf_PrimChildPolicy, layer, ancPath, 'prim', true)) {
      throw new TfError(`Failed to create prim at path '${ancPath.pathString}' in layer @${layer.identifier}@`)
    }
  }
  return true
}

function absolutePrimPath(layer: Layer | undefined, primPath: string | SdfPath): SdfPath {
  const path = typeof primPath === 'string' ? SdfPath.fromString(primPath) : primPath
  const absPath = path.isAbsolutePath() ? path : path.makeAbsolutePath(SdfPath.absoluteRootPath)
  if (!isValidPrimPath(absPath)) {
    codingError(`Cannot create prim at path '${path.pathString}' because it is not a valid prim or ` +
      'prim variant selection path')
  }
  if (!layer) codingError(`Cannot create prim at path '${path.pathString}' in null or expired layer`)
  return absPath
}

// SdfCreatePrimInLayer (primSpec.cpp:933-946): the prim spec at primPath,
// creating it and any missing ancestors (as inert overs) if needed.
export function sdfCreatePrimInLayer(layer: Layer, primPath: string | SdfPath): SdfPrimSpec | undefined {
  const absPath = absolutePrimPath(layer, primPath)
  return sdfChangeBlock(() =>
    _sdfUncheckedCreatePrimInLayer(layer, absPath) ? layer.getPrimAtPath(absPath) : undefined)
}

// SdfJustCreatePrimInLayer (primSpec.cpp:948-958).
export function sdfJustCreatePrimInLayer(layer: Layer, primPath: string | SdfPath): boolean {
  const absPath = absolutePrimPath(layer, primPath)
  return sdfChangeBlock(() => _sdfUncheckedCreatePrimInLayer(layer, absPath))
}
