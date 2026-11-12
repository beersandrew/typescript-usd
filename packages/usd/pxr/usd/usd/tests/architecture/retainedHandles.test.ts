import { _resolverContextForResolver } from 'typescript-usd/usd/_internal'
import { describe, expect, it } from 'vitest'
import { ArInMemoryResolver } from 'typescript-usd/ar/_internal'
import { Stage } from '../../src/index.ts'

const enc = (text: string) => new TextEncoder().encode(text)

describe('retained Stage handles', () => {
  it('keeps Prim and Attribute reads live across rematerialization', async () => {
    const stage = (await Stage.open('handles.usda', {
      resolverContext: _resolverContextForResolver(new ArInMemoryResolver({
        'handles.usda': enc(`#usda 1.0
def Scope "A" { double value = 1 ; }
def Scope "B" {}
`),
      })),
    }))!
    const prim = stage.getPrim('/A')!
    const attr = prim.getAttr('value')!

    stage.getRootLayer().setField('/A.value', 'default', 7)
    await stage.flushChanges()

    expect(prim.getAttr('value')?.getValue()).toBe(7)
    expect(attr.getValue()).toBe(7)
  })

  it('makes a retained Attribute observe removal and later reintroduction', async () => {
    const stage = (await Stage.open('handles.usda', {
      resolverContext: _resolverContextForResolver(new ArInMemoryResolver({
        'handles.usda': enc("#usda 1.0\ndef Scope \"A\" { double value = 1 ; }"),
      })),
    }))!
    const attr = stage.get('/A.value')!

    stage.getRootLayer().eraseField('/A.value', 'default')
    await stage.flushChanges()
    expect(attr.getValue()).toBeUndefined()

    stage.getRootLayer().setField('/A.value', 'default', 9)
    await stage.flushChanges()
    expect(attr.getValue()).toBe(9)
  })
})
