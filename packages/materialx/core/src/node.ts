// Ported from MaterialX 1.39.5: source/MaterialXCore/Node.h,
//  source/MaterialXCore/Node.cpp
// Copyright Contributors to the MaterialX Project. Apache License 2.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Mirrors source/MaterialXCore/Node.h and Node.cpp

import { Exception } from './exceptions.ts'
import { Edge } from './traversal.ts'
import {
  Element,
  TypedElement,
  ValueElement,
  registerElementClass,
  targetStringsMatch,
  _internals,
} from './element.ts'
import { InterfaceElement, Input, Output, PortElement } from './interface.ts'
import { NodeDef, Implementation } from './definition.ts'
import {
  DEFAULT_TYPE_STRING,
  MATERIAL_TYPE_STRING,
  MULTI_OUTPUT_TYPE_STRING,
  SURFACE_MATERIAL_NODE_STRING,
  VOLUME_MATERIAL_NODE_STRING,
  VOLUME_SHADER_TYPE_STRING,
} from './types.ts'
import { EMPTY_STRING, incrementName, type StringMap } from './util.ts'

// Predicate to test a node against some criteria.
export type NodePredicate = (node: Node) => boolean

// The shape of the Document methods used from this module.
interface DocumentNodeShape {
  getMatchingPorts(nodeName: string): PortElement[]
  getMatchingNodeDefs(nodeName: string): NodeDef[]
  getImplementations(): Implementation[]
  getGeomPropDef(name: string): GeomPropDefShape | null
}

// The shape of GeomPropDef (defined in the geom module) used here.
interface GeomPropDefShape extends Element {
  getGeomProp(): string
  getType(): string
}

// A node element within a NodeGraph or Document.
//
// A Node represents an instance of a NodeDef within a graph, and its Input
// elements apply specific values and connections to that instance.
export class Node extends InterfaceElement {
  static readonly CATEGORY = 'node'

  constructor(parent: Element | null, name: string) {
    super(parent, Node.CATEGORY, name)
  }

  override isNode(): boolean {
    return true
  }

  // --- Name ---

  // Set the name string of this Node, propagating the updated name to all
  // downstream ports.
  setNameGlobal(name: string): void {
    const downStreamPorts = this.getDownstreamPorts()
    this.setName(name)
    const newName = this.getName()
    for (const port of downStreamPorts) {
      port.setNodeName(newName)
    }
  }

  // --- Connections ---

  // Set the node to which the given input is connected, creating a child
  // input if needed. A null node clears the connection.
  setConnectedNode(inputName: string, node: Node | null): void {
    let input = this.getInput(inputName)
    if (!input) {
      input = this.addInput(inputName)
    }
    if (node) {
      const type = node.getType()
      if (type !== MULTI_OUTPUT_TYPE_STRING) {
        input.setType(type)
      }
    }
    input.setConnectedNode(node)
  }

  // Return the Node connected to the given input.
  getConnectedNode(inputName: string): Node | null {
    const input = this.getInput(inputName)
    return input ? input.getConnectedNode() : null
  }

  // Set the name of the Node connected to the given input, creating a child
  // element for the input if needed.
  setConnectedNodeName(inputName: string, nodeName: string): void {
    let input = this.getInput(inputName)
    if (!input) {
      input = this.addInput(inputName)
    }
    input.setNodeName(nodeName)
  }

  // Return the name of the Node connected to the given input.
  getConnectedNodeName(inputName: string): string {
    const input = this.getInput(inputName)
    return input ? input.getNodeName() : EMPTY_STRING
  }

  // --- NodeDef References ---

  // Return the first NodeDef that declares this node, optionally filtered
  // by the given target name. When allowRoughMatch is set, a rough match is
  // allowed when an exact match (input names and types) is not found.
  getNodeDef(target = EMPTY_STRING, allowRoughMatch = false): NodeDef | null {
    if (this.hasNodeDefString()) {
      return this.resolveNameReference(NodeDef, this.getNodeDefString())
    }
    const doc = this.getDocument() as unknown as DocumentNodeShape
    const nodeDefs = doc.getMatchingNodeDefs(this.getQualifiedName(this.getCategory()))
    nodeDefs.push(...doc.getMatchingNodeDefs(this.getCategory()))
    const roughMatches: NodeDef[] = []
    for (const nodeDef of nodeDefs) {
      if (
        !targetStringsMatch(nodeDef.getTarget(), target) ||
        !nodeDef.isVersionCompatible(this.getVersionString()) ||
        nodeDef.getType() !== this.getType()
      ) {
        continue
      }
      if (!this.hasExactInputMatch(nodeDef)) {
        if (allowRoughMatch) {
          roughMatches.push(nodeDef)
        }
        continue
      }
      return nodeDef
    }
    if (roughMatches.length > 0) {
      return roughMatches[0]!
    }
    return null
  }

