// Ported from OpenUSD 26.11.1:
//  pxr/exec/execUsd/testenv/testExecUsdRecompilation.cpp
// Copyright 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.11.1 pxr/exec/execUsd/testenv/testExecUsdRecompilation.cpp
//
// The codeless test schema is registered from the upstream testenv
// resources (fixtures/testExecUsdRecompilation/resources), as
// ConfigureTestPlugin does with PlugRegistry::RegisterPlugins. Each upstream
// test function runs with a new Fixture, as main() does; opening a stage is
// asynchronous here, so NewSystemFromLayer is awaited, and so is
// UsdPrim::SetActive.
//
// The registered test (pxr/exec/execUsd/CMakeLists.txt:324-378) runs the
// program, normalizes the 24 .dot files that the test functions write with
// normalizeDotFiles.py, and DIFF_COMPAREs each .out with the baseline
// (fixtures/testExecUsdRecompilation/baseline). Here each test function
// writes its .dot files to a fresh temporary directory, and its it() ends
// with the normalization and comparison of those files
// (testHelpers.ts _DiffCompare).
//
// SdfValueTypeNames->Int is 'int'; UsdListPositionBackOfAppendList is
// ListPositionBackOfAppendList. ASSERT_EQ is expect; scope-end destructors
// are Destroy().

import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { TF_AXIOM } from 'typescript-usd/tf'
import { ValueTypes as VtValueTypes } from 'typescript-usd/vt'
import {
  ListPositionBackOfAppendList as UsdListPositionBackOfAppendList, type Stage as UsdStage,
} from 'typescript-usd/usd'
import type { VdfContext } from 'typescript-usd/vdf'
import { VdfReadIterator } from 'typescript-usd/vdf'
import {
  AttributeValue, EXEC_REGISTER_COMPUTATIONS_FOR_SCHEMA, ExecBuiltinComputations, ExecSystem,
  NamespaceAncestor, Relationship,
} from 'typescript-usd/exec'
import { ExecUsdSystem } from '../../src/system.ts'
import type { ExecUsdRequest } from '../../src/request.ts'
import { ExecUsdValueKey } from '../../src/valueKey.ts'
import { _DiffCompare, _MakeTestDirectory, _OpenStage, _RegisterTestResources } from '../testHelpers.ts'

const T = VtValueTypes
const testName = 'testExecUsdRecompilation'

// TF_DEFINE_PRIVATE_TOKENS
const _tokens = {
  computeOnNamespaceAncestor: 'computeOnNamespaceAncestor',
  computeUsingCustomAttr: 'computeUsingCustomAttr',
  computeUsingCustomRel: 'computeUsingCustomRel',
  computeUsingDuplicateInputNames: 'computeUsingDuplicateInputNames',
  customAttr: 'customAttr',
  customRel: 'customRel',
  customRel2: 'customRel2',
} as const

function ConfigureTestPlugin(): void {
  const testPlugins = _RegisterTestResources(testName)

  TF_AXIOM(testPlugins.length === 1)
  TF_AXIOM(testPlugins[0]!.getName() === 'testExecUsdRecompilation')
}

function CommonComputationCallback(_ctx: VdfContext): number {
  return 42
}

EXEC_REGISTER_COMPUTATIONS_FOR_SCHEMA('TestExecUsdRecompilationCustomSchema', (self) => {
  // A computation that depends on customAttr only.
  self.primComputation(_tokens.computeUsingCustomAttr)
    .Callback(T.int, (context: VdfContext) => {
      const valuePtr =
        context.getInputValuePtr<number>(T.int, _tokens.customAttr)
      return valuePtr !== null ? valuePtr : -1
    })
    .inputs(
      AttributeValue(T.int, _tokens.customAttr))

  // A computation that depends on the targets of customRel.
  self.primComputation(_tokens.computeUsingCustomRel)
    .Callback(T.int, (context: VdfContext) => {
      let result = 0
      const it = new VdfReadIterator<number>(
        T.int, context, ExecBuiltinComputations.computeValue)
      for (; !it.isAtEnd(); it.increment()) {
        result += it.deref()
      }
      return result
    })
    .inputs(
      Relationship(_tokens.customRel)
        .targetedObjects(T.int, ExecBuiltinComputations.computeValue))

  // A computation that depends on the namespace ancestor.
  self.primComputation(_tokens.computeOnNamespaceAncestor)
    .Callback(T.int, CommonComputationCallback)
    .inputs(
      NamespaceAncestor(T.int, _tokens.computeOnNamespaceAncestor))

  // A computation that uses two inputs of the same name and type.
  self.primComputation(_tokens.computeUsingDuplicateInputNames)
    .Callback(T.string, (context: VdfContext) => {
      let result = ''
      const it = new VdfReadIterator<string>(T.string, context,
        ExecBuiltinComputations.computeValue)
      for (; !it.isAtEnd(); it.increment()) {
        result += it.deref()
      }
      return result
    })
    .inputs(
      // Both inputs are named 'computeValue'
      Relationship(_tokens.customRel).targetedObjects(
        T.string, ExecBuiltinComputations.computeValue),
      Relationship(_tokens.customRel2).targetedObjects(
        T.string, ExecBuiltinComputations.computeValue),
    )
})

