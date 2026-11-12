// Applies the page's ?env=NAME=VALUE parameters (exec-scene-index.ts) when it
// is evaluated. main.ts imports it first, so the settings are in place before
// any other module (some start loading imaging when evaluated) reads them, as
// a process's environment is in place before usdview starts.
import { applyEnvParameters, envParameters } from './exec-scene-index'
import { browserEnvironmentDefaults } from './gpu-device-settings'

if (typeof location !== 'undefined') {
  const env = envParameters(location.search)
  applyEnvParameters({ ...env, ...browserEnvironmentDefaults(typeof navigator === 'undefined' ? '' : navigator.userAgent, env) })
}