  // --- Implementation References ---

  // Return the first implementation for this node, optionally filtered by
  // the given target name. A node implementation may be either an
  // Implementation element or a NodeGraph element.
  getImplementation(target = EMPTY_STRING): InterfaceElement | null {
    const nodeDef = this.getNodeDef(target)
    return nodeDef ? nodeDef.getImplementation(target) : null
  }

  // --- Traversal ---

  override getUpstreamEdge(index = 0): Edge | null {
    if (index < this.getUpstreamEdgeCount()) {
      const input = this.getInputs()[index]!
      const upstreamNode = input.getConnectedNode()
      if (upstreamNode) {
        return new Edge(this, input, upstreamNode)
      }
    }
    return null
  }

  override getUpstreamEdgeCount(): number {
    return this.getInputCount()
  }

  // Given a connecting element (Input or Output) return the NodeDef output
  // corresponding to the output the element is connected to. Returns null
  // for standard nodes with a single implicit output.
  getNodeDefOutput(connectingElement: Element): Output | null {
    let outputName = ''
    const port = connectingElement.asA(PortElement)
    if (port) {
      // The connecting element is an input/output port, so get the name of
      // the output connected to this port.
      outputName = port.getOutputString()

      // Handle the case where it's an input to a top level output.
      const connectedInput = connectingElement.asA(Input)
      let output: Output | null = null
      if (connectedInput) {
        const interfaceInput = connectedInput.getInterfaceInput()
        if (interfaceInput) {
          output = interfaceInput.getConnectedOutput()
          outputName = interfaceInput.getOutputString()
        } else {
          output = connectedInput.getConnectedOutput()
        }
      }
      if (output) {
        if (connectedInput || output.getParent() === output.getDocument()) {
          if (output.getOutputString() !== '') {
            outputName = output.getOutputString()
          }
        }
      }
    }
    if (outputName !== '') {
      // Find this output on our nodedef.
      const nodeDef = this.getNodeDef()
      if (nodeDef) {
        return nodeDef.getActiveOutput(outputName)
      }
    }
    return null
  }

  // Return all downstream ports that connect to this node, ordered by the
  // names of the port elements.
  getDownstreamPorts(): PortElement[] {
    const downstreamPorts: PortElement[] = []
    const doc = this.getDocument() as unknown as DocumentNodeShape
    for (const port of doc.getMatchingPorts(this.getQualifiedName(this.getName()))) {
      if (port.getConnectedNode() === this) {
        downstreamPorts.push(port)
      }
    }
    downstreamPorts.sort((a, b) => (a.getName() > b.getName() ? -1 : a.getName() < b.getName() ? 1 : 0))
    return downstreamPorts
  }

  // --- Utility ---

  override getDeclaration(target = EMPTY_STRING): InterfaceElement | null {
    return this.getNodeDef(target)
  }

  // Add an input based on the corresponding input for the associated node
  // definition. If the input already exists on the node it is returned.
  addInputFromNodeDef(inputName: string): Input | null {
    let nodeInput = this.getInput(inputName)
    if (!nodeInput) {
      const nodeDef = this.getNodeDef()
      const nodeDefInput = nodeDef ? nodeDef.getActiveInput(inputName) : null
      if (nodeDefInput) {
        nodeInput = this.addInput(nodeDefInput.getName(), nodeDefInput.getType())
        if (nodeDefInput.hasValueString()) {
          nodeInput.setValueString(nodeDefInput.getValueString())
        }
      }
    }
    return nodeInput
  }

