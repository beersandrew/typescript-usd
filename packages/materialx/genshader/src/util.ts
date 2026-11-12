// Ported from MaterialX 1.39.5: source/MaterialXGenShader/Util.h,
//  source/MaterialXGenShader/Util.cpp
// Copyright Contributors to the MaterialX Project. Apache License 2.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Mirrors source/MaterialXGenShader/Util.h and Util.cpp

import {
  Color3,
  Color4,
  Document,
  Element,
  Input,
  Node,
  NodeDef,
  NodeGraph,
  Output,
  TypedElement,
  TypedValue,
  Value,
  Vector2,
  Vector3,
  Vector4,
  getShaderNodes,
  EMPTY_STRING,
  Exception,
  type StringMap,
} from '@mtlx/core'

// Gaussian kernel weights for different kernel sizes, shared between the
// convolution node implementations and image utilities.
export const GAUSSIAN_KERNEL_3 = [0.27901, 0.44198, 0.27901] // Sigma 1
export const GAUSSIAN_KERNEL_5 = [0.06136, 0.24477, 0.38774, 0.24477, 0.06136] // Sigma 1
export const GAUSSIAN_KERNEL_7 = [0.00598, 0.060626, 0.241843, 0.383103, 0.241843, 0.060626, 0.00598] // Sigma 1

type OpaqueTestPair = [string, number]

// Inputs on a surface shader which are checked for transparency.
const DEFAULT_INPUT_PAIR_LIST: OpaqueTestPair[] = [
  ['opacity', 1.0],
  ['existence', 1.0],
  ['alpha', 1.0],
  ['transmission', 0.0],
]

const MIX_CATEGORY = 'mix'
const MIX_FG_INPUT = 'fg'
const MIX_BG_INPUT = 'bg'

function floatIsEqual(v1: number, v2: number): boolean {
  const EPSILON = 0.00001
  return Math.abs(v1 - v2) < EPSILON
}

function valueIsEqual(value: Value, f: number): boolean {
  if (value instanceof TypedValue) {
    if (value.isA('float') && floatIsEqual(value.getData() as number, f)) {
      return true
    }
    if (value.isA('color3')) {
      const color = value.getData() as Color3
      if (floatIsEqual(color.getItem(0), f) && floatIsEqual(color.getItem(1), f) && floatIsEqual(color.getItem(2), f)) {
        return true
      }
    }
  }
  return false
}

// Get the corresponding input for an interfacename of a nodegraph, checking
// any corresponding nodedef first, then direct child inputs of the graph.
function getInputInterface(interfaceName: string, node: Node): Input | null {
  const parent = node.getParent()
  const nodeGraph = parent ? parent.asA(NodeGraph) : null
  if (nodeGraph) {
    const nodeDef = nodeGraph.getNodeDef()
    if (nodeDef) {
      return nodeDef.getInput(interfaceName)
    }
    return nodeGraph.getInput(interfaceName)
  }
  return null
}

function hasTransparentInputs(opaqueInputList: OpaqueTestPair[], node: Node): boolean {
  for (const [name, opaqueValue] of opaqueInputList) {
    const interfaceInput = node.getInput(name)
    if (interfaceInput) {
      if (interfaceInput.getConnectedNode()) {
        return true
      }
      const value = interfaceInput.getValue()
      if (value && !valueIsEqual(value, opaqueValue)) {
        return true
      }
    }
  }
  return false
}

