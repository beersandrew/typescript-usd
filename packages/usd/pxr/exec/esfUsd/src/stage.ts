// Ported from OpenUSD 26.11.1: pxr/exec/esfUsd/stage.cpp,
//  pxr/exec/esfUsd/stage.h
// Copyright 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.11.1 pxr/exec/esfUsd/stage.h and stage.cpp.
//
// Implementation of EsfStageInterface that wraps a UsdStageConstRefPtr
// (stage.h:21-51): a typescript-usd/usd Stage.

import { TF_VERIFY, type Type as TfType } from 'typescript-usd/tf'
import type { SdfPath } from 'typescript-usd/sdf/path'
import { SchemaRegistry as UsdSchemaRegistry, type Stage as UsdStage } from 'typescript-usd/usd'
import { EsfAttribute } from 'typescript-usd/esf'
import { EsfObject } from 'typescript-usd/esf'
import { EsfPrim } from 'typescript-usd/esf'
import { EsfProperty } from 'typescript-usd/esf'
import { EsfRelationship } from 'typescript-usd/esf'
import { EsfStageInterface } from 'typescript-usd/esf'
import { EsfUsd_Attribute } from './attribute.ts'
import { EsfUsd_Object } from './object.ts'
import { EsfUsd_Prim } from './prim.ts'
import { EsfUsd_Property } from './property.ts'
import { EsfUsd_Relationship } from './relationship.ts'

export class EsfUsd_Stage extends EsfStageInterface {
  // stage.h:48
  private readonly _stage: UsdStage | null

  /** Copies the provided \p stage pointer into this instance; \p stage must
   *  not be a null pointer (stage.cpp:27-37). */
  constructor(stage: UsdStage | null) {
    super()
    this._stage = stage
    TF_VERIFY(this._stage, '_stage')
  }

  // Copy and move construction (fixedSizePolymorphicHolder.h:226-238).
  override _copyTo(): EsfUsd_Stage {
    return new EsfUsd_Stage(this._stage)
  }

  override _moveTo(): EsfUsd_Stage {
    return new EsfUsd_Stage(this._stage)
  }

  // stage.cpp:39-46
  protected _getAttributeAtPath(path: SdfPath): EsfAttribute {
    return new EsfAttribute(
      EsfUsd_Attribute, this._stage!.getAttributeAtPath(path.pathString))
  }

  // stage.cpp:48-52
  protected _getObjectAtPath(path: SdfPath): EsfObject {
    return new EsfObject(EsfUsd_Object, this._stage!.getObjectAtPath(path.pathString))
  }

  // stage.cpp:54-58: UsdStage::GetPrimAtPath (typescript-usd's Stage.getPrim).
  protected _getPrimAtPath(path: SdfPath): EsfPrim {
    return new EsfPrim(EsfUsd_Prim, this._stage!.getPrim(path.pathString))
  }

  // stage.cpp:60-67
  protected _getPropertyAtPath(path: SdfPath): EsfProperty {
    return new EsfProperty(
      EsfUsd_Property, this._stage!.getPropertyAtPath(path.pathString))
  }

  // stage.cpp:69-76
  protected _getRelationshipAtPath(path: SdfPath): EsfRelationship {
    return new EsfRelationship(
      EsfUsd_Relationship, this._stage!.getRelationshipAtPath(path.pathString))
  }

  // stage.cpp:78-83
  protected _getTypeNameAndInstance(apiSchemaName: string): [string, string] {
    return UsdSchemaRegistry.getTypeNameAndInstance(apiSchemaName)
  }

  // stage.cpp:85-90
  protected _getAPITypeFromSchemaTypeName(schemaTypeName: string): TfType {
    return UsdSchemaRegistry.getAPITypeFromSchemaTypeName(schemaTypeName)
  }
}
