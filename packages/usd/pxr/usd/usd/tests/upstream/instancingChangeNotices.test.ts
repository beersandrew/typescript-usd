// Portions ported from OpenUSD 26.11.1, including:
//  pxr/usd/usd/testenv/testUsdInstancing.py, pxr/usd/usd/stage.cpp,
//  pxr/usd/usd/instanceCache.cpp
// Copyright 2016, 2017 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

import { _resolverContextForResolver } from 'typescript-usd/usd/_internal'
// Port of pxr/usd/usd/testenv/testUsdInstancing.py test_PropertyChanges
// (:1055) and test_MetadataChanges (:1113) on the testenv's own basic/
// layers (root.usda, set.usda, prop.usda inlined verbatim; True/False
// normalized to lowercase). All expected notice sets were re-captured on
// the live 26.05 reference build (Usd.Stage over the identical layers) —
// they match the testenv assertions exactly.
//
// The mechanism under test: upstream UsdStage remaps changed paths beneath
// instances into prototype paths before emitting ObjectsChanged
// (stage.cpp:4754-4787 remapChangesToPrototypes, via
// Usd_InstanceCache::GetPrimsInPrototypesUsingPrimIndexPath,
// instanceCache.cpp:521). Changes to objects ON an instance prim itself
// (its own properties/metadata) are NOT remapped — prototypes carry no
// properties, so those notices land on every affected instance path.
//
// The incremental change-plan path performs the same post-recomposition
// instance-cache remap and emits populated prototype objects rather than raw
// Pcp prim-index paths.

import { describe, expect, it } from 'vitest'
import { ArInMemoryResolver } from 'typescript-usd/ar/_internal'
import type { Layer } from 'typescript-usd/sdf'
import { Stage } from '../../src/index.ts'
import { onObjectsChanged, type ObjectsChangedSummary } from '../support/objectsChanged.ts'

const enc = (text: string) => new TextEncoder().encode(text)

// pxr/usd/usd/testenv/testUsdInstancing/basic/root.usda
const ROOT = `#usda 1.0
class "_class_Prop"
{
    def Scope "From_class_in_root"
    {
    }
    over "geom"
    {
        over "Scope"
        {
            double x = 3.5
        }
    }
}
def Scope "World"
{
    def Scope "sets"
    {
        def Scope "Set_1" (
            references = @./set.usda@</Set>
        )
        {
            over "Prop_1"
            {
                def Scope "From_root"
                {
                }
                over "geom"
                {
                    over "Scope"
                    {
                        double x = 3.0
                    }
                }
            }
            over "Prop_2"
            {
                def Scope "From_root"
                {
                }
                over "geom"
                {
                    over "Scope"
                    {
                        double x = 3.0
                    }
                }
            }
            over "Prop_3"
            {
                def Scope "From_root"
                {
                }
                over "geom"
                {
                    over "Scope"
                    {
                        double x = 3.0
                    }
                }
            }
        }
    }
}
`

// pxr/usd/usd/testenv/testUsdInstancing/basic/set.usda
const SET = `#usda 1.0
class "_class_Prop"
{
    def Scope "From_class_in_set"
    {
    }
    over "geom"
    {
        over "Scope"
        {
            double x = 2.5
        }
    }
}
def Scope "Set"
{
    def Scope "Prop_1" (
        references = @./prop.usda@</Prop>
        instanceable = true
    )
    {
        def Scope "From_set"
        {
        }
        over "geom"
        {
            over "Scope"
            {
                double x = 2.0
            }
        }
    }
    def Scope "Prop_2" (
        references = @./prop.usda@</Prop>
        instanceable = true
    )
    {
        def Scope "From_set"
        {
        }
        over "geom"
        {
            over "Scope"
            {
                double x = 2.0
            }
        }
    }
    def Scope "Prop_3" (
        references = @./prop.usda@</Prop>
        instanceable = false
    )
    {
        def Scope "From_set"
        {
        }
        over "geom"
        {
            over "Scope"
            {
                double x = 2.0
            }
        }
    }
}
`

// pxr/usd/usd/testenv/testUsdInstancing/basic/prop.usda
const PROP = `#usda 1.0
class "_class_Prop"
{
}
def Scope "Prop" (
    inherits = </_class_Prop>
)
{
    def Scope "geom"
    {
        def Scope "Scope"
        {
            double x = 1.0
            rel y = </Prop/geom/Scope>
        }
    }
}
`

interface Fixture {
  stage: Stage
  propLayer: Layer
  notices: Array<{ resynced: string[]; info: string[] }>
}

// The NoticeListener analog (testUsdInstancing.py:143-160): record every
// ObjectsChanged notice; compare as sorted lists (the testenv's
// ValidateExpectedChanges compares sets, testUsdInstancing.py:67-83).
async function openBasic(): Promise<Fixture> {
  const stage = (await Stage.open('root.usda', {
    resolverContext: _resolverContextForResolver(new ArInMemoryResolver({
      'root.usda': enc(ROOT),
      'set.usda': enc(SET),
      'prop.usda': enc(PROP),
    })),
  }))!
  const propLayer = stage.getUsedLayers().find(layer => layer.filePath === 'prop.usda')
  if (!propLayer) throw new Error('prop.usda not in used layers')
  const notices: Fixture['notices'] = []
  onObjectsChanged(stage, (notice: ObjectsChangedSummary) => notices.push({
    resynced: [...notice.resyncedPaths].sort(),
    info: [...notice.changedInfoOnlyPaths].sort(),
  }))
  return { stage, propLayer, notices }
}