function isTransparentShaderNode(node: Node | null, interfaceNode: Node | null): boolean {
  if (!node || node.getType() !== 'surfaceshader') {
    return false
  }

  if (node.getCategory() === MIX_CATEGORY) {
    const fg = node.getInput(MIX_FG_INPUT)
    const fgNode = fg ? fg.getConnectedNode() : null
    if (fgNode && isTransparentShaderNode(fgNode, null)) {
      return true
    }
    const bg = node.getInput(MIX_BG_INPUT)
    const bgNode = bg ? bg.getConnectedNode() : null
    if (bgNode && isTransparentShaderNode(bgNode, null)) {
      return true
    }
    return false
  }

  // Check against nodedef input hints.
  const inputPairList: OpaqueTestPair[] = [...DEFAULT_INPUT_PAIR_LIST]
  const nodeDef = node.getNodeDef()
  const nodeDefList = nodeDef ? nodeDef.getInputHints() : new Map<string, string>()
  for (const [inputName, hint] of nodeDefList) {
    if (hint === Input.TRANSPARENCY_HINT) {
      inputPairList.push([inputName, 0.0])
    } else if (hint === Input.OPACITY_HINT) {
      inputPairList.push([inputName, 1.0])
    }
  }

  // Check against the interface if a node was passed in to check against.
  if (interfaceNode) {
    const interfaceNames: OpaqueTestPair[] = []
    for (const [name, opaqueValue] of inputPairList) {
      const checkInput = node.getActiveInput(name)
      if (checkInput) {
        const interfaceName = checkInput.getInterfaceName()
        if (interfaceName !== '') {
          interfaceNames.push([interfaceName, opaqueValue])
        }
      }
    }
    if (interfaceNames.length > 0) {
      if (hasTransparentInputs(interfaceNames, interfaceNode)) {
        return true
      }
    }
  }

  // Check against the child input, or the corresponding functional
  // nodegraph's interface when the input is mapped via an interface name.
  for (const [name, opaqueValue] of inputPairList) {
    let checkInput = node.getActiveInput(name)
    if (checkInput) {
      const interfaceName = checkInput.getInterfaceName()
      if (interfaceName !== '') {
        const interfaceInput = getInputInterface(interfaceName, node)
        if (interfaceInput) {
          checkInput = interfaceInput
        } else {
          return false
        }
      }

      // If mapped but not an operator node then assume transparency.
      const inputNode = checkInput.getConnectedNode()
      if (inputNode) {
        const inputNodeDef = inputNode.getNodeDef()
        const nodeGroup = inputNodeDef ? inputNodeDef.getAttribute(NodeDef.NODE_GROUP_ATTRIBUTE) : EMPTY_STRING
        if (nodeGroup !== NodeDef.ADJUSTMENT_NODE_GROUP && nodeGroup !== NodeDef.CHANNEL_NODE_GROUP) {
          return true
        }
      } else {
        const value = checkInput.getValue()
        if (value && !valueIsEqual(value, opaqueValue)) {
          return true
        }
      }
    }
  }
  return false
}

function isTransparentShaderGraph(output: Output, target: string, interfaceNode: Node | null): boolean {
  const it = output.traverseGraph()
  for (const _edge of it) {
    const upstreamElem = it.getUpstreamElement()
    if (!upstreamElem) {
      continue
    }

    const node = upstreamElem.asA(Node)
    if (node) {
      // Handle shader nodes.
      if (isTransparentShaderNode(node, interfaceNode)) {
        return true
      }

      // Handle graph definitions.
      const nodeDef = node.getNodeDef()
      if (nodeDef && nodeDef.getType() === 'BSDF') {
        const impl = nodeDef.getImplementation(target)
        if (impl && impl instanceof NodeGraph) {
          const outputs = impl.getActiveOutputs()
          if (outputs.length > 0) {
            if (isTransparentShaderGraph(outputs[0]!, target, node)) {
              return true
            }
          }
        }
      }
    }
  }

  return false
}

// Returns true if the given element is a surface shader with the potential
// of being transparent. Used by HW shader generators to determine whether a
// shader requires transparency handling.
export function isTransparentSurface(element: Element, target = EMPTY_STRING): boolean {
  let node = element.asA(Node)
  if (node) {
    // Handle material nodes.
    if (node.getType() === 'material') {
      const shaderNodes = getShaderNodes(node)
      if (shaderNodes.length > 0) {
        node = shaderNodes[0]!
      }
    }

    // Handle shader nodes.
    if (isTransparentShaderNode(node, null)) {
      return true
    }

    // Handle graph definitions.
    const nodeDef = node.getNodeDef()
    const impl = nodeDef ? nodeDef.getImplementation(target) : null
    if (impl && impl instanceof NodeGraph) {
      const outputs = impl.getActiveOutputs()
      if (outputs.length > 0) {
        const output = outputs[0]!
        if (output.getType() === 'surfaceshader') {
          if (isTransparentShaderGraph(output, target, node)) {
            return true
          }
        }
      }
    }
  } else {
    const output = element.asA(Output)
    if (output) {
      const outputNode = output.getConnectedNode()
      if (outputNode) {
        return isTransparentSurface(outputNode, target)
      }
    }
  }

  return false
}