  // Add inputs based on the corresponding associated node definition.
  addInputsFromNodeDef(): void {
    const nodeDef = this.getNodeDef()
    if (nodeDef) {
      for (const nodeDefInput of nodeDef.getActiveInputs()) {
        const inputName = nodeDefInput.getName()
        let nodeInput = this.getInput(inputName)
        if (!nodeInput) {
          nodeInput = this.addInput(inputName, nodeDefInput.getType())
          if (nodeDefInput.hasValueString()) {
            nodeInput.setValueString(nodeDefInput.getValueString())
          }
        }
      }
    }
  }

  // --- Validation ---

  override validate(message?: string[]): boolean {
    let res = true
    res = this.validateRequire(this.getCategory() !== '', res, message, 'Node element is missing a category')
    res = this.validateRequire(this.hasType(), res, message, 'Node element is missing a type')

    const nodeDef = this.getNodeDef(EMPTY_STRING, true)
    if (nodeDef) {
      const matchMessage: string[] = []
      const exactMatch = this.hasExactInputMatch(nodeDef, matchMessage)
      res = this.validateRequire(exactMatch, res, message, 'Node interface error: ' + matchMessage.join(''))

      const activeOutputs = nodeDef.getActiveOutputs()
      if (activeOutputs.length > 1) {
        res = this.validateRequire(
          this.getType() === MULTI_OUTPUT_TYPE_STRING,
          res,
          message,
          "Node type is not 'multioutput' for node with multiple outputs",
        )
      } else if (activeOutputs.length === 1) {
        res = this.validateRequire(
          this.getType() === activeOutputs[0]!.getType(),
          res,
          message,
          'Node type does not match output port type',
        )
      }
    } else {
      const doc = this.getDocument() as unknown as DocumentNodeShape
      const categoryDeclared = doc.getMatchingNodeDefs(this.getCategory()).length > 0
      res = this.validateRequire(!categoryDeclared, res, message, "Node interface doesn't support this output type")
    }

    return super.validate(message) && res
  }
}

// The base class for graph elements such as NodeGraph and Document.
export class GraphElement extends InterfaceElement {
  override isGraphElement(): boolean {
    return true
  }

  // --- Node Elements ---

  // Add a Node to the graph.
  addNode(category: string, name = EMPTY_STRING, type: string = DEFAULT_TYPE_STRING): Node {
    const node = this.addChild(Node, name)
    node.setCategory(category)
    node.setType(type)
    return node
  }

  // Add a Node that is an instance of the given NodeDef.
  addNodeInstance(nodeDef: NodeDef, name = EMPTY_STRING): Node {
    const node = this.addNode(nodeDef.getNodeString(), name, nodeDef.getType())
    node.setNodeDefString(nodeDef.getName())
    return node
  }

  // Return the Node, if any, with the given name.
  getNode(name: string): Node | null {
    return this.getChildOfType(Node, name)
  }

  // Return a vector of all Nodes in the graph, optionally filtered by the
  // given category string.
  getNodes(category = EMPTY_STRING): Node[] {
    return this.getChildrenOfType(Node, category)
  }

  // Return a vector of nodes in the graph which have a given type.
  getNodesOfType(nodeType: string): Node[] {
    return this.getNodes().filter((node) => node.getType() === nodeType)
  }

  // Remove the Node, if any, with the given name.
  removeNode(name: string): void {
    this.removeChildOfType(Node, name)
  }

  // --- Material Nodes ---

  // Add a material node to the graph, optionally connecting it to the given
  // shader node.
  addMaterialNode(name = EMPTY_STRING, shaderNode: Node | null = null): Node {
    const isVolumeShader = shaderNode !== null && shaderNode.getType() === VOLUME_SHADER_TYPE_STRING
    const category = isVolumeShader ? VOLUME_MATERIAL_NODE_STRING : SURFACE_MATERIAL_NODE_STRING
    const materialNode = this.addNode(category, name, MATERIAL_TYPE_STRING)
    if (shaderNode) {
      const input = materialNode.addInput(shaderNode.getType(), shaderNode.getType())
      input.setConnectedNode(shaderNode)
    }
    return materialNode
  }

  // Return a vector of all material nodes.
  getMaterialNodes(): Node[] {
    return this.getNodesOfType(MATERIAL_TYPE_STRING)
  }

  // --- Backdrop Elements ---

