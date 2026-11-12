// Portions ported from OpenUSD 26.11.1, including:
//  pxr/usd/usd/testenv/testUsdAttributeConnections.py
// Copyright 2017 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

import { _setResolverForTest } from 'typescript-usd/usd/_internal'
// Port of the applicable sections of v26.05
// pxr/usd/usd/testenv/testUsdAttributeConnections.py. The installed matching
// Python testenv was run live before this port (5/5 green).

import { beforeEach, describe, expect, it } from 'vitest'
import { ListPositionBackOfAppendList, ListPositionBackOfPrependList, ListPositionFrontOfAppendList, ListPositionFrontOfPrependList, Stage, type Attribute } from 'typescript-usd/usd'
import { ArInMemoryResolver } from 'typescript-usd/usd/_internal'

const enc = (text: string): Uint8Array => new TextEncoder().encode(text)

async function open(text: string): Promise<Stage> {
  _setResolverForTest(new ArInMemoryResolver({ 'root.usda': enc(text) }))
  return (await Stage.open('root.usda'))!
}

beforeEach(() => _setResolverForTest(new ArInMemoryResolver({})))

const BASIC = `#usda 1.0
def Scope "Foo" {
    custom int someAttr
    add int testAttr.connect = [</Qux>, </Bar>, </Baz>, </Foo.someAttr>]
}
def Scope "Baz" { add int bogus.connect = </MissingConnectionPath> ; }
def "Recursive" {
    def "A" { add int AtoB.connect = <../B> ; }
    def "B" { add int BtoC.connect = <../C> ; }
    def "C" { add int CtoD.connect = <../D> ; }
    def "D" {
        add int DtoA.connect = <../A>
        def "A" { add int AtoB.connect = <../B> ; }
        def "B" { add int BtoC.connect = <../C> ; }
        def "C" { add int CtoD.connect = <../D> ; }
        def "D" { add int DtoA.connect = <../A> ; }
    }
    over "E" { add int EtoF.connect = <../F> ; }
    over "F" { add int FtoE.connect = <../E> ; }
}`

