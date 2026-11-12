// Ported from MaterialX 1.39.5: source/MaterialXCore/Interface.h,
//  source/MaterialXCore/Interface.cpp
// Copyright Contributors to the MaterialX Project. Apache License 2.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Mirrors source/MaterialXCore/Interface.h and Interface.cpp
//
// References to Node/NodeGraph/NodeDef (defined in later modules) use
// type-only imports plus the category-keyed class registry, so this module
// has no runtime dependency on them.

import { Edge, ExceptionFoundCycle } from './traversal.ts'
import {
  Element,
  TypedElement,
  ValueElement,
  Token,
  getRegisteredElementClass,
  registerElementClass,
  type ElementClass,
} from './element.ts'
import { DEFAULT_TYPE_STRING, MULTI_OUTPUT_TYPE_STRING } from './types.ts'
import { EMPTY_STRING, splitString } from './util.ts'
import { Value, type ValueData } from './value.ts'
import type { Node, NodeGraph } from './node.ts'
import type { NodeDef } from './definition.ts'

function nodeClass(): ElementClass<Node> | undefined {
  return getRegisteredElementClass('node') as ElementClass<Node> | undefined
}

function nodeGraphClass(): ElementClass<NodeGraph> | undefined {
  return getRegisteredElementClass('nodegraph') as ElementClass<NodeGraph> | undefined
}

// The base class for port elements such as Input and Output.
//
// Port elements support spatially-varying upstream connections to nodes.
export class PortElement extends ValueElement {
  static readonly NODE_NAME_ATTRIBUTE = 'nodename'
  static readonly NODE_GRAPH_ATTRIBUTE = 'nodegraph'
  static readonly OUTPUT_ATTRIBUTE = 'output'

  // --- Node Name ---

  // Set the node name string of this element, creating a connection to the
  // Node with the given name within the same NodeGraph.
  setNodeName(node: string): void {
    this.setAttribute(PortElement.NODE_NAME_ATTRIBUTE, node)
  }

  hasNodeName(): boolean {
    return this.hasAttribute(PortElement.NODE_NAME_ATTRIBUTE)
  }

  getNodeName(): string {
    return this.getAttribute(PortElement.NODE_NAME_ATTRIBUTE)
  }

  // --- Node Graph ---

  setNodeGraphString(node: string): void {
    this.setAttribute(PortElement.NODE_GRAPH_ATTRIBUTE, node)
  }

  hasNodeGraphString(): boolean {
    return this.hasAttribute(PortElement.NODE_GRAPH_ATTRIBUTE)
  }

  getNodeGraphString(): string {
    return this.getAttribute(PortElement.NODE_GRAPH_ATTRIBUTE)
  }

  // --- Output ---

  setOutputString(output: string): void {
    this.setAttribute(PortElement.OUTPUT_ATTRIBUTE, output)
  }

  hasOutputString(): boolean {
    return this.hasAttribute(PortElement.OUTPUT_ATTRIBUTE)
  }

  getOutputString(): string {
    return this.getAttribute(PortElement.OUTPUT_ATTRIBUTE)
  }

  // Set the output to which this input is connected. If the output argument
  // is null, then any existing output connection is cleared.
  setConnectedOutput(output: Output | null): void {
    if (output) {
      this.setOutputString(output.getName())
      const parent = output.getParent()
      if (parent) {
        if (parent.getCategory() === 'nodegraph') {
          this.setNodeGraphString(parent.getName())
          this.removeAttribute(PortElement.NODE_NAME_ATTRIBUTE)
        } else if (parent.isNode()) {
          this.setNodeName(parent.getName())
          this.removeAttribute(PortElement.NODE_GRAPH_ATTRIBUTE)
        }
      }
      this.removeAttribute(ValueElement.VALUE_ATTRIBUTE)
    } else {
      this.removeAttribute(PortElement.OUTPUT_ATTRIBUTE)
      this.removeAttribute(PortElement.NODE_GRAPH_ATTRIBUTE)
      this.removeAttribute(PortElement.NODE_NAME_ATTRIBUTE)
    }
  }

