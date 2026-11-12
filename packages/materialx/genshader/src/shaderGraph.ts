// Ported from MaterialX 1.39.5: source/MaterialXGenShader/ShaderGraph.h,
//  source/MaterialXGenShader/ShaderGraph.cpp
// Copyright Contributors to the MaterialX Project. Apache License 2.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Mirrors source/MaterialXGenShader/ShaderGraph.h and ShaderGraph.cpp

import {
  Document,
  Element,
  ExceptionFoundCycle,
  GeomPropDef,
  Input,
  InterfaceElement,
  Node,
  NodeDef,
  NodeGraph,
  Output,
  Value,
  ValueElement,
  EMPTY_STRING,
} from '@mtlx/core'
import { ExceptionShaderGenError } from './exceptions.ts'
import { Type, TypeDesc } from './typeDesc.ts'
import { ShaderInterfaceType } from './genOptions.ts'
import {
  ShaderInput,
  ShaderNode,
  ShaderOutput,
  ShaderPort,
  type ShaderGraphInputSocket,
  type ShaderGraphOutputSocket,
} from './shaderNode.ts'
import type { GenContext } from './genContext.ts'
import type { IdentifierMap } from './syntax.ts'
import type { ColorManagementSystem, ColorSpaceTransform } from './colorManagement.ts'
import type { UnitSystem, UnitTransform } from './unitSystem.ts'

// A refactoring pass over a shader graph; concrete passes are registered on
// the shader generator.
export interface ShaderGraphRefactor {
  execute(graph: ShaderGraph, context: GenContext): number
}

// An edge returned during shader graph traversal.
export class ShaderGraphEdge {
  constructor(
    public upstream: ShaderOutput | null,
    public downstream: ShaderInput | null,
  ) {}
}

// Iterator class for traversing edges between nodes in a shader graph.
// The first yielded edge is (startOutput, null), as in the C++ begin().
export class ShaderGraphEdgeIterator implements IterableIterator<ShaderGraphEdge> {
  private _upstream: ShaderOutput | null
  private _downstream: ShaderInput | null = null
  private _stack: Array<[ShaderOutput, number]> = []
  private _path = new Set<ShaderOutput>()
  private _visitedEdges = new Set<string>()
  private _started = false

  private static _edgeIds = new WeakMap<object, number>()
  private static _nextEdgeId = 1

  constructor(output: ShaderOutput | null) {
    this._upstream = output
  }

  private static idOf(obj: object | null): number {
    if (!obj) return 0
    let id = ShaderGraphEdgeIterator._edgeIds.get(obj)
    if (id === undefined) {
      id = ShaderGraphEdgeIterator._nextEdgeId++
      ShaderGraphEdgeIterator._edgeIds.set(obj, id)
    }
    return id
  }

  private advance(): boolean {
    if (this._upstream && this._upstream.getNode()!.numInputs() > 0) {
      // Traverse to the first upstream edge of this element.
      this._stack.push([this._upstream, 0])

      const input = this._upstream.getNode()!.getInput(0)!
      const output = input.getConnection()

      if (output && !output.getNode()!.isAGraph() && !this.skipOrMarkAsVisited(output, input)) {
        this.extendPathUpstream(output, input)
        return true
      }
    }

    for (;;) {
      if (this._upstream) {
        this.returnPathDownstream(this._upstream)
      }

      if (this._stack.length === 0) {
        return false
      }

      // Traverse to our siblings.
      const parentFrame = this._stack[this._stack.length - 1]!
      while (parentFrame[1] + 1 < parentFrame[0].getNode()!.numInputs()) {
        parentFrame[1] += 1
        const input = parentFrame[0].getNode()!.getInput(parentFrame[1])!
        const output = input.getConnection()

        if (output && !output.getNode()!.isAGraph() && !this.skipOrMarkAsVisited(output, input)) {
          this.extendPathUpstream(output, input)
          return true
        }
      }

      // Traverse to our parent's siblings.
      this.returnPathDownstream(parentFrame[0])
      this._stack.pop()
    }
  }

  private extendPathUpstream(upstream: ShaderOutput, downstream: ShaderInput): void {
    if (this._path.has(upstream)) {
      throw new ExceptionFoundCycle('Encountered cycle at element: ' + upstream.getFullName())
    }
    this._path.add(upstream)
    this._upstream = upstream
    this._downstream = downstream
  }

  private returnPathDownstream(upstream: ShaderOutput): void {
    this._path.delete(upstream)
    this._upstream = null
    this._downstream = null
  }

  private skipOrMarkAsVisited(output: ShaderOutput, input: ShaderInput): boolean {
    const key = `${ShaderGraphEdgeIterator.idOf(output)}|${ShaderGraphEdgeIterator.idOf(input)}`
    if (this._visitedEdges.has(key)) return true
    this._visitedEdges.add(key)
    return false
  }

  next(): IteratorResult<ShaderGraphEdge> {
    if (!this._started) {
      this._started = true
      if (this._upstream) {
        return { value: new ShaderGraphEdge(this._upstream, this._downstream), done: false }
      }
      return { value: undefined, done: true }
    }
    if (!this.advance()) {
      return { value: undefined, done: true }
    }
    return { value: new ShaderGraphEdge(this._upstream, this._downstream), done: false }
  }

  [Symbol.iterator](): IterableIterator<ShaderGraphEdge> {
    return this
  }
}

// Class representing a graph (DAG) for shader generation.
export class ShaderGraph extends ShaderNode {
  protected _document: Document
  protected _nodeMap = new Map<string, ShaderNode>()
  protected _graphNodeOrder: ShaderNode[] = []
  protected _identifiers: IdentifierMap = new Map()

