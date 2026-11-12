// Ported from OpenUSD 26.11.1: pxr/usdValidation/usdValidation/registry.cpp
// Copyright 2024 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// OpenUSD 26.11.1 usdSkelValidators/plugInfo.json: link-time plugin
// registration of the "Validators" metadata UsdValidationRegistry reads
// (usdValidation/registry.cpp:76-190). The libraries imported here are
// usdSkelValidators/CMakeLists.txt's LIBRARIES (usdSkel, usdValidation). The
// plugin is part of this build (no plugInfo URL), so it is loaded; its
// validators register through TfRegistryManager (../validators.ts).
import 'typescript-usd/usdSkel'
import 'typescript-usd/usdValidation'
import { Registry as PlugRegistry } from 'typescript-usd/plug'
import { plugInfo } from './plugData.ts'
PlugRegistry.GetInstance().RegisterPlugins(plugInfo)
