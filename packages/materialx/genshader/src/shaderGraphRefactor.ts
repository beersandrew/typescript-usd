// Ported from MaterialX 1.39.5:
//  source/MaterialXGenShader/ShaderGraphRefactor.h,
//  source/MaterialXGenShader/ShaderGraphRefactor.cpp
// Copyright Contributors to the MaterialX Project. Apache License 2.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Mirrors source/MaterialXGenShader/ShaderGraphRefactor.h and .cpp

import { NodeDef, Value } from '@mtlx/core'
import { Type } from './typeDesc.ts'
import { ShaderInput, ShaderNode, ShaderNodeClassification, ShaderOutput } from './shaderNode.ts'
import { ShaderGraph, type ShaderGraphRefactor } from './shaderGraph.ts'
import type { GenContext } from './genContext.ts'

function isBsdfMixNode(node: ShaderNode): boolean {
  return node.hasClassification(
    ShaderNodeClassification.BSDF | ShaderNodeClassification.CLOSURE | ShaderNodeClassification.MIX,
  )
}

function isLayerWithMixTop(node: ShaderNode): boolean {
  if (!node.hasClassification(ShaderNodeClassification.LAYER)) {
    return false
  }
  const top = node.getInput('top')
  if (!top || !top.getConnection()) {
    return false
  }
  return isBsdfMixNode(top.getConnection()!.getNode()!)
}

// Fold a mix weight into one side of a BSDF mix node, inserting a multiply
// node to combine the existing weight with the mix weight. Returns the
// upstream output to connect to the replacement add node.
function foldWeightIntoBsdf(
  graph: ShaderGraph,
  context: GenContext,
  bsdfInput: ShaderInput,
  weightSource: ShaderOutput | null,
  namePrefix: string,
  mulFloatDef: NodeDef,
  mulBsdfDef: NodeDef,
): ShaderOutput | null {
  const bsdfUpstream = bsdfInput.getConnection()
  if (!bsdfUpstream) {
    return null
  }

  const bsdfNode = bsdfUpstream.getNode()!
  const weightInput = bsdfNode.getInput('weight')
  if (weightInput) {
    // Create a multiply node to combine the existing weight with the mix
    // weight.
    const mulName = namePrefix + '_weight'
    const mulNode = graph.createNodeFromDef(mulName, mulName, mulFloatDef, context)
    const mulIn1 = mulNode.getInput('in1')
    const mulIn2 = mulNode.getInput('in2')
    if (mulIn1 && mulIn2) {
      const existingSource = weightInput.getConnection()
      if (existingSource) {
        weightInput.breakConnection()
        mulIn1.makeConnection(existingSource)
      } else if (weightInput.getValue()) {
        mulIn1.setValue(weightInput.getValue())
      } else {
        mulIn1.setValue(Value.createValue(1.0))
      }
      mulIn2.makeConnection(weightSource)
      weightInput.makeConnection(mulNode.getOutput())
    }
    return bsdfUpstream
  } else {
    // Wrap the BSDF with a BSDF*float multiply when no weight input exists.
    const mulName = namePrefix + '_mul'
    const mulNode = graph.createNodeFromDef(mulName, mulName, mulBsdfDef, context)
    const mulIn1 = mulNode.getInput('in1')
    const mulIn2 = mulNode.getInput('in2')
    if (mulIn1 && mulIn2) {
      mulIn1.makeConnection(bsdfUpstream)
      mulIn2.makeConnection(weightSource)
      return mulNode.getOutput()
    }
    return bsdfUpstream
  }
}

// Elides constant and filename dot nodes by moving their values downstream.
export class NodeElisionRefactor implements ShaderGraphRefactor {
  getName(): string {
    return 'nodeElision'
  }