  // Temporary storage for ports that require color/unit transformations.
  protected _inputColorTransformMap: Array<[ShaderInput, ColorSpaceTransform]> = []
  protected _inputUnitTransformMap: Array<[ShaderInput, UnitTransform]> = []
  protected _outputColorTransformMap: Array<[ShaderOutput, ColorSpaceTransform]> = []
  protected _outputUnitTransformMap: Array<[ShaderOutput, UnitTransform]> = []

  constructor(parent: ShaderGraph | null, name: string, document: Document, context: GenContext) {
    super(parent, name)
    this._document = document
    this._name = context.getShaderGenerator().getSyntax().makeIdentifier(this._name, this.getIdentifierMap())
  }

  override isAGraph(): boolean {
    return true
  }

  // Get an internal node by its unique identifier.
  getNode(uniqueId: string): ShaderNode | null {
    return this._nodeMap.get(uniqueId) ?? null
  }

  // Get a vector of all nodes in order.
  getNodes(): ShaderNode[] {
    return this._graphNodeOrder
  }

  numInputSockets(): number {
    return this.numOutputs()
  }

  numOutputSockets(): number {
    return this.numInputs()
  }

  // Sockets: an input socket is an output port seen from inside the graph.
  getInputSocket(key: number | string): ShaderGraphInputSocket | null {
    return this.getOutput(key)
  }

  getOutputSocket(key: number | string = 0): ShaderGraphOutputSocket | null {
    return this.getInput(key)
  }

  getInputSockets(): ShaderGraphInputSocket[] {
    return this._outputOrder
  }

  getOutputSockets(): ShaderGraphOutputSocket[] {
    return this._inputOrder
  }

  // Add input/output sockets.
  addInputSocket(name: string, type: TypeDesc): ShaderGraphInputSocket {
    return super.addOutput(name, type)
  }

  addOutputSocket(name: string, type: TypeDesc): ShaderGraphOutputSocket {
    return super.addInput(name, type)
  }

  // Return an iterator for traversal upstream from the given output.
  static traverseUpstream(output: ShaderOutput): ShaderGraphEdgeIterator {
    return new ShaderGraphEdgeIterator(output)
  }

  // Return the map of unique identifiers used in the scope of this graph.
  getIdentifierMap(): IdentifierMap {
    return this._identifiers
  }

  // Return the document associated with this graph.
  getDocument(): Document {
    return this._document
  }

  // Create a new shader graph from an element (output or shader node).
  static create(parent: ShaderGraph | null, name: string, element: Element, context: GenContext): ShaderGraph {
    let graph: ShaderGraph | null = null
    let root: Element | null = null

    const output = element.asA(Output)
    const node = element.asA(Node)
    if (output) {
      let outputParent: Element | null = output.getParent()

      let iface: InterfaceElement | null = null
      if (outputParent instanceof NodeGraph) {
        // A nodegraph output.
        const nodeDef = outputParent.getNodeDef()
        iface = nodeDef ?? outputParent
      } else if (outputParent instanceof Document) {
        // A free floating output.
        outputParent = output.getConnectedNode()
        iface = outputParent ? outputParent.asA(InterfaceElement) : null
      }
      if (!iface) {
        throw new ExceptionShaderGenError(
          `Given output '${output.getName()}' has no interface valid for shader generation`,
        )
      }

      graph = new ShaderGraph(parent, name, element.getDocument() as Document, context)

      // Clear classification.
      graph._classification = 0

      // Create input sockets.
      graph.addInputSockets(iface, context)

      // Create the given output socket.
      const outputType = context.getTypeDesc(output.getType())
      const outputSocket = graph.addOutputSocket(output.getName(), outputType)
      outputSocket.setPath(output.getNamePath())
      const outputUnit = output.getUnit()
      if (outputUnit !== '') {
        outputSocket.setUnit(outputUnit)
      }
      const outputColorSpace = output.getColorSpace()
      if (outputColorSpace !== '') {
        outputSocket.setColorSpace(outputColorSpace)
      }

      // Start traversal from this output.
      root = output
    } else if (node) {
      const nodeDef = node.getNodeDef()
      if (!nodeDef) {
        throw new ExceptionShaderGenError(`Could not find a nodedef for node '${node.getName()}'`)
      }

      graph = new ShaderGraph(parent, name, element.getDocument() as Document, context)

      // Create input and output sockets.
      graph.addInputSockets(nodeDef, context)
      graph.addOutputSockets(nodeDef, context)

      // Create this shader node in the graph.
      const newNode = graph.createNodeFromDef(node.getName(), node.getNamePath(), nodeDef, context)

      // Share metadata.
      graph.setMetadata(newNode.getMetadata())

      // Connect it to the graph outputs.
      for (let i = 0; i < newNode.numOutputs(); ++i) {
        const outputSocket = graph.getOutputSocket(i)!
        outputSocket.makeConnection(newNode.getOutput(i)!)
        outputSocket.setPath(node.getNamePath())
      }

      // Handle node input ports.
      for (const nodedefInput of nodeDef.getActiveInputs()) {
        const inputSocket = graph.getInputSocket(nodedefInput.getName())
        const input = newNode.getInput(nodedefInput.getName())
        if (!inputSocket || !input) {
          throw new ExceptionShaderGenError(
            `Node input '${nodedefInput.getName()}' doesn't match an existing input on graph '${graph.getName()}'`,
          )
        }

        // Copy data from the node element to the shadergen representation.
        const nodeInput = node.getInput(nodedefInput.getName())
        if (nodeInput) {
          let value = nodeInput.getResolvedValue()
          if (!value) {
            const interfaceInput = nodeInput.getInterfaceInput()
            if (interfaceInput) {
              value = interfaceInput.getResolvedValue()
            }
          }
          if (value) {
            const valueString = value.getValueString()
            const type = context.getTypeDesc(nodedefInput.getType())
            const enumNames = nodedefInput.getAttribute('enum')
            const enumResult = context.getShaderGenerator().getSyntax().remapEnumeration(valueString, type, enumNames)
            if (enumResult) {
              inputSocket.setValue(enumResult[1])
            } else {
              inputSocket.setValue(value)
            }
          }

          input.setBindInput()
          const path = nodeInput.getNamePath()
          if (path !== '') {
            inputSocket.setPath(path)
            input.setPath(path)
          }
          const unit = nodeInput.getUnit()
          if (unit !== '') {
            inputSocket.setUnit(unit)
            input.setUnit(unit)
          }
          const colorSpace = nodeInput.getColorSpace()
          if (colorSpace !== '') {
            inputSocket.setColorSpace(colorSpace)
            input.setColorSpace(colorSpace)
          }
        }

        // Connect the graph socket to the node input.
        inputSocket.makeConnection(input)

        // Share metadata.
        inputSocket.setMetadata(input.getMetadata())
      }

      // Apply color and unit transforms to each input.
      graph.applyInputTransforms(node, newNode, context)

      // Set the root for upstream dependency traversal.
      root = node
    }

    if (!graph) {
      throw new ExceptionShaderGenError(
        `Shader generation from element '${element.getName()}' of type '${element.getCategory()}' is not supported`,
      )
    }

    // Traverse and create all dependencies upstream.
    if (root && context.getOptions().addUpstreamDependencies) {
      graph.addUpstreamDependencies(root, context)
    }

    graph.finalize(context)

    return graph
  }

