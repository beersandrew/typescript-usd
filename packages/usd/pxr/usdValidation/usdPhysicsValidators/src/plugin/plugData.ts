// Ported from OpenUSD 26.11.1:
//  pxr/usdValidation/usdPhysicsValidators/plugInfo.json
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// OpenUSD 26.11.1 usdPhysicsValidators plugin artifacts, as in ../../plugin/:
// plugInfo.json verbatim from pxr/usdValidation/usdPhysicsValidators/plugInfo.json.
import type { Info as PlugInfo } from 'typescript-usd/plug'
export const plugInfo: PlugInfo = {
  "Plugins": [
    {
      "Info": {
        "Validators": {
          "RigidBodyChecker": {
            "doc": "Validates all of the UsdPhysicsRigidBodyAPIs applied to a prim.",
            "keywords": [
              "UsdPhysicsRigidBodyAPI"
            ],
            "schemaTypes": [
              "UsdPhysicsRigidBodyAPI"
            ]
          },
          "ColliderChecker": {
            "doc": "Validates all of the UsdPhysicsCollisionAPIs applied to a prim.",
            "keywords": [
              "UsdPhysicsCollisionAPI"
            ],
            "schemaTypes": [
              "UsdPhysicsCollisionAPI"
            ]
          },
          "ArticulationChecker": {
            "doc": "Validates all of the UsdPhysicsArticulationRootAPIs applied to a prim.",
            "keywords": [
              "UsdPhysicsArticulationRootAPI"
            ],
            "schemaTypes": [
              "UsdPhysicsArticulationRootAPI"
            ]
          },
          "PhysicsJointChecker": {
            "doc": "Validates all of the UsdPhysicsJoint prims.",
            "keywords": [
              "UsdPhysicsJoint"
            ],
            "schemaTypes": [
              "UsdPhysicsJoint"
            ]
          },
          "keywords": [
            "UsdPhysicsValidators"
          ]
        }
      },
      "LibraryPath": "@PLUG_INFO_LIBRARY_PATH@",
      "Name": "usdPhysicsValidators",
      "ResourcePath": "@PLUG_INFO_RESOURCE_PATH@",
      "Root": "@PLUG_INFO_ROOT@",
      "Type": "library"
    }
  ]
}
