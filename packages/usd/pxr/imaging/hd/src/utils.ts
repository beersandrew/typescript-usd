// Ported from OpenUSD 26.11.1: pxr/imaging/hd/utils.cpp,
//  pxr/imaging/hd/utils.h, pxr/imaging/hd/material.h,
//  pxr/imaging/hd/materialNetworkSchema.h,
//  pxr/imaging/hd/materialNodeSchema.h, pxr/imaging/hd/materialSchema.h
// Copyright 2016, 2023 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Mirrors pxr/imaging/hd/utils.{h,cpp} — HdUtils material-network conversion.
// The plain HdMaterialNetworkMap data structures live in material.ts
// (material.h).
//
// HdUtils.ConvertHdMaterialNetworkToHdMaterialSchema(networkMap) turns the
// flat (node/relationship list) HdMaterialNetworkMap into the nested container
// data source described by materialSchema.h / materialNetworkSchema.h /
// materialNodeSchema.h:
//
//   {
//     "" /* universalRenderContext */: {
//       config:    { ... },
//       nodes:     { <nodePath>: { nodeIdentifier, parameters, inputConnections } },
//       terminals: { <terminalName>: { upstreamNodePath, upstreamNodeOutputName } },
//     },
//   }

import {
  HdDataSourceBase,
  HdContainerDataSource,
  HdRetainedContainerDataSource,
  HdRetainedTypedSampledDataSource,
  HdRetainedSmallVectorDataSource,
} from './dataSource.ts'
import {
  HdMaterialNetwork,
  HdMaterialNetworkMap,
  HdMaterialNode,
} from './material.ts'

// ---- Schema token sets: the per-schema TF_DECLARE_PUBLIC_TOKENS of
// materialSchema.h, materialNetworkSchema.h, materialNodeSchema.h,
// materialNodeParameterSchema.h and materialConnectionSchema.h ----

import { HdMaterialSchemaTokens } from './materialSchema.ts'
import { HdMaterialNetworkSchemaTokens } from './materialNetworkSchema.ts'
import { HdMaterialNodeSchemaTokens } from './materialNodeSchema.ts'
import { HdMaterialNodeParameterSchemaTokens } from './materialNodeParameterSchema.ts'
import { HdMaterialConnectionSchemaTokens } from './materialConnectionSchema.ts'
export {
  HdMaterialSchemaTokens, HdMaterialNetworkSchemaTokens, HdMaterialNodeSchemaTokens,
  HdMaterialNodeParameterSchemaTokens, HdMaterialConnectionSchemaTokens,
}

// ---- Conversion (mirrors HdUtils::ConvertHdMaterialNetworkTo*) ----

interface ParamData {
  value?: unknown
  colorSpace?: string
  typeName?: string
}

// Mirror of SdfPath::StripPrefixNamespace: if name begins with "<prefix>:",
// return the remainder and true; otherwise return name and false.
function stripPrefixNamespace(
  name: string,
  prefix: string,
): { remainder: string; matched: boolean } {
  const full = prefix + ':'
  if (name.startsWith(full)) {
    return { remainder: name.slice(full.length), matched: true }
  }
  return { remainder: name, matched: false }
}

function convertVtDictionaryToContainerDS(
  dict: Map<string, unknown>,
): HdContainerDataSource {
  const names: string[] = []
  const values: HdDataSourceBase[] = []
  for (const [name, value] of dict) {
    names.push(name)
    values.push(HdRetainedTypedSampledDataSource.new(value))
  }
  return HdRetainedContainerDataSource.new(names, values)
}

