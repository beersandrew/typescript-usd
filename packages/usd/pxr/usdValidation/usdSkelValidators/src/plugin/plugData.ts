// Ported from OpenUSD 26.11.1:
//  pxr/usdValidation/usdSkelValidators/plugInfo.json
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// OpenUSD 26.11.1 usdSkelValidators plugin artifacts, as in ../../plugin/:
// plugInfo.json verbatim from pxr/usdValidation/usdSkelValidators/plugInfo.json.
import type { Info as PlugInfo } from 'typescript-usd/plug'
export const plugInfo: PlugInfo = {
  "Plugins": [
    {
      "Info": {
        "Validators": {
          "SkelBindingApiAppliedValidator": {
            "doc": "Verify a prim has the SkelBindingAPI applied if it has a UsdSkelBinding property."
          },
          "SkelBindingApiValidator": {
            "doc": "Verify that a prim with SkelBindingAPI applied, is either of SkelRoot type or parented by a SkelRoot prim.",
            "schemaTypes": [
              "UsdSkelBindingAPI"
            ]
          },
          "keywords": [
            "UsdSkelValidators"
          ]
        }
      },
      "LibraryPath": "@PLUG_INFO_LIBRARY_PATH@",
      "Name": "usdSkelValidators",
      "ResourcePath": "@PLUG_INFO_RESOURCE_PATH@",
      "Root": "@PLUG_INFO_ROOT@",
      "Type": "library"
    }
  ]
}