  execute(graph: ShaderGraph, context: GenContext): number {
    let numEdits = 0
    for (const node of graph.getNodes()) {
      if (node.hasClassification(ShaderNodeClassification.CONSTANT)) {
        if (node.numInputs() !== 1 || node.numOutputs() !== 1) {
          // The constant node doesn't follow the expected interface.
          continue
        }
        // Constant nodes can be elided by moving their value downstream.
        let canElide = context.getOptions().elideConstantNodes
        if (!canElide) {
          // Filename constant nodes are always elided regardless of the
          // option (see DOT below).
          const inPort = node.getInput('value')
          if (inPort && inPort.getType().equals(Type.FILENAME)) {
            canElide = true
          }
        }
        if (canElide) {
          graph.bypass(node, 0)
          ++numEdits
        }
      } else if (node.hasClassification(ShaderNodeClassification.DOT)) {
        if (node.numOutputs() !== 1) {
          continue
        }
        // Filename dot nodes must be elided so they do not create extra
        // samplers.
        const inPort = node.getInput('in')
        if (inPort && inPort.getType().equals(Type.FILENAME)) {
          graph.bypass(node, 0)
          ++numEdits
        }
      }
    }
    return numEdits
  }
}

// Replaces BSDF mix nodes with premultiplied add nodes.
export class PremultipliedBsdfAddRefactor implements ShaderGraphRefactor {
  getName(): string {
    return 'premultipliedBsdfAdd'
  }

  execute(graph: ShaderGraph, context: GenContext): number {
    if (!context.getOptions().premultipliedBsdfAdd) {
      return 0
    }

    // Look up all required node definitions up front.
    const doc = graph.getDocument()
    const invertDef = doc.getNodeDef('ND_invert_float')
    const mulFloatDef = doc.getNodeDef('ND_multiply_float')
    const mulBsdfDef = doc.getNodeDef('ND_multiply_bsdfF')
    const addBsdfDef = doc.getNodeDef('ND_add_bsdf')
    if (!invertDef || !mulFloatDef || !mulBsdfDef || !addBsdfDef) {
      return 0
    }

    // Collect mix nodes with connected weights first to avoid modifying the
    // graph while iterating.
    const mixNodes: ShaderNode[] = []
    for (const node of graph.getNodes()) {
      if (isBsdfMixNode(node)) {
        const mix = node.getInput('mix')
        if (mix && mix.getConnection()) {
          mixNodes.push(node)
        }
      }
    }

    let numEdits = 0

    for (const mixNode of mixNodes) {
      const fgInput = mixNode.getInput('fg')
      const bgInput = mixNode.getInput('bg')
      const mixInput = mixNode.getInput('mix')
      const mixOutput = mixNode.getOutput()

      if (!fgInput || !bgInput || !mixInput || !mixOutput) {
        continue
      }

      const mixWeightSource = mixInput.getConnection()

      // Create an invert node to compute (1 - mix).
      const invertName = mixNode.getName() + '_mix_inv'
      const invertNode = graph.createNodeFromDef(invertName, invertName, invertDef, context)
      const invertIn = invertNode.getInput('in')
      if (invertIn) {
        invertIn.makeConnection(mixWeightSource)
      }
      const invertOutput = invertNode.getOutput()

      // Fold mix weights into each BSDF side.
      const namePrefix = mixNode.getName()
      const fgUpstream = foldWeightIntoBsdf(graph, context, fgInput, mixWeightSource, namePrefix + '_fg', mulFloatDef, mulBsdfDef)
      const bgUpstream = foldWeightIntoBsdf(graph, context, bgInput, invertOutput, namePrefix + '_bg', mulFloatDef, mulBsdfDef)

      // Create an add node to replace the mix.
      const addName = mixNode.getName() + '_add'
      const addNode = graph.createNodeFromDef(addName, addName, addBsdfDef, context)
      const addIn1 = addNode.getInput('in1')
      const addIn2 = addNode.getInput('in2')
      if (!addIn1 || !addIn2) {
        continue
      }

      if (fgUpstream) {
        addIn1.makeConnection(fgUpstream)
      }
      if (bgUpstream) {
        addIn2.makeConnection(bgUpstream)
      }

      // Rewire all downstream connections from the mix output to the add
      // output.
      graph.replaceOutput(mixOutput, addNode.getOutput()!)

      // Disconnect the mix node's inputs.
      fgInput.breakConnection()
      bgInput.breakConnection()
      mixInput.breakConnection()

      ++numEdits
    }

    return numEdits
  }
}

