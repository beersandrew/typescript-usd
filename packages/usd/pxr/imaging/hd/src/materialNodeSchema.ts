// Ported from OpenUSD 26.11.1: pxr/imaging/hd/materialNodeSchema.cpp,
//  pxr/imaging/hd/materialNodeSchema.h,
//  pxr/imaging/hd/codegenTemplates/schemaClass.cpp,
//  pxr/imaging/hd/codegenTemplates/schemaClass.h,
//  pxr/imaging/hd/hdSchemaDefs.py
// Copyright 2023 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/imaging/hd/materialNodeSchema.{h,cpp} (OpenUSD 26.11.1), generated from
// the MaterialNode entry of pxr/imaging/hd/hdSchemaDefs.py with the
// codegenTemplates/schemaClass.{h,cpp} templates. Custom code sections are
// ported by hand from the upstream materialNodeSchema.{h,cpp}.

import { MakeTokens as TfMakeTokens, type Token as TfToken } from 'typescript-usd/tf'
import { HdContainerDataSource } from './dataSource.ts'
import { HdDataSourceLocator } from './dataSourceLocator.ts'
import type { HdTokenDataSource } from './dataSourceTypeDefs.ts'
import { _HdBuildRetained, HdSchema } from './schema.ts'
import { HdMaterialConnectionVectorContainerSchema, HdMaterialNodeParameterContainerSchema } from './schemaTypeDefs.ts'

/** materialNodeSchema.h TF_DECLARE_PUBLIC_TOKENS(HdMaterialNodeSchemaTokens) */
export const HdMaterialNodeSchemaTokens = TfMakeTokens({
  parameters: 'parameters',
  inputConnections: 'inputConnections',
  nodeIdentifier: 'nodeIdentifier',
  renderContextNodeIdentifiers: 'renderContextNodeIdentifiers',
  nodeTypeInfo: 'nodeTypeInfo',
})

/**
 * The MaterialNode schema is a container schema that defines a particular
 * node in a material network.
 *
 * A material node defines its connections to other nodes via the
 * "inputConnections" member. For example, "albedo" would define that it
 * receives its value from its connection to the node "Color_UnPreMult" and
 * the output "resultRGB" with the following data sources:
 *
 * ds at: material/<renderContext>/nodes/MaterialLayer/inputConnections
 * /albedo/[0]/upstreamNodePath = Color_UnPreMult
 *
 * ds at: material/<renderContext>/nodes/MaterialLayer/inputConnections
 * /albedo/[0]/upstreamNodeOutputName = resultRGB
 */
export class HdMaterialNodeSchema extends HdSchema {
  constructor(container?: HdContainerDataSource | undefined) { super(container) }

  /**
   * Maps parameter names to node parameters. Each node parameter is a
   * container that is defined by the MaterialNodeParameter schema. Note that
   * parameters are inputs that supply their value directly.
   */
  getParameters(): HdMaterialNodeParameterContainerSchema {
    return new HdMaterialNodeParameterContainerSchema(this._getContainerDataSource(HdMaterialNodeSchemaTokens.parameters))
  }

  /**
   * Maps input names to vectors of connections. Each connection is defined by
   * the MaterialConnection schema. Note that inputConnections are inputs that
   * get their value from data flow over the connection.
   */
  getInputConnections(): HdMaterialConnectionVectorContainerSchema {
    return new HdMaterialConnectionVectorContainerSchema(this._getContainerDataSource(HdMaterialNodeSchemaTokens.inputConnections))
  }

  /**
   * This identifies the shader the node represents. The
   * renderContextNodeIdentifier container can store alternative values for
   * this. A consumer which is interested in a specific render context should
   * check for that token within renderContextNodeIdentifiers and fall back on
   * this value in its absence.
   */
  getNodeIdentifier(): HdTokenDataSource | undefined {
    return this._getTypedDataSource<HdTokenDataSource>(HdMaterialNodeSchemaTokens.nodeIdentifier)
  }

  /**
   * A shading node can hold a nodeIdentifier value for multiple render
   * contexts at once. This allows multiple renderer target representations to
   * coexist in the same renderable scene. The contents of this container are
   * alternate possible values for nodeIdentifier. A consumer which is
   * interested in a specific render context should check for that token
   * within this container and fall back on nodeIdentifier in its absence.
   */
  getRenderContextNodeIdentifiers(): HdContainerDataSource | undefined {
    return this._getContainerDataSource(HdMaterialNodeSchemaTokens.renderContextNodeIdentifiers)
  }

  /**
   * Rather than having an identifier, a shader can be specified by other
   * information.
   */
  getNodeTypeInfo(): HdContainerDataSource | undefined {
    return this._getContainerDataSource(HdMaterialNodeSchemaTokens.nodeTypeInfo)
  }

  /** @deprecated Use Builder instead. (schemaClass.cpp:126-148) */
  static buildRetained(
    parameters?: HdContainerDataSource | undefined,
    inputConnections?: HdContainerDataSource | undefined,
    nodeIdentifier?: HdTokenDataSource | undefined,
    renderContextNodeIdentifiers?: HdContainerDataSource | undefined,
    nodeTypeInfo?: HdContainerDataSource | undefined,
  ): HdContainerDataSource {
    return _HdBuildRetained({
      [HdMaterialNodeSchemaTokens.parameters]: parameters,
      [HdMaterialNodeSchemaTokens.inputConnections]: inputConnections,
      [HdMaterialNodeSchemaTokens.nodeIdentifier]: nodeIdentifier,
      [HdMaterialNodeSchemaTokens.renderContextNodeIdentifiers]: renderContextNodeIdentifiers,
      [HdMaterialNodeSchemaTokens.nodeTypeInfo]: nodeTypeInfo,
    })
  }
}

export namespace HdMaterialNodeSchema {
  /** HdMaterialNodeSchema::Builder (schemaClass.cpp:150-166) */
  export class Builder {
    private _parameters: HdContainerDataSource | undefined
    private _inputConnections: HdContainerDataSource | undefined
    private _nodeIdentifier: HdTokenDataSource | undefined
    private _renderContextNodeIdentifiers: HdContainerDataSource | undefined
    private _nodeTypeInfo: HdContainerDataSource | undefined
    setParameters(parameters: HdContainerDataSource | undefined): this {
      this._parameters = parameters
      return this
    }
    setInputConnections(inputConnections: HdContainerDataSource | undefined): this {
      this._inputConnections = inputConnections
      return this
    }
    setNodeIdentifier(nodeIdentifier: HdTokenDataSource | undefined): this {
      this._nodeIdentifier = nodeIdentifier
      return this
    }
    setRenderContextNodeIdentifiers(renderContextNodeIdentifiers: HdContainerDataSource | undefined): this {
      this._renderContextNodeIdentifiers = renderContextNodeIdentifiers
      return this
    }
    setNodeTypeInfo(nodeTypeInfo: HdContainerDataSource | undefined): this {
      this._nodeTypeInfo = nodeTypeInfo
      return this
    }
    build(): HdContainerDataSource {
      return HdMaterialNodeSchema.buildRetained(
        this._parameters,
        this._inputConnections,
        this._nodeIdentifier,
        this._renderContextNodeIdentifiers,
        this._nodeTypeInfo,
      )
    }
  }
}
