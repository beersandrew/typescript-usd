// Ported from OpenUSD 26.11.1: pxr/exec/esfUsd/object.cpp,
//  pxr/exec/esfUsd/object.h
// Copyright 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.11.1 pxr/exec/esfUsd/object.h and object.cpp.
//
// EsfUsd_ObjectImpl<InterfaceType, UsdObjectType> (object.h:24-117) is the
// common implementation of EsfObjectInterface over a wrapped USD object,
// which upstream grafts onto each EsfUsd class by having the class template
// inherit its InterfaceType parameter (object.h:42-62):
//
//   EsfObjectInterface
//     EsfPropertyInterface
//       EsfAttributeInterface
//         EsfUsd_ObjectImpl<EsfAttributeInterface, UsdAttribute>
//           EsfUsd_PropertyImpl<EsfAttributeInterface, UsdAttribute>
//             EsfUsd_Attribute
//
// TypeScript cannot type a class that derives from a type parameter and
// still check the derived class's abstract members, so the template's method
// bodies are the functions of EsfUsd_ObjectImpl (and EsfUsd_PropertyImpl,
// property.ts), taking the wrapped object, and each EsfUsd class derives
// directly from its Esf interface (EsfUsd_Attribute from
// EsfAttributeInterface, ...) and forwards to them.
//
// USD objects are typescript-usd/usd handles: UsdPrim is Prim, UsdAttribute
// is Attribute, UsdRelationship is Rel, and UsdObject/UsdProperty are their
// unions. Upstream's invalid default-constructed objects (UsdObject(), as
// returned by UsdStage::GetObjectAtPath for a missing object) are
// `undefined`; they have the empty path, as upstream's do. Paths are path
// strings there and SdfPath objects here.
//
import {
  TF_CODING_ERROR, TF_FATAL_ERROR, TF_VERIFY, Type as TfType,
} from 'typescript-usd/tf'
import { Schema as SdfSchema } from 'typescript-usd/sdf'
import { SdfPath } from 'typescript-usd/sdf/path'
import {
  Attribute as UsdAttribute, Prim as UsdPrim, PrimDefaultPredicate, Rel as UsdRelationship,
  type Stage as UsdStage,
} from 'typescript-usd/usd'
import { Value as VtValue } from 'typescript-usd/vt'

// TfType::Find<VtValue>() (object.cpp:166).
const _vtValueType = TfType.declare('VtValue')
import { EsfObjectInterface, EsfObject } from 'typescript-usd/esf'
import { EsfPrim } from 'typescript-usd/esf'
import { EsfAttribute } from 'typescript-usd/esf'
import { EsfRelationship } from 'typescript-usd/esf'
import { EsfStage } from 'typescript-usd/esf'
import type { EsfSchemaConfigKey } from 'typescript-usd/esf'
import { EsfUsd_Prim } from './prim.ts'
import { EsfUsd_Attribute } from './attribute.ts'
import { EsfUsd_Relationship } from './relationship.ts'
import { EsfUsd_Stage } from './stage.ts'
import { EsfUsdStageData } from './stageData.ts'

/** UsdObject: any typescript-usd object handle, or an invalid object. */
export type EsfUsd_UsdObject = UsdPrim | UsdAttribute | UsdRelationship | undefined

/** UsdProperty: an attribute or relationship handle, or an invalid one. */
export type EsfUsd_UsdProperty = UsdAttribute | UsdRelationship | undefined

/** UsdObject::GetPath (object.h:187-197); the empty path for an invalid
 *  object. */
export function _EsfUsdGetPath(object: EsfUsd_UsdObject): SdfPath {
  if (object === undefined) {
    return SdfPath.emptyPath
  }
  const pathString = object instanceof UsdPrim ? object.path : object.getPath()
  // A handle with no prim data (UsdAttribute()) has the empty path
  // (object.h:197), which SdfPath.fromString('') would warn about.
  return pathString === '' ? SdfPath.emptyPath : SdfPath.fromString(pathString)
}

/** UsdObject::GetPrim (prim.h:2805-2809). */
export function _EsfUsdGetPrim(object: EsfUsd_UsdObject): UsdPrim | undefined {
  if (object === undefined || object instanceof UsdPrim) {
    return object
  }
  return object.getPrim()
}

/** UsdObject::GetStage (object.cpp:18-22). Upstream dereferences the
 *  object's prim data, so an invalid object has no stage to return. */
export function _EsfUsdGetStage(object: EsfUsd_UsdObject): UsdStage {
  if (object === undefined) {
    TF_FATAL_ERROR('UsdObject::GetStage called on an invalid object ' +
      '(pxr/usd/usd/object.h:708 dereferences a null prim)')
  }
  return object.getStage()
}

/**
 * UsdPrimDefaultPredicate(prim), through Usd_PrimFlagsPredicate::operator()
 * (pxr/usd/usd/primFlags.cpp:20-28): an invalid prim posts a coding error
 * and fails the predicate.
 */