// Maps a value to a four channel color if it is of the appropriate type;
// otherwise the color is opaque black.
export function mapValueToColor(value: Value | null): Color4 {
  const color = new Color4(0.0, 0.0, 0.0, 1.0)
  if (!value || !(value instanceof TypedValue)) {
    return color
  }
  const data = value.getData()
  if (value.isA('float')) {
    color.setItem(0, data as number)
  } else if (value.isA('color3')) {
    const v = data as Color3
    color.setItem(0, v.getItem(0))
    color.setItem(1, v.getItem(1))
    color.setItem(2, v.getItem(2))
  } else if (value.isA('color4')) {
    return (data as Color4).copy() as Color4
  } else if (value.isA('vector2')) {
    const v = data as Vector2
    color.setItem(0, v.getItem(0))
    color.setItem(1, v.getItem(1))
  } else if (value.isA('vector3')) {
    const v = data as Vector3
    color.setItem(0, v.getItem(0))
    color.setItem(1, v.getItem(1))
    color.setItem(2, v.getItem(2))
  } else if (value.isA('vector4')) {
    const v = data as Vector4
    color.setItem(0, v.getItem(0))
    color.setItem(1, v.getItem(1))
    color.setItem(2, v.getItem(2))
    color.setItem(3, v.getItem(3))
  }
  return color
}

// Return whether a nodedef requires an implementation.
export function requiresImplementation(nodeDef: NodeDef | null): boolean {
  if (!nodeDef) {
    return false
  }
  if (nodeDef.getNodeGroup() === 'organization') {
    return false
  }
  const typeAttribute = nodeDef.getType()
  return typeAttribute !== '' && typeAttribute !== 'none'
}

// Determine if a given element requires shading / lighting for rendering.
export function elementRequiresShading(element: TypedElement): boolean {
  const colorClosures = new Set(['material', 'surfaceshader', 'volumeshader', 'lightshader', 'BSDF', 'EDF', 'VDF'])
  return colorClosures.has(element.getType())
}

// Find all renderable material nodes in the given document.
export function findRenderableMaterialNodes(doc: Document): TypedElement[] {
  const renderableNodes: TypedElement[] = []
  for (const materialNode of doc.getMaterialNodes()) {
    if (getShaderNodes(materialNode).length > 0) {
      renderableNodes.push(materialNode)
    }
  }
  return renderableNodes
}

// Find all renderable elements in the given document: material nodes if
// present, or graph outputs of renderable types when none are found.
export function findRenderableElements(doc: Document): TypedElement[] {
  const renderableElements = findRenderableMaterialNodes(doc)
  if (renderableElements.length === 0) {
    // Collect all graph outputs in the content document.
    const graphOutputs: Output[] = []
    for (const graph of doc.getNodeGraphs()) {
      if (!graph.belongsToContentDocument()) {
        continue
      }
      graphOutputs.push(...graph.getOutputs())
    }
    for (const output of doc.getOutputs()) {
      if (output.belongsToContentDocument()) {
        graphOutputs.push(output)
      }
    }

    // Filter out unconnected outputs and unsupported data types.
    const UNSUPPORTED_TYPES = new Set(['BSDF', 'EDF', 'VDF', 'lightshader'])
    for (const output of graphOutputs) {
      const node = output.getConnectedNode()
      if (node && !UNSUPPORTED_TYPES.has(node.getType())) {
        renderableElements.push(output)
      }
    }
  }
  return renderableElements
}

// Given a node input, return the corresponding input within its matching
// nodedef, optionally filtered by target.
export function getNodeDefInput(nodeInput: Input | null, target: string): Input | null {
  const parent = nodeInput ? nodeInput.getParent() : null
  const node = parent ? parent.asA(Node) : null
  if (node) {
    const nodeDef = node.getNodeDef(target)
    if (nodeDef) {
      return nodeDef.getActiveInput(nodeInput!.getName())
    }
  }
  return null
}

const TOKEN_PREFIX = '$'

// Perform token substitutions on the given source string. Tokens start with
// '$' followed by alphanumeric characters, and are replaced when present in
// the substitution map. Returns the substituted string.
export function tokenSubstitution(substitutions: StringMap, source: string): string {
  let buffer = ''
  let pos = 0
  const len = source.length
  while (pos < len) {
    const p1 = source.indexOf(TOKEN_PREFIX, pos)
    if (p1 !== -1 && p1 + 1 < len) {
      buffer += source.slice(pos, p1)
      pos = p1 + 1
      let token = TOKEN_PREFIX
      while (pos < len && /[A-Za-z0-9]/.test(source[pos]!)) {
        token += source[pos++]
      }
      buffer += substitutions.get(token) ?? token
    } else {
      buffer += source.slice(pos)
      break
    }
  }
  return buffer
}