  // Return the output, if any, to which this input is connected.
  getConnectedOutput(): Output | null {
    const outputString = this.getOutputString()
    let result: Output | null = null

    // Determine the scope at which the connected output may be found.
    const parent = this.getParent()
    const scope = parent ? parent.getParent() : null

    // Look for a nodegraph output.
    if (this.hasNodeGraphString()) {
      const ngCls = nodeGraphClass()
      let nodeGraph = ngCls ? this.resolveNameReference(ngCls, this.getNodeGraphString(), scope) : null
      if (!nodeGraph && ngCls) {
        nodeGraph = this.resolveNameReference(ngCls, this.getNodeGraphString())
      }
      if (nodeGraph) {
        const outputs = nodeGraph.getOutputs()
        if (outputs.length > 0) {
          result = outputString === '' ? outputs[0]! : nodeGraph.getOutput(outputString)
        }
      }
    }
    // Look for a node output.
    else if (this.hasNodeName()) {
      const nodeName = this.getNodeName()
      const nCls = nodeClass()
      let node = nCls ? this.resolveNameReference(nCls, nodeName, scope) : null
      if (!node && nCls) {
        node = this.resolveNameReference(nCls, nodeName)
      }
      if (node) {
        const outputs = node.getOutputs()
        if (outputs.length > 0) {
          result = outputString === '' ? outputs[0]! : node.getOutput(outputString)
        }
      }
    }

    // Look for an output at document scope.
    if (!result) {
      result = (this.getDocument() as unknown as InterfaceElement).getOutput(outputString)
    }
    return result
  }

  // --- Connections ---

  // Set the node to which this element is connected. The given node must
  // belong to the same node graph. A null node clears the connection.
  setConnectedNode(node: Node | null): void {
    if (node) {
      this.setNodeName(node.getName())
      this.removeAttribute(ValueElement.VALUE_ATTRIBUTE)
      this.removeAttribute(PortElement.NODE_GRAPH_ATTRIBUTE)
      this.removeAttribute(ValueElement.INTERFACE_NAME_ATTRIBUTE)
    } else {
      this.removeAttribute(PortElement.NODE_NAME_ATTRIBUTE)
    }
  }

  // Return the node, if any, to which this element is connected.
  getConnectedNode(): Node | null {
    let graph: Element | null = null
    for (let elem: Element | null = this; elem; elem = elem.getParent()) {
      if (elem.isGraphElement()) {
        graph = elem
        break
      }
    }
    return graph ? (graph as unknown as { getNode(name: string): Node | null }).getNode(this.getNodeName()) : null
  }

  // --- Validation ---

  override validate(message?: string[]): boolean {
    let res = true

    const connectedNode = this.getConnectedNode()
    if (this.hasNodeName() || this.hasOutputString()) {
      const ngCls = nodeGraphClass()
      const nodeGraph = ngCls ? this.resolveNameReference(ngCls, this.getNodeName()) : null
      if (!nodeGraph) {
        res = this.validateRequire(connectedNode !== null, res, message, 'Invalid port connection')
      }
    }
    if (connectedNode) {
      const outputString = this.getOutputString()
      if (outputString !== '') {
        let output: Output | null = null
        if (this.hasNodeName()) {
          const nodeDef = connectedNode.getNodeDef()
          output = nodeDef ? nodeDef.getOutput(outputString) : null
          if (output) {
            res = this.validateRequire(
              connectedNode.getType() === MULTI_OUTPUT_TYPE_STRING,
              res,
              message,
              'Multi-output type expected in port connection',
            )
          }
        } else if (this.hasNodeGraphString()) {
          const ngCls = nodeGraphClass()
          const nodeGraph = ngCls ? this.resolveNameReference(ngCls, this.getNodeGraphString()) : null
          if (nodeGraph) {
            output = nodeGraph.getOutput(outputString)
            if (nodeGraph.getNodeDef()) {
              res = this.validateRequire(
                nodeGraph.getOutputCount() > 1,
                res,
                message,
                'Multi-output type expected in port connection',
              )
            }
          }
        } else {
          // Document has no concept of a multioutput type.
          output = (this.getDocument() as unknown as InterfaceElement).getOutput(outputString)
        }
        res = this.validateRequire(output !== null, res, message, 'No output found for port connection')

        if (output) {
          res = this.validateRequire(
            this.getType() === output.getType(),
            res,
            message,
            'Mismatched types in port connection',
          )
        }
      } else if (connectedNode.getType() !== MULTI_OUTPUT_TYPE_STRING) {
        res = this.validateRequire(
          this.getType() === connectedNode.getType(),
          res,
          message,
          'Mismatched types in port connection',
        )
      }
    }
    return super.validate(message) && res
  }
}