  // Create a new shader graph from a nodegraph.
  static createFromNodeGraph(parent: ShaderGraph | null, nodeGraph: NodeGraph, context: GenContext): ShaderGraph {
    const nodeDef = nodeGraph.getNodeDef()
    if (!nodeDef) {
      throw new ExceptionShaderGenError(
        `Can't find nodedef '${nodeGraph.getNodeDefString()}' referenced by nodegraph '${nodeGraph.getName()}'`,
      )
    }

    const graphName = context.getShaderGenerator().getSyntax().makeValidName(nodeGraph.getName())
    const graph = new ShaderGraph(parent, graphName, nodeGraph.getDocument() as Document, context)

    // Clear classification.
    graph._classification = 0

    // Create input sockets from the nodedef and output sockets from the
    // nodegraph.
    graph.addInputSockets(nodeDef, context)
    graph.addOutputSockets(nodeGraph, context)

    // Traverse all outputs and create all internal nodes.
    for (const graphOutput of nodeGraph.getActiveOutputs()) {
      graph.addUpstreamDependencies(graphOutput, context)
    }

    // Finalize the graph.
    graph.finalize(context)

    return graph
  }

  // Add input sockets from an interface element (nodedef, nodegraph, or
  // node).
  protected addInputSockets(elem: InterfaceElement, context: GenContext): void {
    for (const input of elem.getActiveInputs()) {
      let inputSocket: ShaderGraphInputSocket
      const portValue = input.getResolvedValue()
      const portValueString = portValue ? portValue.getValueString() : EMPTY_STRING
      const enumNames = input.getAttribute('enum')
      const portType = context.getTypeDesc(input.getType())
      const enumResult = context.getShaderGenerator().getSyntax().remapEnumeration(portValueString, portType, enumNames)
      if (enumResult) {
        inputSocket = this.addInputSocket(input.getName(), enumResult[0])
        inputSocket.setValue(enumResult[1])
      } else {
        inputSocket = this.addInputSocket(input.getName(), portType)
        if (portValueString !== '') {
          inputSocket.setValue(portValue)
        }
      }
      if (input.getIsUniform()) {
        inputSocket.setUniform()
      }
      inputSocket.setPath(input.getNamePath())
      const geomprop = input.getDefaultGeomProp()
      if (geomprop) {
        inputSocket.setGeomProp(geomprop.getName())
      }
    }
  }

  // Add output sockets from an interface element.
  protected addOutputSockets(elem: InterfaceElement, context: GenContext): void {
    for (const output of elem.getActiveOutputs()) {
      this.addOutputSocket(output.getName(), context.getTypeDesc(output.getType()))
    }
    if (this.numOutputSockets() === 0) {
      this.addOutputSocket('out', context.getTypeDesc(elem.getType()))
    }
  }

