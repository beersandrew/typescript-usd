// Port of OpenUSD 26.11.1
// pxr/usdValidation/usdValidation/testenv/testUsdValidationPyPlugin/
// testPyValidatorPlugin/__init__.py, the validator plugin module of
// testUsdValidationPyPlugin. Its plugInfo.json is the upstream one with Type
// "library" and LibraryPath naming this module in place of Type "python"; the
// registry imports it when the plugin is loaded.
//
// When the Plug registry loads this module, the top-level registration code
// below runs and registers the task functions with the ValidationRegistry:
// the equivalent of TF_REGISTRY_FUNCTION(UsdValidationRegistry) in a C++
// plugin.
import type { Layer } from 'typescript-usd/sdf'
import type { Stage } from 'typescript-usd/usd'
import {
  ValidationError, ValidationErrorSite, ValidationErrorType, ValidationRegistry,
} from '../../../src/index.ts'

const _PLUGIN_NAME = 'testPyValidatorPlugin'

function _stageTask(stage: Stage): ValidationError[] {
  return [new ValidationError('PyPluginStageError', ValidationErrorType.Error,
    [new ValidationErrorSite(stage, '/')], 'Python plugin stage validator ran')]
}

function _layerTask(layer: Layer): ValidationError[] {
  return [new ValidationError('PyPluginLayerError', ValidationErrorType.Warn,
    [new ValidationErrorSite(layer, '/')], 'Python plugin layer validator ran')]
}

// --- Registration at import time (equivalent to TF_REGISTRY_FUNCTION) ---
const _registry = ValidationRegistry.getInstance()
_registry.registerPluginStageValidator(_PLUGIN_NAME + ':PyStageValidator', _stageTask)
_registry.registerPluginLayerValidator(_PLUGIN_NAME + ':PyLayerValidator', _layerTask)