// An input element within a Node or NodeDef.
//
// An Input holds either a uniform value or a connection to a
// spatially-varying Output, either of which may be modified within the
// scope of a Material.
export class Input extends PortElement {
  static readonly CATEGORY = 'input'
  static readonly DEFAULT_GEOM_PROP_ATTRIBUTE = 'defaultgeomprop'
  static readonly HINT_ATTRIBUTE = 'hint'
  static readonly TRANSPARENCY_HINT = 'transparency'
  static readonly OPACITY_HINT = 'opacity'
  static readonly ANISOTROPY_HINT = 'anisotropy'

  constructor(parent: Element | null, name: string) {
    super(parent, Input.CATEGORY, name)
  }

  // --- Default Geometric Property ---

  setDefaultGeomPropString(geomprop: string): void {
    this.setAttribute(Input.DEFAULT_GEOM_PROP_ATTRIBUTE, geomprop)
  }

  hasDefaultGeomPropString(): boolean {
    return this.hasAttribute(Input.DEFAULT_GEOM_PROP_ATTRIBUTE)
  }

  getDefaultGeomPropString(): string {
    return this.getAttribute(Input.DEFAULT_GEOM_PROP_ATTRIBUTE)
  }

  // Return the GeomPropDef element to use, if defined for this input.
  getDefaultGeomProp(): Element | null {
    const defaultGeomProp = this.getAttribute(Input.DEFAULT_GEOM_PROP_ATTRIBUTE)
    if (defaultGeomProp !== '') {
      const cls = getRegisteredElementClass('geompropdef')
      return cls ? this.getDocument().getChildOfType(cls, defaultGeomProp) : null
    }
    return null
  }

  // --- Connections ---

  // Return the node, if any, to which this input is connected.
  override getConnectedNode(): Node | null {
    // Handle interface name references.
    const graphInput = this.getInterfaceInput()
    if (graphInput && (graphInput.hasNodeName() || graphInput.hasNodeGraphString())) {
      return graphInput.getConnectedNode()
    }

    // Handle inputs of compound nodegraphs.
    if (this.getParent()?.getCategory() === 'nodegraph') {
      const rootNode = (this.getDocument() as unknown as { getNode(name: string): Node | null }).getNode(
        this.getNodeName(),
      )
      if (rootNode) return rootNode
    }

    // Handle transitive connections via outputs.
    const output = this.getConnectedOutput()
    if (output) {
      const node = output.getConnectedNode()
      if (node) return node
    }

    return super.getConnectedNode()
  }