  // Add a Backdrop to the graph.
  addBackdrop(name = EMPTY_STRING): Backdrop {
    return this.addChild(Backdrop, name)
  }

  // Return the Backdrop, if any, with the given name.
  getBackdrop(name: string): Backdrop | null {
    return this.getChildOfType(Backdrop, name)
  }

  // Return a vector of all Backdrop elements in the graph.
  getBackdrops(): Backdrop[] {
    return this.getChildrenOfType(Backdrop)
  }

  // Remove the Backdrop, if any, with the given name.
  removeBackdrop(name: string): void {
    this.removeChildOfType(Backdrop, name)
  }

  // --- Utility ---

  // Flatten all subgraphs at the root scope of this graph element,
  // recursively replacing each graph-defined node with its equivalent node
  // network.
  flattenSubgraphs(target = EMPTY_STRING, filter: NodePredicate | null = null): void {
    let nodeQueue = this.getNodes()
    while (nodeQueue.length > 0) {
      // Determine which nodes require processing, and precompute
      // declarations and graph implementations for these nodes.
      const processNodeVec: Node[] = []
      const graphImplMap = new Map<Node, NodeGraph>()
      const declarationMap = new Map<Node, InterfaceElement | null>()
      const downstreamPortMap = new Map<Node, PortElement[]>()
      for (const node of nodeQueue) {
        if (filter && !filter(node)) {
          continue
        }

        const implement = node.getImplementation(target)
        if (implement && implement instanceof NodeGraph) {
          processNodeVec.push(node)
          graphImplMap.set(node, implement)
          declarationMap.set(node, node.getDeclaration(target))
          downstreamPortMap.set(node, node.getDownstreamPorts())
          for (const sourceSubNode of implement.getNodes()) {
            downstreamPortMap.set(sourceSubNode, sourceSubNode.getDownstreamPorts())
          }
        }
      }
      nodeQueue = []

      // Iterate through nodes with graph implementations.
      for (const processNode of processNodeVec) {
        const sourceSubGraph = graphImplMap.get(processNode)!
        const subNodeMap = new Map<Node, Node>()

        // Create a new instance of each original subnode.
        for (const sourceSubNode of sourceSubGraph.getNodes()) {
          const origName = sourceSubNode.getName()
          const destName = this.createValidChildName(origName)
          const destSubNode = this.addNode(sourceSubNode.getCategory(), destName)

          destSubNode.copyContentFrom(sourceSubNode)
          this.setChildIndex(destSubNode.getName(), this.getChildIndex(processNode.getName()))

          // Store the mapping between subgraphs.
          subNodeMap.set(sourceSubNode, destSubNode)

          // Add the subnode to the queue, allowing processing of nested
          // subgraphs.
          nodeQueue.push(destSubNode)
        }

        // Update properties of generated subnodes.
        for (const [sourceSubNode, destSubNode] of subNodeMap) {
          // Update node connections.
          for (const sourcePort of downstreamPortMap.get(sourceSubNode) ?? []) {
            if (sourcePort instanceof Input) {
              const sourceParent = sourcePort.getParent()
              const mapped = sourceParent instanceof Node ? subNodeMap.get(sourceParent) : undefined
              if (mapped) {
                const processNodeInput = mapped.getInput(sourcePort.getName())
                if (processNodeInput) {
                  processNodeInput.setNodeName(destSubNode.getName())
                }
              }
            } else if (sourcePort instanceof Output) {
              for (const processNodePort of downstreamPortMap.get(processNode) ?? []) {
                processNodePort.setNodeName(destSubNode.getName())
              }
            }
          }

          // Transfer interface properties.
          for (const destInput of destSubNode.getInputs()) {
            if (destInput.hasInterfaceName()) {
              const sourceInput = processNode.getInput(destInput.getInterfaceName())
              if (sourceInput) {
                destInput.copyContentFrom(sourceInput)
                const connectedNode = destInput.getConnectedNode()
                // Update the downstream port map with the new instance.
                if (connectedNode && downstreamPortMap.has(connectedNode)) {
                  downstreamPortMap.set(connectedNode, connectedNode.getDownstreamPorts())
                }
              } else {
                const declaration = declarationMap.get(processNode)
                const declInput = declaration ? declaration.getActiveInput(destInput.getInterfaceName()) : null
                if (declInput) {
                  if (declInput.hasValueString()) {
                    destInput.setValueString(declInput.getValueString())
                  }
                  if (declInput.hasDefaultGeomPropString()) {
                    const doc = this.getDocument() as unknown as DocumentNodeShape
                    const geomPropDef = doc.getGeomPropDef?.(declInput.getDefaultGeomPropString())
                    if (geomPropDef) {
                      destInput.setConnectedNode(this.addGeomNode(geomPropDef, 'geomNode'))
                    }
                  }
                }
                destInput.removeAttribute(ValueElement.INTERFACE_NAME_ATTRIBUTE)
              }
            }
          }
        }

        // Update downstream ports with connections to subgraph outputs.
        for (const downstreamPort of downstreamPortMap.get(processNode) ?? []) {
          if (downstreamPort.hasOutputString()) {
            const subGraphOutput = sourceSubGraph.getOutput(downstreamPort.getOutputString())
            if (subGraphOutput) {
              let destName = subGraphOutput.getNodeName()
              const sourceSubNode = sourceSubGraph.getNode(destName)
              const destNode = sourceSubNode ? subNodeMap.get(sourceSubNode) : undefined
              if (destNode) {
                destName = destNode.getName()
              }
              downstreamPort.setNodeName(destName)
              downstreamPort.setOutputString(EMPTY_STRING)
            }
          }
        }

        // The processed node has been replaced, so remove it from the graph.
        this.removeNode(processNode.getName())
      }
    }
  }

