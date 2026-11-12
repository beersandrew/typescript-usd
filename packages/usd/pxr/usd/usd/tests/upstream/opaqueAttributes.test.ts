// Portions ported from OpenUSD 26.11.1, including:
//  pxr/usd/usd/testenv/testUsdOpaqueAttributes.py
// Copyright 2022 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

import { _resolverContextForResolver } from 'typescript-usd/usd/_internal'
// Ported from pxr/usd/usd/testenv/testUsdOpaqueAttributes.py
//
// Opaque attributes (Sdf.ValueTypeNames.Opaque) are typed attributes that
// hold NO value — they exist so they can be connection targets / endpoints
// (e.g. shader outputs), but Get() returns nothing and a value cannot be
// authored on them. The upstream suite checks: (1) Get() is None / HasValue()
// is False and authoring a value raises; (2) the format preserves opaque
// attrs' metadata (hidden) and connections through save+reload.
//
// Goldens captured from the Pixar build (usd-2605):
//   typeName: "opaque"; Get(): None; HasValue(): False
//   conns of Attr2: ["/X.Attr1"]; Attr1.IsHidden(): True
//   USDA:
//     custom opaque Attr1 ( hidden = true )
//     custom opaque Attr2
//     prepend opaque Attr2.connect = </X.Attr1>

import { describe, expect, it } from 'vitest'
import { Stage } from 'typescript-usd/usd'
import { ArInMemoryResolver } from 'typescript-usd/usd/_internal'

function openText(identifier: string, text: string): Promise<Stage> {
  const resolver = new ArInMemoryResolver({ [identifier]: new TextEncoder().encode(text) })
  return Stage.open(identifier, { resolverContext: _resolverContextForResolver(resolver) }).then(value => value!)
}

async function reopen(stage: Stage): Promise<Stage> {
  const usda = stage.exportToUsda()
  return openText('roundtrip.usda', usda)
}

describe('opaque attributes', () => {
  it('parses an opaque attribute declared in USDA with the opaque type', async () => {
    const usda = `#usda 1.0

def Scope "X"
{
    custom opaque Attr1 (
        hidden = true
    )
    custom opaque Attr2
    prepend opaque Attr2.connect = </X.Attr1>
}
`
    const stage = await openText('opaque.usda', usda)

    const attr1 = stage.getPrim('/X')!.getAttr('Attr1')!
    expect(attr1.typeName).toBe('opaque')
  })

  it('opaque attribute holds no value (Get returns nothing)', async () => {
    const usda = `#usda 1.0

def Scope "X"
{
    custom opaque Attr1
}
`
    const stage = await openText('opaque.usda', usda)

    const attr1 = stage.getPrim('/X')!.getAttr('Attr1')!
    // No default value was (or can be) authored — Get() is None upstream.
    expect(attr1.getValue()).toBeUndefined()
    expect(attr1.getDefaultValueResult().source).toBe('fallback')
  })

  it('opaque attrs can be authored (declared) without a value', () => {
    const stage = Stage.createNew()
    stage.definePrim('/X', 'Scope')
    stage.declareProperty('/X', 'Attr1', 'opaque')

    const attr1 = stage.getPrim('/X')!.getAttr('Attr1')!
    expect(attr1.typeName).toBe('opaque')
    expect(attr1.getValue()).toBeUndefined()
  })

  it('preserves opaque attr type through USDA round-trip', async () => {
    const stage = Stage.createNew()
    stage.definePrim('/X', 'Scope')
    stage.declareProperty('/X', 'Attr1', 'opaque')

    const reopened = await reopen(stage)
    const attr1 = reopened.getPrim('/X')!.getAttr('Attr1')!
    expect(attr1.typeName).toBe('opaque')
    expect(attr1.getValue()).toBeUndefined()
  })

  it('preserves opaque attrs connections through USDA round-trip', async () => {
    const stage = Stage.createNew()
    const prim = stage.definePrim('/X', 'Scope')
    stage.declareProperty('/X', 'Attr1', 'opaque')
    stage.declareProperty('/X', 'Attr2', 'opaque')
    prim.attr('Attr2').connect('/X.Attr1')

    // Authored read-back
    expect(stage.getPrim('/X')!.getAttr('Attr2')!.getConnections()).toEqual(['/X.Attr1'])

    const reopened = await reopen(stage)
    const attr2 = reopened.getPrim('/X')!.getAttr('Attr2')!
    expect(attr2.typeName).toBe('opaque')
    expect(attr2.getConnections()).toEqual(['/X.Attr1'])
  })

  it('rejects authoring a value on an opaque attribute (Set raises, HasValue stays false)', () => {
    const stage = Stage.createNew()
    const prim = stage.definePrim('/X', 'Scope')
    stage.declareProperty('/X', 'Attr1', 'opaque')
    expect(() => prim.attr('Attr1').set(5)).toThrow()
    expect(() => prim.attr('Attr1').setTimeSample(10, 5)).toThrow()
    const attr = stage.getPrim('/X')!.getAttr('Attr1')!
    expect(attr.hasValue()).toBe(false)
    expect(attr.getValue()).toBeUndefined()
  })

  // Upstream's _RunSerializeTest also checks Attr1.IsHidden() survives
  // save+reload. typescript-usd's USDA parser and exporter do not carry attribute-level
  // `hidden` metadata (only the typeName and connections round-trip), so this
  // needs a source change in pxr/usd/sdf/src (parser + exporter) to
  // read/write per-attr metadata before it can be exercised green.
  it('preserves opaque attr hidden metadata through save+reload', async () => {
    const usda = `#usda 1.0

def Scope "X"
{
    custom opaque Attr1 (
        hidden = true
    )
}
`
    const stage = await openText('opaque.usda', usda)
    const reopened = await reopen(stage)
    const attr1 = reopened.getPrim('/X')!.getAttr('Attr1')!
    expect(attr1.getField('hidden')).toBe(true)
  })
})
