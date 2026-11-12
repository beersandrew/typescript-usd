// Ported from OpenUSD 26.11.1: pxr/exec/esf/schemaConfigKey.h
// Copyright 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.11.1 pxr/exec/esf/schemaConfigKey.h.
//
// An opaque type that can be used to identify the configuration of typed and
// applied schemas for a prim (schemaConfigKey.h:16-19).
//
// Upstream's key is a `const void *` (schemaConfigKey.h:48), the address of a
// stable object chosen by the scene adapter. Here it is that object's
// identity (`object | null`); hashing uses a per-object id.

let _nextKeyId = 1
const _keyIds = new WeakMap<object, number>()

export class EsfSchemaConfigKey {
  // schemaConfigKey.h:48
  private _key: object | null = null

  /** Only null keys can be constructed publicly (schemaConfigKey.h:22-23). */
  constructor() {}

  /**
   * @internal The private constructor from a key (schemaConfigKey.h:39-44),
   * reachable only through EsfObjectInterface.CreateSchemaConfigKey, as the
   * friend declaration of schemaConfigKey.h:38 allows.
   */
  static _create(key: object | null): EsfSchemaConfigKey {
    const result = new EsfSchemaConfigKey()
    result._key = key
    return result
  }

  /** operator== (schemaConfigKey.h:25-27). */
  Equals(key: EsfSchemaConfigKey): boolean {
    return this._key === key._key
  }

  /** operator!= (schemaConfigKey.h:29-31). */
  notEquals(key: EsfSchemaConfigKey): boolean {
    return !this.Equals(key)
  }

  /** TfHashAppend (schemaConfigKey.h:33-36): hashes the key's identity. */
  getHash(): number {
    if (this._key === null) {
      return 0
    }
    let id = _keyIds.get(this._key)
    if (id === undefined) {
      id = _nextKeyId++
      _keyIds.set(this._key, id)
    }
    return id
  }
}
