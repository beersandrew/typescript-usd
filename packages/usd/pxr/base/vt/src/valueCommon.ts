// Ported from OpenUSD 26.11.1: pxr/base/vt/valueCommon.cpp,
//  pxr/base/vt/valueCommon.h
// Copyright 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Default-value storage from OpenUSD v26.08
// pxr/base/vt/valueCommon.h:33-120.
import { Type as TfType } from 'typescript-usd/tf'
import { VtZero } from './types.ts'

export class Vt_DefaultValueHolder {
  private constructor(private readonly value: unknown, private readonly type: TfType) {}

  static create<T>(value: T, type: TfType): Vt_DefaultValueHolder {
    return new Vt_DefaultValueHolder(value, type)
  }
  getPointer<T>(): T { return this.value as T }
  getType(): TfType { return this.type }
}
export class Vt_DefaultValueFactory {
  static invoke(type: TfType): Vt_DefaultValueHolder {
    return Vt_DefaultValueHolder.create(VtZero(type), type)
  }
}

const defaults = new Map<TfType, Vt_DefaultValueHolder>()
export function Vt_FindOrCreateDefaultValue(type: TfType): Vt_DefaultValueHolder {
  let holder = defaults.get(type)
  if (!holder) {
    holder = Vt_DefaultValueFactory.invoke(type)
    defaults.set(type, holder)
  }
  return holder
}
