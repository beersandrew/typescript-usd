// Ported from OpenUSD 26.11.1:
//  pxr/exec/execUsd/testenv/testExecUsdMetadataInput.cpp
// Copyright 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.11.1 pxr/exec/execUsd/testenv/testExecUsdMetadataInput.cpp
//
// The codeless test schema is registered from the upstream testenv
// resources (fixtures/testExecUsdMetadataInput/resources), as main() does
// with PlugRegistry::RegisterPlugins. Opening a stage is asynchronous here
// (testHelpers.ts _OpenStage). SdfFieldKeys->Documentation is
// 'documentation'; UsdObject::GetMetadata(key, &value) is getMetadata(key),
// true when it gives a string. std::unordered_map<int, int> is a
// Map<number, number>. ASSERT_EQ is expect; scope-end destructors are
// Destroy() (TfErrorMark: Dispose()).

import { describe, expect, it } from 'vitest'
import { TF_AXIOM, TfErrorMark } from 'typescript-usd/tf'
import { ValueTypes as VtValueTypes } from 'typescript-usd/vt'
import type { EfTimeInterval } from 'typescript-usd/ef'
import type { VdfContext } from 'typescript-usd/vdf'
import { EXEC_REGISTER_COMPUTATIONS_FOR_SCHEMA, Metadata, Prim } from 'typescript-usd/exec'
import { ExecUsdSystem } from '../../src/system.ts'
import { ExecUsdValueKey } from '../../src/valueKey.ts'
import { _OpenStage, _RegisterTestResources } from '../testHelpers.ts'

const T = VtValueTypes

// SdfFieldKeys (pxr/usd/sdf/schema.h)
const SdfFieldKeys = { Documentation: 'documentation' } as const

// Structure for keeping track of invalidation state as received from request
// callback invocations.
//
class _InvalidationState {
  // Map from invalid index to number of times invalidated.
  indices = new Map<number, number>()

  // Number of times the callback has been invoked.
  numInvoked = 0

  // Reset the invalidation state.
  Reset(): void {
    this.indices.clear()
    this.numInvoked = 0
  }

  // The value invalidation callback invoked by the request.
  valueCalback(
    invalidIndices: ReadonlySet<number>,
    _invalidInterval: EfTimeInterval,
  ): void {
    // Add all invalid indices to the map and increment the invalidation
    // count for each entry.
    for (const i of invalidIndices) {
      this.indices.set(i, (this.indices.get(i) ?? 0) + 1)
    }

    // Increment the number of times the callback has been invoked.
    ++this.numInvoked
  }
}

// TF_DEFINE_PRIVATE_TOKENS
const _tokens = {
  attr: 'attr',
  bogusMetadataKey: 'bogusMetadataKey',
  computeBogusMetadata: 'computeBogusMetadata',
  computeDocumentationMetadata: 'computeDocumentationMetadata',
  computePrimDocumentationMetadata: 'computePrimDocumentationMetadata',
} as const

EXEC_REGISTER_COMPUTATIONS_FOR_SCHEMA(
  'TestExecUsdMetadataInputCustomSchema', (self) => {
    // A prim computation that computes the value of the 'documentation'
    // metadata.
    self.primComputation(
      _tokens.computeDocumentationMetadata)
      .Callback(T.string, (ctx: VdfContext) => {
        const valuePtr =
          ctx.getInputValuePtr<string>(T.string, SdfFieldKeys.Documentation)
        return valuePtr !== null ? valuePtr : '(no value)'
      })
      .inputs(
        Metadata(T.string, SdfFieldKeys.Documentation),
      )

    // An attribute computation that computes the value of the
    // 'documentation' metadata on the attribute.
    self.attributeComputation(
      _tokens.attr,
      _tokens.computeDocumentationMetadata)
      .Callback(T.string, (ctx: VdfContext) => {
        const valuePtr =
          ctx.getInputValuePtr<string>(T.string, SdfFieldKeys.Documentation)
        return valuePtr !== null ? valuePtr : '(no value)'
      })
      .inputs(
        Metadata(T.string, SdfFieldKeys.Documentation),
      )

    // An attribute computation that computes the value of the
    // 'documentation' metadata on the owning prim.
    self.attributeComputation(
      _tokens.attr,
      _tokens.computePrimDocumentationMetadata)
      .Callback(T.string, (ctx: VdfContext) => {
        const valuePtr =
          ctx.getInputValuePtr<string>(T.string, SdfFieldKeys.Documentation)
        return valuePtr !== null ? valuePtr : '(no value)'
      })
      .inputs(
        Prim().Metadata(T.string, SdfFieldKeys.Documentation),
      )

    //
    // Error cases
    //

    // A prim computation that attempts to compute metadata using an invalid
    // metadata key.
    self.primComputation(
      _tokens.computeBogusMetadata)
      .Callback(T.string, (ctx: VdfContext) => {
        const valuePtr =
          ctx.getInputValuePtr<string>(T.string, _tokens.bogusMetadataKey)
        return valuePtr !== null ? valuePtr : '(no value)'
      })
      .inputs(
        Metadata(T.string, _tokens.bogusMetadataKey),
      )
  })

