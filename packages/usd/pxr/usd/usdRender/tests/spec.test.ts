// typescript-usd own check of UsdRenderComputeSpec,
// UsdRenderComputeNamespacedSettings, UsdRenderSettings::GetStageRenderSettings
// and UsdRenderPass::GetRenderVisibilityCollectionAPI against the pinned
// OpenUSD build (fixtures/renderSpec, FIXTURES.md). The text below
// is printed exactly as the native capture prints it; usdRender registers no
// upstream tests.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { TfStreamFloat } from 'typescript-usd/tf'
import { Stage, type Prim } from 'typescript-usd/usd'
import { Array as VtArray } from 'typescript-usd/vt'
import {
  Pass, Settings, computeNamespacedSettings, computeSpec,
  type Spec, type SpecDictionary,
} from 'typescript-usd/usdRender'

const dir = new URL('./fixtures/renderSpec/', import.meta.url)
const native: string[] = JSON.parse(readFileSync(new URL('expected.json', dir), 'utf8')).payload.lines

// TfStringify of the values the native capture prints.
const flt = (v: number) => TfStreamFloat(v)
const vec = (v: { get(i: number): number }, n: number, f: (x: number) => string) =>
  `(${Array.from({ length: n }, (_, i) => f(v.get(i))).join(', ')})`
const tokens = (v: readonly string[]) => `[${v.join(', ')}]`

// VtValue::GetTypeName and TfStringify of a namespaced setting; SdfPathVector
// values are path lists, other values take the authored attribute's type.
const VT_TYPE: Record<string, string> = {
  float: 'float', int: 'int', string: 'string', token: 'TfToken', 'float[]': 'VtArray<float>',
}
function dict(d: SpecDictionary, prim: Prim): string {
  let s = ''
  for (const [key, value] of Object.entries(d)) {
    if (Array.isArray(value)) {
      s += `    ${key} [SdfPathVector] = [${value.join(', ')}]\n`
      continue
    }
    const typeName = prim.getAttr(key)!.typeName
    const vtType = VT_TYPE[typeName] ?? typeName
    const text = value instanceof VtArray
      ? `[${value.toArray().map(x => (typeName === 'float[]' ? flt(x as number) : String(x))).join(', ')}]`
      : typeName === 'float' ? flt(value as number) : String(value)
    s += `    ${key} [${vtType}] = ${text}\n`
  }
  return s
}

function printSpec(spec: Spec, stage: Stage, settingsPrim: Prim): string {
  let s = ''
  s += `  includedPurposes: ${tokens(spec.includedPurposes)}\n`
  s += `  materialBindingPurposes: ${tokens(spec.materialBindingPurposes)}\n`
  s += `  namespacedSettings:\n${dict(spec.namespacedSettings, settingsPrim)}`
  for (const p of spec.products) {
    s += `  product ${p.renderProductPath}\n`
    s += `    type=${p.type} name=${p.name} camera=${p.cameraPath}\n`
    s += `    disableMotionBlur=${+p.disableMotionBlur} disableDepthOfField=${+p.disableDepthOfField}\n`
    s += `    resolution=${vec(p.resolution, 2, String)} pixelAspectRatio=${flt(p.pixelAspectRatio)} policy=${p.aspectRatioConformPolicy}\n`
    s += `    apertureSize=${vec(p.apertureSize, 2, flt)} dataWindowNDC=[${vec(p.dataWindowNDC.getMin(), 2, flt)}...${vec(p.dataWindowNDC.getMax(), 2, flt)}]\n`
    s += `    renderVarIndices:${p.renderVarIndices.map(i => ` ${i}`).join('')}\n`
    s += `    namespacedSettings:\n${dict(p.namespacedSettings, stage.getPrim(p.renderProductPath)!)}`
  }
  for (const v of spec.renderVars) {
    s += `  renderVar ${v.renderVarPath}\n`
    s += `    dataType=${v.dataType} sourceName=${v.sourceName} sourceType=${v.sourceType}\n`
    s += `    namespacedSettings:\n${dict(v.namespacedSettings, stage.getPrim(v.renderVarPath)!)}`
  }
  return s
}

const FILES = ['spec.usda', 'nometadata.usda', 'badpath.usda', 'noproducts.usda']

// The native capture's main(), one file at a time.
async function printFile(name: string): Promise<string> {
  let s = ''
  const stage = (await Stage.open(fileURLToPath(new URL(name, dir))))!
  try {
    const settings = Settings.getStageRenderSettings(stage)
    s += `${name}: GetStageRenderSettings -> ${settings.path} (${settings.isValid() ? 'valid' : 'invalid'})\n`
    if (!settings.isValid()) return s
    for (const namespaces of [[], ['ri'], ['karma', 'outputs']]) {
      s += `spec namespaces=[${namespaces.join(',')}]\n`
      s += printSpec(computeSpec(settings, namespaces), stage, settings.prim)
    }
    const v = stage.getPrim('/Render/Vars/depth')
    if (v) {
      s += `namespaced /Render/Vars/depth [karma]:\n${dict(computeNamespacedSettings(v, ['karma']), v)}`
      s += `namespaced /Render/Settings []:\n${dict(computeNamespacedSettings(settings.prim, []), settings.prim)}`
    }
    const pass = new Pass(stage.getPrim('/Render/Pass'), stage)
    if (pass.isValid()) {
      const c = pass.getRenderVisibilityCollectionAPI()
      s += `pass renderVisibility collection: ${c.getName()} ${c.getCollectionPath()}\n`
    }
  } finally {
    stage.dispose()
  }
  return s
}

// The native text, split at each file's GetStageRenderSettings line.
function nativeSection(name: string): string {
  const start = native.findIndex(l => l.startsWith(`${name}: `))
  let end = native.findIndex((l, i) => i > start && FILES.some(f => l.startsWith(`${f}: `)))
  if (end < 0) end = native.length - 1  // the text ends with a newline
  return native.slice(start, end).join('\n') + '\n'
}

describe('UsdRenderComputeSpec against the pinned native build', () => {
  for (const name of FILES) {
    it(name, async () => {
      expect(await printFile(name)).toBe(nativeSection(name))
    })
  }
})
