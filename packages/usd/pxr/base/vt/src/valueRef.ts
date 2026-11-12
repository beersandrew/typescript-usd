// Ported from OpenUSD 26.11.1: pxr/base/vt/valueRef.cpp,
//  pxr/base/vt/valueRef.h
// Copyright 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Non-owning value views from OpenUSD v26.08 pxr/base/vt/valueRef.h:49-758.
// JavaScript references the VtValue object itself, preserving the observable
// rebinding and mutation operations without exposing C++ storage pointers.
import { Type as TfType } from 'typescript-usd/tf'
import { VtGetKnownValueTypeIndex } from './types.ts'
import { VtValue } from './value.ts'
import { VtValueCanComposeOver } from './valueComposeOver.ts'
import { VtValueCanTransform } from './valueTransform.ts'

export class VtValueRef {
  protected value: VtValue
  readonly #rvalue: boolean

  constructor(value = VtValue.getEmpty(), rvalue = false) {
    this.value = value
    this.#rvalue = rvalue
  }

  Get(): VtValue { return this.value }
  UncheckedGet<T>(): T { return this.value.Get<T>() }
  getWithDefault<T>(def: T): T { return this.value.getWithDefault(def) }
  IsHolding(type: TfType): boolean { return this.value.IsHolding(type) }
  isRValue(): boolean { return this.#rvalue }
  isArrayValued(): boolean { return this.value.isArrayValued() }
  isArrayEditValued(): boolean { return this.value.isArrayEditValued() }
  getArraySize(): number { return this.value.getArraySize() }
  getTypeid(): TfType { return this.value.getType() }
  getElementTypeid(): TfType { return this.value.getElementType() }
  getType(): TfType { return this.value.getType() }
  getTypeName(): string { return this.value.getTypeName() }
  GetKnownValueTypeIndex(): number {
    return VtGetKnownValueTypeIndex(this.value.getType())
  }
  remove<T>(): T { return this.uncheckedRemove<T>() }
  uncheckedRemove<T>(): T { return this.value.Get<T>() }
  IsEmpty(): boolean { return this.value.IsEmpty() }
  canHash(): boolean { return !this.IsEmpty() }
  // valueRef.cpp:108-115: 0 when empty, else the held value's VtHashValue,
  // which is what VtValue::GetHash computes for the same held value.
  getHash(): bigint { return this.value.getHash() }
  canComposeOver(): boolean { return VtValueCanComposeOver(this.value) }
  canTransform(target?: TfType): boolean {
    return target === undefined ? this.value.canTransform() :
      VtValueCanTransform(this.value, target)
  }
}

export class VtMutableValueRef extends VtValueRef {
  Set(value: VtValue): void { this.value = value }
  uncheckedAssign(value: VtValue): this { this.value = value; return this }
  swap(other: VtValue): void { this.value.swap(other) }
  uncheckedSwap(other: VtValue): void { this.swap(other) }
  mutate<T>(): T { return this.value.Get<T>() }
  uncheckedMutate<T>(): T { return this.value.Get<T>() }
}
