// Ported from OpenUSD 26.11.1: pxr/imaging/hd/materialNetworkSchema.cpp,
//  pxr/imaging/hd/materialNetworkSchema.h,
//  pxr/imaging/hd/codegenTemplates/schemaClass.cpp,
//  pxr/imaging/hd/codegenTemplates/schemaClass.h,
//  pxr/imaging/hd/hdSchemaDefs.py
// Copyright 2023 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/imaging/hd/materialNetworkSchema.{h,cpp} (OpenUSD 26.11.1), generated from
// the MaterialNetwork entry of pxr/imaging/hd/hdSchemaDefs.py with the
// codegenTemplates/schemaClass.{h,cpp} templates. Custom code sections are
// ported by hand from the upstream materialNetworkSchema.{h,cpp}.

import { MakeTokens as TfMakeTokens, type Token as TfToken } from 'typescript-usd/tf'
import { HdContainerDataSource } from './dataSource.ts'
import { HdDataSourceLocator } from './dataSourceLocator.ts'
import { HdMaterialInterfaceSchema } from './materialInterfaceSchema.ts'
import { _HdBuildRetained, HdSchema } from './schema.ts'
import { HdMaterialConnectionContainerSchema, HdMaterialNodeContainerSchema, HdSampledDataSourceContainerSchema } from './schemaTypeDefs.ts'

/** materialNetworkSchema.h TF_DECLARE_PUBLIC_TOKENS(HdMaterialNetworkSchemaTokens) */
export const HdMaterialNetworkSchemaTokens = TfMakeTokens({
  nodes: 'nodes',
  terminals: 'terminals',
  interface: 'interface',
  config: 'config',
})

/**
 * The MaterialNetwork schema is a container schema that defines a material
 * for a specific render context. A network is composed of nodes, terminals,
 * and interface.
 *
 * See also the Material schema documentation for ASCII art diagram.
 */
export class HdMaterialNetworkSchema extends HdSchema {
  constructor(container?: HdContainerDataSource | undefined) { super(container) }

  /**
   * Maps node names to material nodes. Each material node is a container that
   * is defined by the MaterialNode schema. The topology of the network is
   * expressed by the connections found on each material node.
   */
  getNodes(): HdMaterialNodeContainerSchema {
    return new HdMaterialNodeContainerSchema(this._getContainerDataSource(HdMaterialNetworkSchemaTokens.nodes))
  }

  /**
   * Maps terminal names to material connections. Each connection is a
   * container defined by the MaterialConnection schema.
   */
  getTerminals(): HdMaterialConnectionContainerSchema {
    return new HdMaterialConnectionContainerSchema(this._getContainerDataSource(HdMaterialNetworkSchemaTokens.terminals))
  }

  /**
   * Describes the material's interface (public UI). A material's public
   * interface has user-authored order, grouping, naming, and mappings.
   */
  getInterface(): HdMaterialInterfaceSchema {
    return new HdMaterialInterfaceSchema(this._getContainerDataSource(HdMaterialNetworkSchemaTokens.interface))
  }

  getConfig(): HdSampledDataSourceContainerSchema {
    return new HdSampledDataSourceContainerSchema(this._getContainerDataSource(HdMaterialNetworkSchemaTokens.config))
  }

  /** @deprecated Use Builder instead. (schemaClass.cpp:126-148) */
  static buildRetained(
    nodes?: HdContainerDataSource | undefined,
    terminals?: HdContainerDataSource | undefined,
    interface_?: HdContainerDataSource | undefined,
    config?: HdContainerDataSource | undefined,
  ): HdContainerDataSource {
    return _HdBuildRetained({
      [HdMaterialNetworkSchemaTokens.nodes]: nodes,
      [HdMaterialNetworkSchemaTokens.terminals]: terminals,
      [HdMaterialNetworkSchemaTokens.interface]: interface_,
      [HdMaterialNetworkSchemaTokens.config]: config,
    })
  }
}

export namespace HdMaterialNetworkSchema {
  /** HdMaterialNetworkSchema::Builder (schemaClass.cpp:150-166) */
  export class Builder {
    private _nodes: HdContainerDataSource | undefined
    private _terminals: HdContainerDataSource | undefined
    private _interface: HdContainerDataSource | undefined
    private _config: HdContainerDataSource | undefined
    setNodes(nodes: HdContainerDataSource | undefined): this {
      this._nodes = nodes
      return this
    }
    setTerminals(terminals: HdContainerDataSource | undefined): this {
      this._terminals = terminals
      return this
    }
    setInterface(interface_: HdContainerDataSource | undefined): this {
      this._interface = interface_
      return this
    }
    setConfig(config: HdContainerDataSource | undefined): this {
      this._config = config
      return this
    }
    build(): HdContainerDataSource {
      return HdMaterialNetworkSchema.buildRetained(
        this._nodes,
        this._terminals,
        this._interface,
        this._config,
      )
    }
  }
}
