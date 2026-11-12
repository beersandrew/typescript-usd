// Ported from OpenUSD 26.11.1: pxr/usd/sdf/propertySpec.cpp,
//  pxr/usd/sdf/propertySpec.h
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of pxr/usd/sdf/propertySpec.{h,cpp}: the base of attribute and
// relationship specs.

import { Error as TfError, TfDiagnosticType } from 'typescript-usd/tf'
import type { SdfAllowed } from './allowed.ts'
import { Sdf_PropertyChildPolicy } from './childrenPolicies.ts'
import { Sdf_ChildrenUtils } from './childrenUtils.ts'
import { SdfMapEditProxy } from './mapEditProxy.ts'
import type { SdfPermission } from './primSpec.ts'
import type { Sdf_Identity } from './identity.ts'
import { SdfSpec } from './spec.ts'
import { SdfValueBlock } from './types.ts'
import { findValueTypeName, type SdfValueTypeName } from './valueTypeName.ts'

export type SdfVariability = 'varying' | 'uniform'

function codingError(message: string): never {
  throw new TfError(message, TfDiagnosticType.CodingError)
}

export abstract class SdfPropertySpec extends SdfSpec {
  /** @internal */
  constructor(id: Sdf_Identity) {
    super(id)
    // SdfPropertySpec is abstract (propertySpec.h); only its attribute and
    // relationship subclasses are instantiated.
    if (new.target === SdfPropertySpec) codingError('SdfPropertySpec is abstract')
  }

  protected _getValueWithDefault<T>(key: string): T {
    const value = this.getField(key)
    return (value !== undefined ? value : this.getSchema().getFallback(key)) as T
  }

  protected _setDictionaryValue(key: string, name: string, value: unknown): void {
    const proxy = new SdfMapEditProxy(this, key)
    if (value === undefined) proxy.erase(name)
    else proxy.set(name, value)
  }

  // ---- Name ----

  getName(): string { return this.getPath().name }
  getNameToken(): string { return this.getName() }

  canSetName(newName: string): SdfAllowed {
    return Sdf_ChildrenUtils.canRename(Sdf_PropertyChildPolicy, this, newName)
  }

  setName(newName: string, _validate = true): boolean {
    return Sdf_ChildrenUtils.rename(Sdf_PropertyChildPolicy, this, newName)
  }

  static isValidName(name: string): boolean {
    return Sdf_ChildrenUtils.isValidName(Sdf_PropertyChildPolicy, name)
  }

  // SdfPropertySpec::GetOwner: the owning prim, or for a relational
  // attribute, the owning relationship.
  getOwner(): SdfSpec | undefined {
    let parentPath = this.getPath().getParentPath()
    if (parentPath.isTargetPath()) parentPath = parentPath.getParentPath()
    return this.getLayer().getObjectAtPath(parentPath)
  }

  // ---- Metadata ----

  getCustomData(): SdfMapEditProxy { return new SdfMapEditProxy(this, 'customData') }
  getAssetInfo(): SdfMapEditProxy { return new SdfMapEditProxy(this, 'assetInfo') }
  setCustomData(name: string, value: unknown): void { this._setDictionaryValue('customData', name, value) }
  setAssetInfo(name: string, value: unknown): void { this._setDictionaryValue('assetInfo', name, value) }

  getDisplayGroup(): string { return this._getValueWithDefault('displayGroup') }
  setDisplayGroup(value: string): void { this.setField('displayGroup', value) }

  getDisplayName(): string { return this._getValueWithDefault('displayName') }
  setDisplayName(value: string): void { this.setField('displayName', value) }

  getDocumentation(): string { return this._getValueWithDefault('documentation') }
  setDocumentation(value: string): void { this.setField('documentation', value) }

  getHidden(): boolean { return this._getValueWithDefault('hidden') }
  setHidden(value: boolean): void { this.setField('hidden', value) }

  getPermission(): SdfPermission { return this._getValueWithDefault('permission') }
  setPermission(value: SdfPermission): void { this.setField('permission', value) }

  getPrefix(): string { return this._getValueWithDefault('prefix') }
  setPrefix(value: string): void { this.setField('prefix', value) }

  getSuffix(): string { return this._getValueWithDefault('suffix') }
  setSuffix(value: string): void { this.setField('suffix', value) }

  getSymmetricPeer(): string { return this._getValueWithDefault('symmetricPeer') }
  setSymmetricPeer(peerName: string): void { this.setField('symmetricPeer', peerName) }

  getSymmetryArguments(): SdfMapEditProxy { return new SdfMapEditProxy(this, 'symmetryArguments') }
  setSymmetryArgument(name: string, value: unknown): void {
    this._setDictionaryValue('symmetryArguments', name, value)
  }

  getSymmetryFunction(): string { return this._getValueWithDefault('symmetryFunction') }
  setSymmetryFunction(functionName: string): void { this.setField('symmetryFunction', functionName) }

  // ---- Value ----

  // SdfPropertySpec::GetTypeName: the attribute's value type name; a
  // relationship has none.
  getTypeName(): SdfValueTypeName | undefined {
    if (this.getSpecType() !== 'attribute') return undefined
    return findValueTypeName(String(this._getValueWithDefault('typeName')))
  }

  getDefaultValue(): unknown { return this._getValueWithDefault('default') }

  // SdfPropertySpec::SetDefaultValue (propertySpec.cpp:177-271).
  setDefaultValue(defaultValue: unknown): boolean {
    if (defaultValue === undefined) {
      this.clearDefaultValue()
      return true
    }
    if (this.getSpecType() === 'attribute') {
      const typeName = String(this._getValueWithDefault('typeName'))
      if (!findValueTypeName(typeName)) {
        // Unknown types may only be blocked.
        if (defaultValue instanceof SdfValueBlock) return this.setField('default', defaultValue)
        codingError(`Can't set value on attribute <${this.getPath().pathString}> with unknown type ` +
          `"${typeName}"`)
      }
      // propertySpec.cpp:202-209: opaque-valued types (opaque and group)
      // reject every authored default, blocks included.
      if (findValueTypeName(typeName)!.type === 'opaque') {
        codingError(`Can't set value on <${this.getPath().pathString}>: ${typeName}-typed attributes ` +
          'cannot have an authored default value')
      }
    }
    return this.setField('default', defaultValue)
  }

  hasDefaultValue(): boolean { return this.hasField('default') }
  clearDefaultValue(): void { this.clearField('default') }

  // ---- Spec properties ----

  getComment(): string { return this._getValueWithDefault('comment') }
  setComment(value: string): void { this.setField('comment', value) }

  isCustom(): boolean { return this._getValueWithDefault('custom') }
  setCustom(custom: boolean): void { this.setField('custom', custom) }

  getVariability(): SdfVariability { return this._getValueWithDefault('variability') }

  hasOnlyRequiredFields(): boolean {
    return this.getLayer()._isInert(this.getPath().pathString, true, true)
  }
}