  // Connects this input to a corresponding interface with the given name.
  // An empty interface name removes any existing connection.
  setConnectedInterfaceName(interfaceName: string): void {
    if (interfaceName !== '') {
      let graph: Element | null = null
      for (let elem: Element | null = this; elem; elem = elem.getParent()) {
        if (elem.isGraphElement()) {
          graph = elem
          break
        }
      }
      if (graph && graph === this.getParent()) {
        // This element is a direct child of a graph element, so its
        // interface name references a value element in the parent scope.
        graph = null
        for (let elem: Element | null = this.getParent()!.getParent(); elem; elem = elem.getParent()) {
          if (elem.isGraphElement()) {
            graph = elem
            break
          }
        }
      }
      if (graph && (graph as unknown as InterfaceElement).getInput(interfaceName)) {
        this.setInterfaceName(interfaceName)
        this.removeAttribute(ValueElement.VALUE_ATTRIBUTE)
        this.removeAttribute(PortElement.OUTPUT_ATTRIBUTE)
        this.removeAttribute(PortElement.NODE_GRAPH_ATTRIBUTE)
        this.removeAttribute(PortElement.NODE_NAME_ATTRIBUTE)
      }
    } else {
      this.removeAttribute(ValueElement.INTERFACE_NAME_ATTRIBUTE)
    }
  }

  // Return the input on the parent graph corresponding to the interface
  // name for this input.
  getInterfaceInput(): Input | null {
    if (this.hasInterfaceName()) {
      for (let elem: Element | null = this; elem; elem = elem.getParent()) {
        if (elem.isGraphElement()) {
          return (elem as unknown as InterfaceElement).getInput(this.getInterfaceName())
        }
      }
    }
    return null
  }

  // --- Hints ---

  hasHint(): boolean {
    return this.hasAttribute(Input.HINT_ATTRIBUTE)
  }

  getHint(): string {
    return this.getAttribute(Input.HINT_ATTRIBUTE)
  }

  setHint(hint: string): void {
    this.setAttribute(Input.HINT_ATTRIBUTE, hint)
  }

  // --- Validation ---

  override validate(message?: string[]): boolean {
    let res = true
    const parent = this.getParent()

    if (this.hasDefaultGeomPropString()) {
      res = this.validateRequire(
        parent?.getCategory() === 'nodedef' || parent?.getCategory() === 'nodegraph',
        res,
        message,
        'Invalid defaultgeomprop on non-definition and non-nodegraph input',
      )
      res = this.validateRequire(this.getDefaultGeomProp() !== null, res, message, 'Invalid defaultgeomprop string')
    }
    if (parent?.isNode()) {
      let numBindings = 0
      if (this.hasValue()) numBindings++
      if (this.hasNodeName()) numBindings++
      if (this.hasNodeGraphString()) numBindings++
      if (this.hasInterfaceName()) numBindings++
      if (this.hasOutputString() && !(this.hasNodeName() || this.hasNodeGraphString())) numBindings++
      res = this.validateRequire(numBindings > 0, res, message, 'Node input binds no value or connection')
      res = this.validateRequire(numBindings <= 1, res, message, 'Node input has too many bindings')
    } else if (parent?.getCategory() === 'nodegraph') {
      res = this.validateRequire(
        (parent as unknown as NodeGraph).getNodeDef() === null,
        res,
        message,
        'Input element in a functional nodegraph has no effect',
      )
    }
    return super.validate(message) && res
  }
}

// A spatially-varying output element within a NodeGraph or NodeDef.
export class Output extends PortElement {
  static readonly CATEGORY = 'output'
  static readonly DEFAULT_INPUT_ATTRIBUTE = 'defaultinput'

  constructor(parent: Element | null, name: string) {
    super(parent, Output.CATEGORY, name)
  }

  // --- Traversal ---

  override getUpstreamEdge(index = 0): Edge | null {
    if (index < this.getUpstreamEdgeCount()) {
      return new Edge(this, null, this.getConnectedNode())
    }
    return null
  }

  override getUpstreamEdgeCount(): number {
    return 1
  }

  // Return true if a cycle exists in any upstream path from this element.
  hasUpstreamCycle(): boolean {
    try {
      for (const _edge of this.traverseGraph()) {
        // Iterate the full graph looking for a cycle.
      }
    } catch (err) {
      if (err instanceof ExceptionFoundCycle) return true
      throw err
    }
    return false
  }

