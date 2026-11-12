// Ported from MaterialX 1.39.5: source/MaterialXCore/Version.cpp
// Copyright Contributors to the MaterialX Project. Apache License 2.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Mirrors the 1.38 -> 1.39 portion of source/MaterialXCore/Version.cpp.
//
// Per the project roadmap, only the single 1.38 -> 1.39 upgrade step is
// supported: most wild .mtlx content is 1.38, while the 1.22-1.37 long tail
// is deliberately out of scope. Documents older than 1.38 fail with a clear
// unsupported-version error.

import { Exception } from './exceptions.ts'
import { Element, ValueElement } from './element.ts'
import { PortElement, InterfaceElement } from './interface.ts'
import { GraphElement, Node } from './node.ts'
import { MULTI_OUTPUT_TYPE_STRING } from './types.ts'
import { ARRAY_VALID_SEPARATORS, EMPTY_STRING, joinStrings, splitString } from './util.ts'
import { TypedValue } from './value.ts'

// The surface of Document used here, avoiding a circular runtime import.
interface DocumentLike extends GraphElement {
  getVersionIntegers(): [number, number]
}

// Copy an input between nodes, maintaining all existing bindings.
function copyInputWithBindings(sourceNode: Node, sourceInputName: string, destNode: Node, destInputName: string): void {
  const sourceInput = sourceNode.getInput(sourceInputName)
  if (sourceInput) {
    let destInput = destNode.getInput(destInputName)
    if (!destInput) {
      destInput = destNode.addInput(destInputName, sourceInput.getType())
    }
    destInput.copyContentFrom(sourceInput)
  }
}

const CHANNEL_INDEX_MAP = new Map<string, number>([
  ['r', 0], ['g', 1], ['b', 2], ['a', 3],
  ['x', 0], ['y', 1], ['z', 2], ['w', 3],
])
const CHANNEL_CONSTANT_MAP = new Map<string, number>([
  ['0', 0.0],
  ['1', 1.0],
])
const CHANNEL_COUNT_MAP = new Map<string, number>([
  ['float', 1],
  ['color3', 3], ['color4', 4],
  ['vector2', 2], ['vector3', 3], ['vector4', 4],
])
const CHANNEL_CONVERT_PATTERNS: Array<[string, number]> = [
  ['rgb', 3], ['rgb', 4], ['rgba', 4],
  ['xyz', 3], ['xyz', 4], ['xyzw', 4],
  ['rr', 1], ['rrr', 1],
  ['xx', 1], ['xxx', 1],
]
const CHANNEL_ATTRIBUTE_PATTERNS: Array<[Set<string>, string]> = [
  [new Set(['xx', 'xxx', 'xxxx']), 'float'],
  [new Set(['xyz', 'x', 'y', 'z']), 'vector3'],
  [new Set(['rgba', 'a']), 'color4'],
]

function findAncestorGraph(elem: Element): GraphElement | null {
  for (let e: Element | null = elem; e; e = e.getParent()) {
    if (e.isGraphElement()) return e as GraphElement
  }
  return null
}

