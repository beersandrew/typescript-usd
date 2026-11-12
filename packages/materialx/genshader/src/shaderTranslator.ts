// Ported from MaterialX 1.39.5: source/MaterialXGenShader/ShaderTranslator.h,
//  source/MaterialXGenShader/ShaderTranslator.cpp
// Copyright Contributors to the MaterialX Project. Apache License 2.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Mirrors source/MaterialXGenShader/ShaderTranslator.h and .cpp

import {
  EMPTY_STRING,
  Exception,
  InterfaceElement,
  Node,
  NodeGraph,
  getConnectedOutputs,
  getShaderNodes,
  type Document,
  type Input,
  type NodeDef,
  type Output,
} from '@mtlx/core'
import { connectsToWorldSpaceNode, findRenderableMaterialNodes } from './util.ts'

// A helper class for translating content between shading models.
export class ShaderTranslator {
  protected _graph: NodeGraph | null = null
  protected _translationNode: Node | null = null

  protected constructor() {}

  static create(): ShaderTranslator {
    return new ShaderTranslator()
  }

  // Connect translation node inputs from the original shader
  protected connectTranslationInputs(shader: Node, translationNodeDef: NodeDef): void {
    const origInputs = shader.getInputs()
    const origOutputs = new Set<Output>()
    for (const shaderInput of origInputs) {
      if (translationNodeDef.getActiveInput(shaderInput.getName())) {
        const input = this._translationNode!.addInput(shaderInput.getName(), shaderInput.getType())

        const connectedOutput = shaderInput.getConnectedOutput()
        if (connectedOutput) {
          let connectedNode = connectedOutput.getConnectedNode()

          // Nodes with world-space outputs are skipped, with translation being applied to
          // the node directly upstream.
          const worldSpaceNode = connectsToWorldSpaceNode(connectedOutput)
          if (worldSpaceNode) {
            const upstreamNode = worldSpaceNode.getConnectedNode('in')
            if (upstreamNode) {
              connectedNode = upstreamNode
            }
          }

          input.setConnectedNode(connectedNode)
          origOutputs.add(connectedOutput)
        } else if (shaderInput.hasValueString()) {
          input.setValueString(shaderInput.getValueString())
        } else {
          throw new Exception('Shader input has no associated output or value ' + shaderInput.getName())
        }

        const colorSpace = shaderInput.getActiveColorSpace()
        if (colorSpace !== '') {
          input.setColorSpace(colorSpace)
        }
        if (shaderInput.hasUnit()) {
          input.setUnit(shaderInput.getUnit())
          input.setUnitType(shaderInput.getUnitType())
        }
      }
    }

    for (const input of origInputs) {
      shader.removeInput(input.getName())
    }
    for (const output of origOutputs) {
      this._graph!.removeOutput(output.getName())
    }
  }

  // Connect translation node outputs to finalize shader translation
  protected connectTranslationOutputs(shader: Node): void {
    const nodeDef = this._translationNode!.getNodeDef()
    if (!nodeDef) {
      throw new Exception('No nodedef for ' + this._translationNode!.getCategory() + ' was found')
    }

    // Iterate through outputs of the translation graph.
    for (const translationGraphOutput of nodeDef.getActiveOutputs()) {
      // Convert output name to input name, using a hardcoded naming convention for now.
      const outputName = translationGraphOutput.getName()
      const pos = outputName.indexOf('_out')
      if (pos === -1) {
        throw new Exception('Translation graph output ' + outputName + " does not end with '_out'")
      }
      const inputName = outputName.substring(0, pos)

      // Determine the node and output representing this translated stream.
      let translatedStreamNode = this._translationNode!
      let translatedStreamOutput = outputName

      // Nodes with world-space outputs are moved outside of their containing graph,
      // providing greater flexibility in texture baking.
      const worldSpaceNode = connectsToWorldSpaceNode(translationGraphOutput)
      if (worldSpaceNode) {
        const nodeInput = worldSpaceNode.getInput('in')
        if (nodeInput && nodeInput.hasInterfaceName()) {
          const interfaceInput = this._translationNode!.getInput(nodeInput.getInterfaceName())
          const sourceNode = interfaceInput ? interfaceInput.getConnectedNode() : null
          if (!sourceNode) {
            continue
          }
          translatedStreamNode = this._graph!.addNode(
            worldSpaceNode.getCategory(),
            worldSpaceNode.getName(),
            worldSpaceNode.getType(),
          )
          translatedStreamNode.setConnectedNode('in', sourceNode)
          translatedStreamOutput = EMPTY_STRING
        }
      }

      // Create translated output.
      let translatedOutput = this._graph!.getOutput(outputName)
      if (!translatedOutput) {
        translatedOutput = this._graph!.addOutput(outputName, translationGraphOutput.getType())
      }
      translatedOutput.setConnectedNode(translatedStreamNode)
      if (translatedStreamOutput !== '') {
        translatedOutput.setOutputString(translatedStreamOutput)
      }

      // Add translated shader input.
      let translatedShaderInput = shader.getInput(inputName)
      if (!translatedShaderInput) {
        translatedShaderInput = shader.addInput(inputName, translationGraphOutput.getType())
      }
      translatedShaderInput.setConnectedOutput(translatedOutput)
    }
  }

  // Translate a shader node to the destination shading model.
  translateShader(shader: Node | null, destCategory: string): void {
    this._graph = null
    this._translationNode = null

    if (!shader) {
      return
    }

    const sourceCategory = shader.getCategory()
    if (sourceCategory === destCategory) {
      throw new Exception(
        'The source shader "' + shader.getNamePath() + '" category is already "' + destCategory + '"',
      )
    }

    const doc = shader.getDocument() as Document
    const referencedOutputs = getConnectedOutputs(shader)
    const referencedParent = referencedOutputs.length > 0 ? referencedOutputs[0]!.getParent() : null
    const referencedGraph = referencedParent ? referencedParent.asA(NodeGraph) : null
    this._graph = referencedGraph ?? doc.addNodeGraph()

    const translateNodeString = sourceCategory + '_to_' + destCategory
    const matchingNodeDefs = doc.getMatchingNodeDefs(translateNodeString)
    if (matchingNodeDefs.length === 0) {
      throw new Exception('Shader translation requires a translation nodedef named ' + translateNodeString)
    }
    const translationNodeDef = matchingNodeDefs[0]!
    this._translationNode = this._graph.addNodeInstance(translationNodeDef)

    this.connectTranslationInputs(shader, translationNodeDef)
    shader.setCategory(destCategory)
    shader.removeAttribute(InterfaceElement.NODE_DEF_ATTRIBUTE)
    this.connectTranslationOutputs(shader)
  }

  // Translate each material in the input document to the destination
  // shading model.
  translateAllMaterials(doc: Document, destCategory: string): void {
    const materialNodes = findRenderableMaterialNodes(doc)
    for (const elem of materialNodes) {
      const materialNode = elem.asA(Node)
      if (!materialNode) {
        continue
      }
      for (const shaderNode of getShaderNodes(materialNode)) {
        this.translateShader(shaderNode, destCategory)
      }
    }
  }
}