describe('testUsdInstancing notice remapping (property/metadata changes)', () => {
  it('shares one prototype across Prop_1/Prop_2 with Prop_3 un-instanced', async () => {
    // ValidateExpectedInstances preamble (testUsdInstancing.py:1060-1062).
    const { stage } = await openBasic()
    const prototypes = stage.getPrototypes().map(prim => prim.path)
    expect(prototypes).toEqual(['/__Prototype_1'])
    expect([...stage.getInstances('/__Prototype_1')].sort()).toEqual([
      '/World/sets/Set_1/Prop_1', '/World/sets/Set_1/Prop_2',
    ])
    expect(stage.getPrim('/World/sets/Set_1/Prop_3')?.isInstance()).toBe(false)
  })

  it('new attribute spec on a child of the referenced prop resyncs the prototype path', async () => {
    // testUsdInstancing.py:1067-1078. Live 26.05 capture: resynced =
    // ['/World/sets/Set_1/Prop_3/geom/Scope.attr',
    //  '/__Prototype_1/geom/Scope.attr'] — the instanced dependents
    // (Prop_1, Prop_2) are remapped to the single shared prototype path;
    // the un-instanced Prop_3 keeps its ordinary composed path.
    const { stage, propLayer, notices } = await openBasic()

    propLayer.declareProperty('/Prop/geom/Scope', 'attr', 'int')
    await stage.flushChanges()

    expect(notices).toEqual([{
      resynced: [
        '/World/sets/Set_1/Prop_3/geom/Scope.attr',
        '/__Prototype_1/geom/Scope.attr',
      ],
      info: [],
    }])
  })

  it('attribute value change on a child of the referenced prop info-changes the prototype path', async () => {
    // testUsdInstancing.py:1080-1087. Live 26.05 capture: changedInfoOnly =
    // ['/World/sets/Set_1/Prop_3/geom/Scope.attr',
    //  '/__Prototype_1/geom/Scope.attr'], and the prototype attribute
    // composes the new value.
    const { stage, propLayer, notices } = await openBasic()
    propLayer.declareProperty('/Prop/geom/Scope', 'attr', 'int')
    await stage.flushChanges()
    notices.length = 0

    propLayer.setAttrDefault('/Prop/geom/Scope', 'attr', 1)
    await stage.flushChanges()

    expect(notices).toEqual([{
      resynced: [],
      info: [
        '/World/sets/Set_1/Prop_3/geom/Scope.attr',
        '/__Prototype_1/geom/Scope.attr',
      ],
    }])
    expect(stage.get('/__Prototype_1/geom/Scope.attr')?.getValue()).toBe(1)
  })

  it('new attribute spec on the referenced prop root resyncs every instance path', async () => {
    // testUsdInstancing.py:1089-1101. Live 26.05 capture: prototype prims
    // carry no properties, so a property change on the instances' own prim
    // is NOT remapped — it notifies at every affected instance path plus
    // the un-instanced Prop_3.
    const { stage, propLayer, notices } = await openBasic()

    propLayer.declareProperty('/Prop', 'attr', 'int')
    await stage.flushChanges()

    expect(notices).toEqual([{
      resynced: [
        '/World/sets/Set_1/Prop_1.attr',
        '/World/sets/Set_1/Prop_2.attr',
        '/World/sets/Set_1/Prop_3.attr',
      ],
      info: [],
    }])
  })

  it('attribute value change on the referenced prop root info-changes every instance path', async () => {
    // testUsdInstancing.py:1103-1111. Live 26.05 capture: changedInfoOnly =
    // the three instance-site property paths; the instance attribute
    // composes the new value.
    const { stage, propLayer, notices } = await openBasic()
    propLayer.declareProperty('/Prop', 'attr', 'int')
    await stage.flushChanges()
    notices.length = 0

    propLayer.setAttrDefault('/Prop', 'attr', 1)
    await stage.flushChanges()

    expect(notices).toEqual([{
      resynced: [],
      info: [
        '/World/sets/Set_1/Prop_1.attr',
        '/World/sets/Set_1/Prop_2.attr',
        '/World/sets/Set_1/Prop_3.attr',
      ],
    }])
    expect(stage.get('/World/sets/Set_1/Prop_1.attr')?.getValue()).toBe(1)
  })

  it('metadata change on a child of the referenced prop info-changes the prototype path', async () => {
    // testUsdInstancing.py:1119-1134. Live 26.05 capture: changedInfoOnly =
    // ['/World/sets/Set_1/Prop_3/geom/Scope', '/__Prototype_1/geom/Scope'].
    const { stage, propLayer, notices } = await openBasic()

    propLayer.setField('/Prop/geom/Scope', 'documentation', 'Test metadata change')
    await stage.flushChanges()

    expect(notices).toEqual([{
      resynced: [],
      info: [
        '/World/sets/Set_1/Prop_3/geom/Scope',
        '/__Prototype_1/geom/Scope',
      ],
    }])
  })

  it('metadata change on the referenced prop root info-changes every instance path', async () => {
    // testUsdInstancing.py:1136-1148. Live 26.05 capture: changedInfoOnly =
    // the three instance prim paths (prototype prims carry no metadata).
    const { stage, propLayer, notices } = await openBasic()

    propLayer.setField('/Prop', 'documentation', 'Test metadata change')
    await stage.flushChanges()

    expect(notices).toEqual([{
      resynced: [],
      info: [
        '/World/sets/Set_1/Prop_1',
        '/World/sets/Set_1/Prop_2',
        '/World/sets/Set_1/Prop_3',
      ],
    }])
  })
})