export function _EsfUsdPrimDefaultPredicate(prim: UsdPrim | undefined): boolean {
  if (prim === undefined || !prim.isValid()) {
    TF_CODING_ERROR('Applying predicate to invalid prim.')
    return false
  }
  return PrimDefaultPredicate.evaluate(prim)
}

/**
 * The template class EsfUsd_ObjectImpl<InterfaceType, UsdObjectType>
 * (object.h:63-117, object.cpp:38-235): the implementation of
 * EsfObjectInterface's virtual methods over a wrapped USD object, which
 * upstream grafts onto each EsfUsd class by inheritance. Each EsfUsd class
 * here (EsfUsd_Object, EsfUsd_Prim, EsfUsd_Property, EsfUsd_Attribute,
 * EsfUsd_Relationship) derives from its Esf interface and forwards its
 * EsfObjectInterface overrides to these functions, which take the wrapped
 * object (object.h:96-97).
 */
export const EsfUsd_ObjectImpl = {
  // object.cpp:42-52
  _isValid(object: EsfUsd_UsdObject): boolean {
    if (object instanceof UsdPrim) {
      return object.isValid() && _EsfUsdPrimDefaultPredicate(object)
    } else {
      return object !== undefined && object.isValid() &&
        _EsfUsdPrimDefaultPredicate(_EsfUsdGetPrim(object))
    }
  },

  // object.cpp:54-59, through UsdObject::GetName (object.h:222-224): the
  // prim path's name for a prim, the property name otherwise.
  _getName(object: EsfUsd_UsdObject): string {
    if (object === undefined) {
      return ''
    }
    return object instanceof UsdPrim
      ? SdfPath.fromString(object.path).name
      : object.name
  },

  // object.cpp:61-66
  _getPrim(object: EsfUsd_UsdObject): EsfPrim {
    return new EsfPrim(EsfUsd_Prim, _EsfUsdGetPrim(object))
  },

  // object.cpp:68-73
  _getStage(object: EsfUsd_UsdObject): EsfStage {
    return new EsfStage(EsfUsd_Stage, _EsfUsdGetStage(object))
  },

  // object.cpp:75-81
  _getIncomingConnections(object: EsfUsd_UsdObject): SdfPath[] {
    return EsfUsdStageData.getIncomingConnections(
      _EsfUsdGetStage(object), _EsfUsdGetPath(object))
  },

  // object.cpp:83-98: the prim's UsdPrimTypeInfo is the schema config key,
  // since it is unique to the set of types and applied schemas for the prim
  // and stays alive at least as long as the UsdStage.
  _getSchemaConfigKey(object: EsfUsd_UsdObject): EsfSchemaConfigKey {
    const prim = _EsfUsdGetPrim(object)
    if (prim === undefined) {
      TF_FATAL_ERROR('UsdPrim::GetPrimTypeInfo called on an invalid prim ' +
        '(pxr/exec/esfUsd/object.cpp:90-97 dereferences a null prim)')
    }
    return EsfUsd_CreateSchemaConfigKey(prim.getPrimTypeInfo())
  },

  // object.cpp:100-110
  _getMetadata(object: EsfUsd_UsdObject, key: string): VtValue {
    const value = VtValue.getEmpty()
    if (!(object as UsdPrim | undefined)?.getMetadata(key, value)) {
      TF_CODING_ERROR(`Invalid metadata key '${key}'`)
    }
    return value
  },

  // object.cpp:112-150
  _isValidMetadataKey(object: EsfUsd_UsdObject, key: string): boolean {
    const schema = SdfSchema.getInstance()
    let spec = undefined
    // The wrapped handle's class is its concrete type (object.cpp:121-145
    // distinguishes concrete wrapped types at compile time and abstract ones
    // through IsPrim/IsAttribute/IsRelationship).
    if (EsfUsd_ObjectImpl.isPrim(object)) {
      spec = schema.getSpecDefinition('prim')
    } else if (EsfUsd_ObjectImpl.isAttribute(object)) {
      spec = schema.getSpecDefinition('attribute')
    } else if (EsfUsd_ObjectImpl.isRelationship(object)) {
      spec = schema.getSpecDefinition('relationship')
    }

    if (!TF_VERIFY(spec, 'spec', 'Unexpected object type')) {
      return false
    }
    return spec!.isMetadataField(key)
  },

  // object.cpp:152-172
  _getMetadataValueType(_object: EsfUsd_UsdObject, key: string): TfType {
    // TODO: This will be cleaner when we have SdfSchema API that lets us
    // directly qurey the value type for a given field.
    const fieldDef = SdfSchema.getInstance().getFieldDefinition(key)
    if (!fieldDef) {
      TF_CODING_ERROR(`Invalid metadata key '${key}'`)
      return TfType.getUnknownType()
    }

    // An empty value indicates a value type of VtValue; otherwise, we return
    // the fallback value held type.
    const fallback = fieldDef.getTypedFallbackValue()
    return fallback.IsEmpty() ? _vtValueType : fallback.getType()
  },

  // object.cpp:174-193: UsdObject::Is<T> tests the handle's dynamic type
  // (object.h:240-245), not its validity.
  isPrim(object: EsfUsd_UsdObject): boolean {
    return object instanceof UsdPrim
  },

  isAttribute(object: EsfUsd_UsdObject): boolean {
    return object instanceof UsdAttribute && !object.isRelationship
  },

  isRelationship(object: EsfUsd_UsdObject): boolean {
    return object instanceof UsdRelationship ||
      (object instanceof UsdAttribute && object.isRelationship)
  },

  // object.cpp:195-235: UsdObject::As<T> (object.h:229-233) keeps the
  // handle when it is convertible to T and gives an invalid T otherwise.
  asObject(object: EsfUsd_UsdObject): EsfObject {
    return new EsfObject(EsfUsd_Object, object)
  },

  asPrim(object: EsfUsd_UsdObject): EsfPrim {
    return new EsfPrim(EsfUsd_Prim, object instanceof UsdPrim ? object : undefined)
  },

  asAttribute(object: EsfUsd_UsdObject): EsfAttribute {
    return new EsfAttribute(
      EsfUsd_Attribute,
      EsfUsd_ObjectImpl.isAttribute(object) ? object as UsdAttribute : undefined)
  },

  asRelationship(object: EsfUsd_UsdObject): EsfRelationship {
    if (object instanceof UsdAttribute && object.isRelationship) {
      // A typescript-usd Attribute handle can name a relationship property
      // (Prim.getProperty serves both); the relationship handle for the
      // same property is the convertible object.
      return new EsfRelationship(EsfUsd_Relationship, object.getPrim()?.rel(object.name))
    }
    return new EsfRelationship(
      EsfUsd_Relationship, object instanceof UsdRelationship ? object : undefined)
  },
}