  // Return a vector of all children (nodes and outputs) sorted in
  // topological order, using Kahn's algorithm.
  topologicalSort(): Element[] {
    const children = this.getChildren()

    // Calculate in-degrees for all children.
    const inDegree = new Map<Element, number>()
    const childQueue: Element[] = []
    for (const child of children) {
      let connectionCount = 0
      for (let i = 0; i < child.getUpstreamEdgeCount(); i++) {
        const upstreamEdge = child.getUpstreamEdge(i)
        if (upstreamEdge && upstreamEdge.getUpstreamElement()) {
          const elem = upstreamEdge.getUpstreamElement()!.getParent()
          if (elem === child.getParent()) {
            connectionCount++
          }
        }
      }

      inDegree.set(child, connectionCount)

      // Enqueue children with in-degree 0.
      if (connectionCount === 0) {
        childQueue.push(child)
      }
    }

    const result: Element[] = []
    while (childQueue.length > 0) {
      // Pop the queue and add to topological order.
      const child = childQueue.shift()!
      result.push(child)

      // Find connected nodes and decrease their in-degree, adding the node
      // to the queue when its in-degree becomes 0.
      if (child instanceof Node) {
        for (const port of child.getDownstreamPorts()) {
          const downstreamElem = port instanceof Output ? port : port.getParent()!
          const current = inDegree.get(downstreamElem) ?? 0
          if (current > 1) {
            inDegree.set(downstreamElem, current - 1)
          } else {
            inDegree.set(downstreamElem, 0)
            childQueue.push(downstreamElem)
          }
        }
      }
    }

    return result
  }

  // If not yet present, add a geometry node to this graph matching the
  // given property definition and name prefix.
  addGeomNode(geomPropDef: GeomPropDefShape, namePrefix: string): Node {
    const geomNodeName = namePrefix + '_' + geomPropDef.getName()
    let geomNode = this.getNode(geomNodeName)
    if (!geomNode) {
      geomNode = this.addNode(geomPropDef.getGeomProp(), geomNodeName, geomPropDef.getType())
      if (geomPropDef.hasAttribute('space')) {
        geomNode.setInputValue('space', geomPropDef.getAttribute('space'))
      }
      if (geomPropDef.hasAttribute('index')) {
        geomNode.setInputValue('index', parseInt(geomPropDef.getAttribute('index'), 10), 'integer')
      }
    }
    return geomNode
  }