describe('UsdAttributeConnections', () => {
  it('returns a composed connection list in authored order', async () => {
    const stage = await open(BASIC)
    expect(stage.getPrim('/Foo')!.getAttr('testAttr')!.getConnections()).toEqual([
      '/Qux', '/Bar', '/Baz', '/Foo.someAttr',
    ])
  })

  it('FindAllAttributeConnectionPaths recursively follows sources and predicates', async () => {
    const stage = await open(BASIC)
    const recursive = stage.getPrim('/Recursive')!
    expect(new Set(recursive.findAllAttributeConnectionPaths())).toEqual(new Set([
      '/Recursive/A', '/Recursive/B', '/Recursive/C', '/Recursive/D',
      '/Recursive/D/A', '/Recursive/D/B', '/Recursive/D/C', '/Recursive/D/D',
    ]))
    const owningName = (attr: unknown): string => {
      const path = (attr as Attribute).primPath
      return path.slice(path.lastIndexOf('/') + 1)
    }
    expect(new Set(recursive.findAllAttributeConnectionPaths({
      predicate: attr => ['B', 'D'].includes(owningName(attr)),
    }))).toEqual(new Set([
      '/Recursive/A', '/Recursive/C', '/Recursive/D/A', '/Recursive/D/C',
    ]))
    expect(new Set(recursive.findAllAttributeConnectionPaths({
      predicate: attr => ['A', 'C'].includes(owningName(attr)),
    }))).toEqual(new Set([
      '/Recursive/B', '/Recursive/D', '/Recursive/D/B', '/Recursive/D/D',
    ]))
    const recursiveA = stage.getPrim('/Recursive/A')!
    expect(new Set(recursiveA.findAllAttributeConnectionPaths())).toEqual(new Set(['/Recursive/B']))
    expect(new Set(recursiveA.findAllAttributeConnectionPaths({ recurseOnSources: true }))).toEqual(
      new Set([
        '/Recursive/A', '/Recursive/B', '/Recursive/C', '/Recursive/D',
        '/Recursive/D/A', '/Recursive/D/B', '/Recursive/D/C', '/Recursive/D/D',
      ]),
    )
    expect(new Set(recursiveA.findAllAttributeConnectionPaths({
      recurseOnSources: true,
      predicate: attr => {
        const path = (attr as Attribute).primPath
        const parent = path.slice(0, path.lastIndexOf('/'))
        return parent.endsWith('/Recursive') || ['A', 'C'].includes(owningName(attr))
      },
    }))).toEqual(new Set([
      '/Recursive/A', '/Recursive/B', '/Recursive/C', '/Recursive/D',
      '/Recursive/D/B', '/Recursive/D/D',
    ]))
    expect(new Set(recursive.findAllAttributeConnectionPaths({
      traversalPredicate: 'allPrims',
    }))).toEqual(new Set([
      '/Recursive/A', '/Recursive/B', '/Recursive/C', '/Recursive/D', '/Recursive/E', '/Recursive/F',
      '/Recursive/D/A', '/Recursive/D/B', '/Recursive/D/C', '/Recursive/D/D',
    ]))
    expect(new Set(recursive.findAllAttributeConnectionPaths({
      traversalPredicate: 'allPrims',
      predicate: attr => ['B', 'D', 'E'].includes(owningName(attr)),
    }))).toEqual(new Set([
      '/Recursive/A', '/Recursive/C', '/Recursive/F',
      '/Recursive/D/A', '/Recursive/D/C',
    ]))
    expect(new Set(recursive.findAllAttributeConnectionPaths({
      traversalPredicate: 'allPrims',
      predicate: attr => ['A', 'C', 'F'].includes(owningName(attr)),
    }))).toEqual(new Set([
      '/Recursive/B', '/Recursive/D', '/Recursive/E',
      '/Recursive/D/B', '/Recursive/D/D',
    ]))
  })

  it('maps connections authored inside an instance to its prototype', async () => {
    const stage = await open(`#usda 1.0
def Scope "Ref" {
    def Scope "Foo" {
        custom int someAttr
        add int testAttr.connect = [</Ref/Qux>, </Ref/Bar>, </Ref/Baz>, </Ref/Foo.someAttr>]
    }
    def Scope "Baz" {
        add int bogus.connect = </Ref/MissingConnectionPath>
        add int root.connect = </Ref>
    }
}
def Scope "Root" (instanceable = true ; references = </Ref>) {}`)
    const prototype = stage.getPrim('/Root')!.getPrototype()!
    expect(stage.get(`${prototype.path}/Foo.testAttr`)!.getConnections()).toEqual([
      `${prototype.path}/Qux`, `${prototype.path}/Bar`, `${prototype.path}/Baz`,
      `${prototype.path}/Foo.someAttr`,
    ])
    expect(stage.get(`${prototype.path}/Baz.bogus`)!.getConnections())
      .toEqual([`${prototype.path}/MissingConnectionPath`])
    expect(stage.get(`${prototype.path}/Baz.root`)!.getConnections()).toEqual([prototype.path])
    const writable = stage.definePrim('/Root').attr('cattr')
    expect(() => writable.addConnection(`${prototype.path}/A`)).toThrow(/prototype/)
    expect(() => writable.removeConnection(`${prototype.path}/A`)).toThrow(/prototype/)
    expect(() => writable.setConnections(['/Root', `${prototype.path}/A`])).toThrow(/prototype/)
  })

  it('maps connections to objects in instances for stage and prototype queries', async () => {
    const stage = await open(`#usda 1.0
def "Instance" {
    double attr = 1
    def "A" {
        double attr = 1
        int cattr.connect = [</Instance>, </Instance.attr>, </Instance/A>, </Instance/A.attr>,
            </Instance/NestedInstance_1>, </Instance/NestedInstance_1.attr>,
            </Instance/NestedInstance_1/B>, </Instance/NestedInstance_1/B.attr>,
            </Instance/NestedInstance_2>, </Instance/NestedInstance_2.attr>,
            </Instance/NestedInstance_2/B>, </Instance/NestedInstance_2/B.attr>]
    }
    def "NestedInstance_1" (instanceable = true ; references = </NestedInstance>) {}
    def "NestedInstance_2" (instanceable = true ; references = </NestedInstance>) {}
}
def "NestedInstance" { double attr = 1 ; def "B" { double attr = 1 ; }
}
def "Root" {
    int cattr.connect = [</Root/Instance_1>, </Root/Instance_1.attr>,
        </Root/Instance_1/A>, </Root/Instance_1/A.attr>,
        </Root/Instance_1/NestedInstance_1>, </Root/Instance_1/NestedInstance_1.attr>,
        </Root/Instance_1/NestedInstance_1/B>, </Root/Instance_1/NestedInstance_1/B.attr>,
        </Root/Instance_1/NestedInstance_2>, </Root/Instance_1/NestedInstance_2.attr>,
        </Root/Instance_1/NestedInstance_2/B>, </Root/Instance_1/NestedInstance_2/B.attr>,
        </Root/Instance_2>, </Root/Instance_2.attr>, </Root/Instance_2/A>, </Root/Instance_2/A.attr>,
        </Root/Instance_2/NestedInstance_1>, </Root/Instance_2/NestedInstance_1.attr>,
        </Root/Instance_2/NestedInstance_1/B>, </Root/Instance_2/NestedInstance_1/B.attr>,
        </Root/Instance_2/NestedInstance_2>, </Root/Instance_2/NestedInstance_2.attr>,
        </Root/Instance_2/NestedInstance_2/B>, </Root/Instance_2/NestedInstance_2/B.attr>]
    def "Instance_1" (instanceable = true ; references = </Instance>) {
        int cattr.connect = [</Root/Instance_1>, </Root/Instance_1.attr>,
            </Root/Instance_1/A>, </Root/Instance_1/A.attr>,
            </Root/Instance_1/NestedInstance_1>, </Root/Instance_1/NestedInstance_1.attr>,
            </Root/Instance_1/NestedInstance_1/B>, </Root/Instance_1/NestedInstance_1/B.attr>,
            </Root/Instance_1/NestedInstance_2>, </Root/Instance_1/NestedInstance_2.attr>,
            </Root/Instance_1/NestedInstance_2/B>, </Root/Instance_1/NestedInstance_2/B.attr>,
            </Root/Instance_2>, </Root/Instance_2.attr>, </Root/Instance_2/A>, </Root/Instance_2/A.attr>,
            </Root/Instance_2/NestedInstance_1>, </Root/Instance_2/NestedInstance_1.attr>,
            </Root/Instance_2/NestedInstance_1/B>, </Root/Instance_2/NestedInstance_1/B.attr>,
            </Root/Instance_2/NestedInstance_2>, </Root/Instance_2/NestedInstance_2.attr>,
            </Root/Instance_2/NestedInstance_2/B>, </Root/Instance_2/NestedInstance_2/B.attr>]
    }
    def "Instance_2" (instanceable = true ; references = </Instance>) {}
}`)
    const expected = [
      '/Root/Instance_1', '/Root/Instance_1.attr', '/Root/Instance_1/A', '/Root/Instance_1/A.attr',
      '/Root/Instance_1/NestedInstance_1', '/Root/Instance_1/NestedInstance_1.attr',
      '/Root/Instance_1/NestedInstance_1/B', '/Root/Instance_1/NestedInstance_1/B.attr',
      '/Root/Instance_1/NestedInstance_2', '/Root/Instance_1/NestedInstance_2.attr',
      '/Root/Instance_1/NestedInstance_2/B', '/Root/Instance_1/NestedInstance_2/B.attr',
      '/Root/Instance_2', '/Root/Instance_2.attr', '/Root/Instance_2/A', '/Root/Instance_2/A.attr',
      '/Root/Instance_2/NestedInstance_1', '/Root/Instance_2/NestedInstance_1.attr',
      '/Root/Instance_2/NestedInstance_1/B', '/Root/Instance_2/NestedInstance_1/B.attr',
      '/Root/Instance_2/NestedInstance_2', '/Root/Instance_2/NestedInstance_2.attr',
      '/Root/Instance_2/NestedInstance_2/B', '/Root/Instance_2/NestedInstance_2/B.attr',
    ]
    expect(stage.getPrim('/Root')!.getAttr('cattr')!.getConnections()).toEqual(expected)
    expect(stage.getPrim('/Root/Instance_1')!.getAttr('cattr')!.getConnections()).toEqual(expected)
    const prototype = stage.getPrim('/Root/Instance_1')!.getPrototype()!
    expect(stage.get(`${prototype.path}/A.cattr`)!.getConnections()).toEqual([
      prototype.path, `${prototype.path}.attr`, `${prototype.path}/A`, `${prototype.path}/A.attr`,
      `${prototype.path}/NestedInstance_1`, `${prototype.path}/NestedInstance_1.attr`,
      `${prototype.path}/NestedInstance_1/B`, `${prototype.path}/NestedInstance_1/B.attr`,
      `${prototype.path}/NestedInstance_2`, `${prototype.path}/NestedInstance_2.attr`,
      `${prototype.path}/NestedInstance_2/B`, `${prototype.path}/NestedInstance_2/B.attr`,
    ])
  })

  it('authors explicit connection lists', async () => {
    const stage = await open('#usda 1.0\ndef "Test" {}')
    const attr = stage.definePrim('/Test').createAttr('attr', 'int')
    attr.setConnections(['/Test.A', '/Test.B'])
    await stage.flushChanges()
    expect(stage.getPrim('/Test')!.getAttr('attr')!.getConnections()).toEqual(['/Test.A', '/Test.B'])
  })

  it('authors positioned connection list edits and clears them', async () => {
    const stage = await open('#usda 1.0\ndef "Test" {}')
    const attr = stage.definePrim('/Test').createAttr('attr', 'int')
    attr.setConnections(['/Test.A', '/Test.B'])
    attr.addConnection('/Test.C')
    expect(attr.getConnections()).toEqual(['/Test.A', '/Test.B', '/Test.C'])
    attr.clearConnections()
    expect(attr.getConnections()).toEqual([])
    attr.addConnection('/Test.A', ListPositionFrontOfPrependList)
    attr.addConnection('/Test.B', ListPositionBackOfPrependList)
    attr.addConnection('/Test.C', ListPositionFrontOfAppendList)
    attr.addConnection('/Test.D', ListPositionBackOfAppendList)
    expect(attr.getConnections()).toEqual(['/Test.A', '/Test.B', '/Test.C', '/Test.D'])
    attr.removeConnection('/Test.C')
    expect(attr.getConnections()).toEqual(['/Test.A', '/Test.B', '/Test.D'])
  })

  it('composes connections across inconsistent property specs', async () => {
    const stage = await open(`#usda 1.0
def "A" {
    double a = 1
    double attr = 1
    prepend double attr.connect = </A.a>
}
def "B" (references = </A>) {
    string b = "foo"
    uniform string attr = "foo"
    prepend uniform string attr.connect = </B.b>
}`)
    expect(stage.getPrim('/B')!.getAttr('attr')!.getConnections()).toEqual(['/B.b', '/B.a'])
  })
})