  // Create node connections corresponding to the connection between a pair
  // of elements.
  protected createConnectedNodes(
    downstreamElement: Element,
    upstreamElement: Element,
    connectingElement: Element | null,
    context: GenContext,
  ): void {
    // Create the node if it doesn't exist.
    const upstreamNode = upstreamElement.asA(Node)
    if (!upstreamNode) {
      throw new ExceptionShaderGenError(`Upstream element to connect is not a node '${upstreamElement.getName()}'`)
    }
    let newNode = this.getNode(upstreamNode.getNamePath())
    if (!newNode) {
      newNode = this.createNode(upstreamNode, context)
    }

    // Handle interface inputs with default geometric properties.
    for (const activeInput of upstreamNode.getActiveInputs()) {
      if (!activeInput.hasInterfaceName() || activeInput.getConnectedNode()) {
        continue
      }

      const graphInput = activeInput.getInterfaceInput()
      if (graphInput && graphInput.hasDefaultGeomPropString()) {
        const shaderInput = newNode.getInput(activeInput.getName())
        if (shaderInput) {
          this.addDefaultGeomNode(shaderInput, graphInput.getDefaultGeomProp() as GeomPropDef, context)
        }
      }
    }

    // Find the output to connect to.
    if (!connectingElement && downstreamElement instanceof Output) {
      // Edge case for an output downstream with no connecting element
      // reported upstream; the output itself handles finding the nodedef
      // output for multioutput upstream nodes.
      connectingElement = downstreamElement
    }
    const nodeDefOutput = connectingElement ? upstreamNode.getNodeDefOutput(connectingElement) : null
    const output = nodeDefOutput ? newNode.getOutput(nodeDefOutput.getName()) : newNode.getOutput()
    if (!output) {
      throw new ExceptionShaderGenError(
        `Could not find an output named '${nodeDefOutput ? nodeDefOutput.getName() : 'out'}' on upstream node '${upstreamNode.getName()}'`,
      )
    }

    // Connect to the downstream node or graph output socket.
    const downstreamNode = downstreamElement.asA(Node)
    if (downstreamNode) {
      const downstream = this.getNode(downstreamNode.getNamePath())
      if (downstream) {
        if (downstream === newNode) {
          throw new ExceptionShaderGenError(
            `Upstream node '${downstream.getName()}' has itself as downstream node, creating a loop`,
          )
        }

        if (connectingElement) {
          const input = downstream.getInput(connectingElement.getName())
          if (!input) {
            throw new ExceptionShaderGenError(
              `Could not find an input named '${connectingElement.getName()}' on downstream node '${downstream.getName()}'`,
            )
          }
          input.makeConnection(output)
        } else {
          throw new ExceptionShaderGenError(`No connecting element for downstream node '${downstreamNode.getName()}'`)
        }
      }
    } else {
      // Not a node, so it must be an output.
      const outputSocket = this.getOutputSocket(downstreamElement.getName())
      if (outputSocket) {
        outputSocket.makeConnection(output)
      }
    }
  }

  // Traverse from the given root element and add all dependencies upstream.
  protected addUpstreamDependencies(root: Element, context: GenContext): void {
    const processedOutputs = new Set<Element>()

    for (const edge of root.traverseGraph()) {
      let upstreamElement: Element | null = edge.getUpstreamElement()
      if (!upstreamElement) {
        continue
      }

      const downstreamElement = edge.getDownstreamElement()!

      // Early out if the downstream element is an already-processed output
      // (jumps over output elements happen below).
      if (processedOutputs.has(downstreamElement)) {
        continue
      }

      // If upstream is an output, jump to the node connected to it.
      if (upstreamElement instanceof Output) {
        processedOutputs.add(upstreamElement)
        upstreamElement = upstreamElement.getConnectedNode()
        if (!upstreamElement) {
          continue
        }
      }

      this.createConnectedNodes(downstreamElement, upstreamElement, edge.getConnectingElement(), context)
    }
  }

  // Add a default geometric node and connect it to the given input.
  addDefaultGeomNode(input: ShaderInput, geomprop: GeomPropDef, context: GenContext): void {
    const geomNodeName = 'geomprop_' + geomprop.getName()
    let node = this.getNode(geomNodeName)

    if (!node) {
      // Find the nodedef for the geometric node referenced by the geomprop.
      // The input's type is used; geomprops are required to match it.
      const geomNodeDefName = 'ND_' + geomprop.getGeomProp() + '_' + input.getType().getName()
      const geomNodeDef = this._document.getNodeDef(geomNodeDefName)
      if (!geomNodeDef) {
        throw new ExceptionShaderGenError(
          `Could not find a nodedef named '${geomNodeDefName}' for defaultgeomprop on input '${input.getFullName()}'`,
        )
      }

      const geomNode = ShaderNode.create(this, geomNodeName, geomNodeDef, context)
      this.addNode(geomNode)

      // Set node inputs if given.
      const namePath = geomprop.getNamePath()
      const space = geomprop.getSpace()
      if (space !== '') {
        const spaceInput = geomNode.getInput(GeomPropDef.SPACE_ATTRIBUTE)
        const nodeDefSpaceInput = geomNodeDef.getActiveValueElement(GeomPropDef.SPACE_ATTRIBUTE)
        if (spaceInput && nodeDefSpaceInput) {
          const enumNames = nodeDefSpaceInput.getAttribute(ValueElement.ENUM_ATTRIBUTE)
          const portType = context.getTypeDesc(nodeDefSpaceInput.getType())
          const enumResult = context.getShaderGenerator().getSyntax().remapEnumeration(space, portType, enumNames)
          if (enumResult) {
            spaceInput.setValue(enumResult[1])
          } else {
            spaceInput.setValue(Value.createValue(space))
          }
          spaceInput.setPath(namePath)
        }
      }
      const index = geomprop.getIndex()
      if (index !== '') {
        const indexInput = geomNode.getInput('index')
        if (indexInput) {
          indexInput.setValue(Value.createValue(index))
          indexInput.setPath(namePath)
        }
      }
      const geomProp = geomprop.getGeomProp()
      if (geomProp !== '') {
        const geomPropInput = geomNode.getInput(GeomPropDef.GEOM_PROP_ATTRIBUTE)
        if (geomPropInput) {
          geomPropInput.setValue(Value.createValue(geomProp))
          geomPropInput.setPath(namePath)
        }
      }

      node = geomNode

      // Assign a unique variable name for the node output.
      const syntax = context.getShaderGenerator().getSyntax()
      const output = node.getOutput()!
      output.setVariable(syntax.getVariableName(output.getFullName(), output.getType(), this._identifiers))
    }

    input.makeConnection(node.getOutput()!)
  }