  // Convert this graph to a string in the DOT language syntax, usable with
  // GraphViz (http://www.graphviz.org).
  asStringDot(): string {
    let dot = 'digraph {\n'

    // Create a unique name for each child element.
    const children = this.topologicalSort()
    const nameMap: StringMap = new Map()
    const nameSet = new Set<string>()
    for (const elem of children) {
      let uniqueName = elem.getCategory()
      while (nameSet.has(uniqueName)) {
        uniqueName = incrementName(uniqueName)
      }
      nameMap.set(elem.getName(), uniqueName)
      nameSet.add(uniqueName)
    }

    // Write out all nodes.
    for (const elem of children) {
      const node = elem.asA(Node)
      if (node) {
        dot += '    "' + (nameMap.get(node.getName()) ?? '') + '" '
        const nodeDef = node.getNodeDef()
        const nodeGroup = nodeDef ? nodeDef.getNodeGroup() : EMPTY_STRING
        if (nodeGroup === NodeDef.CONDITIONAL_NODE_GROUP) {
          dot += '[shape=diamond];\n'
        } else {
          dot += '[shape=box];\n'
        }
      }
    }

    // Write out all connections.
    const processedEdges = new Set<string>()
    const processedInterfaces = new Set<string>()
    for (const output of this.getOutputs()) {
      for (const edge of output.traverseGraph()) {
        if (!processedEdges.has(edge.key())) {
          const upstreamElem = edge.getUpstreamElement()!
          const downstreamElem = edge.getDownstreamElement()!
          const connectingElem = edge.getConnectingElement()

          dot += '    "' + (nameMap.get(upstreamElem.getName()) ?? '')
          dot += '" -> "' + (nameMap.get(downstreamElem.getName()) ?? '')
          dot += '" [label="'
          dot += connectingElem ? connectingElem.getName() : EMPTY_STRING
          dot += '"];\n'

          const upstreamNode = upstreamElem.asA(Node)
          if (upstreamNode && !processedInterfaces.has(upstreamNode.getName())) {
            for (const input of upstreamNode.getInputs()) {
              if (input.hasInterfaceName()) {
                dot += '    "' + input.getInterfaceName()
                dot += '" -> "' + (nameMap.get(upstreamElem.getName()) ?? '')
                dot += '" [label="'
                dot += input.getName()
                dot += '"];\n'
              }
            }
            processedInterfaces.add(upstreamNode.getName())
          }

          processedEdges.add(edge.key())
        }
      }
    }

    dot += '}\n'

    return dot
  }
}

// A node graph element within a Document.
export class NodeGraph extends GraphElement {
  static readonly CATEGORY = 'nodegraph'

  constructor(parent: Element | null, name: string) {
    super(parent, NodeGraph.CATEGORY, name)
  }

  // --- Name ---

  // Set the name string of this NodeGraph, propagating the updated name to
  // all downstream ports.
  setNameGlobal(name: string): void {
    const downStreamPorts = this.getDownstreamPorts()
    this.setName(name)
    const newName = this.getName()
    for (const port of downStreamPorts) {
      port.setNodeGraphString(newName)
    }
  }

  // --- Material References ---

  // Return all material-type outputs of the nodegraph.
  getMaterialOutputs(): Output[] {
    const materialOutputs: Output[] = []
    for (const graphOutput of this.getActiveOutputs()) {
      if (graphOutput.getType() === MATERIAL_TYPE_STRING) {
        const node = graphOutput.getConnectedNode()
        if (node && node.getType() === MATERIAL_TYPE_STRING) {
          materialOutputs.push(graphOutput)
        }
      }
    }
    return materialOutputs
  }

  // --- NodeDef References ---

  // Set the NodeDef element referenced by this NodeGraph.
  setNodeDef(nodeDef: NodeDef | null): void {
    if (nodeDef) {
      this.setNodeDefString(nodeDef.getName())
    } else {
      this.removeAttribute(InterfaceElement.NODE_DEF_ATTRIBUTE)
    }
  }

  // Return the NodeDef element referenced by this NodeGraph.
  getNodeDef(): NodeDef | null {
    let nodedef = this.resolveNameReference(NodeDef, this.getNodeDefString())
    // If not directly defined, look for an implementation which has a
    // nodedef association.
    if (!nodedef) {
      const doc = this.getDocument() as unknown as DocumentNodeShape
      for (const impl of doc.getImplementations()) {
        if (impl.getNodeGraph() === this.getQualifiedName(this.getName())) {
          nodedef = impl.getNodeDef()
        }
      }
    }
    return nodedef
  }

