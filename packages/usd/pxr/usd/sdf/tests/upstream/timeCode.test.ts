// Ported from OpenUSD pxr/usd/sdf/testenv/testSdfTimeCode.py
//
// SCOPE NOTE: upstream's testSdfTimeCode.py exercises the `SdfTimeCode` value
// type — a typed double wrapper with repr/str/float conversion, ==/!=/</<=/>/>=
// comparison, +/-/*// arithmetic, and SdfLayerOffset multiplication. typescript-usd has
// NO SdfTimeCode class (no Sdf.TimeCode export); the `timecode` value role is
// carried as a plain JS number through the parser/writer/Layer surface (see
// pxr/usd/sdf/src/parserHelpers.ts: `timecode` -> 'float' ScalarKind).
//
// So the arithmetic/comparison/LayerOffset portions of the upstream suite are
// BLOCKED (the class is genuinely absent). This file ports the portion that DOES
// map to existing typescript-usd public API: parsing `timecode` / `timecode[]` attribute
// values and the timeCodesPerSecond / framesPerSecond / startTimeCode /
// endTimeCode layer metadata, plus USDA round-trip of timecode value formatting
// (which mirrors upstream's str(SdfTimeCode) expectations: '0', '3', '-2.5').
//
// All golden values are captured from the Pixar build (usd-2605, Python 3.9.21)
// by building the same layer in pxr.Sdf/pxr.Usd and reading layer.ExportToString().

import { describe, expect, it } from 'vitest'
import { Layer, serializeUsda } from 'typescript-usd/sdf'
import { parseUsda } from '../../src/textFileFormatParser.ts'

// The exact USDA emitted by the Pixar build for a layer carrying timecode
// metadata + scalar/array/default timecode attribute values:
//
//   layer = Sdf.Layer.CreateAnonymous(".usda")
//   layer.timeCodesPerSecond = 24.0
//   layer.framesPerSecond    = 30.0
//   layer.startTimeCode      = 1.0
//   layer.endTimeCode        = 48.0
//   stage = Usd.Stage.Open(layer); p = stage.DefinePrim("/Prim")
//   p.CreateAttribute("tc",        Sdf.ValueTypeNames.TimeCode).Set(Sdf.TimeCode(12.5))
//   p.CreateAttribute("tcArr",     Sdf.ValueTypeNames.TimeCodeArray)
//        .Set([Sdf.TimeCode(0), Sdf.TimeCode(3.0), Sdf.TimeCode(-2.5)])
//   p.CreateAttribute("tcDefault", Sdf.ValueTypeNames.TimeCode).Set(Sdf.TimeCode())
//   print(layer.ExportToString())
const PIXAR_USDA = `#usda 1.0
(
    endTimeCode = 48
    framesPerSecond = 30
    startTimeCode = 1
    timeCodesPerSecond = 24
)

def "Prim"
{
    custom timecode tc = 12.5
    custom timecode[] tcArr = [0, 3, -2.5]
    custom timecode tcDefault = 0
}
`

// Loose view of the parsed scene: spec path -> field -> { value }
type FieldScene = Record<string, Record<string, { value: unknown }>>

describe('sdf timecode / layer metadata', () => {
  it('parses timeCodesPerSecond / framesPerSecond / start / end as numbers', () => {
    const layer = Layer.createInMemory('timecode-meta.usda', PIXAR_USDA)
    // Golden values from layer.timeCodesPerSecond etc. on the Pixar build.
    expect(layer.getField('/', 'timeCodesPerSecond')).toBe(24)
    expect(layer.getField('/', 'framesPerSecond')).toBe(30)
    expect(layer.getField('/', 'startTimeCode')).toBe(1)
    expect(layer.getField('/', 'endTimeCode')).toBe(48)
  })
})

describe('sdf timecode / attribute values', () => {
  it('parses a scalar timecode attribute value', () => {
    const scene = parseUsda(PIXAR_USDA) as unknown as FieldScene
    // a.Get() == Sdf.TimeCode(12.5) == 12.5 on the Pixar build.
    expect(scene['/Prim.tc']!['default']!.value).toBe(12.5)
    expect(scene['/Prim.tc']!['typeName']!.value).toBe('timecode')
  })

  it('parses the default (zero) timecode value', () => {
    const scene = parseUsda(PIXAR_USDA) as unknown as FieldScene
    // Sdf.TimeCode() defaults to 0 (Pixar: str(Sdf.TimeCode()) == '0').
    expect(scene['/Prim.tcDefault']!['default']!.value).toBe(0)
  })

  it('parses a timecode[] array value', () => {
    const scene = parseUsda(PIXAR_USDA) as unknown as FieldScene
    // Pixar: b.Get() == [Sdf.TimeCode(0), Sdf.TimeCode(3), Sdf.TimeCode(-2.5)]
    expect(scene['/Prim.tcArr']!['default']!.value).toEqual([0, 3, -2.5])
    expect(scene['/Prim.tcArr']!['typeName']!.value).toBe('timecode[]')
  })

  it('exposes timecode attribute values through the Layer surface', () => {
    const layer = Layer.createInMemory('timecode-attrs.usda', PIXAR_USDA)
    expect(layer.getField('/Prim.tc', 'default')).toBe(12.5)
    expect(layer.getField('/Prim.tcArr', 'default')).toEqual([0, 3, -2.5])
    expect(layer.getField('/Prim.tcDefault', 'default')).toBe(0)
    expect(layer.getField('/Prim.tc', 'typeName')).toBe('timecode')
    expect(layer.getField('/Prim.tcArr', 'typeName')).toBe('timecode[]')
  })
})

describe('sdf timecode / USDA value formatting (mirrors str(SdfTimeCode))', () => {
  // upstream test_ReprAndConversion: str(Sdf.TimeCode(0)) == '0',
  // str(Sdf.TimeCode(3)) == '3', str(Sdf.TimeCode(-2.5)) == '-2.5'.
  // In typescript-usd these manifest as the serialized USDA value forms.
  it('round-trips timecode attribute values with Pixar formatting', () => {
    const out = serializeUsda(Layer.createInMemory('timecode.usda', PIXAR_USDA))
    // Whole-number timecodes print without a trailing decimal (0, 3),
    // fractional ones keep it (12.5, -2.5) — exactly as the Pixar build emits.
    expect(out).toContain('custom timecode tc = 12.5')
    expect(out).toContain('custom timecode[] tcArr = [0, 3, -2.5]')
    expect(out).toContain('custom timecode tcDefault = 0')
  })

  it('round-trips timecode layer metadata values', () => {
    const out = serializeUsda(Layer.createInMemory('timecode-meta.usda', PIXAR_USDA))
    expect(out).toContain('startTimeCode = 1')
    expect(out).toContain('endTimeCode = 48')
    expect(out).toContain('timeCodesPerSecond = 24')
    expect(out).toContain('framesPerSecond = 30')
  })
})