  // Add a color transform node and connect it to the given port.
  protected addColorTransformNodeToInput(input: ShaderInput, transform: ColorSpaceTransform, context: GenContext): void {
    if (input.getConnection() && !input.isBindInput()) {
      // Ignore connected inputs, which are unaffected by color space
      // bindings.
      return
    }

    const colorManagementSystem = context.getShaderGenerator().getColorManagementSystem()
    if (!colorManagementSystem) {
      return
    }
    const colorTransformNodeName = input.getFullName() + '_cm'
    const colorTransformNode = colorManagementSystem.createNode(this, transform, colorTransformNodeName, context)

    if (colorTransformNode) {
      this.addNode(colorTransformNode)

      const colorTransformNodeOutput = colorTransformNode.getOutput(0)!
      const shaderInput = colorTransformNode.getInput(0)!
      shaderInput.setVariable(input.getFullName())
      shaderInput.setValue(input.getValue())
      shaderInput.setPath(input.getPath())
      shaderInput.setUnit(EMPTY_STRING)

      if (input.isBindInput()) {
        const oldConnection = input.getConnection()
        shaderInput.makeConnection(oldConnection)
      }

      input.makeConnection(colorTransformNodeOutput)
    }
  }

  protected addColorTransformNodeToOutput(output: ShaderOutput, transform: ColorSpaceTransform, context: GenContext): void {
    const colorManagementSystem = context.getShaderGenerator().getColorManagementSystem()
    if (!colorManagementSystem) {
      return
    }

    const colorTransformNodeName = output.getFullName() + '_cm'
    const colorTransformNode = colorManagementSystem.createNode(this, transform, colorTransformNodeName, context)

    if (colorTransformNode) {
      this.addNode(colorTransformNode)

      const colorTransformNodeOutput = colorTransformNode.getOutput(0)!

      for (const input of [...output.getConnections()]) {
        input.breakConnection()
        input.makeConnection(colorTransformNodeOutput)
      }

      // Connect the node to the upstream output.
      colorTransformNode.getInput(0)!.makeConnection(output)
    }
  }

  protected addUnitTransformNodeToInput(input: ShaderInput, transform: UnitTransform, context: GenContext): void {
    if (input.getConnection() && !input.isBindInput()) {
      return
    }

    const unitSystem = context.getShaderGenerator().getUnitSystem()
    if (!unitSystem) {
      return
    }
    const unitTransformNodeName = input.getFullName() + '_unit'
    const unitTransformNode = unitSystem.createNode(this, transform, unitTransformNodeName, context)

    if (unitTransformNode) {
      this.addNode(unitTransformNode)

      const unitTransformNodeOutput = unitTransformNode.getOutput(0)!
      const shaderInput = unitTransformNode.getInput(0)!
      shaderInput.setVariable(input.getFullName())
      shaderInput.setValue(input.getValue())
      shaderInput.setPath(input.getPath())
      shaderInput.setUnit(input.getUnit())
      shaderInput.setColorSpace(input.getColorSpace())

      if (input.isBindInput()) {
        const oldConnection = input.getConnection()
        shaderInput.makeConnection(oldConnection)
      }

      input.makeConnection(unitTransformNodeOutput)
    }
  }

  protected addUnitTransformNodeToOutput(output: ShaderOutput, transform: UnitTransform, context: GenContext): void {
    const unitSystem = context.getShaderGenerator().getUnitSystem()
    if (!unitSystem) {
      return
    }

    const unitTransformNodeName = output.getFullName() + '_unit'
    const unitTransformNode = unitSystem.createNode(this, transform, unitTransformNodeName, context)

    if (unitTransformNode) {
      this.addNode(unitTransformNode)

      const unitTransformNodeOutput = unitTransformNode.getOutput(0)!

      for (const input of [...output.getConnections()]) {
        input.breakConnection()
        input.makeConnection(unitTransformNodeOutput)
      }

      // Connect the node to the upstream output.
      unitTransformNode.getInput(0)!.makeConnection(output)
    }
  }

  // Apply color and unit transforms to each input of a node.
  applyInputTransforms(node: Node, shaderNode: ShaderNode, context: GenContext): void {
    const colorManagementSystem = context.getShaderGenerator().getColorManagementSystem()
    const unitSystem = context.getShaderGenerator().getUnitSystem()

    const targetColorSpace =
      context.getOptions().targetColorSpaceOverride === ''
        ? this._document.getActiveColorSpace()
        : context.getOptions().targetColorSpaceOverride
    const targetDistanceUnit = context.getOptions().targetDistanceUnit

    for (const input of node.getInputs()) {
      if (input.hasValue() || input.hasInterfaceName()) {
        let sourceColorSpace = input.getActiveColorSpace()
        if (input.getType() === 'filename' && (node.isColorType() || node.isMultiOutputType())) {
          // Adjust the source color space for filename interface names.
          if (input.hasInterfaceName()) {
            for (const parentNode of context.getParentNodes()) {
              if (!parentNode.isColorType() && !parentNode.isMultiOutputType()) {
                const interfaceInput = parentNode.getInput(input.getInterfaceName())
                const interfaceColorSpace = interfaceInput ? interfaceInput.getActiveColorSpace() : EMPTY_STRING
                if (interfaceColorSpace !== '') {
                  sourceColorSpace = interfaceColorSpace
                }
              }
            }
          }

          for (const shaderOutput of shaderNode.getOutputs()) {
            this.populateColorTransformMap(colorManagementSystem, shaderOutput, sourceColorSpace, targetColorSpace, false)
            this.populateUnitTransformMap(unitSystem, shaderOutput, input, targetDistanceUnit, false)
          }
        } else {
          const shaderInput = shaderNode.getInput(input.getName())
          this.populateColorTransformMap(colorManagementSystem, shaderInput, sourceColorSpace, targetColorSpace, true)
          this.populateUnitTransformMap(unitSystem, shaderInput, input, targetDistanceUnit, true)
        }
      }
    }
  }

