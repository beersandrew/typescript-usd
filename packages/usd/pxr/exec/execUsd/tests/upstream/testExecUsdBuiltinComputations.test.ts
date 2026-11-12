// Ported from OpenUSD 26.11.1:
//  pxr/exec/execUsd/testenv/testExecUsdBuiltinComputations.cpp,
//  pxr/base/tf/ostreamMethods.h
// Copyright 2016, 2026 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.11.1 pxr/exec/execUsd/testenv/testExecUsdBuiltinComputations.cpp
//
// The codeless test schema is registered from the upstream testenv
// resources (fixtures/testExecUsdBuiltinComputations/resources), as main()
// does with PlugRegistry::RegisterPlugins. Each upstream test function runs
// with a new Fixture, as main() does; opening a stage is asynchronous here,
// so NewSystemFromLayer is awaited. TfStringify of an SdfPath is its path
// string, and of an SdfPathVector is the ostreamMethods.h form
// (testHelpers.ts _OstreamPathVector). Assigning a new request to `request`
// is ExecUsdRequest's move assignment: the new request replaces the old,
// which is destroyed. Scope-end destructors are Destroy().

import { describe, expect, it } from 'vitest'
import { TF_AXIOM, Type as TfType } from 'typescript-usd/tf'
import { ValueTypes as VtValueTypes } from 'typescript-usd/vt'
import { SdfPath } from 'typescript-usd/sdf/path'
import { NamespaceEditor as UsdNamespaceEditor, type Stage as UsdStage } from 'typescript-usd/usd'
import type { VdfContext } from 'typescript-usd/vdf'
import { VdfReadIteratorRange } from 'typescript-usd/vdf'
import {
  Computation, Connections, EXEC_REGISTER_COMPUTATIONS_FOR_SCHEMA, ExecBuiltinComputations,
  NamespaceAncestor, SdfPathType,
} from 'typescript-usd/exec'
import { ExecUsdSystem } from '../../src/system.ts'
import { ExecUsdValueKey } from '../../src/valueKey.ts'
import { _OpenStage, _OstreamPathVector, _RegisterTestResources } from '../testHelpers.ts'

const T = VtValueTypes

// TF_DEFINE_PRIVATE_TOKENS
const _tokens = {
  attr: 'attr',
  computeAttributePath: 'computeAttributePath',
  computeConnectionPaths: 'computeConnectionPaths',
  computeParentPrimPath: 'computeParentPrimPath',
  computePrimPath: 'computePrimPath',
  computeRelationshipPath: 'computeRelationshipPath',
  inputName: 'inputName',
} as const

function _PathAsString(ctx: VdfContext): string {
  const range = new VdfReadIteratorRange<SdfPath>(SdfPathType, ctx, _tokens.inputName)
  const paths: SdfPath[] = [...range]
  return paths.length === 1 ? paths[0]!.pathString : _OstreamPathVector(paths)
}

EXEC_REGISTER_COMPUTATIONS_FOR_SCHEMA('TestExecUsdBuiltinComputationsCustomSchema', (self) => {
  self.primComputation(_tokens.computePrimPath)
    .Callback(T.string, _PathAsString)
    .inputs(
      Computation(SdfPathType, ExecBuiltinComputations.computePath)
        .inputName(_tokens.inputName),
    )

  self.primComputation(_tokens.computeParentPrimPath)
    .Callback(T.string, _PathAsString)
    .inputs(
      NamespaceAncestor(SdfPathType, ExecBuiltinComputations.computePath)
        .inputName(_tokens.inputName),
    )

  self.attributeComputation(_tokens.attr, _tokens.computeAttributePath)
    .Callback(T.string, _PathAsString)
    .inputs(
      Computation(SdfPathType, ExecBuiltinComputations.computePath)
        .inputName(_tokens.inputName),
    )

  self.attributeComputation(_tokens.attr, _tokens.computeConnectionPaths)
    .Callback(T.string, _PathAsString)
    .inputs(
      Connections(SdfPathType, ExecBuiltinComputations.computePath)
        .inputName(_tokens.inputName),
    )
})

class Fixture {
  stage!: UsdStage
  namespaceEditor: UsdNamespaceEditor | undefined
  private _system: ExecUsdSystem | undefined

