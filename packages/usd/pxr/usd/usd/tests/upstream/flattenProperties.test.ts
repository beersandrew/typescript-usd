import { _setResolverForTest } from 'typescript-usd/usd/_internal'
// Ported from upstream testenv/testUsdFlattenProperties. The upstream suite
// exercises UsdAttribute.FlattenTo / UsdProperty.FlattenTo — copying a
// property's fully *composed* opinions (default, time samples, metadata,
// connections, with layer offsets folded in) onto a destination prim/property.
//
// The fixtures and expectations are captured from the v26.05 reference
// build; FlattenTo consumes the same composed query path as ordinary reads.
import { beforeEach, describe, expect, it } from 'vitest'
import { Stage } from 'typescript-usd/usd'
import { ArInMemoryResolver } from 'typescript-usd/usd/_internal'

const ROOT = `#usda 1.0
(
    subLayers = [ @./sub.usda@ (offset = 10) ]
)
def "Basic"
{
    double a = 1 ( displayName = "foo" )
    double a.timeSamples = { 0: 100, 10: 1000, }
}
over "WeakerTimeSamples" { double a = 1 ; }
over "StrongerTimeSamples" { double a.timeSamples = { 0: 100, 10: 1000, } ; }
def "RemapTargetPaths"
{
    rel a = [
        </OutsideTarget>,
        </RemapTargetPaths/A>,
        </RemapTargetPaths/A.b>,
        </RemapTargetPaths.b>
    ]
}
def "FlattenInstanceProperty" (
    references = @./proto.usda@</Prop>
    instanceable = True
)
{
}
`
const SUB = `#usda 1.0
def "OffsetTimeSamples" { double a.timeSamples = { 0: 100, 10: 1000 } ; }
def "OffsetTimeCodeTimeSamples" { timecode a = 0  ; timecode a.timeSamples = { 0: 100, 10: 1000 } ; }
def "WeakerTimeSamples" { double a.timeSamples = { 0: 100, 10: 1000 } ; }
def "StrongerTimeSamples" { double a = 1 ; }
`
const PROTO = `#usda 1.0
def "Prop" {
    def "Instance" { double builtinAttr = 5 ; }
}
`
const FIXTURE = { 'root.usda': ROOT, 'sub.usda': SUB, 'proto.usda': PROTO }

function timeSamples(stage: Stage, path: string, attr: string): Record<number, unknown> {
  const a = stage.getPrim(path)!.getAttr(attr)!
  const out: Record<number, unknown> = {}
  for (const k of a.getTimeSampleKeys()) out[k] = a.getValueAtTime(k)
  return out
}

