// typescript-usd/execGeom — pxr/exec/execGeom (OpenUSD 26.11.1): tokens, and the
// registration of the execGeom plugin. The plugin's library, xformable.ts,
// which registers the UsdGeomXformable computations, is not imported here:
// exec loads it through the plugin (src/plugin/registerPlugin.ts).
import './plugin/registerPlugin.ts'
export { ExecGeomXformableTokens } from './tokens.ts'
