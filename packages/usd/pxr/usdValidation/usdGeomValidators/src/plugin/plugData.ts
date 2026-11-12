// Ported from OpenUSD 26.11.1:
//  pxr/usdValidation/usdGeomValidators/plugInfo.json
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// OpenUSD 26.11.1 usdGeomValidators plugin artifacts, as in ../../plugin/:
// plugInfo.json verbatim from pxr/usdValidation/usdGeomValidators/plugInfo.json.
import type { Info as PlugInfo } from 'typescript-usd/plug'
export const plugInfo: PlugInfo = {
  "Plugins": [
    {
      "Info": {
        "Validators": {
          "EncapsulationChecker": {
            "doc": "Validates there are no nested Gprims.",
            "schemaTypes": [
              "UsdGeomBoundable"
            ]
          },
          "StageMetadataChecker": {
            "doc": "All stages must declare their 'upAxis' and 'metersPerUnit'."
          },
          "SubsetFamilies": {
            "doc": "Validates all of the geom subset families authored beneath an Imageable prim.",
            "keywords": [
              "UsdGeomSubset"
            ],
            "schemaTypes": [
              "UsdGeomImageable"
            ]
          },
          "SubsetParentIsImageable": {
            "doc": "Validates that GeomSubset prims are direct descendants of an Imageable prim.",
            "keywords": [
              "UsdGeomSubset"
            ],
            "schemaTypes": [
              "UsdGeomSubset"
            ]
          },
          "keywords": [
            "UsdGeomValidators"
          ]
        }
      },
      "LibraryPath": "@PLUG_INFO_LIBRARY_PATH@",
      "Name": "usdGeomValidators",
      "ResourcePath": "@PLUG_INFO_RESOURCE_PATH@",
      "Root": "@PLUG_INFO_ROOT@",
      "Type": "library"
    }
  ]
}
