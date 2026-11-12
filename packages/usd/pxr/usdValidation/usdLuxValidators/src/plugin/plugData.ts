// Ported from OpenUSD 26.11.1:
//  pxr/usdValidation/usdLuxValidators/plugInfo.json
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// OpenUSD 26.11.1 usdLuxValidators plugin artifacts, as in ../../plugin/:
// plugInfo.json verbatim from pxr/usdValidation/usdLuxValidators/plugInfo.json.
import type { Info as PlugInfo } from 'typescript-usd/plug'
export const plugInfo: PlugInfo = {
  "Plugins": [
    {
      "Info": {
        "Validators": {
          "EncapsulationRulesValidator": {
            "doc": "Connectable prims in UsdLux (e.g. Light, LightFilters) can only be nested inside other Container-like Connectable prims (UsdShadeNodeGraph, UsdLuxLight or UsdLuxLightFilter).",
            "schemaTypes": [
              "UsdLuxLightAPI",
              "UsdLuxLightFilter"
            ]
          },
          "keywords": [
            "UsdLuxValidators"
          ]
        }
      },
      "LibraryPath": "@PLUG_INFO_LIBRARY_PATH@",
      "Name": "usdLuxValidators",
      "ResourcePath": "@PLUG_INFO_RESOURCE_PATH@",
      "Root": "@PLUG_INFO_ROOT@",
      "Type": "library"
    }
  ]
}
