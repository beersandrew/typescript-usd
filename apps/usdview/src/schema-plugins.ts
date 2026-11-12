// The schema libraries the imaging stack uses (usdLux, usdRender, usdSkel,
// usdVol, usdHydra), registered with the Core chunk, before any stage opens.
// Upstream registers every plugin's schemas at startup (PlugRegistry,
// UsdSchemaRegistry); a stage composed before a schema library registers
// keeps its prims' type info without that schema (no DomeLight, SkelRoot or
// SkelBindingAPI), so the imaging chunk loading later is too late for them.
import 'typescript-usd/usdLux'
import 'typescript-usd/usdRender'
import 'typescript-usd/usdSkel'
import 'typescript-usd/usdVol'
import 'typescript-usd/usdHydra'
