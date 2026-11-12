// Ported from OpenUSD 26.11.1:
//  pxr/usd/sdf/testenv/testSdfAttributeBlocking.cpp,
//  pxr/usd/sdf/testenv/testSdfAttributeBlocking.py
// Copyright 2017 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from OpenUSD pxr/usd/sdf/testenv/testSdfAttributeBlocking.{py,cpp}.
//
// Upstream tests attribute *value blocking*: authoring an `SdfValueBlock`
// (USDA literal `None`) to a default or a time sample, which round-trips as a
// distinct "blocked" opinion and, at value resolution, makes the attribute fall
// back to the weaker opinion / schema fallback.
//
// The USDA `None` token parses and authors as a first-class `SdfValueBlock`:
//   - authoring a block to a default and to each time sample,
//   - reading the blocked opinion back,
//   - serializing it as the USDA `None` literal,
//   - parsing `None` back into the block sentinel (round-trip).
//
// Golden strings below were captured from the Pixar build (usd-2605,
// Python 3.9.21) by building the identical layer in pxr.Sdf and calling
// ExportToString() before and after blocking — see the header comment on each
// EXPECTED_* constant. The Pixar build returns `Sdf.ValueBlock` from
// QueryTimeSample / defAttr.default after blocking, and distinct instances
// compare equal.

import { describe, expect, it } from 'vitest'
import { Layer, ValueBlock as SdfValueBlock, serializeUsda } from 'typescript-usd/sdf'
import { parseUsda } from '../../src/textFileFormatParser.ts'

// pxr.Sdf ExportToString() of the layer BEFORE blocking (golden, usd-2605).
const EXPECTED_BEFORE = `#usda 1.0

def "Sphere"
{
    token visibility = "visible"
    double xformOp:transform.timeSamples = {
        101: 101,
        102: 102,
        103: 103,
        104: 104,
    }
}

`

// pxr.Sdf ExportToString() of the layer AFTER blocking the default and every
// time sample with Sdf.ValueBlock() (golden, usd-2605).
const EXPECTED_AFTER = `#usda 1.0

def "Sphere"
{
    token visibility = None
    double xformOp:transform.timeSamples = {
        101: None,
        102: None,
        103: None,
        104: None,
    }
}

`

// typescript-usd's block sentinel — the value to which the USDA `None` literal parses
// and which authoring a block stores. (Upstream's Sdf.ValueBlock().)
const BLOCK = new SdfValueBlock()

// Builds the same layer the upstream test builds: a Sphere with a token
// default attr `visibility` and a double time-sampled attr `xformOp:transform`.
function buildLayer(): Layer {
  const layer = Layer.createAnonymous()
  layer.definePrimSpec('/Sphere', undefined, 'def')
  // default attr
  layer.declareProperty('/Sphere', 'visibility', 'token')
  layer.setAttrDefault('/Sphere', 'visibility', 'visible')
  // time sampled attr
  layer.declareProperty('/Sphere', 'xformOp:transform', 'double')
  for (let i = 101; i < 105; i++) {
    layer.setAttrTimeSample('/Sphere', 'xformOp:transform', i, i + 0.0)
  }
  return layer
}

// Reads a single time sample by time off the stored timeSamples field.
function queryTimeSample(layer: Layer, attrPath: string, time: number): unknown {
  const samples = layer.getField(attrPath, 'timeSamples') as [number, unknown][] | undefined
  const hit = samples?.find(([t]) => t === time)
  return hit ? hit[1] : undefined
}

describe('SdfAttributeBlocking / test_Basic', () => {
  const SAMPLE = '/Sphere.xformOp:transform'
  const DEF = '/Sphere.visibility'

  it('authors the unblocked layer matching the Pixar golden', () => {
    const layer = buildLayer()
    expect(serializeUsda(layer as never)).toBe(EXPECTED_BEFORE)
  })

  it('time samples read back as their authored values before blocking', () => {
    const layer = buildLayer()
    for (let i = 101; i < 105; i++) {
      expect(queryTimeSample(layer, SAMPLE, i)).toBe(i)
    }
  })

  it('blocking each time sample stores the block sentinel', () => {
    const layer = buildLayer()
    for (let i = 101; i < 105; i++) {
      // value present before
      expect(queryTimeSample(layer, SAMPLE, i)).toBe(i)
      // block it (upstream: SetTimeSample(path, i, Sdf.ValueBlock()))
      layer.setAttrTimeSample('/Sphere', 'xformOp:transform', i, BLOCK)
      // reads back as the block sentinel
      expect(queryTimeSample(layer, SAMPLE, i)).toBe(BLOCK)
    }
  })

  it('the default reads back, then blocks to the block sentinel', () => {
    const layer = buildLayer()
    expect(layer.getField(DEF, 'default')).toBe('visible')
    // block it (upstream: defAttr.default = Sdf.ValueBlock())
    layer.setAttrDefault('/Sphere', 'visibility', BLOCK)
    expect(layer.getField(DEF, 'default')).toBe(BLOCK)
  })

  it('a fully blocked layer serializes to the Pixar golden (None literals)', () => {
    const layer = buildLayer()
    layer.setAttrDefault('/Sphere', 'visibility', BLOCK)
    for (let i = 101; i < 105; i++) {
      layer.setAttrTimeSample('/Sphere', 'xformOp:transform', i, BLOCK)
    }
    expect(serializeUsda(layer as never)).toBe(EXPECTED_AFTER)
  })
})

describe('SdfAttributeBlocking / None parses to the block sentinel', () => {
  it('parses a blocked default and blocked time samples', () => {
    const scene = parseUsda(EXPECTED_AFTER) as unknown as Record<
      string,
      Record<string, { value: unknown }>
    >
    // blocked default
    expect(scene['/Sphere.visibility']!['default']!.value).toBeInstanceOf(SdfValueBlock)
    // every blocked time sample
    const ts = scene['/Sphere.xformOp:transform']!['timeSamples']!.value as Record<string, unknown>
    for (let i = 101; i < 105; i++) {
      expect(ts[String(i)]).toBeInstanceOf(SdfValueBlock)
    }
  })

  it('round-trips: parse(None) then re-author then serialize back to None', () => {
    const layer = buildLayer()
    layer.setAttrDefault('/Sphere', 'visibility', BLOCK)
    for (let i = 101; i < 105; i++) {
      layer.setAttrTimeSample('/Sphere', 'xformOp:transform', i, BLOCK)
    }
    const usda = serializeUsda(layer as never)
    const scene = parseUsda(usda) as unknown as Record<
      string,
      Record<string, { value: unknown }>
    >
    expect(scene['/Sphere.visibility']!['default']!.value).toBeInstanceOf(SdfValueBlock)
    expect(usda).toBe(EXPECTED_AFTER)
  })
})