function convertHdMaterialNetworkToHdMaterialNetworkSchema(
  hdNetworkMap: HdMaterialNetworkMap,
): HdContainerDataSource {
  const terminalsNames: string[] = []
  const terminalsValues: HdDataSourceBase[] = []
  const nodeNames: string[] = []
  const nodeValues: HdDataSourceBase[] = []

  for (const [terminalName, hdNetwork] of hdNetworkMap.map) {
    if (hdNetwork.nodes.length === 0) {
      continue
    }

    terminalsNames.push(terminalName)

    // Transfer over individual nodes. The same nodes may be shared by multiple
    // terminals; we simply overwrite them here.
    for (const node of hdNetwork.nodes) {
      const paramsNames: string[] = []
      const paramsValues: HdDataSourceBase[] = []

      // Gather parameter value, colorspace and typename metadata in paramsInfo,
      // a mapping of the parameter name to its value and metadata.
      const paramsInfo = new Map<string, ParamData>()
      const getInfo = (key: string): ParamData => {
        let info = paramsInfo.get(key)
        if (!info) {
          info = {}
          paramsInfo.set(key, info)
        }
        return info
      }
      for (const [pName, pValue] of node.parameters) {
        // Colorspace metadata - strip "colorSpace" prefix.
        const csRes = stripPrefixNamespace(
          pName, HdMaterialNodeParameterSchemaTokens.colorSpace)
        if (csRes.matched) {
          getInfo(csRes.remainder).colorSpace = pValue as string
          continue
        }

        // TypeName metadata - strip "typeName" prefix.
        const vtRes = stripPrefixNamespace(
          pName, HdMaterialNodeParameterSchemaTokens.typeName)
        if (vtRes.matched) {
          getInfo(vtRes.remainder).typeName = pValue as string
          continue
        }

        // Value.
        getInfo(pName).value = pValue
      }

      // Create and store the HdMaterialNodeParameter data source.
      // (std::map iterates in sorted key order.)
      for (const key of [...paramsInfo.keys()].sort()) {
        const item = paramsInfo.get(key)!
        const pNames: string[] = [HdMaterialNodeParameterSchemaTokens.value]
        const pValues: HdDataSourceBase[] = [
          HdRetainedTypedSampledDataSource.new(item.value),
        ]
        if (item.colorSpace !== undefined && item.colorSpace !== '') {
          pNames.push(HdMaterialNodeParameterSchemaTokens.colorSpace)
          pValues.push(HdRetainedTypedSampledDataSource.new(item.colorSpace))
        }
        if (item.typeName !== undefined && item.typeName !== '') {
          pNames.push(HdMaterialNodeParameterSchemaTokens.typeName)
          pValues.push(HdRetainedTypedSampledDataSource.new(item.typeName))
        }
        paramsNames.push(key)
        paramsValues.push(HdRetainedContainerDataSource.new(pNames, pValues))
      }

      // Accumulate array connections to the same input.
      const connectionsMap = new Map<string, HdDataSourceBase[]>()

      for (const rel of hdNetwork.relationships) {
        if (rel.outputId === node.path) {
          const outputPath = rel.inputId
          const outputName = rel.inputName

          const c = HdRetainedContainerDataSource.new(
            [
              HdMaterialConnectionSchemaTokens.upstreamNodePath,
              HdMaterialConnectionSchemaTokens.upstreamNodeOutputName,
            ],
            [
              HdRetainedTypedSampledDataSource.new(outputPath),
              HdRetainedTypedSampledDataSource.new(outputName),
            ],
          )

          let bucket = connectionsMap.get(rel.outputName)
          if (!bucket) {
            bucket = []
            connectionsMap.set(rel.outputName, bucket)
          }
          bucket.push(c)
        }
      }

      const cNames: string[] = []
      const cValues: HdDataSourceBase[] = []
      for (const [inputName, conns] of connectionsMap) {
        cNames.push(inputName)
        cValues.push(HdRetainedSmallVectorDataSource.new(conns))
      }

      nodeNames.push(node.path)
      nodeValues.push(
        HdRetainedContainerDataSource.new(
          [
            HdMaterialNodeSchemaTokens.parameters,
            HdMaterialNodeSchemaTokens.inputConnections,
            HdMaterialNodeSchemaTokens.nodeIdentifier,
          ],
          [
            HdRetainedContainerDataSource.new(paramsNames, paramsValues),
            HdRetainedContainerDataSource.new(cNames, cValues),
            HdRetainedTypedSampledDataSource.new(node.identifier),
          ],
        ),
      )
    }

    // The terminal's upstream node is the last node of the network; the
    // terminal's output name is the network's terminal (map) key.
    const lastNode = hdNetwork.nodes[hdNetwork.nodes.length - 1]!
    terminalsValues.push(
      HdRetainedContainerDataSource.new(
        [
          HdMaterialConnectionSchemaTokens.upstreamNodePath,
          HdMaterialConnectionSchemaTokens.upstreamNodeOutputName,
        ],
        [
          HdRetainedTypedSampledDataSource.new(lastNode.path),
          HdRetainedTypedSampledDataSource.new(
            terminalsNames[terminalsNames.length - 1]!),
        ],
      ),
    )
  }

  const nodesDefaultContext =
    HdRetainedContainerDataSource.new(nodeNames, nodeValues)
  const terminalsDefaultContext =
    HdRetainedContainerDataSource.new(terminalsNames, terminalsValues)
  const configDefaultContext =
    convertVtDictionaryToContainerDS(hdNetworkMap.config)

  return HdRetainedContainerDataSource.new(
    [
      HdMaterialNetworkSchemaTokens.nodes,
      HdMaterialNetworkSchemaTokens.terminals,
      HdMaterialNetworkSchemaTokens.config,
    ],
    [nodesDefaultContext, terminalsDefaultContext, configDefaultContext],
  )
}

export const HdUtils = {
  convertHdMaterialNetworkToHdMaterialSchema(
    hdNetworkMap: HdMaterialNetworkMap,
  ): HdContainerDataSource {
    // Create the material network, potentially one per network selector.
    const network =
      convertHdMaterialNetworkToHdMaterialNetworkSchema(hdNetworkMap)

    const defaultContext = HdMaterialSchemaTokens.universalRenderContext
    return HdRetainedContainerDataSource.new([defaultContext], [network])
  },
}