  // Create a new node in the graph from a node definition.
  createNodeFromDef(name: string, uniqueId: string, nodeDef: NodeDef | null, context: GenContext): ShaderNode {
    if (!nodeDef) {
      throw new ExceptionShaderGenError(`Could not find a nodedef for node '${name}'`)
    }

    const newNode = ShaderNode.create(this, name, nodeDef, context)
    newNode._setUniqueId(uniqueId)
    this._nodeMap.set(uniqueId, newNode)
    this._graphNodeOrder.push(newNode)

    return newNode
  }

  // Create a new node in the graph from a document node.
  createNode(node: Node, context: GenContext): ShaderNode {
    const nodeDef = node.getNodeDef()

    // Create this node in the graph.
    context.pushParentNode(node)
    const newNode = this.createNodeFromDef(node.getName(), node.getNamePath(), nodeDef, context)
    newNode.initialize(node, nodeDef!, context)
    context.popParentNode()

    // Check if any of the node inputs should be connected to the graph
    // interface.
    for (const elem of node.getChildrenOfType(ValueElement)) {
      const interfaceName = elem.getInterfaceName()
      if (interfaceName !== '') {
        const inputSocket = this.getInputSocket(interfaceName)
        if (inputSocket) {
          const input = newNode.getInput(elem.getName())
          if (input) {
            input.makeConnection(inputSocket)
          }
        }
      }
    }

    // Handle "defaultgeomprop" directives on the nodedef inputs: create and
    // connect default geometric nodes on unconnected inputs.
    for (const nodeDefInput of nodeDef!.getActiveInputs()) {
      const input = newNode.getInput(nodeDefInput.getName())
      const nodeInput = node.getInput(nodeDefInput.getName())

      const connection = nodeInput ? nodeInput.getNodeName() : EMPTY_STRING
      if (connection === '' && input && !input.getConnection()) {
        const geomprop = nodeDefInput.getDefaultGeomProp()
        if (geomprop) {
          this.addDefaultGeomNode(input, geomprop as GeomPropDef, context)
        }
      }
    }

    // Apply color and unit transforms to each input.
    this.applyInputTransforms(node, newNode, context)

    return newNode
  }

  // Insert a new node between the output of the graph and its upstream
  // connection, reconnecting the upstream to the specified input on the new
  // node, if present.
  inlineNodeBeforeOutput(
    output: ShaderGraphOutputSocket,
    newNodeName: string,
    nodeDefName: string,
    inputName: string,
    outputName: string,
    context: GenContext,
  ): ShaderNode {
    const nodeDef = this._document.getNodeDef(nodeDefName)
    if (!nodeDef) {
      throw new ExceptionShaderGenError(`Cannot find NodeDef '${nodeDefName}' when inserting node '${newNodeName}'`)
    }

    // Check that the nodedef has the specified ports.
    const nodeDefOutput = nodeDef.getOutput(outputName)
    if (!nodeDefOutput) {
      throw new ExceptionShaderGenError(`Output '${outputName}' not found on NodeDef '${nodeDefName}'`)
    }

    let nodeDefInput: Input | null = null
    if (inputName !== '') {
      nodeDefInput = nodeDef.getInput(inputName)
      if (!nodeDefInput) {
        throw new ExceptionShaderGenError(`Input '${inputName}' not found on NodeDef '${nodeDefName}'`)
      }
    }

    // Record the previously connected upstream.
    const originalUpstream = output.getConnection()

    if (nodeDefInput && originalUpstream) {
      // Check the types match before creating any new data.
      if (nodeDefInput.getType() !== originalUpstream.getType().getName()) {
        throw new ExceptionShaderGenError(
          `Cannot connect ports of mismatched types '${nodeDefInput.getType()}' and '${originalUpstream.getType().getName()}' when inserting node`,
        )
      }
    }

    // Create the new node, and connect its output to the provided graph
    // output.
    const newNode = this.createNodeFromDef(newNodeName, newNodeName, nodeDef, context)
    const newNodeOutput = newNode.getOutput(outputName)!
    newNodeOutput.setVariable(newNodeOutput.getFullName())
    output.makeConnection(newNodeOutput)

    // Update the type of the graph output port to match the new node.
    output.setType(newNodeOutput.getType())

    // Connect the original upstream to the named input, when given.
    if (originalUpstream && nodeDefInput) {
      const newNodeInput = newNode.getInput(inputName)!
      newNodeInput.setVariable(newNodeInput.getFullName())
      originalUpstream.makeConnection(newNodeInput)
    }

    return newNode
  }

  // Add a node to the graph, keyed by its unique identifier.
  protected addNode(node: ShaderNode): void {
    this._nodeMap.set(node.getUniqueId(), node)
    this._graphNodeOrder.push(node)
  }

