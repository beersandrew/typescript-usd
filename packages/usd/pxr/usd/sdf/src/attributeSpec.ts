// Ported from OpenUSD 26.11.1: pxr/usd/sdf/attributeSpec.cpp,
//  pxr/usd/sdf/attributeSpec.h
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of pxr/usd/sdf/attributeSpec.{h,cpp}.

import { Error as TfError, TfDiagnosticType } from 'typescript-usd/tf'
import { sdfChangeBlock } from './changeManager.ts'
import { Sdf_AttributeChildPolicy } from './childrenPolicies.ts'
import { Sdf_ChildrenUtils } from './childrenUtils.ts'
import type { Layer } from './layer.ts'
import { SdfPath } from './path.ts'
import { _sdfUncheckedCreatePrimInLayer, type SdfPrimSpec } from './primSpec.ts'
import { SdfPropertySpec, type SdfVariability } from './propertySpec.ts'
import { sdfGetPathEditorProxy, type SdfPathEditorProxy } from './proxyTypes.ts'
import { Spline as TsSpline } from 'typescript-usd/ts'
import { findValueTypeName, type SdfValueTypeName } from './valueTypeName.ts'

function codingError(message: string): never {
  throw new TfError(message, TfDiagnosticType.CodingError)
}

function typeNameToken(typeName: SdfValueTypeName | string): string {
  return typeof typeName === 'string' ? typeName : typeName.name
}

export class SdfAttributeSpec extends SdfPropertySpec {
  // SdfAttributeSpec::New (attributeSpec.cpp:29-111).
  static new(
    owner: SdfPrimSpec | undefined, name: string, typeName: SdfValueTypeName | string,
    variability: SdfVariability = 'varying', custom = false,
  ): SdfAttributeSpec | undefined {
    // An expired handle has a null pointer (attributeSpec.cpp:40-45).
    if (!owner || owner.isDormant()) codingError('Cannot create an SdfAttributeSpec with a null owner')
    if (!Sdf_ChildrenUtils.isValidName(Sdf_AttributeChildPolicy, name)) {
      codingError(`Cannot create attribute spec on <${owner.getPath().pathString}> with invalid name ` +
        `'${name}'`)
    }
    if (owner.getPath().isAbsoluteRootPath()) {
      codingError(`Cannot create attribute spec '${name}' on the pseudo-root '/'`)
    }
    const token = typeNameToken(typeName)
    const attrPath = owner.getPath().appendProperty(name)
    if (token === '') codingError(`Cannot create attribute spec <${attrPath.pathString}> with invalid type`)
    const layer = owner.getLayer()
    return sdfChangeBlock(() => {
      // Attribute specs initially have only required fields unless custom.
      if (!Sdf_ChildrenUtils.createSpec(Sdf_AttributeChildPolicy, layer, attrPath, 'attribute', !custom)) {
        return undefined
      }
      const result = layer.getAttributeAtPath(attrPath)!
      result.setField('custom', custom)
      result.setField('typeName', token)
      result.setField('variability', variability)
      return result
    })
  }

  // ---- Connections ----

  getConnectionPathList(): SdfPathEditorProxy { return sdfGetPathEditorProxy(this, 'connectionPaths') }
  hasConnectionPaths(): boolean { return this.getConnectionPathList().hasKeys() }
  clearConnectionPaths(): void { this.getConnectionPathList().clearEdits() }

  // ---- Values ----

  hasSpline(): boolean { return this.hasField('spline') }
  // SDF_DEFINE_GET(Spline, ..., TsSpline) (attributeSpec.cpp:150): an empty
  // spline when none is authored.
  getSpline(): TsSpline {
    const spline = this.getField('spline')
    return spline instanceof TsSpline ? spline : new TsSpline()
  }

  // SdfAttributeSpec::SetSpline (attributeSpec.cpp:152-192).
  setSpline(spline: TsSpline): void {
    if (!this.getLayer().permissionToEdit()) {
      codingError(`Cannot set spline on spec <${this.getPath().pathString}> because owning layer ` +
        `@${this.getLayer().identifier}@ is not editable`)
    }
    const typeName = this.getField('typeName')
    const valueType = typeName !== undefined ? findValueTypeName(String(typeName))?.cppTypeName : undefined
    if (!valueType) {
      codingError(`Cannot determine value type for attribute spec <${this.getPath().pathString}>`)
    }
    if (!TsSpline.isSupportedValueType(valueType)) {
      codingError(`Cannot set spline on spec <${this.getPath().pathString}> because the value type ` +
        `'${valueType}' is not supported for splines`)
    }
    if (spline.GetValueTypeName() !== valueType) {
      codingError(`Cannot set spline on spec <${this.getPath().pathString}> because the value type ` +
        `'${spline.GetValueTypeName()}' does not match the attribute value type '${valueType}'`)
    }
    this.setField('spline', spline)
  }
  clearSpline(): void { this.clearField('spline') }

