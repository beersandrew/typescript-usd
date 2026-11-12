// Ported from OpenUSD 26.11.1:
//  pxr/exec/execUsd/testenv/testExecUsdUncompilation.cpp
// Copyright 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.11.1 pxr/exec/execUsd/testenv/testExecUsdUncompilation.cpp
//
// The codeless test schema is registered from the upstream testenv
// resources (fixtures/testExecUsdUncompilation/resources), as main() does
// with PlugRegistry::RegisterPlugins. Each upstream test function runs with a
// new Fixture, as main() does; opening a stage is asynchronous here, so
// NewSystemFromLayer is awaited, and so is UsdPrim::SetActive.
//
// The registered test (pxr/exec/execUsd/CMakeLists.txt:449-471) runs the
// program, normalizes the 8 .dot files that the test functions write with
// normalizeDotFiles.py, and DIFF_COMPAREs each .out with the baseline
// (fixtures/testExecUsdUncompilation/baseline). Here each test function
// writes its .dot files to a fresh temporary directory, and its it() ends
// with the normalization and comparison of those files
// (testHelpers.ts _DiffCompare).
//
// Scope-end destructors are Destroy().

import { join } from 'node:path'
import { describe, it } from 'vitest'
import { TF_AXIOM, Type as TfType } from 'typescript-usd/tf'
import { ValueTypes as VtValueTypes } from 'typescript-usd/vt'
import { NamespaceEditor as UsdNamespaceEditor, type Stage as UsdStage } from 'typescript-usd/usd'
import type { VdfContext } from 'typescript-usd/vdf'
import {
  AttributeValue, EXEC_REGISTER_COMPUTATIONS_FOR_SCHEMA, ExecSystem, NamespaceAncestor,
} from 'typescript-usd/exec'
import { ExecUsdSystem } from '../../src/system.ts'
import { ExecUsdValueKey } from '../../src/valueKey.ts'
import { _DiffCompare, _MakeTestDirectory, _OpenStage, _RegisterTestResources } from '../testHelpers.ts'

const T = VtValueTypes
const testName = 'testExecUsdUncompilation'

// TF_DEFINE_PRIVATE_TOKENS
const _tokens = {
  constantComputation: 'constantComputation',
  usesAttributeValue: 'usesAttributeValue',
  usesNamespaceAncestor: 'usesNamespaceAncestor',
  inputName: 'inputName',
  customAttr: 'customAttr',
} as const

function _CommonComputationCallback(ctx: VdfContext): number {
  const inputValue = ctx.getInputValuePtr<number>(T.int, _tokens.inputName)
  return inputValue !== null ? inputValue : 0
}

EXEC_REGISTER_COMPUTATIONS_FOR_SCHEMA('TestExecUsdUncompilationCustomSchema', (self) => {
  self.primComputation(_tokens.constantComputation)
    .Callback(T.int, (_ctx: VdfContext) => { return 42 })

  self.primComputation(_tokens.usesAttributeValue)
    .Callback(T.int, _CommonComputationCallback)
    .inputs(
      AttributeValue(T.int, _tokens.customAttr)
        .inputName(_tokens.inputName))

  self.primComputation(_tokens.usesNamespaceAncestor)
    .Callback(T.int, _CommonComputationCallback)
    .inputs(
      NamespaceAncestor(T.int, _tokens.constantComputation)
        .inputName(_tokens.inputName))
})

class Fixture {
  // The test's working directory, where GraphNetwork writes.
  readonly directory = _MakeTestDirectory(testName)
  // The .dot files written, for DIFF_COMPARE.
  readonly graphs: string[] = []

  private _stage!: UsdStage
  private _namespaceEditor: UsdNamespaceEditor | undefined
  private _system: ExecUsdSystem | undefined

  async newSystemFromLayer(layerContents: string): Promise<ExecUsdSystem> {
    TF_AXIOM(!this._system)

    this._stage = await _OpenStage(layerContents)
    TF_AXIOM(this._stage)
    this._namespaceEditor = new UsdNamespaceEditor(this._stage)
    this._system = new ExecUsdSystem(this._stage)

    return this._system
  }

  getPrimAtPath(pathStr: string) {
    return this._stage.getPrim(pathStr)!
  }

  getAttributeAtPath(pathStr: string) {
    return this._stage.getAttributeAtPath(pathStr)!
  }

