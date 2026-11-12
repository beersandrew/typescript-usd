// Ported from OpenUSD 26.11.1: pxr/usd/usd/schemaBase.cpp,
//  pxr/usd/usd/schemaBase.h
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Common base for typed schema authoring handles (UsdSchemaBase equivalent).
// Holds the prim handle and provides the typed-attribute creation pattern
// shared by all schema classes across the domain packages.

import type { Stage } from './stage.ts'
import type { Prim } from './prim.ts'
import type { Attribute } from './prim.ts'
import type { UsdRel } from './relationship.ts'
import { UsdSchemaRegistry } from './schemaRegistry.ts'
import { _sdfCoerceValueToType, _sdfValuesEqual } from 'typescript-usd/sdf/_internal'

export class SchemaBase {
  protected readonly _prim: Prim
  protected readonly _stage: Stage
  private readonly _hasPrim: boolean

  // The stage defaults to the prim's, as UsdSchemaBase(const UsdPrim&) holds
  // only the prim (schemaBase.h:121-127).
  constructor(prim: Prim | undefined, stage?: Stage) {
    this._prim = prim as Prim
    this._stage = (stage ?? prim?.getStage()) as Stage
    this._hasPrim = prim !== undefined
  }

  // UsdSchemaBase::GetSchemaAttributeNames (schemaBase.h:130-137): none;
  // it exists for consistency with the generated schema classes.
  static getSchemaAttributeNames(_includeInherited = true): string[] {
    return []
  }

  get path(): string { return this._hasPrim ? this._prim.path : '' }
  get prim(): Prim { return this._prim }
  get stage(): Stage { return this._stage }

  // OpenUSD pxr/usd/usd/schemaBase.cpp:73-135. These classify the schema
  // wrapper's registered type, not the type of the prim it happens to hold.
  isConcrete(): boolean {
    return this._schemaKind() === 'concreteTyped'
  }

  isTyped(): boolean {
    const kind = this._schemaKind()
    return kind === 'abstractTyped' || kind === 'concreteTyped'
  }

  isAppliedAPISchema(): boolean {
    const kind = this._schemaKind()
    return kind === 'singleApplyAPI' || kind === 'multipleApplyAPI'
  }

  isValid(): boolean {
    return this._hasPrim && this._stage.has(this._prim.path)
  }

  private _schemaKind() {
    const ctor = this.constructor as typeof SchemaBase & { typeName?: string }
    if (!ctor.typeName) return 'invalid'
    return UsdSchemaRegistry.findSchemaInfo(ctor.typeName)?.kind ?? 'invalid'
  }

  // The Get<Name>Attr body of generated schema classes:
  // GetPrim().GetAttribute(name) (e.g. usdGeom/cube.cpp:68-72). Reading
  // never authors; Create<Name>Attr (_createAttr) does.
  protected _attr(name: string, _typeName: string): Attribute {
    if (!this._hasPrim) throw new Error('Cannot access an attribute on an invalid schema')
    return this._prim.attr(name)
  }

  // Authors the attribute's spec (type name) on the edit target and returns
  // a handle: the UsdPrim::CreateAttribute step of Create<Name>Attr and of
  // the hand-written create paths (inputs, outputs, primvars, xform ops).
  protected _declareAttr(name: string, typeName: string): Attribute {
    if (!this._hasPrim) throw new Error('Cannot access an attribute on an invalid schema')
    this._stage.declareProperty(this._prim.path, name, typeName)
    return this._prim.attr(name)
  }

  // UsdSchemaBase::_CreateAttr (schemaBase.cpp:75-104): the Create<Name>Attr
  // body of generated schema classes. With writeSparsely, a builtin attribute
  // whose unauthored fallback already equals defaultValue is not authored.
  // Upstream compares two typed VtValues; a plain JS default is converted by
  // the attribute's type first, as Set converts it.
  protected _createAttr(
    name: string, typeName: string, custom: boolean, variability: 'varying' | 'uniform',
    defaultValue: unknown, writeSparsely: boolean,
  ): Attribute {
    if (writeSparsely && !custom) {
      const attr = this._prim.getAttr(name)!
      if (defaultValue === undefined
        || (!attr.hasAuthoredValue()
          && _sdfValuesEqual(attr.get(), _sdfCoerceValueToType(defaultValue, typeName)))) {
        return attr
      }
    }
    const attr = this._prim.createAttribute(name, typeName, custom, variability)
    if (attr.isValid() && defaultValue !== undefined) attr.set(defaultValue)
    return attr
  }

  // Returns a relationship handle.
  protected _rel(name: string): UsdRel {
    if (!this._hasPrim) throw new Error('Cannot access a relationship on an invalid schema')
    return this._prim.rel(name)
  }
}