class Fixture {
  // The test's working directory, where GraphNetwork writes.
  readonly directory = _MakeTestDirectory(testName)
  // The .dot files written, for DIFF_COMPARE.
  readonly graphs: string[] = []

  private _stage!: UsdStage
  private _system: ExecUsdSystem | undefined

  async newSystemFromLayer(layerContents: string): Promise<ExecUsdSystem> {
    TF_AXIOM(!this._system)

    this._stage = await _OpenStage(layerContents)
    TF_AXIOM(this._stage)
    this._system = new ExecUsdSystem(this._stage)

    return this._system
  }

  buildRequest(valueKeys: ExecUsdValueKey[]): ExecUsdRequest {
    return this._system!.buildRequest(
      valueKeys)
  }

  getStage(): UsdStage {
    return this._stage
  }

  getPrimAtPath(pathStr: string) {
    return this._stage.getPrim(pathStr)!
  }

  getAttributeAtPath(pathStr: string) {
    return this._stage.getAttributeAtPath(pathStr)!
  }

  getRelationshipAtPath(pathStr: string) {
    return this._stage.getRelationshipAtPath(pathStr)!
  }

  graphNetwork(filename: string): void {
    const diagnostics = new ExecSystem.Diagnostics(this._system!)
    diagnostics.graphNetwork(join(this.directory, filename))
    this.graphs.push(filename)
  }

  // ~Fixture
  destroy(): void {
    this._system?.destroy()
  }

  // POST_COMMAND normalizeDotFiles.py <file>.dot; DIFF_COMPARE <file>.out
  diffCompare(): void {
    for (const filename of this.graphs) {
      _DiffCompare(testName, this.directory, filename.replace(/\.dot$/, ''))
    }
  }
}

ConfigureTestPlugin()

