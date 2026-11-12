// Ported from OpenUSD 26.11.1: pxr/usd/pcp/primIndex.cpp,
//  pxr/usd/pcp/targetIndex.cpp, pxr/usd/usd/instanceCache.cpp,
//  pxr/usd/usd/stage.cpp
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Operational invariants from OpenUSD v26.08:
// target filtering (pxr/usd/pcp/targetIndex.cpp:62-106), relocation diagnostics
// (pxr/usd/pcp/primIndex.cpp:3006-3014), property stacks
// (pxr/usd/usd/stage.cpp:5483-5515), and prototype processing
// (pxr/usd/usd/instanceCache.cpp:187-239).
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { ErrorType as PcpErrorType, Cache as PcpCache, Error as PcpError } from 'typescript-usd/pcp'
import { Stage } from '../../src/index.ts'

const museum = (name: string): string => fileURLToPath(new URL(
  `../../../pcp/tests/upstream/fixtures/compositionResults/testPcpMuseum_${name}.testenv/${name}/`,
  import.meta.url,
))

function cacheOf(stage: Stage): PcpCache {
  return (stage as unknown as { _pcpCache: PcpCache })._pcpCache
}

function errorsOf(stage: Stage, type: PcpErrorType): PcpError[] {
  const errors: PcpError[] = []
  cacheOf(stage).forEachPrimIndex(index => {
    errors.push(...index.localErrors.filter(error => error.errorType === type))
  })
  return [...new Set(errors)]
}

function opinionRoots(stage: Stage): string[] {
  return errorsOf(stage, PcpErrorType.OpinionAtRelocationSource)
    .map(error => error.rootSite.path).sort()
}

describe('OpenUSD v26.08 Pcp museum internal correspondence', () => {
  it('retains the exact arc-cycle root sites', async () => {
    const stage = (await Stage.open(`${museum('ErrorArcCycle')}root.usda`))!
    expect(errorsOf(stage, PcpErrorType.ArcCycle).map(error =>
      error.rootSite.path).sort()).toEqual([
      '/AnotherParent/AnotherChild/AnotherChild',
      '/CoRecursiveParent1/Child1/Child2',
      '/CoRecursiveParent2/Child2/Child1',
      '/GroupRoot', '/InheritOfChild', '/Parent/Child1', '/Parent/Child2',
      '/RelocatedInheritOfChild/Child', '/RelocatedInheritOfChild/Object',
      '/YetAnotherParent/Child',
    ])
  })

  it('reports relocation-source opinions at their outer composed roots', async () => {
    const stage = (await Stage.open(
      `${museum('TrickyInheritsAndRelocatesToNewRootPrim')}root.usda`))!
    expect(opinionRoots(stage)).toEqual([
      '/Model_Renamed', '/Model_Renamed', '/Model_Renamed', '/Model_Renamed',
      '/Rig/Anim/RigInstance', '/RigClass',
    ])
  })

  it('attributes inherited relocation-source opinions to the relocation target', async () => {
    const stage = (await Stage.open(`${museum('TrickyInheritsAndRelocates')}root.usda`))!
    expect(opinionRoots(stage)).toEqual([
      '/Group/Model_Renamed', '/Group/Model_Renamed',
      '/Group/Model_Renamed', '/Group/Model_Renamed',
      '/Rig/Anim/RigClass', '/Rig/Anim/RigClass',
    ])
  })

  it('attributes variant relocation-source opinions to the relocated sibling', async () => {
    const stage = (await Stage.open(`${museum('ErrorOpinionAtRelocationSource')}root.usda`))!
    expect(opinionRoots(stage)).toEqual([
      '/CharRig/Anim/Path',
      '/VariantAtRelocateSource/Sibling', '/VariantAtRelocateSource/Sibling',
    ])
  })

  it('keeps referenced relocation-source errors in their source indexes', async () => {
    const stage = (await Stage.open(`${museum('ErrorInvalidReferenceToRelocationSource')}root.usda`))!
    expect(opinionRoots(stage)).toEqual([
      '/Char/Relocated', '/Char/Relocated', '/ReferencedChar/Relocated',
    ])
  })

  it('filters inherited-class connections in the composed instance namespace', async () => {
    const stage = (await Stage.open(`${museum('ErrorInvalidInstanceTargetPath')}root.usda`))!
    expect(stage.getPrim('/ConnectionToLocalClass/Instance_1')!.getAttr('x')!.getConnections())
      .toEqual(['/ConnectionToLocalClass/Instance_2.y'])
    expect(stage.getPrim('/ConnectionToLocalClass/Instance_2')!.getAttr('x')!.getConnections())
      .toEqual(['/ConnectionToLocalClass/Instance_1.y'])
  })

  it('retains weaker conflicting property specs in the property stack', async () => {
    const stage = (await Stage.open(`${museum('ErrorInconsistentProperties')}root.usda`))!
    expect(stage.getPrim('/InconsistentPropertyType')!.getAttr('x')!.getPropertyStack()
      .map(entry => [entry.layerIdentifier.split('/').at(-1), entry.specPath]))
      .toEqual([
        ['root.usda', '/InconsistentPropertyType.x'],
        ['ref.usda', '/InconsistentPropType.x'],
      ])
  })

  it('assigns nested-instance prototype identities dependency-first', async () => {
    const stage = (await Stage.open(`${museum('BasicInstancingAndNestedInstances')}root.usda`))!
    expect(stage.getPrototypes().map(prim => [
      prim.path, stage.getAllChildPrimPaths(prim.path, { instanceProxies: true }),
    ])).toEqual([
      ['/__Prototype_1', ['/__Prototype_1/geom']],
      ['/__Prototype_2', [
        '/__Prototype_2/PropInstance_1',
        '/__Prototype_2/PropInstance2',
        '/__Prototype_2/PropNotAnInstance_1',
      ]],
    ])
  })

  it('retains provenance for descendants of every nested instance proxy', async () => {
    const stage = (await Stage.open(`${museum('BasicInstancingAndNestedInstances')}root.usda`))!
    expect(stage.getPrimStack('/Set_1/PropInstance2/geom').map(entry => [
      entry.layerIdentifier.split('/').at(-1), entry.specPath,
    ])).toEqual([['prop.usda', '/Prop/geom']])
  })
})