// Transforms layer(mix(A, B, w), C) into mix(layer(A, C), layer(B, C), w).
export class DistributeLayerOverMixRefactor implements ShaderGraphRefactor {
  getName(): string {
    return 'distributeLayerOverMix'
  }

  execute(graph: ShaderGraph, context: GenContext): number {
    if (!context.getOptions().distributeLayerOverBsdfMix) {
      return 0
    }

    // Look up all required node definitions up front.
    const doc = graph.getDocument()
    const layerBsdfDef = doc.getNodeDef('ND_layer_bsdf')
    const mixBsdfDef = doc.getNodeDef('ND_mix_bsdf')
    if (!layerBsdfDef || !mixBsdfDef) {
      return 0
    }

    // Collect layer nodes to process first.
    const layerNodes: ShaderNode[] = []
    for (const node of graph.getNodes()) {
      if (isLayerWithMixTop(node)) {
        layerNodes.push(node)
      }
    }

    let numEdits = 0

    for (const layerNode of layerNodes) {
      const topInput = layerNode.getInput('top')
      const baseInput = layerNode.getInput('base')
      const layerOutput = layerNode.getOutput()

      if (!topInput || !baseInput || !layerOutput) {
        continue
      }

      const topConnection = topInput.getConnection()
      if (!topConnection) {
        continue
      }

      const mixNode = topConnection.getNode()!
      const fgInput = mixNode.getInput('fg')
      const bgInput = mixNode.getInput('bg')
      const mixInput = mixNode.getInput('mix')

      if (!fgInput || !bgInput || !mixInput) {
        continue
      }

      const fgUpstream = fgInput.getConnection()
      const bgUpstream = bgInput.getConnection()
      const baseUpstream = baseInput.getConnection()
      const mixWeightSource = mixInput.getConnection()

      // Create layer(fg, base).
      const layer1Name = layerNode.getName() + '_tf'
      const layer1 = graph.createNodeFromDef(layer1Name, layer1Name, layerBsdfDef, context)
      const layer1Top = layer1.getInput('top')
      const layer1Base = layer1.getInput('base')
      if (layer1Top && fgUpstream) {
        layer1Top.makeConnection(fgUpstream)
      }
      if (layer1Base && baseUpstream) {
        layer1Base.makeConnection(baseUpstream)
      }

      // Create layer(bg, base).
      const layer2Name = layerNode.getName() + '_notf'
      const layer2 = graph.createNodeFromDef(layer2Name, layer2Name, layerBsdfDef, context)
      const layer2Top = layer2.getInput('top')
      const layer2Base = layer2.getInput('base')
      if (layer2Top && bgUpstream) {
        layer2Top.makeConnection(bgUpstream)
      }
      if (layer2Base && baseUpstream) {
        layer2Base.makeConnection(baseUpstream)
      }

      // Create mix(layer1, layer2, w).
      const newMixName = layerNode.getName() + '_mix'
      const newMixNode = graph.createNodeFromDef(newMixName, newMixName, mixBsdfDef, context)
      const newFg = newMixNode.getInput('fg')
      const newBg = newMixNode.getInput('bg')
      const newMix = newMixNode.getInput('mix')
      if (newFg) {
        newFg.makeConnection(layer1.getOutput())
      }
      if (newBg) {
        newBg.makeConnection(layer2.getOutput())
      }
      if (newMix && mixWeightSource) {
        newMix.makeConnection(mixWeightSource)
      } else if (newMix && mixInput.getValue()) {
        newMix.setValue(mixInput.getValue())
      }

      // Rewire downstream connections from the old layer to the new mix.
      graph.replaceOutput(layerOutput, newMixNode.getOutput()!)

      // Disconnect the old layer node's inputs.
      topInput.breakConnection()
      baseInput.breakConnection()

      ++numEdits
    }

    return numEdits
  }
}
