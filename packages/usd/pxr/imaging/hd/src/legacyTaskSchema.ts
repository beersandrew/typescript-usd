// Ported from OpenUSD 26.11.1: pxr/imaging/hd/legacyTaskSchema.cpp,
//  pxr/imaging/hd/legacyTaskSchema.h,
//  pxr/imaging/hd/codegenTemplates/schemaClass.cpp,
//  pxr/imaging/hd/codegenTemplates/schemaClass.h,
//  pxr/imaging/hd/hdSchemaDefs.py
// Copyright 2023 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/imaging/hd/legacyTaskSchema.{h,cpp} (OpenUSD 26.11.1), generated from
// the LegacyTask entry of pxr/imaging/hd/hdSchemaDefs.py with the
// codegenTemplates/schemaClass.{h,cpp} templates. Custom code sections are
// ported by hand from the upstream legacyTaskSchema.{h,cpp}.

import { MakeTokens as TfMakeTokens, type Token as TfToken } from 'typescript-usd/tf'
import { HdContainerDataSource, type HdSampledDataSource } from './dataSource.ts'
import { HdDataSourceLocator } from './dataSourceLocator.ts'
import { _HdBuildRetained, HdSchema } from './schema.ts'

// --(BEGIN CUSTOM CODE: Declares)--
// legacyTaskSchema.h Declares.
import type { HdTypedSampledDataSource } from './dataSource.ts'
import type { HdRprimCollection } from './rprimCollection.ts'
import type { HdLegacyTaskFactory } from './legacyTaskFactory.ts'
export type HdRprimCollectionDataSource = HdTypedSampledDataSource<HdRprimCollection>
export type HdTokenVectorDataSource = HdTypedSampledDataSource<TfToken[]>
export type HdLegacyTaskFactorySharedPtr = HdLegacyTaskFactory
export type HdLegacyTaskFactoryDataSource =
  HdTypedSampledDataSource<HdLegacyTaskFactorySharedPtr>
// --(END CUSTOM CODE: Declares)--

/** legacyTaskSchema.h TF_DECLARE_PUBLIC_TOKENS(HdLegacyTaskSchemaTokens) */
export const HdLegacyTaskSchemaTokens = TfMakeTokens({
  task: 'task',
  factory: 'factory',
  parameters: 'parameters',
  collection: 'collection',
  renderTags: 'renderTags',
})

/**
 * The {{ SCHEMA_CLASS_NAME }} specifies a Hydra task by providing a task
 * factory and data.
 */
export class HdLegacyTaskSchema extends HdSchema {
  constructor(container?: HdContainerDataSource | undefined) { super(container) }

  /** legacyTaskSchema.cpp GetFromParent (schemaClass.cpp:169-178) */
  static getFromParent(fromParentContainer: HdContainerDataSource | undefined): HdLegacyTaskSchema {
    const ds = fromParentContainer?.Get(HdLegacyTaskSchemaTokens.task)
    return new HdLegacyTaskSchema(ds instanceof HdContainerDataSource ? ds : undefined)
  }

  getFactory(): HdLegacyTaskFactoryDataSource | undefined {
    return this._getTypedDataSource<HdLegacyTaskFactoryDataSource>(HdLegacyTaskSchemaTokens.factory)
  }

  /**
   * Parameters for task. Type depends on task type. E.g. HdxRenderTaskParams
   * if the factory produces HdxRenderTask instances.
   */
  getParameters(): HdSampledDataSource | undefined {
    return this._getTypedDataSource<HdSampledDataSource>(HdLegacyTaskSchemaTokens.parameters)
  }

  getCollection(): HdRprimCollectionDataSource | undefined {
    return this._getTypedDataSource<HdRprimCollectionDataSource>(HdLegacyTaskSchemaTokens.collection)
  }

  getRenderTags(): HdTokenVectorDataSource | undefined {
    return this._getTypedDataSource<HdTokenVectorDataSource>(HdLegacyTaskSchemaTokens.renderTags)
  }

  static getSchemaToken(): TfToken {
    return HdLegacyTaskSchemaTokens.task
  }

  private static _defaultLocator: HdDataSourceLocator | undefined
  static getDefaultLocator(): HdDataSourceLocator {
    return HdLegacyTaskSchema._defaultLocator ??= new HdDataSourceLocator(HdLegacyTaskSchema.getSchemaToken())
  }

  private static _factoryLocator: HdDataSourceLocator | undefined
  static getFactoryLocator(): HdDataSourceLocator {
    return HdLegacyTaskSchema._factoryLocator ??= HdLegacyTaskSchema.getDefaultLocator().append(HdLegacyTaskSchemaTokens.factory)
  }

  private static _parametersLocator: HdDataSourceLocator | undefined
  static getParametersLocator(): HdDataSourceLocator {
    return HdLegacyTaskSchema._parametersLocator ??= HdLegacyTaskSchema.getDefaultLocator().append(HdLegacyTaskSchemaTokens.parameters)
  }

  private static _collectionLocator: HdDataSourceLocator | undefined
  static getCollectionLocator(): HdDataSourceLocator {
    return HdLegacyTaskSchema._collectionLocator ??= HdLegacyTaskSchema.getDefaultLocator().append(HdLegacyTaskSchemaTokens.collection)
  }

  private static _renderTagsLocator: HdDataSourceLocator | undefined
  static getRenderTagsLocator(): HdDataSourceLocator {
    return HdLegacyTaskSchema._renderTagsLocator ??= HdLegacyTaskSchema.getDefaultLocator().append(HdLegacyTaskSchemaTokens.renderTags)
  }

  /** @deprecated Use Builder instead. (schemaClass.cpp:126-148) */
  static buildRetained(
    factory?: HdLegacyTaskFactoryDataSource | undefined,
    parameters?: HdSampledDataSource | undefined,
    collection?: HdRprimCollectionDataSource | undefined,
    renderTags?: HdTokenVectorDataSource | undefined,
  ): HdContainerDataSource {
    return _HdBuildRetained({
      [HdLegacyTaskSchemaTokens.factory]: factory,
      [HdLegacyTaskSchemaTokens.parameters]: parameters,
      [HdLegacyTaskSchemaTokens.collection]: collection,
      [HdLegacyTaskSchemaTokens.renderTags]: renderTags,
    })
  }
}

export namespace HdLegacyTaskSchema {
  /** HdLegacyTaskSchema::Builder (schemaClass.cpp:150-166) */
  export class Builder {
    private _factory: HdLegacyTaskFactoryDataSource | undefined
    private _parameters: HdSampledDataSource | undefined
    private _collection: HdRprimCollectionDataSource | undefined
    private _renderTags: HdTokenVectorDataSource | undefined
    setFactory(factory: HdLegacyTaskFactoryDataSource | undefined): this {
      this._factory = factory
      return this
    }
    setParameters(parameters: HdSampledDataSource | undefined): this {
      this._parameters = parameters
      return this
    }
    setCollection(collection: HdRprimCollectionDataSource | undefined): this {
      this._collection = collection
      return this
    }
    setRenderTags(renderTags: HdTokenVectorDataSource | undefined): this {
      this._renderTags = renderTags
      return this
    }
    build(): HdContainerDataSource {
      return HdLegacyTaskSchema.buildRetained(
        this._factory,
        this._parameters,
        this._collection,
        this._renderTags,
      )
    }
  }
}
