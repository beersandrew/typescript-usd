// Ported from OpenUSD 26.11.1: pxr/base/tf/typeInfoMap.h
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// TfTypeInfoMap — port of pxr/base/tf/typeInfoMap.h.
//
// Upstream accepts std::type_info or its canonical string name. TypeScript has
// no std::type_info, so the private key normalization below accepts the
// corresponding TfType or name while preserving Set/Find/Exists/Remove and
// alias creation/invalidation semantics (typeInfoMap.h:31-192).

import { TfType } from './type.ts'

type TypeKey = TfType | string

const keyName = (key: TypeKey): string =>
  typeof key === 'string' ? key : key.getTypeName()

export class TfTypeInfoMap<T> {
  readonly #values = new Map<string, T>()
  readonly #aliases = new Map<string, string>()

  exists(key: TypeKey): boolean {
    return this.#values.has(this.#resolve(keyName(key)))
  }

  find(key: TypeKey): T | undefined {
    return this.#values.get(this.#resolve(keyName(key)))
  }

  Set(key: TypeKey, value: T): void {
    const name = keyName(key)
    this.#values.set(this.#aliases.get(name) ?? name, value)
  }

  createAlias(alias: string, target: TypeKey): boolean {
    const targetName = this.#resolve(keyName(target))
    if (!this.#values.has(targetName)) return false
    if (!this.#values.has(alias) && !this.#aliases.has(alias)) {
      this.#aliases.set(alias, targetName)
    }
    return true
  }

  remove(key: TypeKey): void {
    const targetName = this.#resolve(keyName(key))
    this.#values.delete(targetName)
    for (const [alias, target] of this.#aliases) {
      if (target === targetName) this.#aliases.delete(alias)
    }
  }

  #resolve(name: string): string {
    return this.#aliases.get(name) ?? name
  }
}
