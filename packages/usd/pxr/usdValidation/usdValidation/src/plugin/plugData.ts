// Ported from OpenUSD 26.11.1: pxr/usdValidation/usdValidation/plugInfo.json
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// OpenUSD 26.11.1 usdValidation plugin artifacts, as in ../../plugin/:
// plugInfo.json verbatim from pxr/usdValidation/usdValidation/plugInfo.json.
import type { Info as PlugInfo } from 'typescript-usd/plug'
export const plugInfo: PlugInfo = {
  "Plugins": [
    {
      "Info": {
        "Validators": {
          "CompositionErrorTest": {
            "doc": "Validator aims at providing all composition errors, which were generated while composing the stage."
          },
          "StageMetadataChecker": {
            "doc": "Stages that can be consumed as referenceable assets must have a valid 'defaultPrim' specified."
          },
          "AttributeTypeMismatch": {
            "doc": "Validator that checks for attribute type mismatch with the schema definition."
          },
          "keywords": [
            "UsdCoreValidators"
          ]
        }
      },
      "LibraryPath": "@PLUG_INFO_LIBRARY_PATH@",
      "Name": "usdValidation",
      "ResourcePath": "@PLUG_INFO_RESOURCE_PATH@",
      "Root": "@PLUG_INFO_ROOT@",
      "Type": "library"
    }
  ]
}
