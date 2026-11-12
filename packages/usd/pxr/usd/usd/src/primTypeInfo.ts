// Ported from OpenUSD 26.11.1: pxr/usd/usd/primTypeInfo.cpp,
//  pxr/usd/usd/primTypeInfo.h, pxr/usd/usd/primTypeInfoCache.h
// Copyright 2020 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// UsdPrimTypeInfo — port of pxr/usd/usd/primTypeInfo.{h,cpp} plus the
// Usd_PrimTypeInfoCache interning (primTypeInfoCache.h).
//
// Interned per unique (typeName, mappedTypeName, appliedAPISchemas) triple;
// resolves the schema TfType and caches the prim definition (composed via
// UsdSchemaRegistry.buildComposedPrimDefinition when authored API schemas
// exist). mappedTypeName carries the fallbackPrimTypes substitution: a prim
// whose authored type is unrecognized but has a fallbackPrimTypes entry
// composes as the mapped (fallback) type.

import { Type as TfType } from 'typescript-usd/tf'
import { Registry as PlugRegistry } from 'typescript-usd/plug'
import type { UsdPrimDefinition } from './primDefinition.ts'
import { UsdSchemaRegistry } from './schemaRegistry.ts'

export class UsdPrimTypeInfo {
  // Usd_PrimTypeInfoCache._primTypeInfoMap — one entry per distinct _TypeId.
  // Browser module discovery can enlarge the schema set after construction;
  // unresolved entries are re-interned and resolved entries discard only
  // their lazily composed definition. Canonical typed definitions themselves
  // retain identity while the registry updates their state in place.
  static #cache = new Map<string, UsdPrimTypeInfo>()
  static #empty: UsdPrimTypeInfo | null = null
  static {
    PlugRegistry.GetInstance().addDidRegisterPluginsListener(() => {
      for (const [key, info] of UsdPrimTypeInfo.#cache) {
        if (info.#schemaType.isUnknown()) UsdPrimTypeInfo.#cache.delete(key)
        else info.#primDefinition = null
      }
    })
  }

  readonly #primTypeName: string
  readonly #mappedTypeName: string
  readonly #appliedAPISchemas: readonly string[]
  #schemaType: TfType = TfType.getUnknownType()
  #schemaTypeName = ''
  #primDefinition: UsdPrimDefinition | null = null

  private constructor(
    primTypeName: string, mappedTypeName: string, appliedAPISchemas: readonly string[],
  ) {
    this.#primTypeName = primTypeName
    this.#mappedTypeName = mappedTypeName
    this.#appliedAPISchemas = [...appliedAPISchemas]

    // Mirrors the UsdPrimTypeInfo ctor (primTypeInfo.cpp:12): try the mapped
    // type name first; a non-empty name consumes the attempt even when it
    // resolves to no concrete schema type.
    const trySetSchemaType = (typeName: string): boolean => {
      if (typeName === '') return false
      const type = UsdSchemaRegistry.getConcreteTypeFromSchemaTypeName(typeName)
      if (!type.isUnknown()) {
        this.#schemaType = type
        this.#schemaTypeName = typeName
      }
      return true
    }
    void (trySetSchemaType(this.#mappedTypeName) || trySetSchemaType(this.#primTypeName))
  }

  /** The authored prim type name (may be unregistered). */
  getTypeName(): string {
    return this.#primTypeName
  }

  /** The authored applied API schemas (in strength order), NOT including
   *  built-ins from the schema definition. */
  getAppliedAPISchemas(): string[] {
    return [...this.#appliedAPISchemas]
  }

  /** The TfType this prim composes as — from the authored type name, or the
   *  fallbackPrimTypes-mapped name; unknown TfType if neither is registered. */
  getSchemaType(): TfType {
    return this.#schemaType
  }

  /** The schema type name corresponding to getSchemaType() ('' if unknown). */
  getSchemaTypeName(): string {
    return this.#schemaTypeName
  }

  /** The (possibly composed) prim definition. Never null — falls back to the
   *  registry's empty prim definition. Mirrors _FindOrCreatePrimDefinition
   *  (primTypeInfo.cpp:40). */
  getPrimDefinition(): UsdPrimDefinition {
    if (this.#primDefinition) return this.#primDefinition
    const registry = UsdSchemaRegistry.getInstance()
    this.#primDefinition = this.#appliedAPISchemas.length === 0
      ? registry.findConcretePrimDefinition(this.#schemaTypeName) ?? registry.getEmptyPrimDefinition()
      : registry.buildComposedPrimDefinition(this.#schemaTypeName, this.#appliedAPISchemas)
    return this.#primDefinition
  }

  /** The interned empty type info (typeless prims). */
  static getEmptyPrimType(): UsdPrimTypeInfo {
    return (UsdPrimTypeInfo.#empty ??= new UsdPrimTypeInfo('', '', []))
  }

  /**
   * @internal Interned lookup per (typeName, mappedTypeName,
   * appliedAPISchemas) — Usd_PrimTypeInfoCache::FindOrCreatePrimTypeInfo.
   * The prim/stage wiring consumes this; it is not public API surface.
   */
  static _findOrCreatePrimTypeInfo(
    primTypeName: string, mappedTypeName: string, appliedAPISchemas: readonly string[],
  ): UsdPrimTypeInfo {
    if (primTypeName === '' && mappedTypeName === '' && appliedAPISchemas.length === 0) {
      return UsdPrimTypeInfo.getEmptyPrimType()
    }
    const key = [primTypeName, mappedTypeName, ...appliedAPISchemas].join('\u0000')
    let info = UsdPrimTypeInfo.#cache.get(key)
    if (!info) {
      info = new UsdPrimTypeInfo(primTypeName, mappedTypeName, appliedAPISchemas)
      UsdPrimTypeInfo.#cache.set(key, info)
    }
    return info
  }
}