// main(): load test custom schemas.
{
  const testPlugins = _RegisterTestResources('testExecUsdMetadataInput')
  expect(testPlugins.length).toBe(1)
  expect(testPlugins[0]!.getName()).toBe('testExecUsdMetadataInput')
}

describe('testExecUsdMetadataInput', () => {
  // Test the metadata computation input yield the expected values.
  it('TestMetadataBasic', async () => {
    const invalidation = new _InvalidationState()

    const usdStage = await _OpenStage(`#usda 1.0
        def CustomSchema "Prim" (
            doc = "prim documentation"
        ) {
            int attr (doc = "attribute documentation")
        }
    `)

    const execSystem = new ExecUsdSystem(usdStage)

    const prim = usdStage.getPrim('/Prim')!
    TF_AXIOM(prim.isValid())
    const attr = usdStage.getAttributeAtPath('/Prim.attr')!
    TF_AXIOM(attr.isValid())

    const valueKeys = [
      new ExecUsdValueKey(prim, _tokens.computeDocumentationMetadata),
      new ExecUsdValueKey(attr, _tokens.computeDocumentationMetadata),
      new ExecUsdValueKey(attr, _tokens.computePrimDocumentationMetadata),
    ]

    const request = execSystem.buildRequest(
      valueKeys,
      (indices, interval) => invalidation.valueCalback(indices, interval))
    TF_AXIOM(request.isValid())

    execSystem.prepareRequest(request)
    TF_AXIOM(request.isValid())

    const TestValues = (numInvalidations: number): void => {
      const view = execSystem.compute(request)
      expect(invalidation.numInvoked).toBe(numInvalidations)
      let index = 0

      let v = view.Get(index++)
      TF_AXIOM(v.IsHolding(T.string))
      const primDocValue = prim.getMetadata(SdfFieldKeys.Documentation)
      TF_AXIOM(typeof primDocValue === 'string')
      TF_AXIOM(primDocValue.length !== 0)
      expect(v.Get<string>()).toBe(primDocValue)

      v = view.Get(index++)
      TF_AXIOM(v.IsHolding(T.string))
      const attrDocValue = attr.getMetadata(SdfFieldKeys.Documentation)
      TF_AXIOM(typeof attrDocValue === 'string')
      TF_AXIOM(attrDocValue.length !== 0)
      expect(v.Get<string>()).toBe(attrDocValue)

      v = view.Get(index++)
      TF_AXIOM(v.IsHolding(T.string))
      expect(v.Get<string>()).toBe(primDocValue)
    }

    TestValues(/* numInvalidations */ 0)
    invalidation.Reset()

    // Author new metadata values and re-compute.
    prim.setMetadata(SdfFieldKeys.Documentation, 'new prim doc')
    attr.setMetadata(SdfFieldKeys.Documentation, 'new attribute doc')
    TestValues(/* numInvalidations */ 2)
    invalidation.Reset()

    request.destroy()
    execSystem.destroy()
  })

  // Test error cases involving metadata computation inputs.
  it('TestMetadataErrorCases', async () => {
    const usdStage = await _OpenStage(`#usda 1.0
        def CustomSchema "Prim" (
            doc = "prim documentation"
        ) {
        }
    `)

    const execSystem = new ExecUsdSystem(usdStage)

    const prim = usdStage.getPrim('/Prim')!
    TF_AXIOM(prim.isValid())

    const valueKeys = [
      new ExecUsdValueKey(prim, _tokens.computeBogusMetadata),
    ]

    const request = execSystem.buildRequest(valueKeys)
    TF_AXIOM(request.isValid())

    {
      const mark = new TfErrorMark()
      execSystem.prepareRequest(request)
      TF_AXIOM(request.isValid())
      TF_AXIOM(!mark.isClean())
      mark.dispose()
    }

    {
      const view = execSystem.compute(request)
      let index = 0

      const v = view.Get(index++)
      TF_AXIOM(v.IsHolding(T.string))
      expect(v.Get<string>()).toBe('(no value)')
    }

    request.destroy()
    execSystem.destroy()
  })
})