// Compute the UDIM coordinates for a set of UDIM identifiers.
export function getUdimCoordinates(udimIdentifiers: string[]): Vector2[] {
  const udimCoordinates: Vector2[] = []
  for (const udimIdentifier of udimIdentifiers) {
    if (udimIdentifier === '') {
      continue
    }

    let udimVal = parseInt(udimIdentifier, 10)
    if (!Number.isFinite(udimVal) || udimVal <= 1000 || udimVal >= 2000) {
      throw new Exception('Invalid UDIM identifier specified' + udimIdentifier)
    }

    // Compute the UDIM coordinate.
    udimVal -= 1000
    let uVal = udimVal % 10
    uVal = uVal === 0 ? 9 : uVal - 1
    const vVal = (udimVal - uVal - 1) / 10
    udimCoordinates.push(new Vector2(uVal, Math.floor(vVal)))
  }
  return udimCoordinates
}

// Get the UV scale and offset to transform uv coordinates from UDIM uv
// space to 0..1 space.
export function getUdimScaleAndOffset(udimCoordinates: Vector2[], scaleUV: Vector2, offsetUV: Vector2): void {
  if (udimCoordinates.length === 0) {
    return
  }

  // Find the range for the lower left corner of each tile.
  const minUV = udimCoordinates[0]!.copy()
  const maxUV = udimCoordinates[0]!.copy()
  for (let i = 1; i < udimCoordinates.length; i++) {
    const c = udimCoordinates[i]!
    if (c.getItem(0) < minUV.getItem(0)) minUV.setItem(0, c.getItem(0))
    if (c.getItem(1) < minUV.getItem(1)) minUV.setItem(1, c.getItem(1))
    if (c.getItem(0) > maxUV.getItem(0)) maxUV.setItem(0, c.getItem(0))
    if (c.getItem(1) > maxUV.getItem(1)) maxUV.setItem(1, c.getItem(1))
  }
  // Extend to the upper right corner of a tile.
  maxUV.setItem(0, maxUV.getItem(0) + 1.0)
  maxUV.setItem(1, maxUV.getItem(1) + 1.0)

  scaleUV.setItem(0, 1.0 / (maxUV.getItem(0) - minUV.getItem(0)))
  scaleUV.setItem(1, 1.0 / (maxUV.getItem(1) - minUV.getItem(1)))
  offsetUV.setItem(0, -minUV.getItem(0))
  offsetUV.setItem(1, -minUV.getItem(1))
}

// Determine whether the given output is directly connected to a node that
// generates world-space coordinates, returning the node if found.
export function connectsToWorldSpaceNode(output: Output | null): Node | null {
  const WORLD_SPACE_NODE_CATEGORIES = new Set(['normalmap'])
  const connectedNode = output ? output.getConnectedNode() : null
  if (connectedNode && WORLD_SPACE_NODE_CATEGORIES.has(connectedNode.getCategory())) {
    return connectedNode
  }
  return null
}

// Returns true if any value elements with the given attributes exist on the
// starting node or any node upstream of it.
export function hasElementAttributes(output: Output | null, attributes: string[]): boolean {
  if (!output || attributes.length === 0) {
    return false
  }

  const it = output.traverseGraph()
  for (const _edge of it) {
    const upstreamElem = it.getUpstreamElement()
    const upstreamNode = upstreamElem ? upstreamElem.asA(Node) : null
    if (!upstreamNode) {
      it.setPruneSubgraph(true)
      continue
    }
    const nodeDef = upstreamNode.getNodeDef()
    if (!nodeDef) {
      continue
    }
    for (const nodeDefElement of nodeDef.getActiveValueElements()) {
      let testElement = upstreamNode.getActiveValueElement(nodeDefElement.getName())
      if (!testElement) {
        testElement = nodeDefElement
      }
      for (const attr of attributes) {
        if (testElement.hasAttribute(attr)) {
          return true
        }
      }
    }
  }
  return false
}