  async newSystemFromLayer(layerContents: string): Promise<ExecUsdSystem> {
    TF_AXIOM(!this._system)

    this.stage = await _OpenStage(layerContents)
    TF_AXIOM(this.stage)
    this.namespaceEditor = new UsdNamespaceEditor(this.stage)
    this._system = new ExecUsdSystem(this.stage)

    return this._system
  }

  // ~Fixture
  destroy(): void {
    this._system?.destroy()
  }
}

// main(): load the custom schema.
{
  const testPlugins = _RegisterTestResources('testExecUsdBuiltinComputations')
  expect(testPlugins.length).toBe(1)
  expect(testPlugins[0]!.getName()).toBe('testExecUsdBuiltinComputations')

  const customSchemaType =
    TfType.findByName('TestExecUsdBuiltinComputationsCustomSchema')
  TF_AXIOM(!customSchemaType.isUnknown())
}

describe('testExecUsdBuiltinComputations', () => {
  it('TestComputePath', async () => {
    const fixture = new Fixture()
    const system = await fixture.newSystemFromLayer(`#usda 1.0
        def Scope "Parent" {
            string customAttr
            def CustomSchema "Prim" {
                string attr.connect = [
                    </Parent.customAttr>, </Parent/Prim.customAttr>]
                string customAttr
            }
        }

        def Scope "NewParent" {
        }
    `)

    let prim = fixture.stage.getPrim('/Parent/Prim')!
    TF_AXIOM(prim)
    let attr = prim.getAttr('attr')!
    TF_AXIOM(attr.isValid())
    let customAttr = prim.getAttr('customAttr')!
    TF_AXIOM(customAttr.isValid())
    const parentCustomAttr =
      fixture.stage.getAttributeAtPath('/Parent.customAttr')!
    TF_AXIOM(parentCustomAttr)

    let request = system.buildRequest([
      new ExecUsdValueKey(prim, _tokens.computePrimPath),
      new ExecUsdValueKey(prim, _tokens.computeParentPrimPath),
      new ExecUsdValueKey(attr, _tokens.computeAttributePath),
      new ExecUsdValueKey(attr, _tokens.computeConnectionPaths),
    ])

    const validateResults = (): void => {
      const view = system.compute(request)
      let index = 0

      let v = view.Get(index++)
      TF_AXIOM(v.IsHolding(T.string))
      expect(v.Get<string>()).toBe(prim.path)

      v = view.Get(index++)
      TF_AXIOM(v.IsHolding(T.string))
      expect(v.Get<string>()).toBe(prim.getParent()!.path)

      v = view.Get(index++)
      TF_AXIOM(v.IsHolding(T.string))
      expect(v.Get<string>()).toBe(attr.getPath())

      // TODO: We should revisit the question of whether the correct result
      // here is the path of the connections themselves or the paths of the
      // targeted attributes, which is what we currently produce and verify
      // here.
      v = view.Get(index++)
      TF_AXIOM(v.IsHolding(T.string))
      expect(v.Get<string>()).toBe(
        _OstreamPathVector([
          SdfPath.fromString(parentCustomAttr.getPath()),
          SdfPath.fromString(customAttr.getPath())]))
    }

    validateResults()

    // Reparent the prim to a different ancestor. This is a resync on the
    // prim, but not on the original ancestor that provided the input value.
    fixture.namespaceEditor!.reparentPrim(
      prim,
      fixture.stage.getPrim('/NewParent'))
    fixture.namespaceEditor!.applyEdits()

    prim = fixture.stage.getPrim('/NewParent/Prim')!
    TF_AXIOM(prim)
    attr = prim.getAttr('attr')!
    TF_AXIOM(attr.isValid())
    customAttr = prim.getAttr('customAttr')!
    TF_AXIOM(customAttr.isValid())

    // TODO: When we add special handling for namespace edits, instead of
    // treating them as resyncs, we won't need to re-build the request.
    {
      // ExecUsdRequest::operator=(ExecUsdRequest &&): the moved-from impl is
      // taken, then the old impl is destroyed.
      const newRequest = system.buildRequest([
        new ExecUsdValueKey(prim, _tokens.computePrimPath),
        new ExecUsdValueKey(prim, _tokens.computeParentPrimPath),
        new ExecUsdValueKey(attr, _tokens.computeAttributePath),
        new ExecUsdValueKey(attr, _tokens.computeConnectionPaths),
      ])
      request.destroy()
      request = newRequest
    }

    validateResults()

    request.destroy()
    fixture.destroy()
  })
})