// The it()s run in main()'s order.
describe('testExecUsdRecompilation', () => {
  // Tests that we recompile a disconnected attribute input, when that
  // attribute comes into existence.
  //
  it('TestRecompileDisconnectedAttributeInput', async () => {
    const fixture = new Fixture()
    const system = await fixture.newSystemFromLayer(`#usda 1.0
        def CustomSchema "Prim" {
        }
    `)

    // Compile a leaf node and callback node for `computeUsingCustomAttr`.
    // The callback node's input for `customAttr` is disconnected because the
    // attribute does not exist.
    const request = fixture.buildRequest([
      new ExecUsdValueKey(fixture.getPrimAtPath('/Prim'), _tokens.computeUsingCustomAttr),
    ])
    system.prepareRequest(request)
    fixture.graphNetwork('TestRecompileDisconnectedAttributeInput-1.dot')
    {
      const view = system.compute(request)
      const v = view.Get(0)
      TF_AXIOM(!v.IsEmpty())
      TF_AXIOM(v.Get<number>() === -1)
    }

    // Create the attribute. The next round of compilation should compile
    // and connect the `customAttr` input of the callback node.
    const attr = fixture.getPrimAtPath('/Prim').createAttribute(
      _tokens.customAttr, 'int')
    attr.set(2)
    system.prepareRequest(request)
    fixture.graphNetwork('TestRecompileDisconnectedAttributeInput-2.dot')
    {
      const view = system.compute(request)
      const v = view.Get(0)
      TF_AXIOM(!v.IsEmpty())
      TF_AXIOM(v.Get<number>() === 2)
    }

    // Delete the attribute. The next round of compilation should uncompile
    // the attribute input node--but it should *not* uncompile the time input
    // node.
    const layer = fixture.getStage().getRootLayer()
    TF_AXIOM(layer)
    layer.importFromString(`#usda 1.0
        def CustomSchema "Prim" {
        }
    `)
    system.prepareRequest(request)
    fixture.graphNetwork('TestRecompileDisconnectedAttributeInput-3.dot')
    {
      const view = system.compute(request)
      const v = view.Get(0)
      TF_AXIOM(!v.IsEmpty())
      TF_AXIOM(v.Get<number>() === -1)
    }

    request.destroy()
    fixture.destroy()
    fixture.diffCompare()
  })

  // Tests that when we recompile a network, we recompile all inputs that
  // require recompilation, even those that do not contribute to the request
  // being compiled.
  //
  it('TestRecompileMultipleRequests', async () => {
    const fixture = new Fixture()
    const system = await fixture.newSystemFromLayer(`#usda 1.0
        def CustomSchema "Prim1" {
            int customAttr = 10
        }
        def CustomSchema "Prim2" {
            int customAttr = 20
        }
    `)

    const prim1 = fixture.getPrimAtPath('/Prim1')
    const prim2 = fixture.getPrimAtPath('/Prim2')

    // Make 2 requests.
    const request1 = fixture.buildRequest([
      new ExecUsdValueKey(prim1, _tokens.computeUsingCustomAttr),
    ])
    const request2 = fixture.buildRequest([
      new ExecUsdValueKey(prim2, _tokens.computeUsingCustomAttr),
    ])

    // Compile the requests.
    system.prepareRequest(request1)
    system.prepareRequest(request2)
    fixture.graphNetwork('TestRecompileMultipleRequests-1.dot')

    // Remove the custom attributes. This will uncompile both attribute input
    // nodes.
    prim1.removeProperty(_tokens.customAttr)
    prim2.removeProperty(_tokens.customAttr)
    fixture.graphNetwork('TestRecompileMultipleRequests-2.dot')

    // Re-add both attributes.
    prim1.createAttribute(_tokens.customAttr, 'int')
    prim2.createAttribute(_tokens.customAttr, 'int')

    // By preparing just one of the requests, all inputs should be
    // recompiled, even those that only contribute to the other request.
    system.prepareRequest(request1)
    fixture.graphNetwork('TestRecompileMultipleRequests-3.dot')

    request2.destroy()
    request1.destroy()
    fixture.destroy()
    fixture.diffCompare()
  })

  // Tests that inputs which depend on relationship targets are recompiled
  // when the set of targets changes.
  //
  it('TestRecompileChangedRelationshipTargets', async () => {
    const fixture = new Fixture()
    const system = await fixture.newSystemFromLayer(`#usda 1.0
        def CustomSchema "Prim" {
            add rel customRel = [</Prim.forwardingRel>, </C.customAttr>]
            add rel forwardingRel
        }
        def Scope "A" {
            int customAttr = 1
        }
        def Scope "B" {
            int customAttr = 2
        }
        def Scope "C" {
        }
    `)

    const request = fixture.buildRequest([
      new ExecUsdValueKey(fixture.getPrimAtPath('/Prim'), _tokens.computeUsingCustomRel),
    ])
    system.prepareRequest(request)
    fixture.graphNetwork('TestRecompileChangedRelationshipTargets-1.dot')
    {
      const view = system.compute(request)
      const v = view.Get(0)
      TF_AXIOM(!v.IsEmpty())
      TF_AXIOM(v.Get<number>() === 0)
    }

    // Create a second target.
    fixture.getRelationshipAtPath('/Prim.customRel').addTarget(
      '/A.customAttr')
    system.prepareRequest(request)
    fixture.graphNetwork('TestRecompileChangedRelationshipTargets-2.dot')
    {
      const view = system.compute(request)
      const v = view.Get(0)
      TF_AXIOM(!v.IsEmpty())
      TF_AXIOM(v.Get<number>() === 1)
    }

    // Add a second target on the forwarding relationship.
    fixture.getRelationshipAtPath('/Prim.forwardingRel').addTarget(
      '/B.customAttr')
    system.prepareRequest(request)
    fixture.graphNetwork('TestRecompileChangedRelationshipTargets-3.dot')
    {
      const view = system.compute(request)
      const v = view.Get(0)
      TF_AXIOM(!v.IsEmpty())
      TF_AXIOM(v.Get<number>() === 3)
    }

    // Create the missing 'customAttr' on prim C.
    const primC = fixture.getPrimAtPath('/C')
    TF_AXIOM(primC)
    const attr =
      primC.createAttribute(_tokens.customAttr, 'int')
    attr.set(3)
    system.prepareRequest(request)
    fixture.graphNetwork('TestRecompileChangedRelationshipTargets-4.dot')
    {
      const view = system.compute(request)
      const v = view.Get(0)
      TF_AXIOM(!v.IsEmpty())
      TF_AXIOM(v.Get<number>() === 6)
    }

    // Clear all targets.
    fixture.getRelationshipAtPath('/Prim.customRel')
      .clearTargets(/* removeSpec */ true)
    system.prepareRequest(request)
    fixture.graphNetwork('TestRecompileChangedRelationshipTargets-5.dot')
    {
      const view = system.compute(request)
      const v = view.Get(0)
      TF_AXIOM(!v.IsEmpty())
      TF_AXIOM(v.Get<number>() === 0)
    }

    request.destroy()
    fixture.destroy()
    fixture.diffCompare()
  })

  // Tests that changes to objects that were previously targeted by a
  // relationship (but are no longer targeted) do not cause uncompilation of
  // inputs that depend on the new targets of that relationship.
  //
  it('TestRecompileAfterChangingOldRelationshipTarget', async () => {
    const fixture = new Fixture()
    const system = await fixture.newSystemFromLayer(`#usda 1.0
        def CustomSchema "Prim" {
            add rel customRel = [</X.attr>, </Y.attr>, </Z.attr>]
        }
        def Scope "X" {
            int attr = 1
        }
        def Scope "Y" {
            int attr = 2
        }
        def Scope "Z" {
            int attr = 3
        }
    `)

    const request = fixture.buildRequest([
      new ExecUsdValueKey(fixture.getPrimAtPath('/Prim'), _tokens.computeUsingCustomRel),
    ])

    // Compile the network.
    system.prepareRequest(request)
    fixture.graphNetwork(
      'TestRecompileAfterChangingOldRelationshipTarget-1.dot')
    {
      const view = system.compute(request)
      const v = view.Get(0)
      TF_AXIOM(!v.IsEmpty())
      TF_AXIOM(v.Get<number>() === 6)
    }

    // Remove <X.attr> as a relationship target. This will disconnect all
    // VdfConnections to the callback node input.
    fixture.getRelationshipAtPath('/Prim.customRel').removeTarget(
      '/X.attr')
    fixture.graphNetwork(
      'TestRecompileAfterChangingOldRelationshipTarget-2.dot')

    // Re-compile the network.
    system.prepareRequest(request)
    fixture.graphNetwork(
      'TestRecompileAfterChangingOldRelationshipTarget-3.dot')
    {
      const view = system.compute(request)
      const v = view.Get(0)
      TF_AXIOM(!v.IsEmpty())
      TF_AXIOM(v.Get<number>() === 5)
    }

    // Deactivate </X>. This should not affect the compiled network because
    // <X.attr>'s computeValue is no longer connected to the callback node.
    await fixture.getPrimAtPath('/X').setActive(false)
    fixture.graphNetwork(
      'TestRecompileAfterChangingOldRelationshipTarget-4.dot')
    {
      const view = system.compute(request)
      const v = view.Get(0)
      TF_AXIOM(!v.IsEmpty())
      TF_AXIOM(v.Get<number>() === 5)
    }

    request.destroy()
    fixture.destroy()
    fixture.diffCompare()
  })

  // Tests that when we recompile a network, we delete nodes and connections
  // that become isolated during uncompilation and remain isolated after
  // recompilation.
  //
  it('TestRecompileDeletedPrim', async () => {
    const fixture = new Fixture()
    const system = await fixture.newSystemFromLayer(`#usda 1.0
        def CustomSchema "Prim1" {
            def CustomSchema "Prim2" {
            }
        }
        def CustomSchema "Prim3" {
        }
    `)

    const prim2 = fixture.getPrimAtPath('/Prim1/Prim2')
    const prim3 = fixture.getPrimAtPath('/Prim3')

    // Make 2 requests.
    const request1 = fixture.buildRequest([
      new ExecUsdValueKey(prim2, _tokens.computeOnNamespaceAncestor),
    ])
    const request2 = fixture.buildRequest([
      new ExecUsdValueKey(prim3, _tokens.computeOnNamespaceAncestor),
    ])

    // Compile the requests.
    system.prepareRequest(request1)
    system.prepareRequest(request2)
    fixture.graphNetwork('TestRecompileDeletedPrim-1.dot')

    // Remove Prim2
    const layer = fixture.getStage().getRootLayer()
    TF_AXIOM(layer)
    layer.importFromString(`#usda 1.0
        def CustomSchema "Prim1" {
        }
        def CustomSchema "Prim3" {
        }
    `)

    fixture.graphNetwork('TestRecompileDeletedPrim-2.dot')

    // Prepare only the request that still has a value key with a valid
    // provider.
    system.prepareRequest(request2)
    fixture.graphNetwork('TestRecompileDeletedPrim-3.dot')

    request2.destroy()
    request1.destroy()
    fixture.destroy()
    fixture.diffCompare()
  })

  // Tests that when a prim is resynced (but not deleted), we can recompile
  // value keys for that prim.
  //
  it('TestRecompileResyncedPrim', async () => {
    const fixture = new Fixture()
    const system = await fixture.newSystemFromLayer(`#usda 1.0
        def CustomSchema "Prim" {
            int customAttr = 1
        }
    `)

    const prim = fixture.getPrimAtPath('/Prim')

    // Request a computation on Prim.
    const request = fixture.buildRequest([
      new ExecUsdValueKey(prim, _tokens.computeUsingCustomAttr),
    ])

    // Compile and evaluate the request.
    system.prepareRequest(request)
    fixture.graphNetwork('TestRecompileResyncedPrim-1.dot')
    {
      const view = system.compute(request)
      const v = view.Get(0)
      TF_AXIOM(!v.IsEmpty())
      TF_AXIOM(v.Get<number>() === 1)
    }

    // Apply a schema to the prim. This produduces a resync event for the
    // prim, but the prim still exists.
    prim.addAppliedSchema('CustomAppliedSchema')
    fixture.graphNetwork('TestRecompileResyncedPrim-2.dot')

    // Compile a new request for the same value key. This should recompile
    // the leaf node because the prim still exists.
    system.prepareRequest(request)
    fixture.graphNetwork('TestRecompileResyncedPrim-3.dot')
    {
      const view = system.compute(request)
      const v = view.Get(0)
      TF_AXIOM(!v.IsEmpty())
      TF_AXIOM(v.Get<number>() === 1)
    }

    request.destroy()
    fixture.destroy()
    fixture.diffCompare()
  })

  it('TestRecompileDuplicateInputNames', async () => {
    const fixture = new Fixture()
    const system = await fixture.newSystemFromLayer(`#usda 1.0
        def CustomSchema "Prim" {
            add rel customRel = [</Targets.a>]
            add rel customRel2 = [</Targets.x>]
        }
        def Scope "Targets" {
            custom string a = "a"
            custom string b = "b"
            custom string x = "x"
            custom string y = "y"
        }
    `)

    const request = fixture.buildRequest([
      new ExecUsdValueKey(fixture.getPrimAtPath('/Prim'),
        _tokens.computeUsingDuplicateInputNames),
    ])

    // Compile and compute the request.
    system.prepareRequest(request)
    fixture.graphNetwork('TestRecompileDuplicateInputNames-1.dot')
    {
      const view = system.compute(request)
      const v = view.Get(0)
      TF_AXIOM(!v.IsEmpty())
      expect(v.Get<string>()).toBe('ax')
    }

    // Add a target to customRel. This affects the journal of the first input
    // registered as 'computeValue'. After recompilation, the computed value
    // should be greater to account for the new target.
    fixture.getRelationshipAtPath('/Prim.customRel')
      .addTarget('/Targets.b', UsdListPositionBackOfAppendList)
    system.prepareRequest(request)
    fixture.graphNetwork('TestRecompileDuplicateInputNames-2.dot')
    {
      const view = system.compute(request)
      const v = view.Get(0)
      TF_AXIOM(!v.IsEmpty())
      expect(v.Get<string>()).toBe('abx')
    }

    // Add a target to customRel2. This affects the journal of the second
    // input registered as 'computeValue'. After recompilation, the computed
    // value should be greater to account for the new target.
    fixture.getRelationshipAtPath('/Prim.customRel2')
      .addTarget('/Targets.y', UsdListPositionBackOfAppendList)
    system.prepareRequest(request)
    fixture.graphNetwork('TestRecompileDuplicateInputNames-3.dot')
    {
      const view = system.compute(request)
      const v = view.Get(0)
      TF_AXIOM(!v.IsEmpty())
      expect(v.Get<string>()).toBe('abxy')
    }

    request.destroy()
    fixture.destroy()
    fixture.diffCompare()
  })
})
