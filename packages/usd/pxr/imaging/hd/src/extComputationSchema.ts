// Ported from OpenUSD 26.11.1: pxr/imaging/hd/extComputationSchema.cpp,
//  pxr/imaging/hd/extComputationSchema.h,
//  pxr/imaging/hd/codegenTemplates/schemaClass.cpp,
//  pxr/imaging/hd/codegenTemplates/schemaClass.h,
//  pxr/imaging/hd/hdSchemaDefs.py
// Copyright 2023 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/imaging/hd/extComputationSchema.{h,cpp} (OpenUSD 26.11.1), generated from
// the ExtComputation entry of pxr/imaging/hd/hdSchemaDefs.py with the
// codegenTemplates/schemaClass.{h,cpp} templates. Custom code sections are
// ported by hand from the upstream extComputationSchema.{h,cpp}.

import { MakeTokens as TfMakeTokens, type Token as TfToken } from 'typescript-usd/tf'
import { HdContainerDataSource } from './dataSource.ts'
import { HdDataSourceLocator } from './dataSourceLocator.ts'
import type { HdSizetDataSource, HdStringDataSource } from './dataSourceTypeDefs.ts'
import { _HdBuildRetained, HdSchema } from './schema.ts'
import { HdExtComputationInputComputationContainerSchema, HdExtComputationOutputContainerSchema, HdSampledDataSourceContainerSchema } from './schemaTypeDefs.ts'

// --(BEGIN CUSTOM CODE: Declares)--
// extComputationSchema.h Declares:
//   using HdExtComputationCpuCallbackSharedPtr =
//       std::shared_ptr<class HdExtComputationCpuCallback>;
//   using HdExtComputationCpuCallbackDataSource =
//       HdTypedSampledDataSource<HdExtComputationCpuCallbackSharedPtr>;
// extComputationCpuCallback.h is not a separate module in this port; the
// callback is typed structurally (see HdExtComputationCpuCallback in
// dataSourceLegacyPrim.ts).
import type { HdTypedSampledDataSource } from './dataSource.ts'
export type HdExtComputationCpuCallbackSharedPtr = object
export type HdExtComputationCpuCallbackDataSource =
  HdTypedSampledDataSource<HdExtComputationCpuCallbackSharedPtr>
// --(END CUSTOM CODE: Declares)--

/** extComputationSchema.h TF_DECLARE_PUBLIC_TOKENS(HdExtComputationSchemaTokens) */
export const HdExtComputationSchemaTokens = TfMakeTokens({
  extComputation: 'extComputation',
  inputValues: 'inputValues',
  inputComputations: 'inputComputations',
  outputs: 'outputs',
  glslKernel: 'glslKernel',
  cpuCallback: 'cpuCallback',
  dispatchCount: 'dispatchCount',
  elementCount: 'elementCount',
})

export class HdExtComputationSchema extends HdSchema {
  constructor(container?: HdContainerDataSource | undefined) { super(container) }

  /** extComputationSchema.cpp GetFromParent (schemaClass.cpp:169-178) */
  static getFromParent(fromParentContainer: HdContainerDataSource | undefined): HdExtComputationSchema {
    const ds = fromParentContainer?.Get(HdExtComputationSchemaTokens.extComputation)
    return new HdExtComputationSchema(ds instanceof HdContainerDataSource ? ds : undefined)
  }

  getInputValues(): HdSampledDataSourceContainerSchema {
    return new HdSampledDataSourceContainerSchema(this._getContainerDataSource(HdExtComputationSchemaTokens.inputValues))
  }

  getInputComputations(): HdExtComputationInputComputationContainerSchema {
    return new HdExtComputationInputComputationContainerSchema(this._getContainerDataSource(HdExtComputationSchemaTokens.inputComputations))
  }

  getOutputs(): HdExtComputationOutputContainerSchema {
    return new HdExtComputationOutputContainerSchema(this._getContainerDataSource(HdExtComputationSchemaTokens.outputs))
  }

  getGlslKernel(): HdStringDataSource | undefined {
    return this._getTypedDataSource<HdStringDataSource>(HdExtComputationSchemaTokens.glslKernel)
  }

  getCpuCallback(): HdExtComputationCpuCallbackDataSource | undefined {
    return this._getTypedDataSource<HdExtComputationCpuCallbackDataSource>(HdExtComputationSchemaTokens.cpuCallback)
  }

  getDispatchCount(): HdSizetDataSource | undefined {
    return this._getTypedDataSource<HdSizetDataSource>(HdExtComputationSchemaTokens.dispatchCount)
  }

  getElementCount(): HdSizetDataSource | undefined {
    return this._getTypedDataSource<HdSizetDataSource>(HdExtComputationSchemaTokens.elementCount)
  }

  static getSchemaToken(): TfToken {
    return HdExtComputationSchemaTokens.extComputation
  }

  private static _defaultLocator: HdDataSourceLocator | undefined
  static getDefaultLocator(): HdDataSourceLocator {
    return HdExtComputationSchema._defaultLocator ??= new HdDataSourceLocator(HdExtComputationSchema.getSchemaToken())
  }

