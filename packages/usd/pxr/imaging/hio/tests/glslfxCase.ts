// The fixtures/glslfx capture in TypeScript: the HioGlslfx results the
// native driver records for one case, shared by glslfx.test.ts and
// glslfxAssets.test.ts.
import { TfDiagnosticTrap, Type as TfType, Token as TfToken } from 'typescript-usd/tf'
import { Dictionary as VtDictionary, Value as VtValue, ValueTypes as VtValueTypes } from 'typescript-usd/vt'
import { HioGlslfx, HioGlslfxInputStream } from '../src/glslfx.ts'
import {
  HioGlslfxResourceLayout,
  type HioGlslfxResourceLayoutElement,
} from '../src/glslfxResourceLayout.ts'
import { Hio_VtValueVectorType } from '../src/dictionary.ts'

export interface GlslfxCase {
  name: string
  kind: 'file' | 'stream' | 'none'
  input: string
  technique: string
  sourceKeys: string[]
  layoutKeys: string[][]
}

const floatVectorType = TfType.declare('std::vector<float>')
const num = (d: number) => Number.isNaN(d) ? 'nan' : d === Infinity ? 'inf' : d === -Infinity ? '-inf' : d

// The capture's _Value
function value(v: VtValue): unknown {
  if (v.IsEmpty()) return { empty: true }
  if (v.IsHolding(VtValueTypes.dictionary)) {
    return { dict: [...v.UncheckedGet<VtDictionary>()].map(([k, e]) => [k, value(e)]) }
  }
  if (v.IsHolding(Hio_VtValueVectorType)) return { vector: v.UncheckedGet<VtValue[]>().map(value) }
  if (v.IsHolding(floatVectorType)) return { floats: v.UncheckedGet<number[]>().map(num) }
  if (v.IsHolding(VtValueTypes.string)) return { string: v.UncheckedGet<string>() }
  if (v.IsHolding(VtValueTypes.bool)) return { bool: v.UncheckedGet<boolean>() }
  if (v.IsHolding(VtValueTypes.int)) return { int: v.UncheckedGet<number>() }
  if (v.IsHolding(VtValueTypes.double)) return { double: num(v.UncheckedGet<number>()) }
  if (v.IsHolding(VtValueTypes.float)) return { float: num(v.UncheckedGet<number>()) }
  return { type: v.getTypeName() }
}

// The capture's _Diagnostics
function diagnostics(trap: TfDiagnosticTrap) {
  const result = {
    errors: trap.getErrors().map(e => e.getCommentary()),
    warnings: trap.getWarnings().map(w => w.getCommentary()),
  }
  trap.clear()
  return result
}

// The capture's _Element
function element(e: HioGlslfxResourceLayoutElement) {
  return {
    inOut: e.inOut, kind: e.kind, location: e.location, dataType: e.dataType,
    name: e.name, qualifiers: e.qualifiers, arraySize: e.arraySize,
    aggregateName: e.aggregateName,
    members: e.members.map(m => [m.dataType, m.name, m.arraySize, m.qualifiers]),
    stageVisibility: e.stageVisibility,
  }
}

// The capture's main(), in the same order.
export function runGlslfxCase(c: GlslfxCase) {
  const trap = new TfDiagnosticTrap()
  try {
    const technique = TfToken(c.technique)
    const glslfx = c.kind === 'file' ? new HioGlslfx(c.input, technique)
      : c.kind === 'stream' ? new HioGlslfx(new HioGlslfxInputStream(c.input), technique)
      : new HioGlslfx()
    const ctor = diagnostics(trap)
    const reason = { value: '' }
    const valid = glslfx.isValid(reason)
    const files = [...glslfx.getFiles()]
    const sources = c.sourceKeys.map(key => {
      const source = glslfx.getSource(TfToken(key))
      return [key, source, diagnostics(trap)]
    })
    const layouts = c.layoutKeys.map(keys => {
      const errorStr = { value: '' }
      const dict = glslfx.getLayoutAsDictionary(keys.map(k => TfToken(k)), errorStr)
      const elements = keys.map(key => {
        const result: HioGlslfxResourceLayoutElement[] = []
        HioGlslfxResourceLayout.parseLayout(result, TfToken(key), dict)
        return result.map(element)
      })
      return {
        keys, dict: value(VtValue.createDictionary(dict)), error: errorStr.value,
        elements, diagnostics: diagnostics(trap),
      }
    })
    const parameters = glslfx.getParameters().map(p => ({
      name: p.name, default: value(p.defaultValue), doc: p.docString, role: p.role,
    }))
    const textures = glslfx.getTextures().map(t => ({
      name: t.name, default: value(t.defaultValue), doc: t.docString,
    }))
    const attributes = glslfx.getAttributes().map(a => ({
      name: a.name, default: value(a.defaultValue), doc: a.docString,
    }))
    const surface = glslfx.getSurfaceSource()
    const displacement = glslfx.getDisplacementSource()
    const volume = glslfx.getVolumeSource()
    return {
      valid, reason: reason.value, ctor, filePath: glslfx.getFilePath(), files,
      hash: glslfx.getHash().toString(), surface, displacement, volume,
      accessorDiagnostics: diagnostics(trap), sources, layouts, parameters,
      textures, attributes, metadata: value(VtValue.createDictionary(glslfx.getMetadata())),
    }
  } finally {
    trap.clear()
    trap.dismiss()
  }
}

