// Ported from OpenUSD 26.11.1:
//  pxr/usdValidation/usdLodValidators/plugInfo.json
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// OpenUSD 26.11.1 usdLodValidators/plugInfo.json: link-time plugin
// registration of the "Validators" metadata UsdValidationRegistry reads.
// The validated schemas come from the libraries imported here
// (usdLodValidators/CMakeLists.txt LIBRARIES: usdLod, usdValidation). The
// plugin is part of this build (no plugInfo URL), so it is loaded; its
// validators register through TfRegistryManager (../validators.ts).
import 'typescript-usd/usdLod'
import 'typescript-usd/usdValidation'
import { Registry as PlugRegistry } from 'typescript-usd/plug'
import { plugInfo } from './plugData.ts'
PlugRegistry.GetInstance().RegisterPlugins(plugInfo)
