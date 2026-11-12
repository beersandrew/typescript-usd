// Ported from OpenUSD 26.11.1: pxr/base/vt/valueComposeOver.cpp,
//  pxr/base/vt/valueComposeOver.h, pxr/base/vt/visitValue.h
// Copyright 2022, 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Compose-over and visitor dispatch from OpenUSD v26.08
// pxr/base/vt/valueComposeOver.h and pxr/base/vt/visitValue.h.
import { Type as TfType } from 'typescript-usd/tf'
import { _copyVtValue, VtValue } from './value.ts'

type Compose = (stronger: VtValue, weaker: VtValue) => VtValue
const composers = new Map<TfType, Map<TfType, Compose>>()
export const VtRegisterComposeOver = (
  strongType: TfType,
  weakType: TfType,
  compose: Compose,
): void => {
  const weakTypes = composers.get(strongType) ?? new Map<TfType, Compose>()
  if (!weakTypes.has(weakType)) weakTypes.set(weakType, compose)
  composers.set(strongType, weakTypes)
}
export const Vt_RegisterComposeOver = VtRegisterComposeOver
export function VtValueCanComposeOver(value: VtValue): boolean
export function VtValueCanComposeOver(
  stronger: VtValue,
  weaker: VtValue,
): boolean
export function VtValueCanComposeOver(
  stronger: VtValue,
  weaker?: VtValue,
): boolean {
  if (stronger.IsEmpty()) return true
  const weakTypes = composers.get(stronger.getType())
  return weaker === undefined
    ? weakTypes !== undefined
    : weakTypes?.has(weaker.getType()) === true
}
export const VtValueTypeCanComposeOver = (strongType: TfType): boolean =>
  composers.has(strongType)
export function VtValueTryComposeOver(
  stronger: VtValue, weaker: VtValue,
): VtValue | undefined {
  if (stronger.IsEmpty()) return _copyVtValue(weaker)
  return composers.get(stronger.getType())?.get(weaker.getType())?.(
    stronger,
    weaker,
  )
}
export const VtValueComposeOver = (stronger: VtValue, weaker: VtValue): VtValue =>
  VtValueTryComposeOver(stronger, weaker) ?? _copyVtValue(stronger)

export function VtVisitValue<T>(
  value: VtValue, visitor: (held: unknown, type: TfType) => T,
): T {
  return visitor(value.Get<unknown>(), value.getType())
}
export const VtVisitValueType = <T>(
  type: TfType, visitor: (type: TfType) => T,
): T => visitor(type)

// valueComposeOver.h:65-66. Upstream VtValue keys compose-over functions by
// typeid; here values carry a TfType, so VtBackgroundType has one by name.
export class VtBackgroundType {}
export const VtBackground = new VtBackgroundType()
TfType.define('VtBackgroundType')

export class Vt_ExtTypeIndexTable {
  constructor(private readonly types: readonly TfType[] = []) {}
  lookup(type: TfType): number { return this.types.indexOf(type) }
}

export class VtVisitValueWithExtTypes {
  static VisitValue<T>(
    value: VtValue, visitor: (held: unknown, type: TfType) => T,
  ): T { return VtVisitValue(value, visitor) }
  static visitType<T>(type: TfType, visitor: (type: TfType) => T): T {
    return VtVisitValueType(type, visitor)
  }
}

export const Vt_VisitValueHashThreshold = 8
export const Vt_VisitValueExtDispatchOne = VtVisitValue
export const Vt_VisitValueExtDispatch = VtVisitValue
export const Vt_VisitValueTypeExtDispatchOne = VtVisitValueType
export const Vt_VisitValueTypeExtDispatch = VtVisitValueType
export const Vt_VisitValueTypeTmplExtDispatchOne = VtVisitValueType
export const Vt_VisitValueTypeTmplExtDispatch = VtVisitValueType