  // Perform all post-build operations on the graph.
  finalize(context: GenContext): void {
    // Allow node implementations to update the classification on their
    // node instances.
    for (const node of this.getNodes()) {
      node.getImplementation().addClassification(node)
    }

    // Add classification according to the root node.
    const outputSocket = this.getOutputSocket()
    if (outputSocket && outputSocket.getConnection()) {
      this.addClassification(outputSocket.getConnection()!.getNode()!.getClassification())
    }

    // Insert color transformation nodes where needed.
    if (context.getOptions().emitColorTransforms) {
      for (const [input, transform] of this._inputColorTransformMap) {
        this.addColorTransformNodeToInput(input, transform, context)
      }
      for (const [output, transform] of this._outputColorTransformMap) {
        this.addColorTransformNodeToOutput(output, transform, context)
      }
    }
    this._inputColorTransformMap = []
    this._outputColorTransformMap = []

    // Insert unit transformation nodes where needed.
    for (const [input, transform] of this._inputUnitTransformMap) {
      this.addUnitTransformNodeToInput(input, transform, context)
    }
    for (const [output, transform] of this._outputUnitTransformMap) {
      this.addUnitTransformNodeToOutput(output, transform, context)
    }
    this._inputUnitTransformMap = []
    this._outputUnitTransformMap = []

    // Run registered graph refactoring passes.
    let totalEdits = 0
    for (const refactor of context.getShaderGenerator().getRefactors()) {
      totalEdits += refactor.execute(this, context)
    }

    // Remove unused nodes if any refactoring pass made edits.
    if (totalEdits > 0) {
      this.removeUnusedNodes()
    }

    // Sort the nodes in topological order.
    this.topologicalSort()

    if (context.getOptions().shaderInterfaceType === ShaderInterfaceType.SHADER_INTERFACE_COMPLETE) {
      // Publish all node inputs that have not been connected already.
      for (const node of this.getNodes()) {
        for (const input of node.getInputs()) {
          if (!input.getConnection()) {
            // Only editable, non-closure types can be published as
            // editable uniforms.
            if (!input.getType().isClosure() && node.isEditable(input)) {
              // Naming convention: <nodename>_<inputname>, so applications
              // can map uniforms back to node inputs.
              const interfaceName = node.getName() + '_' + input.getName()

              let inputSocket = this.getInputSocket(interfaceName)
              if (!inputSocket) {
                inputSocket = this.addInputSocket(interfaceName, input.getType())
                inputSocket.setPath(input.getPath())
                inputSocket.setValue(input.getValue())
                inputSocket.setUnit(input.getUnit())
                inputSocket.setColorSpace(input.getColorSpace())
                if (input.isUniform()) {
                  inputSocket.setUniform()
                }
              }
              inputSocket.makeConnection(input)
              inputSocket.setMetadata(input.getMetadata())
            }
          }
        }
      }
    }

    // Set variable names for inputs and outputs in the graph.
    this.setVariableNames(context)
  }

  // Break all connections on a node.
  protected disconnect(node: ShaderNode): void {
    for (const input of node.getInputs()) {
      input.breakConnection()
    }
    for (const output of node.getOutputs()) {
      output.breakConnections()
    }
  }

  // Remove nodes that are no longer connected to any output.
  removeUnusedNodes(): void {
    const usedNodesSet = new Set<ShaderNode>()
    const usedNodesVec: ShaderNode[] = []

    // Traverse the graph to find nodes still in use.
    for (const outputSocket of this.getOutputSockets()) {
      // Make sure not to include connections to the graph itself.
      const upstreamPort = outputSocket.getConnection()
      if (upstreamPort && upstreamPort.getNode() !== this) {
        for (const edge of ShaderGraph.traverseUpstream(upstreamPort)) {
          const node = edge.upstream!.getNode()!
          if (!usedNodesSet.has(node)) {
            usedNodesSet.add(node)
            usedNodesVec.push(node)
          }
        }
      }
    }

    // Remove any unused nodes.
    for (const [key, node] of [...this._nodeMap.entries()]) {
      if (!usedNodesSet.has(node)) {
        this.disconnect(node)
        this._nodeMap.delete(key)
      }
    }

    this._graphNodeOrder = usedNodesVec
  }

  // Rewire all downstream connections from one output to another.
  replaceOutput(oldOutput: ShaderOutput, newOutput: ShaderOutput): void {
    for (const downstream of [...oldOutput.getConnections()]) {
      oldOutput.breakConnection(downstream)
      downstream.makeConnection(newOutput)
    }
  }

  // Bypass a node for a particular input and output, connecting the input's
  // upstream connection with the output's downstream connections.
  bypass(node: ShaderNode, inputIndex: number, outputIndex = 0): void {
    if (inputIndex >= node.numInputs()) {
      throw new ExceptionShaderGenError(`Input index '${inputIndex}' out of bounds for node '${node.getName()}'`)
    }
    if (outputIndex >= node.numOutputs()) {
      throw new ExceptionShaderGenError(`Output index '${outputIndex}' out of bounds for node '${node.getName()}'`)
    }

    const input = node.getInput(inputIndex)!
    const output = node.getOutput(outputIndex)!

    const upstream = input.getConnection()
    if (upstream) {
      // Re-route the upstream output to the downstream inputs. Iterate a
      // copy since the vector changes while breaking connections.
      for (const downstream of [...output.getConnections()]) {
        output.breakConnection(downstream)
        downstream.makeConnection(upstream)
      }
    } else {
      // No node connected upstream to re-route, so push the input's value
      // and element path downstream instead.
      for (const downstream of [...output.getConnections()]) {
        output.breakConnection(downstream)
        downstream.setValue(input.getValue())
        downstream.setPath(input.getPath())
        const inputUnit = input.getUnit()
        if (inputUnit !== '') {
          downstream.setUnit(inputUnit)
        }
        const inputColorSpace = input.getColorSpace()
        if (inputColorSpace !== '') {
          downstream.setColorSpace(inputColorSpace)
        }
      }
    }
  }