  private static _inputValuesLocator: HdDataSourceLocator | undefined
  static getInputValuesLocator(): HdDataSourceLocator {
    return HdExtComputationSchema._inputValuesLocator ??= HdExtComputationSchema.getDefaultLocator().append(HdExtComputationSchemaTokens.inputValues)
  }

  private static _inputComputationsLocator: HdDataSourceLocator | undefined
  static getInputComputationsLocator(): HdDataSourceLocator {
    return HdExtComputationSchema._inputComputationsLocator ??= HdExtComputationSchema.getDefaultLocator().append(HdExtComputationSchemaTokens.inputComputations)
  }

  private static _outputsLocator: HdDataSourceLocator | undefined
  static getOutputsLocator(): HdDataSourceLocator {
    return HdExtComputationSchema._outputsLocator ??= HdExtComputationSchema.getDefaultLocator().append(HdExtComputationSchemaTokens.outputs)
  }

  private static _glslKernelLocator: HdDataSourceLocator | undefined
  static getGlslKernelLocator(): HdDataSourceLocator {
    return HdExtComputationSchema._glslKernelLocator ??= HdExtComputationSchema.getDefaultLocator().append(HdExtComputationSchemaTokens.glslKernel)
  }

  private static _cpuCallbackLocator: HdDataSourceLocator | undefined
  static getCpuCallbackLocator(): HdDataSourceLocator {
    return HdExtComputationSchema._cpuCallbackLocator ??= HdExtComputationSchema.getDefaultLocator().append(HdExtComputationSchemaTokens.cpuCallback)
  }

  private static _dispatchCountLocator: HdDataSourceLocator | undefined
  static getDispatchCountLocator(): HdDataSourceLocator {
    return HdExtComputationSchema._dispatchCountLocator ??= HdExtComputationSchema.getDefaultLocator().append(HdExtComputationSchemaTokens.dispatchCount)
  }

  private static _elementCountLocator: HdDataSourceLocator | undefined
  static getElementCountLocator(): HdDataSourceLocator {
    return HdExtComputationSchema._elementCountLocator ??= HdExtComputationSchema.getDefaultLocator().append(HdExtComputationSchemaTokens.elementCount)
  }

  /** @deprecated Use Builder instead. (schemaClass.cpp:126-148) */
  static buildRetained(
    inputValues?: HdContainerDataSource | undefined,
    inputComputations?: HdContainerDataSource | undefined,
    outputs?: HdContainerDataSource | undefined,
    glslKernel?: HdStringDataSource | undefined,
    cpuCallback?: HdExtComputationCpuCallbackDataSource | undefined,
    dispatchCount?: HdSizetDataSource | undefined,
    elementCount?: HdSizetDataSource | undefined,
  ): HdContainerDataSource {
    return _HdBuildRetained({
      [HdExtComputationSchemaTokens.inputValues]: inputValues,
      [HdExtComputationSchemaTokens.inputComputations]: inputComputations,
      [HdExtComputationSchemaTokens.outputs]: outputs,
      [HdExtComputationSchemaTokens.glslKernel]: glslKernel,
      [HdExtComputationSchemaTokens.cpuCallback]: cpuCallback,
      [HdExtComputationSchemaTokens.dispatchCount]: dispatchCount,
      [HdExtComputationSchemaTokens.elementCount]: elementCount,
    })
  }
}

export namespace HdExtComputationSchema {
  /** HdExtComputationSchema::Builder (schemaClass.cpp:150-166) */
  export class Builder {
    private _inputValues: HdContainerDataSource | undefined
    private _inputComputations: HdContainerDataSource | undefined
    private _outputs: HdContainerDataSource | undefined
    private _glslKernel: HdStringDataSource | undefined
    private _cpuCallback: HdExtComputationCpuCallbackDataSource | undefined
    private _dispatchCount: HdSizetDataSource | undefined
    private _elementCount: HdSizetDataSource | undefined
    setInputValues(inputValues: HdContainerDataSource | undefined): this {
      this._inputValues = inputValues
      return this
    }
    setInputComputations(inputComputations: HdContainerDataSource | undefined): this {
      this._inputComputations = inputComputations
      return this
    }
    setOutputs(outputs: HdContainerDataSource | undefined): this {
      this._outputs = outputs
      return this
    }
    setGlslKernel(glslKernel: HdStringDataSource | undefined): this {
      this._glslKernel = glslKernel
      return this
    }
    setCpuCallback(cpuCallback: HdExtComputationCpuCallbackDataSource | undefined): this {
      this._cpuCallback = cpuCallback
      return this
    }
    setDispatchCount(dispatchCount: HdSizetDataSource | undefined): this {
      this._dispatchCount = dispatchCount
      return this
    }
    setElementCount(elementCount: HdSizetDataSource | undefined): this {
      this._elementCount = elementCount
      return this
    }
    build(): HdContainerDataSource {
      return HdExtComputationSchema.buildRetained(
        this._inputValues,
        this._inputComputations,
        this._outputs,
        this._glslKernel,
        this._cpuCallback,
        this._dispatchCount,
        this._elementCount,
      )
    }
  }
}
