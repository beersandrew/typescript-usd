// Ported from OpenUSD 26.11.1: pxr/imaging/hd/materialSchema.cpp,
//  pxr/imaging/hd/materialSchema.h,
//  pxr/imaging/hd/codegenTemplates/schemaClass.cpp,
//  pxr/imaging/hd/codegenTemplates/schemaClass.h,
//  pxr/imaging/hd/hdSchemaDefs.py
// Copyright 2023 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/imaging/hd/materialSchema.{h,cpp} (OpenUSD 26.11.1), generated from
// the Material entry of pxr/imaging/hd/hdSchemaDefs.py with the
// codegenTemplates/schemaClass.{h,cpp} templates. Custom code sections are
// ported by hand from the upstream materialSchema.{h,cpp}.

import { MakeTokens as TfMakeTokens, type Token as TfToken } from 'typescript-usd/tf'
import { HdContainerDataSource, type HdDataSourceBase, HdRetainedContainerDataSource } from './dataSource.ts'
import { HdDataSourceLocator } from './dataSourceLocator.ts'
import { HdMaterialNetworkSchema } from './materialNetworkSchema.ts'
import { HdSchema } from './schema.ts'

/** materialSchema.h TF_DECLARE_PUBLIC_TOKENS(HdMaterialSchemaTokens) */
export const HdMaterialSchemaTokens = TfMakeTokens({
  material: 'material',
  universalRenderContext: '',
  _universalRenderContextToken: 'universalRenderContext',
  all: '__all',
  terminals: 'terminals',
  surface: 'surface',
  displacement: 'displacement',
  volume: 'volume',
})

/**
 * The Material schema is a container schema that provides the correct
 * material definition per render context.
 *
 * For example, a material may specify several render contexts like the
 * universalRenderContext (""), Renderman ("ri"), Storm ("glslfx"), etc. Each
 * render context will then provide the specific definition for the renderer,
 * which is defined by the MaterialNetwork schema. The universalRenderContext
 * applies to all renderers.
 *
 * See "Custom Code: Schema Methods" section for ASCII art diagram.
 */
export class HdMaterialSchema extends HdSchema {
  constructor(container?: HdContainerDataSource | undefined) { super(container) }

  /** materialSchema.cpp GetFromParent (schemaClass.cpp:169-178) */
  static getFromParent(fromParentContainer: HdContainerDataSource | undefined): HdMaterialSchema {
    const ds = fromParentContainer?.Get(HdMaterialSchemaTokens.material)
    return new HdMaterialSchema(ds instanceof HdContainerDataSource ? ds : undefined)
  }

  // --(BEGIN CUSTOM CODE: Schema Methods)--

  /** materialSchema.cpp GetRenderContexts */
  getRenderContexts(): TfToken[] {
    return (this.getContainer()?.getNames() ?? []) as TfToken[]
  }

  /**
   * materialSchema.cpp GetMaterialNetwork overloads:
   * - () returns the universalRenderContext network;
   * - (renderContext) returns that context's network (no fallback);
   * - (renderContexts[]) returns the first context found, else the
   *   universalRenderContext network.
   */
  getMaterialNetwork(renderContext?: string | readonly string[]): HdMaterialNetworkSchema {
    if (typeof renderContext === 'string') {
      return new HdMaterialNetworkSchema(this._getContainerDataSource(renderContext))
    }
    if (renderContext !== undefined) {
      for (const context of renderContext) {
        const b = this._getContainerDataSource(context)
        if (b) return new HdMaterialNetworkSchema(b)
      }
    }
    // If we can't find the context-specific binding, return the fallback.
    return new HdMaterialNetworkSchema(
      this._getContainerDataSource(HdMaterialSchemaTokens.universalRenderContext))
  }

  /** materialSchema.cpp GetLocatorTerminal overloads: find the terminal
   * (surface/volume/displacement) from a given data source locator. */
  static getLocatorTerminal(
    locator: HdDataSourceLocator, renderContexts?: string | readonly string[],
  ): TfToken {
    const contexts: readonly string[] = renderContexts === undefined ? []
      : typeof renderContexts === 'string' ? [renderContexts] : renderContexts
    if (locator.getElementCount() >= 4) {
      // Always check the universal render context
      const universalTerminalLocator = new HdDataSourceLocator(
        HdMaterialSchema.getSchemaToken(),
        HdMaterialSchemaTokens.universalRenderContext,
        HdMaterialSchemaTokens.terminals)
      if (locator.intersects(universalTerminalLocator)) {
        return locator.getElement(3) as TfToken
      }
      // Check the render specific contexts
      for (const context of contexts) {
        const terminalLocator = new HdDataSourceLocator(
          HdMaterialSchema.getSchemaToken(), context, HdMaterialSchemaTokens.terminals)
        if (locator.intersects(terminalLocator)) {
          return locator.getElement(3) as TfToken
        }
      }
    }
    return '' as TfToken
  }
  // --(END CUSTOM CODE: Schema Methods)--

  static getSchemaToken(): TfToken {
    return HdMaterialSchemaTokens.material
  }

  private static _defaultLocator: HdDataSourceLocator | undefined
  static getDefaultLocator(): HdDataSourceLocator {
    return HdMaterialSchema._defaultLocator ??= new HdDataSourceLocator(HdMaterialSchema.getSchemaToken())
  }

  /** schemaClass.cpp:115-124 (the count argument is implied by the
   * array lengths, as in HdRetainedContainerDataSource.New of this port). */
  static buildRetained(
    names: readonly string[], values: readonly HdDataSourceBase[],
  ): HdContainerDataSource {
    return HdRetainedContainerDataSource.new([...names], [...values])
  }
}