  // Return the first implementation for this node graph.
  getImplementation(): InterfaceElement | null {
    const nodedef = this.getNodeDef()
    return nodedef ? nodedef.getImplementation() : null
  }

  // --- Traversal ---

  // Return all downstream ports that connect to this graph, ordered by the
  // names of the port elements.
  getDownstreamPorts(): PortElement[] {
    const downstreamPorts: PortElement[] = []
    const doc = this.getDocument() as unknown as DocumentNodeShape
    for (const port of doc.getMatchingPorts(this.getQualifiedName(this.getName()))) {
      const node = port.getParent()
      const graph = node ? node.getParent() : null
      if (graph && graph.isGraphElement() && graph === this.getParent()) {
        downstreamPorts.push(port)
      }
    }
    downstreamPorts.sort((a, b) => (a.getName() > b.getName() ? -1 : a.getName() < b.getName() ? 1 : 0))
    return downstreamPorts
  }

  // --- Utility ---

  override getDeclaration(_target = EMPTY_STRING): InterfaceElement | null {
    const nodeDef = this.getNodeDef()
    if (nodeDef) {
      return nodeDef
    }
    if (!this.hasNodeDefString()) {
      return this
    }
    return null
  }

  protected override usesUnorderedChildEquivalence(): boolean {
    // Functional graphs (with a nodedef reference) define node interfaces,
    // so they require strict interface ordering.
    return this.getNodeDef() === null
  }

  // Add an interface name to an existing NodeDef associated with this
  // NodeGraph.
  addInterfaceName(inputPath: string, interfaceName: string): Input | null {
    const nodeDef = this.getNodeDef()
    const interfaceElement: InterfaceElement = nodeDef ?? this
    if (interfaceElement.getChild(interfaceName)) {
      throw new Exception(
        `Interface: ${interfaceName} has already been declared on the interface: ${interfaceElement.getNamePath()}`,
      )
    }

    let interfaceInput: Input | null = null
    const elem = this.getDescendant(inputPath)
    const input = elem ? elem.asA(Input) : null
    if (input && !input.getConnectedNode()) {
      input.setInterfaceName(interfaceName)
      interfaceInput = interfaceElement.getInput(interfaceName)
      if (!interfaceInput) {
        interfaceInput = interfaceElement.addInput(interfaceName, input.getType())
      }
      if (input.hasValue()) {
        interfaceInput.setValueString(input.getValueString())
        input.removeAttribute(ValueElement.VALUE_ATTRIBUTE)
      }
    }
    return interfaceInput
  }

  // Remove an interface name from an existing NodeDef associated with this
  // NodeGraph.
  removeInterfaceName(inputPath: string): void {
    const desc = this.getDescendant(inputPath)
    const input = desc ? desc.asA(Input) : null
    if (input) {
      const interfaceName = input.getInterfaceName()
      if (interfaceName !== '') {
        const nodeDef = this.getNodeDef()
        const iface: InterfaceElement = nodeDef ?? this
        const interfacePort = iface.getChild(interfaceName)
        if (interfacePort) {
          const interfaceInput = interfacePort.asA(Input)
          if (interfaceInput && interfaceInput.hasValue()) {
            input.setValueString(interfaceInput.getValueString())
          }
          iface.removeChild(interfaceName)
        }
        input.setInterfaceName(EMPTY_STRING)
      }
    }
  }

  // Modify the interface name on an existing NodeDef associated with this
  // NodeGraph.
  modifyInterfaceName(inputPath: string, interfaceName: string): void {
    const nodeDef = this.getNodeDef()
    const interfaceElement: InterfaceElement = nodeDef ?? this

    const desc = this.getDescendant(inputPath)
    const input = desc ? desc.asA(Input) : null
    if (input) {
      const previousName = input.getInterfaceName()
      if (previousName !== interfaceName) {
        const previousChild = interfaceElement.getChild(previousName)
        if (previousChild) {
          previousChild.setName(interfaceName)
        }
        input.setInterfaceName(interfaceName)
      }
    }
  }

  // --- Validation ---