  // --- Validation ---

  override validate(message?: string[]): boolean {
    let res = true
    res = this.validateRequire(!this.hasUpstreamCycle(), res, message, 'Cycle in upstream path')
    return super.validate(message) && res
  }
}

// The base class for interface elements such as Node, NodeDef, and
// NodeGraph.
//
// An InterfaceElement supports a set of Input and Output elements, with an
// API for setting their values.
export class InterfaceElement extends TypedElement {
  static readonly NODE_DEF_ATTRIBUTE = 'nodedef'
  static readonly TARGET_ATTRIBUTE = 'target'
  static readonly VERSION_ATTRIBUTE = 'version'
  static readonly DEFAULT_VERSION_ATTRIBUTE = 'isdefaultversion'

  private _inputCount = 0
  private _outputCount = 0

  override isInterfaceElement(): boolean {
    return true
  }

  // --- NodeDef String ---

  setNodeDefString(nodeDef: string): void {
    this.setAttribute(InterfaceElement.NODE_DEF_ATTRIBUTE, nodeDef)
  }

  hasNodeDefString(): boolean {
    return this.hasAttribute(InterfaceElement.NODE_DEF_ATTRIBUTE)
  }

  getNodeDefString(): string {
    return this.getAttribute(InterfaceElement.NODE_DEF_ATTRIBUTE)
  }

  // --- Inputs ---

  // Add an Input to this interface.
  addInput(name = EMPTY_STRING, type: string = DEFAULT_TYPE_STRING): Input {
    const child = this.addChild(Input, name)
    child.setType(type)
    return child
  }

  // Return the Input, if any, with the given name.
  getInput(name: string): Input | null {
    return this.getChildOfType(Input, name)
  }

  // Return a vector of all Input elements.
  getInputs(): Input[] {
    return this.getChildrenOfType(Input)
  }

  // Return the number of Input elements.
  getInputCount(): number {
    return this._inputCount
  }

  // Remove the Input, if any, with the given name.
  removeInput(name: string): void {
    this.removeChildOfType(Input, name)
  }

  // Return the first Input with the given name that belongs to this
  // interface, taking interface inheritance into account.
  getActiveInput(name: string): Input | null {
    for (const elem of this.traverseInheritance()) {
      const input = (elem as InterfaceElement).getInput(name)
      if (input) return input
    }
    return null
  }

  // Return all Input elements that belong to this interface, taking
  // inheritance into account.
  getActiveInputs(): Input[] {
    const activeInputs: Input[] = []
    const activeInputNamesSet = new Set<string>()
    for (const elem of this.traverseInheritance()) {
      for (const input of (elem as InterfaceElement).getInputs()) {
        if (!activeInputNamesSet.has(input.getName())) {
          activeInputNamesSet.add(input.getName())
          activeInputs.push(input)
        }
      }
    }
    return activeInputs
  }

  // --- Outputs ---

  // Add an Output to this interface.
  addOutput(name = EMPTY_STRING, type: string = DEFAULT_TYPE_STRING): Output {
    const output = this.addChild(Output, name)
    output.setType(type)
    return output
  }

  // Return the Output, if any, with the given name.
  getOutput(name: string): Output | null {
    return this.getChildOfType(Output, name)
  }

  // Return a vector of all Output elements.
  getOutputs(): Output[] {
    return this.getChildrenOfType(Output)
  }

  // Return the number of Output elements.
  getOutputCount(): number {
    return this._outputCount
  }

  // Remove the Output, if any, with the given name.
  removeOutput(name: string): void {
    this.removeChildOfType(Output, name)
  }

  // Return the first Output with the given name that belongs to this
  // interface, taking interface inheritance into account.
  getActiveOutput(name: string): Output | null {
    for (const elem of this.traverseInheritance()) {
      const output = (elem as InterfaceElement).getOutput(name)
      if (output) return output
    }
    return null
  }

