// The plugins an OpenUSD install registers at startup (lib/usd/*/plugInfo.json
// and plugin/usd): every schema library, file format and shader definition
// the tools can meet. Upstream PlugRegistry finds them all before a stage
// opens; here each library registers when its module loads, so the pages
// load them before running a tool. Without them a tool drops the fields
// those plugins register, e.g. UsdGeom's upAxis, metersPerUnit and
// interpolation (usdGeom/plugInfo.json SdfMetadata). Imaging plugins are left
// out: the tools never draw.
import 'typescript-usd/usdGeom'
import 'typescript-usd/usdShade'
import 'typescript-usd/usdSkel'
import 'typescript-usd/usdSemantics'
import 'typescript-usd/usdLux'
import 'typescript-usd/usdVol'
import 'typescript-usd/usdPhysics'
import 'typescript-usd/usdMedia'
import 'typescript-usd/usdLod'
import 'typescript-usd/usdUI'
import 'typescript-usd/usdRi'
import 'typescript-usd/usdRender'
import 'typescript-usd/usdProc'
import 'typescript-usd/usdHydra'
import 'typescript-usd/usdProfiles'
import 'typescript-usd/usdMtlx'
import 'typescript-usd/usdShaders'
