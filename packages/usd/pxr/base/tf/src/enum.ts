// Ported from OpenUSD 26.11.1: pxr/base/tf/enum.cpp, pxr/base/tf/enum.h
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// TfEnum registry, ported from OpenUSD v26.08 pxr/base/tf/enum.{h,cpp}.

type EnumValue = string | number
interface Entry { name: string; displayName: string; fullName: string }
const entries = new Map<EnumValue, Entry>()

export class TfEnum {
  readonly #value: EnumValue
  constructor(value: EnumValue) { this.#value = value }
  GetValue(): EnumValue { return this.#value }
  getName(): string { return entries.get(this.#value)?.name ?? String(this.#value) }
  getFullName(): string {
    return entries.get(this.#value)?.fullName ?? String(this.#value)
  }
  getDisplayName(): string {
    return entries.get(this.#value)?.displayName ?? this.getName()
  }
  equals(other: TfEnum): boolean { return this.#value === other.#value }

  static addName(
    value: EnumValue,
    name: string,
    displayName = name,
    fullName = name,
  ): void {
    entries.set(value, { name, displayName, fullName })
  }
  static getAllNames(): string[] { return [...entries.values()].map(v => v.name) }
}
