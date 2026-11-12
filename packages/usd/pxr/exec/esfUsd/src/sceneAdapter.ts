// Ported from OpenUSD 26.11.1: pxr/exec/esfUsd/sceneAdapter.cpp,
//  pxr/exec/esfUsd/sceneAdapter.h
// Copyright 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.11.1 pxr/exec/esfUsd/sceneAdapter.h and
// sceneAdapter.cpp.
//
// Family of static factory methods that produce abstract scene objects from
// USD scene objects (sceneAdapter.h:25-33). The underlying implementations of
// the scene object interfaces are not exported by EsfUsd; clients obtain
// abstract scene objects only through this class. Upstream's const& and &&
// overloads are one method each here.

import { TF_CODING_ERROR } from 'typescript-usd/tf'
import type { Stage as UsdStage, Prim as UsdPrim, Attribute as UsdAttribute } from 'typescript-usd/usd'
import { EsfAttribute } from 'typescript-usd/esf'
import { EsfObject } from 'typescript-usd/esf'
import { EsfPrim } from 'typescript-usd/esf'
import { EsfProperty } from 'typescript-usd/esf'
import { EsfStage } from 'typescript-usd/esf'
import { EsfUsd_Attribute } from './attribute.ts'
import { EsfUsd_Object, type EsfUsd_UsdObject, type EsfUsd_UsdProperty } from './object.ts'
import { EsfUsd_Prim } from './prim.ts'
import { EsfUsd_Property } from './property.ts'
import { EsfUsd_Stage } from './stage.ts'

export class EsfUsdSceneAdapter {
  private constructor() {}

  // sceneAdapter.cpp:22-40
  static adaptStage(stage: UsdStage | null): EsfStage {
    if (!stage) {
      TF_CODING_ERROR('EsfUsdSceneAdapter cannot adapt a null stage pointer')
    }
    return new EsfStage(EsfUsd_Stage, stage)
  }

  // sceneAdapter.cpp:42-52
  static adaptObject(object: EsfUsd_UsdObject): EsfObject {
    return new EsfObject(EsfUsd_Object, object)
  }

  // sceneAdapter.cpp:54-64
  static adaptPrim(prim: UsdPrim | undefined): EsfPrim {
    return new EsfPrim(EsfUsd_Prim, prim)
  }

  // sceneAdapter.cpp:66-76
  static adaptProperty(property: EsfUsd_UsdProperty): EsfProperty {
    return new EsfProperty(EsfUsd_Property, property)
  }

  // sceneAdapter.cpp:78-88
  static adaptAttribute(attribute: UsdAttribute | undefined): EsfAttribute {
    return new EsfAttribute(EsfUsd_Attribute, attribute)
  }
}