  // Sort the nodes in topological order using Kahn's algorithm.
  topologicalSort(): void {
    // Calculate in-degrees for all nodes, and enqueue those with degree 0.
    const inDegree = new Map<ShaderNode, number>()
    const nodeQueue: ShaderNode[] = []
    for (const node of this._graphNodeOrder) {
      let connectionCount = 0
      for (const input of node.getInputs()) {
        if (input.getConnection() && input.getConnection()!.getNode() !== this) {
          ++connectionCount
        }
      }

      inDegree.set(node, connectionCount)

      if (connectionCount === 0) {
        nodeQueue.push(node)
      }
    }

    const order: ShaderNode[] = []

    while (nodeQueue.length > 0) {
      // Pop the queue and add to the topological order.
      const node = nodeQueue.shift()!
      order.push(node)

      // Find connected nodes and decrease their in-degree, adding them to
      // the queue when their in-degree becomes 0.
      for (const output of node.getOutputs()) {
        for (const input of output.getConnections()) {
          const downstreamNode = input.getNode()
          if (downstreamNode && downstreamNode !== (this as ShaderNode)) {
            const d = (inDegree.get(downstreamNode) ?? 0) - 1
            inDegree.set(downstreamNode, d)
            if (d <= 0) {
              nodeQueue.push(downstreamNode)
            }
          }
        }
      }
    }

    this._graphNodeOrder = order
  }

  // For inputs and outputs in the graph, set valid and unique variable
  // names to be used in generated code.
  protected setVariableNames(context: GenContext): void {
    const syntax = context.getShaderGenerator().getSyntax()

    for (const inputSocket of this.getInputSockets()) {
      inputSocket.setVariable(syntax.getVariableName(inputSocket.getName(), inputSocket.getType(), this._identifiers))
    }
    for (const outputSocket of this.getOutputSockets()) {
      outputSocket.setVariable(syntax.getVariableName(outputSocket.getName(), outputSocket.getType(), this._identifiers))
    }
    for (const node of this.getNodes()) {
      for (const input of node.getInputs()) {
        input.setVariable(syntax.getVariableName(input.getFullName(), input.getType(), this._identifiers))
      }
      for (const output of node.getOutputs()) {
        output.setVariable(syntax.getVariableName(output.getFullName(), output.getType(), this._identifiers))
      }
    }
  }

  // Populate the color transform map for the given shader port, when the
  // source/target color space combination is supported for its data type.
  protected populateColorTransformMap(
    colorManagementSystem: ColorManagementSystem | null,
    shaderPort: ShaderPort | null,
    sourceColorSpace: string,
    targetColorSpace: string,
    asInput: boolean,
  ): void {
    if (
      !shaderPort ||
      sourceColorSpace === '' ||
      targetColorSpace === '' ||
      sourceColorSpace === targetColorSpace ||
      sourceColorSpace === 'none' ||
      targetColorSpace === 'none'
    ) {
      return
    }

    if (shaderPort.getType().equals(Type.COLOR3) || shaderPort.getType().equals(Type.COLOR4)) {
      // Store the source color space on the shader port.
      shaderPort.setColorSpace(sourceColorSpace)

      // Update the color transform map when a CMS is provided.
      if (colorManagementSystem) {
        const transform = { sourceSpace: sourceColorSpace, targetSpace: targetColorSpace, type: shaderPort.getType() }
        if (colorManagementSystem.supportsTransform(transform)) {
          if (asInput) {
            this._inputColorTransformMap.push([shaderPort as ShaderInput, transform])
          } else {
            this._outputColorTransformMap.push([shaderPort as ShaderOutput, transform])
          }
        } else {
          console.error(`Unsupported color space transform from ${sourceColorSpace} to ${targetColorSpace}`)
        }
      }
    }
  }

  // Populate the unit transform map when the given port has a unit
  // attribute of a supported type.
  protected populateUnitTransformMap(
    unitSystem: UnitSystem | null,
    shaderPort: ShaderPort | null,
    input: ValueElement,
    globalTargetUnitSpace: string,
    asInput: boolean,
  ): void {
    if (!unitSystem || globalTargetUnitSpace === '') {
      return
    }

    const sourceUnitSpace = input.getUnit()
    if (!shaderPort || sourceUnitSpace === '') {
      return
    }

    const unitType = input.getUnitType()
    if (!(input.getDocument() as Document).getUnitTypeDef(unitType)) {
      return
    }

    let targetUnitSpace = input.getActiveUnit()
    if (targetUnitSpace === '') {
      targetUnitSpace = globalTargetUnitSpace
    }

    // Only float and vector types support conversion.
    const type = shaderPort.getType()
    const supportedType =
      type.equals(Type.FLOAT) || type.equals(Type.VECTOR2) || type.equals(Type.VECTOR3) || type.equals(Type.VECTOR4)
    if (supportedType) {
      const transform = {
        sourceUnit: sourceUnitSpace,
        targetUnit: targetUnitSpace,
        type,
        unitType,
      }
      if (unitSystem.supportsTransform(transform)) {
        shaderPort.setUnit(sourceUnitSpace)
        if (asInput) {
          this._inputUnitTransformMap.push([shaderPort as ShaderInput, transform])
        } else {
          this._outputUnitTransformMap.push([shaderPort as ShaderOutput, transform])
        }
      }
    }
  }
}