// EsfObjectInterface::CreateSchemaConfigKey (esf/object.h:138-140) is
// protected static; the implementation classes reach it through this
// subclass.
abstract class _EsfUsdSchemaConfigKeyAccess extends EsfObjectInterface {
  static create(id: object | null): EsfSchemaConfigKey {
    return EsfObjectInterface.createSchemaConfigKey(id)
  }
}

function EsfUsd_CreateSchemaConfigKey(id: object | null): EsfSchemaConfigKey {
  return _EsfUsdSchemaConfigKeyAccess.create(id)
}

/** Implementation of EsfObjectInterface that wraps a UsdObject
 *  (object.h:119-120: EsfUsd_ObjectImpl<EsfObjectInterface, UsdObject>). */
export class EsfUsd_Object extends EsfObjectInterface {
  // The wrapped native usd object (object.h:96-97).
  private readonly _object: EsfUsd_UsdObject

  /** Copies the provided object into this instance (object.h:69-79). */
  constructor(object: EsfUsd_UsdObject) {
    super(_EsfUsdGetPath(object))
    this._object = object
  }

  /** Accessor to the wrapped object (object.h:81-87). */
  _getWrapped(): EsfUsd_UsdObject {
    return this._object
  }

  // Copy and move construction (fixedSizePolymorphicHolder.h:226-238).
  override _copyTo(): EsfUsd_Object {
    return new EsfUsd_Object(this._object)
  }

  override _moveTo(): EsfUsd_Object {
    return new EsfUsd_Object(this._object)
  }

  // EsfObjectInterface implementation (EsfUsd_ObjectImpl).
  protected _isValid(): boolean { return EsfUsd_ObjectImpl._isValid(this._object) }
  protected _getName(): string { return EsfUsd_ObjectImpl._getName(this._object) }
  protected _getPrim(): EsfPrim { return EsfUsd_ObjectImpl._getPrim(this._object) }
  protected _getStage(): EsfStage { return EsfUsd_ObjectImpl._getStage(this._object) }
  protected _getSchemaConfigKey(): EsfSchemaConfigKey {
    return EsfUsd_ObjectImpl._getSchemaConfigKey(this._object)
  }
  protected _isValidMetadataKey(key: string): boolean {
    return EsfUsd_ObjectImpl._isValidMetadataKey(this._object, key)
  }
  protected _getMetadata(key: string): VtValue {
    return EsfUsd_ObjectImpl._getMetadata(this._object, key)
  }
  protected _getMetadataValueType(key: string): TfType {
    return EsfUsd_ObjectImpl._getMetadataValueType(this._object, key)
  }
  protected _getIncomingConnections(): SdfPath[] {
    return EsfUsd_ObjectImpl._getIncomingConnections(this._object)
  }
  isPrim(): boolean { return EsfUsd_ObjectImpl.isPrim(this._object) }
  isAttribute(): boolean { return EsfUsd_ObjectImpl.isAttribute(this._object) }
  isRelationship(): boolean { return EsfUsd_ObjectImpl.isRelationship(this._object) }
  asObject(): EsfObject { return EsfUsd_ObjectImpl.asObject(this._object) }
  asPrim(): EsfPrim { return EsfUsd_ObjectImpl.asPrim(this._object) }
  asAttribute(): EsfAttribute { return EsfUsd_ObjectImpl.asAttribute(this._object) }
  asRelationship(): EsfRelationship { return EsfUsd_ObjectImpl.asRelationship(this._object) }
}
