// Portions ported from OpenUSD 26.11.1, including: pxr/exec/execIr/types.cpp
// Copyright 2026 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

import './plugin/registerPlugin.ts'
// typescript-usd/execIr — pxr/exec/execIr (OpenUSD 26.11.1): generated schema
// classes (generatedSchema.classes.txt), tokens, and the invertible-rigging
// computations.
export { Controller } from './controller.ts'
export { FkController } from './fkController.ts'
export { JointScope } from './jointScope.ts'
export { SwitchController } from './switchController.ts'
export { Xformable } from './xformable.ts'
export { ExecIrTokens, ExecIrTokens as Tokens } from './tokens.ts'
export { ExecIrComputations, ExecIrComputationsType } from './computations.ts'
export { ExecIrResultType, type ExecIrResult } from './types.ts'
export { ExecIrControllerBuilder, ExecIr_ControllerBuilderBase } from './controllerBuilder.ts'
export {
  ExecIr_ComputeDefaultSpace,
  ExecIr_ComputeFkParams,
  ExecIr_ComputeLocalXf,
  ExecIr_UtilsCompute,
  ExecIr_UtilsComputeLocalRotation,
  ExecIr_UtilsComputeLocalTranslation,
  ExecIr_UtilsComputeStandardRotationOrientation,
  ExecIr_UtilsComputeStandardTranslationOrientation,
  ExecIr_UtilsInvert,
  type ExecIr_UtilsParams,
} from './utils.ts'
// The execIr plugin's library registers its computations when it is loaded.
// The plugin is registered as part of this build (src/plugin/registerPlugin.ts
// passes no plugInfo URL), so its library is this barrel: importing it runs
// the TF_REGISTRY_FUNCTION blocks of types.cpp and the three
// *Computations.cpp files, as loading libexecIr does upstream.
import './fkControllerComputations.ts'
import './switchControllerComputations.ts'
import './xformableComputations.ts'