  // Return all Output elements that belong to this interface, taking
  // inheritance into account.
  getActiveOutputs(): Output[] {
    const activeOutputs: Output[] = []
    const activeOutputNamesSet = new Set<string>()
    for (const elem of this.traverseInheritance()) {
      for (const output of (elem as InterfaceElement).getOutputs()) {
        if (!activeOutputNamesSet.has(output.getName())) {
          activeOutputNamesSet.add(output.getName())
          activeOutputs.push(output)
        }
      }
    }
    return activeOutputs
  }

  // Set the output to which the given input is connected, creating a child
  // input if needed.
  setConnectedOutput(inputName: string, output: Output | null): void {
    let input = this.getInput(inputName)
    if (!input) {
      input = this.addInput(inputName)
    }
    if (output) {
      input.setType(output.getType())
    }
    input.setConnectedOutput(output)
  }

  // Return the output connected to the given input.
  getConnectedOutput(inputName: string): Output | null {
    const input = this.getInput(inputName)
    return input ? input.getConnectedOutput() : null
  }

  // --- Tokens ---

  // Add a Token to this interface.
  addToken(name = EMPTY_STRING): Token {
    return this.addChild(Token, name)
  }

  // Return the Token, if any, with the given name.
  getToken(name: string): Token | null {
    return this.getChildOfType(Token, name)
  }

  // Return a vector of all Token elements.
  getTokens(): Token[] {
    return this.getChildrenOfType(Token)
  }

  // Remove the Token, if any, with the given name.
  removeToken(name: string): void {
    this.removeChildOfType(Token, name)
  }

  // Return the first Token with the given name that belongs to this
  // interface, taking interface inheritance into account.
  getActiveToken(name: string): Token | null {
    for (const elem of this.traverseInheritance()) {
      const token = (elem as InterfaceElement).getToken(name)
      if (token) return token
    }
    return null
  }

  // Return all Token elements that belong to this interface, taking
  // inheritance into account.
  getActiveTokens(): Token[] {
    const activeTokens: Token[] = []
    for (const elem of this.traverseInheritance()) {
      activeTokens.push(...(elem as InterfaceElement).getTokens())
    }
    return activeTokens
  }

  // --- Value Elements ---

  // Return the ValueElement, if any, with the given name.
  getValueElement(name: string): ValueElement | null {
    return this.getChildOfType(ValueElement, name)
  }

  // Return the first value element with the given name that belongs to this
  // interface, taking interface inheritance into account.
  getActiveValueElement(name: string): ValueElement | null {
    for (const iface of this.traverseInheritance()) {
      const valueElem = iface.getChildOfType(ValueElement, name)
      if (valueElem) return valueElem
    }
    return null
  }

  // Return all value elements that belong to this interface, taking
  // inheritance into account.
  getActiveValueElements(): ValueElement[] {
    const activeValueElems: ValueElement[] = []
    const activeValueElemNamesSet = new Set<string>()
    for (const iface of this.traverseInheritance()) {
      for (const valueElem of iface.getChildrenOfType(ValueElement)) {
        if (!activeValueElemNamesSet.has(valueElem.getName())) {
          activeValueElemNamesSet.add(valueElem.getName())
          activeValueElems.push(valueElem)
        }
      }
    }
    return activeValueElems
  }

  // --- Values ---

  // Set the typed value of an input by its name, creating a child element
  // to hold the input if needed.
  setInputValue(name: string, value: ValueData, type = EMPTY_STRING): Input {
    let input = this.getChildOfType(Input, name)
    if (!input) {
      input = this.addInput(name)
    }
    input.setValue(value, type)
    return input
  }

  // Return the typed value of an input by its name, taking both the calling
  // element and its declaration into account.
  getInputValue(name: string, target = EMPTY_STRING): Value | null {
    let input = this.getInput(name)
    if (input) {
      return input.getValue()
    }

    // Return the value, if any, stored in our declaration.
    const decl = this.getDeclaration(target)
    if (decl) {
      input = decl.getInput(name)
      if (input) {
        return input.getValue()
      }
    }

    return null
  }