  getNamespaceEditor(): UsdNamespaceEditor {
    return this._namespaceEditor!
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

// main(): load the custom schema.
{
  const testPlugins = _RegisterTestResources(testName)
  TF_AXIOM(testPlugins.length === 1)
  TF_AXIOM(testPlugins[0]!.getName() === 'testExecUsdUncompilation')

  const customSchemaType =
    TfType.findByName('TestExecUsdUncompilationCustomSchema')
  TF_AXIOM(!customSchemaType.isUnknown())
}

describe('testExecUsdUncompilation', () => {
  it('TestUncompileConstantComputation', async () => {
    const fixture = new Fixture()
    const system = await fixture.newSystemFromLayer(`#usda 1.0
        def CustomSchema "Provider1" {
        }

        def CustomSchema "Provider2" {
        }
    `)

    const request = system.buildRequest([
      new ExecUsdValueKey(fixture.getPrimAtPath('/Provider1'), _tokens.constantComputation),
      new ExecUsdValueKey(fixture.getPrimAtPath('/Provider2'), _tokens.constantComputation),
    ])
    system.prepareRequest(request)
    fixture.graphNetwork('TestUncompileConstantComputation-compiled.dot')

    // Resync Provider1. Nodes contributing to the first value key should be
    // uncompiled, but nodes contributing to the second value key should not.
    await fixture.getPrimAtPath('/Provider1').setActive(false)

    fixture.graphNetwork('TestUncompileConstantComputation-uncompiled.dot')

    request.destroy()
    fixture.destroy()
    fixture.diffCompare()
  })

  it('TestUncompileAttributeInput', async () => {
    const fixture = new Fixture()
    const system = await fixture.newSystemFromLayer(`#usda 1.0
        def CustomSchema "AttributeOwner" {
            int customAttr = 42
        }
    `)

    const request = system.buildRequest([
      new ExecUsdValueKey(fixture.getPrimAtPath('/AttributeOwner'), _tokens.usesAttributeValue),
    ])
    system.prepareRequest(request)
    fixture.graphNetwork('TestUncompileAttributeInput-compiled.dot')

    // Resync the custom attribute. The provider for 'usesAttributeValue' was
    // not resynced, so its callback node and leaf node will still exist. But,
    // the attribute input node feeding into the callback node should have
    // been uncompiled.
    fixture.getPrimAtPath('/AttributeOwner')
      .removeProperty(_tokens.customAttr)
    fixture.graphNetwork('TestUncompileAttributeInput-uncompiled.dot')

    request.destroy()
    fixture.destroy()
    fixture.diffCompare()
  })

  it('TestUncompileNamespaceAncestorInput', async () => {
    const fixture = new Fixture()
    const system = await fixture.newSystemFromLayer(`#usda 1.0
        def CustomSchema "Ancestor" {
            def Scope "Scope1" {
                def Scope "Scope2" {
                    def CustomSchema "Provider" {
                    }
                }
            }
        }
        def CustomSchema "NewAncestor" {
        }
    `)

    const providerPath = '/Ancestor/Scope1/Scope2/Provider'
    const request = system.buildRequest([
      new ExecUsdValueKey(fixture.getPrimAtPath(providerPath), _tokens.usesNamespaceAncestor),
    ])
    system.prepareRequest(request)
    fixture.graphNetwork('TestUncompileNamespaceAncestorInput-compiled.dot')

    // Reparent the provider to a different ancestor. This is a resync on the
    // provider, but not on the original ancestor that provided the input
    // value.
    fixture.getNamespaceEditor().reparentPrim(
      fixture.getPrimAtPath(providerPath),
      fixture.getPrimAtPath('/NewAncestor'))
    fixture.getNamespaceEditor().applyEdits()
    fixture.graphNetwork('TestUncompileNamespaceAncestorInput-uncompiled.dot')

    request.destroy()
    fixture.destroy()
    fixture.diffCompare()
  })

  it('TestUncompileRecursiveResync', async () => {
    const fixture = new Fixture()
    const system = await fixture.newSystemFromLayer(`#usda 1.0
        def Scope "Root1" {
            def CustomSchema "A" {
                def CustomSchema "B" {
                    int customAttr = 10
                }
            }
        }
        def Scope "Root2" {
            def CustomSchema "C" {
            }
        }
    `)

    const request = system.buildRequest([
      new ExecUsdValueKey(fixture.getPrimAtPath('/Root1/A/B'), _tokens.usesAttributeValue),
      new ExecUsdValueKey(fixture.getPrimAtPath('/Root1/A/B'), _tokens.constantComputation),
      new ExecUsdValueKey(fixture.getPrimAtPath('/Root1/A/B'), _tokens.usesNamespaceAncestor),
      new ExecUsdValueKey(fixture.getPrimAtPath('/Root2/C'), _tokens.constantComputation),
    ])
    system.prepareRequest(request)
    fixture.graphNetwork('TestUncompileRecursiveResync-compiled.dot')

    // Trigger a recursive resync on /Root1. This implies resyncs on all
    // descendants of /Root1. This will uncompile nodes for computations
    // whose providers are descendants of /Root1. But, nodes whose providers
    // are descendants of /Root2 should be unaffected.
    await fixture.getPrimAtPath('/Root1').setActive(false)
    fixture.graphNetwork('TestUncompileRecursiveResync-uncompiled.dot')

    request.destroy()
    fixture.destroy()
    fixture.diffCompare()
  })
})