describe('FlattenProperties — composed source resolution', () => {
  beforeEach(() => {
    _setResolverForTest(new ArInMemoryResolver(Object.fromEntries(
      Object.entries(FIXTURE).map(([name, text]) => [name, new TextEncoder().encode(text)]),
    )))
  })

  it('Basic: composed default + time samples (the fields FlattenTo bakes)', async () => {
    const stage = (await Stage.open('root.usda'))!
    const a = stage.getPrim('/Basic')!.getAttr('a')!
    expect(a.getValue()).toBe(1)
    expect(a.typeName).toBe('double')
    expect(timeSamples(stage, '/Basic', 'a')).toEqual({ 0: 100, 10: 1000 })
  })

  it('FlattenWithOffsets: sublayer offset folded into time-sample keys', async () => {
    // sub.usda time samples {0,10} seen through a (offset=10) sublayer arc
    // resolve to {10,20} on the stage — Pixar: {10:100, 20:1000}.
    const stage = (await Stage.open('root.usda'))!
    expect(timeSamples(stage, '/OffsetTimeSamples', 'a')).toEqual({ 10: 100, 20: 1000 })
  })

  it('DefaultAndTimeSamples: a strong default + weak time samples in separate layers', async () => {
    const stage = (await Stage.open('root.usda'))!
    // StrongerTimeSamples: time samples authored in the stronger root layer,
    // default 1 in the weaker sublayer. Default resolves to 1; the strong
    // time samples are the resolved animation.
    const s = stage.getPrim('/StrongerTimeSamples')!.getAttr('a')!
    expect(s.getValue()).toBe(1)
    expect(timeSamples(stage, '/StrongerTimeSamples', 'a')).toEqual({ 0: 100, 10: 1000 })
    // WeakerTimeSamples: the default lives in the stronger root layer.
    expect(stage.getPrim('/WeakerTimeSamples')!.getAttr('a')!.getValue()).toBe(1)
  })

  it('RemapTargetPaths: composed relationship targets (the set FlattenTo remaps)', async () => {
    const stage = (await Stage.open('root.usda'))!
    expect(stage.getPrim('/RemapTargetPaths')!.getAttr('a')!.getTargets()).toEqual([
      '/OutsideTarget',
      '/RemapTargetPaths/A',
      '/RemapTargetPaths/A.b',
      '/RemapTargetPaths.b',
    ])
  })

  it('Attribute/Rel.FlattenTo copies composed opinions to a destination', async () => {
    const stage = (await Stage.open('root.usda'))!
    const srcAttr = stage.getPrim('/Basic')!.getAttr('a')!
    const dstPrim = stage.definePrim('/BasicCopy')
    const dstAttr = srcAttr.flattenTo(dstPrim)
    expect(dstAttr.getValue()).toBe(1)
    expect(dstAttr.getField('displayName')).toBe('foo')
    expect(timeSamples(stage, '/BasicCopy', 'a')).toEqual({ 0: 100, 10: 1000 })

    const renamed = srcAttr.flattenTo(dstPrim, 'b')
    expect(renamed.getValue()).toBe(1)
    expect(timeSamples(stage, '/BasicCopy', 'b')).toEqual({ 0: 100, 10: 1000 })
  })

  it('FlattenTo remaps intra-prim rel targets / connections to the copy', async () => {
    const stage = (await Stage.open('root.usda'))!
    const srcRel = stage.getPrim('/RemapTargetPaths')!.getAttr('a')!
    const dstPrim = stage.definePrim('/RemapTargetPathsCopy')
    const dstRel = srcRel.flattenTo(dstPrim)
    expect(dstRel.getTargets()).toEqual([
      '/OutsideTarget',
      '/RemapTargetPathsCopy/A',
      '/RemapTargetPathsCopy/A.b',
      '/RemapTargetPathsCopy.b',
    ])
  })

  it('FlattenTo bakes schema fallbacks when destination type differs', async () => {
    const stage = (await Stage.open('root.usda'))!
    const srcAttr = stage.getPrim('/Basic')!.getAttr('a')!
    // Destination already has an authored opinion of a different shape —
    // FlattenTo should overwrite it with the source's baked-out fields.
    const dstPrim = stage.definePrim('/BasicCopyDifferentType')
    const dstAttrHandle = dstPrim.createAttr('a', 'placeholder')
    const dstAttr = srcAttr.flattenTo(dstAttrHandle)
    expect(dstAttr.getValue()).toBe(1)
  })

  it('FlattenTo raises on an invalid destination prim', async () => {
    const stage = (await Stage.open('root.usda'))!
    const srcAttr = stage.getPrim('/Basic')!.getAttr('a')!
    const bogus = stage.getPrim('/Bogus')
    expect(bogus).toBeUndefined()
    expect(() => srcAttr.flattenTo(bogus)).toThrow(/invalid destination/)
  })

  it('FlattenTo over self lofts composed opinions into the edit target', async () => {
    const stage = (await Stage.open('root.usda'))!
    const srcAttr = stage.getPrim('/Basic')!.getAttr('a')!
    const dstAttr = srcAttr.flattenTo(srcAttr)
    expect(dstAttr.getValue()).toBe(1)
  })

  it('FlattenTo from an instancing prototype property', async () => {
    const stage = (await Stage.open('root.usda'))!
    const inst = stage.getPrim('/FlattenInstanceProperty')!
    expect(inst.isInstance()).toBe(true)
    const proto = inst.getPrototype()!
    // The prototype root has no properties; flatten from its child, as
    // testUsdFlattenProperties.test_FlattenInstanceProperty does.
    const srcAttr = stage.getPrim(`${proto.path}/Instance`)!.getAttr('builtinAttr')!
    const dstPrim = stage.definePrim('/FlattenInstanceProperty_1')
    const dstAttr = srcAttr.flattenTo(dstPrim)
    expect(dstAttr.getValue()).toBe(5)
  })

  // Value-resolution divergences surfaced while porting:
  // - displayName (and other authored property metadata) is not carried onto
  //   the composed Attribute, so it cannot be asserted / flattened.
  it('composed Attribute exposes authored displayName metadata (gap: metadata not composed)', async () => {
    const stage = (await Stage.open('root.usda'))!
    const a = stage.getPrim('/Basic')!.getAttr('a')!
    expect(a.getField('displayName')).toBe('foo')
  })
  // - A weaker-layer time sample block: Pixar suppresses sublayer time samples
  //   when a STRONGER layer supplies only a default (WeakerTimeSamples => {}).
  //   typescript-usd still surfaces the weaker time samples.
  it('a stronger-layer default suppresses weaker-layer time samples (gap: value resolution)', async () => {
    const stage = (await Stage.open('root.usda'))!
    expect(timeSamples(stage, '/WeakerTimeSamples', 'a')).toEqual({})
  })
  // - timecode-typed values are not shifted by layer offsets (only the sample
  //   KEYS are): OffsetTimeCodeTimeSamples default should be TimeCode(10) and
  //   samples {10:TC(110),20:TC(1010)}; typescript-usd leaves the timecode values raw.
  it('layer offsets are applied to timecode-typed VALUES, not just keys (gap)', async () => {
    const stage = (await Stage.open('root.usda'))!
    const a = stage.getPrim('/OffsetTimeCodeTimeSamples')!.getAttr('a')!
    expect(a.getValue()).toBe(10)
    expect(timeSamples(stage, '/OffsetTimeCodeTimeSamples', 'a')).toEqual({ 10: 110, 20: 1010 })
  })
})