  // Set the string value of a Token by its name, creating a child element
  // to hold the Token if needed.
  setTokenValue(name: string, value: string): Token {
    let token = this.getToken(name)
    if (!token) token = this.addToken(name)
    token.setValue(value, 'string')
    return token
  }

  // Return the string value of a Token by its name, or an empty string if
  // the given Token is not present.
  getTokenValue(name: string): string {
    const token = this.getToken(name)
    return token ? token.getValueString() : EMPTY_STRING
  }

  // --- Target ---

  setTarget(target: string): void {
    this.setAttribute(InterfaceElement.TARGET_ATTRIBUTE, target)
  }

  hasTarget(): boolean {
    return this.hasAttribute(InterfaceElement.TARGET_ATTRIBUTE)
  }

  getTarget(): string {
    return this.getAttribute(InterfaceElement.TARGET_ATTRIBUTE)
  }

  // --- Version ---

  setVersionString(version: string): void {
    this.setAttribute(InterfaceElement.VERSION_ATTRIBUTE, version)
  }

  hasVersionString(): boolean {
    return this.hasAttribute(InterfaceElement.VERSION_ATTRIBUTE)
  }

  getVersionString(): string {
    return this.getAttribute(InterfaceElement.VERSION_ATTRIBUTE)
  }

  // Set the major and minor versions as an integer pair.
  setVersionIntegers(majorVersion: number, minorVersion: number): void {
    this.setVersionString(`${majorVersion}.${minorVersion}`)
  }

  // Return the major and minor versions as an integer pair.
  getVersionIntegers(): [number, number] {
    const versionString = this.getVersionString()
    const splitVersion = splitString(versionString, '.')
    if (splitVersion.length >= 1 && /^\d+$/.test(splitVersion[0]!)) {
      const major = parseInt(splitVersion[0]!, 10)
      if (splitVersion.length === 2 && /^\d+$/.test(splitVersion[1]!)) {
        return [major, parseInt(splitVersion[1]!, 10)]
      }
      if (splitVersion.length === 1) {
        return [major, 0]
      }
    }
    return [0, 0]
  }

  // --- Default Version ---

  setDefaultVersion(defaultVersion: boolean): void {
    this.setTypedAttribute(InterfaceElement.DEFAULT_VERSION_ATTRIBUTE, defaultVersion)
  }

  getDefaultVersion(): boolean {
    return this.getTypedAttribute(InterfaceElement.DEFAULT_VERSION_ATTRIBUTE, 'boolean') === true
  }

  // --- Utility ---

  // Return the first declaration of this interface, optionally filtered by
  // the given target name.
  getDeclaration(_target = EMPTY_STRING): InterfaceElement | null {
    return null
  }

  override clearContent(): void {
    this._inputCount = 0
    this._outputCount = 0
    super.clearContent()
  }

  // Return true if this instance has an exact input match with the given
  // declaration, where each input of this instance corresponds to a
  // declaration input of the same name and type.
  hasExactInputMatch(declaration: InterfaceElement, message?: string[]): boolean {
    for (const input of this.getActiveInputs()) {
      const declarationInput = declaration.getActiveInput(input.getName())
      if (!declarationInput || declarationInput.getType() !== input.getType()) {
        message?.push(`Input '${input.getName()}' doesn't match declaration`)
        return false
      }
    }
    return true
  }

  protected override registerChildElement(child: Element): void {
    super.registerChildElement(child)
    if (child instanceof Input) {
      this._inputCount++
    } else if (child instanceof Output) {
      this._outputCount++
    }
  }

  protected override unregisterChildElement(child: Element): void {
    super.unregisterChildElement(child)
    if (child instanceof Input) {
      this._inputCount--
    } else if (child instanceof Output) {
      this._outputCount--
    }
  }
}

registerElementClass(Input)
registerElementClass(Output)