  override validate(message?: string[]): boolean {
    let res = true

    res = this.validateRequire(!this.hasVersionString(), res, message, 'NodeGraph elements do not support version strings')
    if (this.hasNodeDefString()) {
      const nodeDef = this.getNodeDef()
      res = this.validateRequire(nodeDef !== null, res, message, 'NodeGraph implementation refers to non-existent NodeDef')
      if (nodeDef) {
        const graphOutputs = this.getOutputs()
        const nodeDefOutputs = nodeDef.getActiveOutputs()
        res = this.validateRequire(
          graphOutputs.length === nodeDefOutputs.length,
          res,
          message,
          'NodeGraph implementation has a different number of outputs than its NodeDef',
        )
        if (graphOutputs.length === 1 && nodeDefOutputs.length === 1) {
          res = this.validateRequire(
            graphOutputs[0]!.getType() === nodeDefOutputs[0]!.getType(),
            res,
            message,
            'NodeGraph implementation has a different output type than its NodeDef',
          )
        }
      }
    }

    return super.validate(message) && res
  }
}

// A layout element used to contain, group and document nodes within a graph.
export class Backdrop extends Element {
  static readonly CATEGORY = 'backdrop'
  static readonly CONTAINS_ATTRIBUTE = 'contains'
  static readonly WIDTH_ATTRIBUTE = 'width'
  static readonly HEIGHT_ATTRIBUTE = 'height'

  constructor(parent: Element | null, name: string) {
    super(parent, Backdrop.CATEGORY, name)
  }

  // --- Contains String ---

  setContainsString(contains: string): void {
    this.setAttribute(Backdrop.CONTAINS_ATTRIBUTE, contains)
  }

  hasContainsString(): boolean {
    return this.hasAttribute(Backdrop.CONTAINS_ATTRIBUTE)
  }

  getContainsString(): string {
    return this.getAttribute(Backdrop.CONTAINS_ATTRIBUTE)
  }

  // --- Width ---

  setWidth(width: number): void {
    this.setTypedAttribute(Backdrop.WIDTH_ATTRIBUTE, width, 'float')
  }

  hasWidth(): boolean {
    return this.hasAttribute(Backdrop.WIDTH_ATTRIBUTE)
  }

  getWidth(): number {
    return (this.getTypedAttribute(Backdrop.WIDTH_ATTRIBUTE, 'float') as number | null) ?? 0
  }

  // --- Height ---

  setHeight(height: number): void {
    this.setTypedAttribute(Backdrop.HEIGHT_ATTRIBUTE, height, 'float')
  }

  hasHeight(): boolean {
    return this.hasAttribute(Backdrop.HEIGHT_ATTRIBUTE)
  }

  getHeight(): number {
    return (this.getTypedAttribute(Backdrop.HEIGHT_ATTRIBUTE, 'float') as number | null) ?? 0
  }

  // --- Utility ---

  // Set the vector of elements that this backdrop contains.
  setContainsElements(elems: TypedElement[]): void {
    if (elems.length > 0) {
      this.setTypedAttribute(
        Backdrop.CONTAINS_ATTRIBUTE,
        elems.map((e) => e.getName()),
        'stringarray',
      )
    } else {
      this.removeAttribute(Backdrop.CONTAINS_ATTRIBUTE)
    }
  }

  // Return the vector of elements that this backdrop contains.
  getContainsElements(): TypedElement[] {
    const vec: TypedElement[] = []
    const graph = this.getAncestorOfType(GraphElement)
    if (graph) {
      const names = (this.getTypedAttribute(Backdrop.CONTAINS_ATTRIBUTE, 'stringarray') as string[] | null) ?? []
      for (const str of names) {
        const elem = graph.getChildOfType(TypedElement, str)
        if (elem) {
          vec.push(elem)
        }
      }
    }
    return vec
  }

  // --- Validation ---

  override validate(message?: string[]): boolean {
    let res = true
    if (this.hasContainsString()) {
      const stringVec = (this.getTypedAttribute(Backdrop.CONTAINS_ATTRIBUTE, 'stringarray') as string[] | null) ?? []
      const elemVec = this.getContainsElements()
      res = this.validateRequire(stringVec.length === elemVec.length, res, message, 'Invalid element in contains string')
    }
    return super.validate(message) && res
  }
}

registerElementClass(Node)
registerElementClass(NodeGraph)
registerElementClass(Backdrop)
_internals.nodeConstructor = Node