  getTimeSampleMap(): ReadonlyArray<readonly [number, unknown]> {
    const samples = this.getField('timeSamples')
    return Array.isArray(samples) ? samples as Array<[number, unknown]> : []
  }

  listTimeSamples(): number[] { return this.getLayer().listTimeSamplesForPath(this.getPath().pathString) }

  getNumTimeSamples(): number { return this.listTimeSamples().length }

  getBracketingTimeSamples(time: number): [number, number] | undefined {
    return this.getLayer().getBracketingTimeSamplesForPath(this.getPath().pathString, time)
  }

  queryTimeSample(time: number): unknown {
    return this.getLayer().queryTimeSample(this.getPath().pathString, time)
  }

  setTimeSample(time: number, value: unknown): void {
    const path = this.getPath()
    this.getLayer().setAttrTimeSample(path.getParentPath().pathString, path.name, time, value)
  }

  // SdfAttributeSpec::EraseTimeSample (attributeSpec.cpp:247-251).
  eraseTimeSample(time: number): void {
    this.getLayer().eraseTimeSample(this.getPath(), time)
  }

  // ---- Metadata ----

  getAllowedTokens(): string[] { return [...(this._getValueWithDefault<string[]>('allowedTokens') ?? [])] }
  setAllowedTokens(allowedTokens: readonly string[]): void { this.setField('allowedTokens', [...allowedTokens]) }
  hasAllowedTokens(): boolean { return this.hasField('allowedTokens') }
  clearAllowedTokens(): void { this.clearField('allowedTokens') }

  getLimits(): Record<string, unknown> { return { ...this._getValueWithDefault<Record<string, unknown>>('limits') } }
  setLimits(limits: Record<string, unknown>): void { this.setField('limits', limits) }
  hasLimits(): boolean { return this.hasField('limits') }
  clearLimits(): void { this.clearField('limits') }

  getDisplayUnit(): string {
    return this.hasField('displayUnit') ? String(this.getField('displayUnit')) : 'default'
  }
  setDisplayUnit(displayUnit: string): void { this.setField('displayUnit', displayUnit) }
  hasDisplayUnit(): boolean { return this.hasField('displayUnit') }
  clearDisplayUnit(): void { this.clearField('displayUnit') }

  getColorSpace(): string { return this._getValueWithDefault('colorSpace') }
  setColorSpace(colorSpace: string): void { this.setField('colorSpace', colorSpace) }
  hasColorSpace(): boolean { return this.hasField('colorSpace') }
  clearColorSpace(): void { this.clearField('colorSpace') }

  getArraySizeConstraint(): number { return this._getValueWithDefault('arraySizeConstraint') }
  setArraySizeConstraint(constraint: number): void { this.setField('arraySizeConstraint', constraint) }
  hasArraySizeConstraint(): boolean { return this.hasField('arraySizeConstraint') }
  clearArraySizeConstraint(): void { this.clearField('arraySizeConstraint') }

  getRoleName(): string { return this.getTypeName()?.role ?? '' }
}

// SdfJustCreatePrimAttributeInLayer (attributeSpec.cpp:283-325).
export function sdfJustCreatePrimAttributeInLayer(
  layer: Layer, attrPath: string | SdfPath, typeName: SdfValueTypeName | string,
  variability: SdfVariability = 'varying', isCustom = false,
): boolean {
  const path = typeof attrPath === 'string' ? SdfPath.fromString(attrPath) : attrPath
  if (!path.isPrimPropertyPath()) {
    codingError(`Cannot create prim attribute at path '${path.pathString}' because it is not a prim ` +
      'property path')
  }
  return sdfChangeBlock(() => {
    if (!_sdfUncheckedCreatePrimInLayer(layer, path.getParentPath())) return false
    if (!Sdf_ChildrenUtils.createSpec(Sdf_AttributeChildPolicy, layer, path, 'attribute', !isCustom)) {
      throw new TfError(`Failed to create attribute at path '${path.pathString}' in layer @${layer.identifier}@`)
    }
    layer.setField(path.pathString, 'custom', isCustom)
    layer.setField(path.pathString, 'typeName', typeNameToken(typeName))
    layer.setField(path.pathString, 'variability', variability)
    return true
  })
}

// SdfCreatePrimAttributeInLayer (attributeSpec.cpp:268-281).
export function sdfCreatePrimAttributeInLayer(
  layer: Layer, attrPath: string | SdfPath, typeName: SdfValueTypeName | string,
  variability: SdfVariability = 'varying', isCustom = false,
): SdfAttributeSpec | undefined {
  return sdfJustCreatePrimAttributeInLayer(layer, attrPath, typeName, variability, isCustom)
    ? layer.getAttributeAtPath(attrPath) : undefined
}
