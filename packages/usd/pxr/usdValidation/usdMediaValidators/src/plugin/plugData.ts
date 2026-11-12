// Ported from OpenUSD 26.11.1:
//  pxr/usdValidation/usdMediaValidators/plugInfo.json
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// OpenUSD 26.11.1 usdMediaValidators plugin artifacts, as in ../../plugin/:
// plugInfo.json verbatim from pxr/usdValidation/usdMediaValidators/plugInfo.json.
import type { Info as PlugInfo } from 'typescript-usd/plug'
export const plugInfo: PlugInfo = {
  "Plugins": [
    {
      "Info": {
        "Validators": {
          "ShadowedOrDuplicateAuthorship": {
            "doc": "Warns about authorship records the composed prim can't report: an application shadowed by a stronger, explicit apiSchemas list, or an application authored in more than one prim spec, where composition keeps only the strongest opinion for each field."
          },
          "AuthorshipInputsPaired": {
            "doc": "inputs on an authorship record must hold (name, value) pairs: its length must be a multiple of the tuple-length given by its arraySizeConstraint."
          },
          "keywords": [
            "UsdMediaValidators"
          ]
        }
      },
      "LibraryPath": "@PLUG_INFO_LIBRARY_PATH@",
      "Name": "usdMediaValidators",
      "ResourcePath": "@PLUG_INFO_RESOURCE_PATH@",
      "Root": "@PLUG_INFO_ROOT@",
      "Type": "library"
    }
  ]
}
