// Ported from MaterialX 1.39.5: source/MaterialXCore/Material.h,
//  source/MaterialXCore/Material.cpp
// Copyright Contributors to the MaterialX Project. Apache License 2.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Mirrors source/MaterialXCore/Material.h and Material.cpp

import { Node, NodeGraph } from './node.ts'
import { Output } from './interface.ts'
import { MATERIAL_TYPE_STRING, SURFACE_SHADER_TYPE_STRING } from './types.ts'
import { EMPTY_STRING } from './util.ts'

// Return all shader nodes connected to the given material node's inputs,
// filtered by the given shader type and target. By default, all surface
// shader nodes are returned.
export function getShaderNodes(
  materialNode: Node,
  nodeType: string = SURFACE_SHADER_TYPE_STRING,
  target = EMPTY_STRING,
): Node[] {
  const shaderNodeVec: Node[] = []
  const shaderNodeSet = new Set<Node>()

  const inputs = materialNode.getActiveInputs()
  for (const input of inputs) {
    // Scan for a node directly connected to the input. Note that this will
    // handle traversing through interfacename associations.
    const shaderNode = input.getConnectedNode()
    if (shaderNode && !shaderNodeSet.has(shaderNode)) {
      let inputMatchesOutputType = nodeType !== '' && shaderNode.getType() === nodeType

      if (shaderNode.isMultiOutputType()) {
        const activeOutputs = shaderNode.getActiveOutputs()
        const multiOutputMatches = activeOutputs.some((output) => output.getType() === nodeType)
        inputMatchesOutputType = multiOutputMatches || inputMatchesOutputType
      }

      if (!inputMatchesOutputType) {
        continue
      }

      if (target !== '') {
        const nodeDef = shaderNode.getNodeDef(target)
        if (!nodeDef) {
          continue
        }
      }

      shaderNodeVec.push(shaderNode)
      shaderNodeSet.add(shaderNode)
    } else if (input.hasNodeGraphString()) {
      // Check the upstream nodegraph connected to the input. If no explicit
      // output name is given then scan all outputs on the nodegraph.
      const parent = materialNode.getParent()
      const nodeGraph = parent ? parent.getChildOfType(NodeGraph, input.getNodeGraphString()) : null
      if (!nodeGraph) {
        continue
      }
      let outputs: Output[]
      if (input.hasOutputString()) {
        const connectedOutput = nodeGraph.getOutput(input.getOutputString())
        outputs = connectedOutput ? [connectedOutput] : []
      } else {
        outputs = nodeGraph.getOutputs()
      }
      for (const output of outputs) {
        const upstreamNode = output.getConnectedNode()
        if (upstreamNode && !shaderNodeSet.has(upstreamNode)) {
          if (target !== '' && !upstreamNode.getNodeDef(target)) {
            continue
          }
          shaderNodeVec.push(upstreamNode)
          shaderNodeSet.add(upstreamNode)
        }
      }
    }
  }

  if (shaderNodeVec.length === 0) {
    // Try to find material nodes in the implementation graph, if any. When
    // a target is specified the nodedef for the given target is used.
    const materialNodeDef = materialNode.getNodeDef(target)
    if (materialNodeDef) {
      const impl = materialNodeDef.getImplementation()
      if (impl && impl instanceof NodeGraph) {
        const implGraph = impl
        for (const defOutput of materialNodeDef.getOutputs()) {
          if (defOutput.getType() === MATERIAL_TYPE_STRING) {
            const implGraphOutput = implGraph.getOutput(defOutput.getName())
            if (implGraphOutput) {
              const it = implGraphOutput.traverseGraph()
              for (const _edge of it) {
                const upstreamElem = it.getUpstreamElement()
                if (!upstreamElem) {
                  it.setPruneSubgraph(true)
                  continue
                }
                const upstreamNode = upstreamElem.asA(Node)
                if (upstreamNode && upstreamNode.getType() === MATERIAL_TYPE_STRING) {
                  for (const shaderNode of getShaderNodes(upstreamNode, nodeType, target)) {
                    if (!shaderNodeSet.has(shaderNode)) {
                      shaderNodeVec.push(shaderNode)
                      shaderNodeSet.add(shaderNode)
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  }

  return shaderNodeVec
}

// Return all outputs connected to the given node's inputs.
export function getConnectedOutputs(node: Node): Output[] {
  const outputVec: Output[] = []
  const outputSet = new Set<Output>()
  for (const input of node.getInputs()) {
    const output = input.getConnectedOutput()
    if (output && !outputSet.has(output)) {
      outputVec.push(output)
      outputSet.add(output)
    }
  }
  return outputVec
}