function upgrade38To39(doc: DocumentLike): void {
  // Convert channels attributes to legacy swizzle nodes, which are then
  // converted to modern nodes in a second pass.
  for (const elem of doc.traverseTree()) {
    const port = elem.asA(PortElement)
    if (!port) continue

    const channelString = port.getAttribute('channels')
    if (channelString === '') continue

    // Determine the upstream type.
    const parent = port.getParent()!
    const graph = findAncestorGraph(port)
    const upstreamNode = port.getConnectedNode()
    let upstreamType = upstreamNode ? upstreamNode.getType() : EMPTY_STRING
    if (upstreamType === '' || upstreamType === MULTI_OUTPUT_TYPE_STRING) {
      for (const [patterns, type] of CHANNEL_ATTRIBUTE_PATTERNS) {
        if (patterns.has(channelString)) {
          upstreamType = type
          break
        }
      }
      if (upstreamType === '' || upstreamType === MULTI_OUTPUT_TYPE_STRING) {
        upstreamType = port.getType() === 'color3' ? 'color4' : 'color3'
      }
    }

    // Ignore the channels string for purely scalar connections.
    if (upstreamType === 'float' && port.getType() === 'float') {
      port.removeAttribute('channels')
      continue
    }

    // Create the new swizzle node.
    if (!graph) continue
    const swizzleNode = graph.addNode('swizzle', graph.createValidChildName('swizzle'), port.getType())
    const childIndex =
      parent.getParent() === graph ? graph.getChildIndex(parent.getName()) : graph.getChildIndex(port.getName())
    if (childIndex !== -1) {
      graph.setChildIndex(swizzleNode.getName(), childIndex)
    }
    const inInput = swizzleNode.addInput('in')
    inInput.copyContentFrom(port)
    inInput.removeAttribute('channels')
    inInput.setType(upstreamType)
    swizzleNode.setInputValue('channels', channelString, 'string')

    // Connect the original port to this node.
    port.setConnectedNode(swizzleNode)
    port.removeAttribute(PortElement.OUTPUT_ATTRIBUTE)
    port.removeAttribute(ValueElement.INTERFACE_NAME_ATTRIBUTE)
    port.removeAttribute('channels')

    // Update any nodegraph reference.
    const portNodeGraphString = port.getNodeGraphString()
    if (portNodeGraphString !== '') {
      const graphName = graph.getName()
      if (graphName === '') {
        port.removeAttribute(PortElement.NODE_GRAPH_ATTRIBUTE)
      } else if (graphName !== portNodeGraphString) {
        port.setNodeGraphString(graphName)
      }
    }
  }

  // Update all nodes.
  const unusedNodes: Node[] = []
  for (const elem of doc.traverseTree()) {
    const node = elem.asA(Node)
    if (!node) continue
    const nodeCategory = node.getCategory()
    if (nodeCategory === 'layer') {
      // Convert layering of thin_film_bsdf nodes to thin-film parameters on
      // the affected BSDF nodes.
      const top = node.getConnectedNode('top')
      const base = node.getConnectedNode('base')
      if (top && base && top.getCategory() === 'thin_film_bsdf') {
        // Apply thin-film parameters to all supported BSDFs upstream.
        const BSDF_WITH_THINFILM = new Set(['dielectric_bsdf', 'conductor_bsdf', 'generalized_schlick_bsdf'])
        for (const edge of node.traverseGraph()) {
          const upstream = edge.getUpstreamElement()?.asA(Node) ?? null
          if (upstream && BSDF_WITH_THINFILM.has(upstream.getCategory())) {
            const scatterMode = upstream.getInput('scatter_mode')
            if (!scatterMode || scatterMode.getValueString() !== 'T') {
              copyInputWithBindings(top, 'thickness', upstream, 'thinfilm_thickness')
              copyInputWithBindings(top, 'ior', upstream, 'thinfilm_ior')
            }
          }
        }

        // Bypass the thin-film layer operator.
        for (const port of node.getDownstreamPorts()) {
          port.setNodeName(base.getName())
        }

        // Mark the original nodes as unused.
        unusedNodes.push(node, top)
      }
    } else if (nodeCategory === 'subsurface_bsdf') {
      const radiusInput = node.getInput('radius')
      if (radiusInput && radiusInput.getType() === 'vector3') {
        const graph = findAncestorGraph(node)!
        const convertNode = graph.addNode('convert', graph.createValidChildName('convert'), 'color3')
        copyInputWithBindings(node, 'radius', convertNode, 'in')
        radiusInput.setConnectedNode(convertNode)
        radiusInput.setType('color3')
      }
    } else if (nodeCategory === 'switch') {
      // Upgrade switch nodes from 5 to 10 inputs, handling the fallback
      // behavior for constant "which" values previously out of range.
      const which = node.getInput('which')
      if (which && which.hasValue()) {
        const whichValue = which.getValue()
        if (whichValue instanceof TypedValue) {
          if (whichValue.isA('integer') && (whichValue.getData() as number) >= 5) {
            which.setValue(0, 'integer')
          } else if (whichValue.isA('float') && (whichValue.getData() as number) >= 5) {
            which.setValue(0.0)
          }
        }
      }
    } else if (nodeCategory === 'swizzle') {
      const inInput = node.getInput('in')
      const sourceType = inInput ? inInput.getType() : 'float'
      if (CHANNEL_COUNT_MAP.has(sourceType) && CHANNEL_COUNT_MAP.has(node.getType())) {
        const channelsInput = node.getInput('channels')
        const channelString = channelsInput ? channelsInput.getValueString() : EMPTY_STRING
        const destType = node.getType()
        const sourceChannelCount = CHANNEL_COUNT_MAP.get(sourceType)!
        const destChannelCount = CHANNEL_COUNT_MAP.get(destType)!

        // Resolve the invalid case of having both a connection and a value
        // by removing the value attribute.
        if (inInput && inInput.hasValue()) {
          if (inInput.hasNodeName() || inInput.hasNodeGraphString() || inInput.hasInterfaceName()) {
            inInput.removeAttribute(ValueElement.VALUE_ATTRIBUTE)
          }
        }

        // We convert to a constant node if the "in" input is a constant
        // value or does not exist.
        let convertToConstantNode = !inInput || inInput.hasValue()
        // We also convert to a constant node if every destination channel
        // is constant (e.g. channels "010").
        if (!convertToConstantNode) {
          convertToConstantNode = true
          for (let i = 0; i < destChannelCount; i++) {
            if (i < channelString.length && CHANNEL_CONSTANT_MAP.has(channelString[i]!)) {
              continue
            }
            convertToConstantNode = false
            break
          }
        }

        if (convertToConstantNode) {
          // Replace swizzle with constant.
          node.setCategory('constant')
          if (node.hasNodeDefString()) {
            node.setNodeDefString('ND_constant_' + node.getType())
          }
          const valueString = inInput ? inInput.getValueString() : '0'
          const origValueTokens = splitString(valueString, ARRAY_VALID_SEPARATORS)
          const newValueTokens: string[] = []
          for (let i = 0; i < destChannelCount; i++) {
            const channel = i < channelString.length ? channelString[i]! : ''
            if (CHANNEL_INDEX_MAP.has(channel)) {
              const index = CHANNEL_INDEX_MAP.get(channel)!
              if (index < origValueTokens.length) {
                newValueTokens.push(origValueTokens[index]!)
                continue
              }
            } else if (CHANNEL_CONSTANT_MAP.has(channel)) {
              // Mirrors C++ std::to_string(float), which writes 6 decimals.
              newValueTokens.push(CHANNEL_CONSTANT_MAP.get(channel)!.toFixed(6))
              continue
            }
            // Invalid channel name, or missing channel name.
            newValueTokens.push(origValueTokens[0]!)
          }
          const valueInput = node.addInput('value', node.getType())
          valueInput.setValueString(joinStrings(newValueTokens, ', '))
          if (inInput) {
            node.removeInput(inInput.getName())
          }
        } else if (destChannelCount === 1) {
          // Replace swizzle with extract.
          node.setCategory('extract')
          if (node.hasNodeDefString()) {
            node.setNodeDefString('ND_extract_' + sourceType)
          }
          if (channelString !== '' && CHANNEL_INDEX_MAP.has(channelString[0]!)) {
            node.setInputValue('index', CHANNEL_INDEX_MAP.get(channelString[0]!)!, 'integer')
          }
        } else if (
          sourceType !== destType &&
          CHANNEL_CONVERT_PATTERNS.some(([str, count]) => str === channelString && count === sourceChannelCount)
        ) {
          // Replace swizzle with convert.
          node.setCategory('convert')
          if (node.hasNodeDefString()) {
            node.setNodeDefString('ND_convert_' + sourceType + '_' + destType)
          }
        } else if (sourceChannelCount === 1) {
          // Replace swizzle with combine.
          node.setCategory('combine' + String(destChannelCount))
          if (node.hasNodeDefString()) {
            node.setNodeDefString('ND_combine' + String(destChannelCount) + '_' + node.getType())
          }
          for (let i = 0; i < destChannelCount; i++) {
            const combineInInput = node.addInput('in' + String(i + 1), 'float')
            if (i < channelString.length && CHANNEL_CONSTANT_MAP.has(channelString[i]!)) {
              combineInInput.setValue(CHANNEL_CONSTANT_MAP.get(channelString[i]!)!)
            } else {
              copyInputWithBindings(node, inInput!.getName(), node, combineInInput.getName())
            }
          }
          node.removeInput(inInput!.getName())
        } else {
          // Replace swizzle with separate and combine.
          const graph = findAncestorGraph(node)!
          const separateNode = graph.addNode(
            'separate' + String(sourceChannelCount),
            graph.createValidChildName('separate'),
            MULTI_OUTPUT_TYPE_STRING,
          )
          const childIndex = graph.getChildIndex(node.getName())
          if (childIndex !== -1) {
            graph.setChildIndex(separateNode.getName(), childIndex)
          }
          node.setCategory('combine' + String(destChannelCount))
          if (node.hasNodeDefString()) {
            node.setNodeDefString('ND_combine' + String(destChannelCount) + '_' + node.getType())
          }
          for (let i = 0; i < destChannelCount; i++) {
            const combineInInput = node.addInput('in' + String(i + 1), 'float')
            if (i < channelString.length) {
              const channel = channelString[i]!
              if (CHANNEL_INDEX_MAP.has(channel)) {
                combineInInput.setConnectedNode(separateNode)
                combineInInput.setOutputString('out' + channel)
                continue
              } else if (CHANNEL_CONSTANT_MAP.has(channel)) {
                combineInInput.setValue(CHANNEL_CONSTANT_MAP.get(channel)!)
                continue
              }
            }
            // Invalid channel name, or missing channel name.
            combineInInput.setConnectedNode(separateNode)
            combineInInput.setOutputString(inInput!.isColorType() ? 'outr' : 'outx')
          }
          copyInputWithBindings(node, inInput!.getName(), separateNode, 'in')
          node.removeInput(inInput!.getName())
        }

        // Remove the channels input from the converted node.
        if (channelsInput) {
          node.removeInput(channelsInput.getName())
        }
      }
    } else if (nodeCategory === 'atan2') {
      const input1 = node.getInput('in1')
      if (input1) {
        input1.setName('iny')
      }
      const input2 = node.getInput('in2')
      if (input2) {
        input2.setName('inx')
      }
    } else if (nodeCategory === 'normalmap') {
      const space = node.getInput('space')
      if (space && space.getValueString() === 'object') {
        // Replace an object-space normalmap with a graph.
        const graph = findAncestorGraph(node)!
        const multiply = graph.addNode('multiply', graph.createValidChildName('multiply'), 'vector3')
        copyInputWithBindings(node, 'in', multiply, 'in1')
        multiply.setInputValue('in2', 2.0)
        const subtract = graph.addNode('subtract', graph.createValidChildName('subtract'), 'vector3')
        subtract.addInput('in1', 'vector3').setConnectedNode(multiply)
        subtract.setInputValue('in2', 1.0)
        node.setCategory('normalize')
        for (const input of [...node.getInputs()]) {
          node.removeChild(input.getName())
        }
        node.addInput('in', 'vector3').setConnectedNode(subtract)

        // Update the nodedef name if present.
        if (node.hasNodeDefString()) {
          node.setNodeDefString('ND_normalize_vector3')
        }
      } else {
        // Clear the tangent-space input.
        node.removeInput('space')

        // If the normal or tangent inputs are set and the bitangent input
        // is not, the bitangent should be set to normalize(cross(N, T)).
        const normalInput = node.getInput('normal')
        const tangentInput = node.getInput('tangent')
        const bitangentInput = node.getInput('bitangent')
        if ((normalInput || tangentInput) && !bitangentInput) {
          const graph = findAncestorGraph(node)!
          const crossNode = graph.addNode('crossproduct', graph.createValidChildName('normalmap_cross'), 'vector3')
          copyInputWithBindings(node, 'normal', crossNode, 'in1')
          copyInputWithBindings(node, 'tangent', crossNode, 'in2')

          const normalizeNode = graph.addNode(
            'normalize',
            graph.createValidChildName('normalmap_cross_norm'),
            'vector3',
          )
          normalizeNode.addInput('in', 'vector3').setConnectedNode(crossNode)

          node.addInput('bitangent', 'vector3').setConnectedNode(normalizeNode)
        }

        // Update the nodedef name if present.
        if (node.getNodeDefString() === 'ND_normalmap') {
          node.setNodeDefString('ND_normalmap_float')
        }
      }
    }
  }
  for (const node of unusedNodes) {
    node.getParent()!.removeChild(node.getName())
  }
}

// Upgrade the content of the given document to the library version.
// Supports 1.38 -> 1.39 only; older documents raise a clear error.
export function upgradeDocumentVersion(doc: DocumentLike): void {
  const [majorVersion, minorVersion] = doc.getVersionIntegers()
  if (majorVersion > 1 || (majorVersion === 1 && minorVersion >= 39)) {
    return
  }
  if (!(majorVersion === 1 && minorVersion === 38)) {
    throw new Exception(
      `Unsupported document version ${majorVersion}.${minorVersion}: ` +
        'This port upgrades MaterialX 1.38 documents only (see packages/materialx/README.md)',
    )
  }

  upgrade38To39(doc)

  ;(doc as unknown as InterfaceElement).setVersionIntegers(1, 39)
}
