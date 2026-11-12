// Ported from MaterialX 1.39.5: source/MaterialXGenShader/ShaderNode.h,
//  source/MaterialXGenShader/ShaderNode.cpp
// Copyright Contributors to the MaterialX Project. Apache License 2.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Mirrors source/MaterialXGenShader/ShaderNode.h and ShaderNode.cpp

import { Input, NodeDef, Node, Output, Value, EMPTY_STRING, NAME_PATH_SEPARATOR } from '@mtlx/core'
import { ExceptionShaderGenError } from './exceptions.ts'
import { GenUserData } from './genUserData.ts'
import { Type, TypeDesc } from './typeDesc.ts'
import { ShaderNodeImpl } from './shaderNodeImpl.ts'
import type { GenContext } from './genContext.ts'
import type { ShaderGraph } from './shaderGraph.ts'

// Metadata to be exported to the generated shader.
export class ShaderMetadata {
  constructor(
    public name: string,
    public type: TypeDesc,
    public value: Value | null = null,
  ) {}
}

// A registry for metadata that will be exported to the generated shader if
// found on nodes and inputs during shader generation.
export class ShaderMetadataRegistry extends GenUserData {
  static readonly USER_DATA_NAME = 'ShaderMetadataRegistry'

  protected _entries: ShaderMetadata[] = []
  protected _entryIndex = new Map<string, number>()

  // Add a new metadata entry to the registry.
  addMetadata(name: string, type: TypeDesc, value: Value | null = null): void {
    if (!this._entryIndex.has(name)) {
      this._entryIndex.set(name, this._entries.length)
      this._entries.push(new ShaderMetadata(name, type, value))
    }
  }

  // Return the metadata registered for the given name, or null.
  findMetadata(name: string): ShaderMetadata | null {
    const i = this._entryIndex.get(name)
    return i !== undefined ? this._entries[i]! : null
  }

  // Return all entries in the registry.
  getAllMetadata(): ShaderMetadata[] {
    return this._entries
  }

  // Clear all entries in the registry.
  clear(): void {
    this._entryIndex.clear()
    this._entries = []
  }
}

// Flags set on shader ports.
export const ShaderPortFlag = {
  UNIFORM: 1 << 0,
  EMITTED: 1 << 1,
  BIND_INPUT: 1 << 2,
  AUTHORED_VALUE: 1 << 3,
} as const

// An input or output port on a ShaderNode.
export class ShaderPort {
  protected _node: ShaderNode | null
  protected _type: TypeDesc
  protected _name: string
  protected _path = ''
  protected _semantic = ''
  protected _variable: string
  protected _value: Value | null
  protected _unit = ''
  protected _colorspace = ''
  protected _geomprop = ''
  protected _metadata: ShaderMetadata[] | null = null
  protected _flags = 0

  constructor(node: ShaderNode | null, type: TypeDesc, name: string, value: Value | null = null) {
    this._node = node
    this._type = type
    this._name = name
    this._variable = name
    this._value = value
  }

  // Return the node this port belongs to.
  getNode(): ShaderNode | null {
    return this._node
  }

  setType(type: TypeDesc): void {
    this._type = type
  }

  getType(): TypeDesc {
    return this._type
  }

  setName(name: string): void {
    this._name = name
  }

  getName(): string {
    return this._name
  }

  getFullName(): string {
    return (this._node ? this._node.getName() : '') + '_' + this._name
  }

  setVariable(name: string): void {
    this._variable = name
  }

  getVariable(): string {
    return this._variable
  }

  setSemantic(semantic: string): void {
    this._semantic = semantic
  }

  getSemantic(): string {
    return this._semantic
  }

  // Set a value on this port.
  setValue(value: Value | null, authoredValue = true): void {
    this._value = value
    this.setFlag(ShaderPortFlag.AUTHORED_VALUE, authoredValue)
  }

  getValue(): Value | null {
    return this._value
  }

  // Return the value set on this port as a string, or an empty string.
  getValueString(): string {
    return this._value ? this._value.getValueString() : EMPTY_STRING
  }

  setColorSpace(colorspace: string): void {
    this._colorspace = colorspace
  }

  getColorSpace(): string {
    return this._colorspace
  }

  setUnit(unit: string): void {
    this._unit = unit
  }

  getUnit(): string {
    return this._unit
  }

  // Set the geomprop name when the input has a default geomprop to be
  // assigned when unconnected.
  setGeomProp(geomprop: string): void {
    this._geomprop = geomprop
  }

  getGeomProp(): string {
    return this._geomprop
  }

  setPath(path: string): void {
    this._path = path
  }

  getPath(): string {
    return this._path
  }

  setFlags(flags: number): void {
    this._flags = flags
  }

  getFlags(): number {
    return this._flags
  }

  setFlag(flag: number, value: boolean): void {
    this._flags = value ? this._flags | flag : this._flags & ~flag
  }

  getFlag(flag: number): boolean {
    return (this._flags & flag) !== 0
  }

  setUniform(): void {
    this._flags |= ShaderPortFlag.UNIFORM
  }

  isUniform(): boolean {
    return (this._flags & ShaderPortFlag.UNIFORM) !== 0
  }

  setEmitted(): void {
    this._flags |= ShaderPortFlag.EMITTED
  }

  isEmitted(): boolean {
    return (this._flags & ShaderPortFlag.EMITTED) !== 0
  }

  setBindInput(): void {
    this._flags |= ShaderPortFlag.BIND_INPUT
  }

  isBindInput(): boolean {
    return (this._flags & ShaderPortFlag.BIND_INPUT) !== 0
  }

  hasAuthoredValue(): boolean {
    return (this._flags & ShaderPortFlag.AUTHORED_VALUE) !== 0
  }

  setMetadata(metadata: ShaderMetadata[] | null): void {
    this._metadata = metadata
  }

  getMetadata(): ShaderMetadata[] | null {
    return this._metadata
  }
}

// An input on a ShaderNode.
export class ShaderInput extends ShaderPort {
  protected _connection: ShaderOutput | null = null

  // Return a connection to an upstream node output, or null.
  getConnection(): ShaderOutput | null {
    return this._connection
  }

  // Make a connection from the given source output to this input.
  makeConnection(src: ShaderOutput | null): void {
    if (src !== this._connection) {
      this.breakConnection()
      if (src) {
        if (src.getNode() === this.getNode() && !this.getNode()!.isAGraph()) {
          throw new ExceptionShaderGenError(
            `Tried to create looping connection on node ${this.getNode()!.getName()}` +
              ` from output: ${src.getFullName()} to input: ${this.getFullName()}`,
          )
        }
        this._connection = src
        src._connections.push(this)
      }
    }
  }

  // Break the connection to this input.
  breakConnection(): void {
    if (this._connection) {
      const connected = this._connection._connections
      const it = connected.indexOf(this)
      if (it !== -1) {
        connected.splice(it, 1)
      }
      this._connection = null
    }
  }

  // Return the sibling node connected upstream, or null.
  getConnectedSibling(): ShaderNode | null {
    if (this._connection && this._connection.getNode()?.getParent() === this._node?.getParent()) {
      return this._connection.getNode()
    }
    return null
  }
}

// An output on a ShaderNode.
export class ShaderOutput extends ShaderPort {
  // Internal connection list, managed by ShaderInput.
  _connections: ShaderInput[] = []

  // Return the connections to downstream node inputs.
  getConnections(): ShaderInput[] {
    return this._connections
  }

  // Make a connection from this output to the given input.
  makeConnection(dst: ShaderInput): void {
    dst.makeConnection(this)
  }

  // Break a connection from this output to the given input.
  breakConnection(dst: ShaderInput): void {
    if (!this._connections.includes(dst)) {
      throw new ExceptionShaderGenError(
        `Cannot break non-existent connection from output: ${this.getFullName()} to input: ${dst.getFullName()}`,
      )
    }
    dst.breakConnection()
  }

  // Break all connections from this output.
  breakConnections(): void {
    for (const input of [...this._connections]) {
      input.breakConnection()
    }
    if (this._connections.length > 0) {
      throw new ExceptionShaderGenError(
        `Number of output connections not broken properly '${this._connections.length}' for output: ${this.getFullName()}`,
      )
    }
  }
}

// In the upstream API graph sockets are aliases of the port types: an input
// socket is a ShaderOutput seen from inside the graph, and vice versa.
export type ShaderGraphInputSocket = ShaderOutput
export type ShaderGraphOutputSocket = ShaderInput

// Flags for classifying nodes into different categories.
export const ShaderNodeClassification = {
  // Node classes
  TEXTURE: 1 << 0, // Any node that outputs floats, colors, vectors, etc.
  CLOSURE: 1 << 1, // Any node that represents light integration
  SHADER: 1 << 2, // Any node that outputs a shader
  MATERIAL: 1 << 3, // Any node that outputs a material
  // Specific texture node types
  FILETEXTURE: 1 << 4,
  CONDITIONAL: 1 << 5,
  CONSTANT: 1 << 6,
  // Specific closure types
  BSDF: 1 << 7,
  BSDF_R: 1 << 8,
  BSDF_T: 1 << 9,
  EDF: 1 << 10,
  VDF: 1 << 11,
  LAYER: 1 << 12, // A node for vertical layering of other closure nodes
  MIX: 1 << 13, // A node for mixing of other closure nodes
  // Specific shader types
  SURFACE: 1 << 14,
  VOLUME: 1 << 15,
  LIGHT: 1 << 16,
  UNLIT: 1 << 17,
  // Types based on nodegroup
  SAMPLE2D: 1 << 18,
  SAMPLE3D: 1 << 19,
  GEOMETRIC: 1 << 20,
  DOT: 1 << 21,
} as const

// Class representing a node in the shader generation DAG.
export class ShaderNode {
  static readonly CONSTANT = 'constant'
  static readonly DOT = 'dot'
  static readonly IMAGE = 'image'
  static readonly SURFACESHADER = 'surfaceshader'
  static readonly BACKSURFACESHADER = 'backsurfaceshader'
  static readonly BSDF_R = 'R'
  static readonly BSDF_T = 'T'
  static readonly TEXTURE2D_GROUPNAME = 'texture2d'
  static readonly TEXTURE3D_GROUPNAME = 'texture3d'
  static readonly PROCEDURAL2D_GROUPNAME = 'procedural2d'
  static readonly PROCEDURAL3D_GROUPNAME = 'procedural3d'
  static readonly GEOMETRIC_GROUPNAME = 'geometric'

  protected _parent: ShaderGraph | null
  protected _name: string
  protected _uniqueId: string
  protected _classification = 0

  protected _inputMap = new Map<string, ShaderInput>()
  protected _inputOrder: ShaderInput[] = []

  protected _outputMap = new Map<string, ShaderOutput>()
  protected _outputOrder: ShaderOutput[] = []

  protected _impl: ShaderNodeImpl | null = null
  protected _metadata: ShaderMetadata[] | null = null

  constructor(parent: ShaderGraph | null, name: string) {
    this._parent = parent
    this._name = name
    this._uniqueId = name
  }

  // Create a new node from a nodedef.
  static create(parent: ShaderGraph | null, name: string, nodeDef: NodeDef, context: GenContext): ShaderNode {
    const newNode = new ShaderNode(parent, name)

    const shadergen = context.getShaderGenerator()

    // Find the implementation for this nodedef.
    newNode._impl = shadergen.getImplementation(nodeDef, context)
    if (!newNode._impl) {
      throw new ExceptionShaderGenError(
        `Could not find a matching implementation for node '${nodeDef.getNodeString()}' matching target '${shadergen.getTarget()}'`,
      )
    }

    // Create the interface from the nodedef.
    for (const port of nodeDef.getActiveValueElements()) {
      const portType = context.getTypeDesc(port.getType())
      if (port instanceof Output) {
        newNode.addOutput(port.getName(), portType)
      } else if (port instanceof Input) {
        let input: ShaderInput
        const portValue = port.getResolvedValueString()
        const enumNames = port.getAttribute('enum')
        const enumResult = shadergen.getSyntax().remapEnumeration(portValue, portType, enumNames)
        if (enumResult) {
          input = newNode.addInput(port.getName(), enumResult[0])
          input.setValue(enumResult[1], false)
        } else {
          input = newNode.addInput(port.getName(), portType)
          if (portValue !== '') {
            input.setValue(port.getResolvedValue(), false)
          }
        }
        if (port.getIsUniform()) {
          input.setUniform()
        }
      }
    }

    // Add any additional inputs required by the implementation.
    newNode.getImplementation().addInputs(newNode, context)

    // Add a default output if needed.
    if (newNode.numOutputs() === 0) {
      newNode.addOutput('out', context.getTypeDesc(nodeDef.getType()))
    }

    const nodeDefName = nodeDef.getName()
    const groupName = nodeDef.getNodeGroup()
    const C = ShaderNodeClassification

    // Set the node classification, defaulting to texture node.
    newNode._classification = C.TEXTURE

    // First, check for specific output types.
    const primaryOutput = newNode.getOutput()!
    if (primaryOutput.getType().equals(Type.MATERIAL)) {
      newNode._classification = C.MATERIAL
    } else if (primaryOutput.getType().equals(Type.SURFACESHADER)) {
      if (nodeDefName === 'ND_surface_unlit') {
        newNode._classification = C.SHADER | C.SURFACE | C.UNLIT
      } else {
        newNode._classification = C.SHADER | C.SURFACE | C.CLOSURE
      }
    } else if (primaryOutput.getType().equals(Type.VOLUMESHADER)) {
      newNode._classification = C.SHADER | C.VOLUME | C.CLOSURE
    } else if (primaryOutput.getType().equals(Type.LIGHTSHADER)) {
      newNode._classification = C.LIGHT | C.SHADER | C.CLOSURE
    } else if (primaryOutput.getType().equals(Type.BSDF)) {
      newNode._classification = C.BSDF | C.CLOSURE

      // Add additional classifications for BSDF reflection/transmission.
      const bsdfType = nodeDef.getAttribute('bsdf')
      if (bsdfType === ShaderNode.BSDF_R) {
        newNode._classification |= C.BSDF_R
      } else if (bsdfType === ShaderNode.BSDF_T) {
        newNode._classification |= C.BSDF_T
      } else {
        newNode._classification |= C.BSDF_R | C.BSDF_T
      }

      // Check specifically for the vertical layering node.
      if (nodeDefName === 'ND_layer_bsdf' || nodeDefName === 'ND_layer_vdf') {
        newNode._classification |= C.LAYER
      }
      // Check specifically for the mix node.
      if (nodeDefName === 'ND_mix_bsdf') {
        newNode._classification |= C.MIX
      }
    } else if (primaryOutput.getType().equals(Type.EDF)) {
      newNode._classification = C.EDF | C.CLOSURE
      if (nodeDefName === 'ND_mix_edf') {
        newNode._classification |= C.MIX
      }
    } else if (primaryOutput.getType().equals(Type.VDF)) {
      newNode._classification = C.VDF | C.CLOSURE
      if (nodeDefName === 'ND_mix_vdf') {
        newNode._classification |= C.MIX
      }
    }
    // Second, check for specific node types.
    else if (nodeDef.getNodeString() === ShaderNode.CONSTANT) {
      newNode._classification = C.TEXTURE | C.CONSTANT
    } else if (nodeDef.getNodeString() === ShaderNode.DOT) {
      newNode._classification = C.TEXTURE | C.DOT
    }
    // Third, check for file texture classification by group name.
    else if (groupName === ShaderNode.TEXTURE2D_GROUPNAME || groupName === ShaderNode.TEXTURE3D_GROUPNAME) {
      newNode._classification = C.TEXTURE | C.FILETEXTURE
    }

    // Add in classification based on group name.
    if (groupName === ShaderNode.TEXTURE2D_GROUPNAME || groupName === ShaderNode.PROCEDURAL2D_GROUPNAME) {
      newNode._classification |= C.SAMPLE2D
    } else if (groupName === ShaderNode.TEXTURE3D_GROUPNAME || groupName === ShaderNode.PROCEDURAL3D_GROUPNAME) {
      newNode._classification |= C.SAMPLE3D
    } else if (groupName === ShaderNode.GEOMETRIC_GROUPNAME) {
      newNode._classification |= C.GEOMETRIC
    }

    // Create any metadata.
    newNode.createMetadata(nodeDef, context)

    return newNode
  }

  // Create a new node from a node implementation.
  static createFromImpl(
    parent: ShaderGraph | null,
    name: string,
    impl: ShaderNodeImpl,
    classification: number = ShaderNodeClassification.TEXTURE,
  ): ShaderNode {
    const newNode = new ShaderNode(parent, name)
    newNode._impl = impl
    newNode._classification = classification
    return newNode
  }

  // Return true if this node is a graph.
  isAGraph(): boolean {
    return false
  }

  // Return the parent graph that owns this node, or null for a root graph.
  getParent(): ShaderGraph | null {
    return this._parent
  }

  setClassification(c: number): void {
    this._classification = c
  }

  getClassification(): number {
    return this._classification
  }

  addClassification(c: number): void {
    this._classification |= c
  }

  // Return true if this node matches the given classification.
  hasClassification(c: number): boolean {
    return (this._classification & c) === c
  }

  getName(): string {
    return this._name
  }

  // Return the unique identifier for this node, used as its key in the
  // parent graph's node map.
  getUniqueId(): string {
    return this._uniqueId
  }

  // Internal: assign the unique id (used by ShaderGraph).
  _setUniqueId(id: string): void {
    this._uniqueId = id
  }

  // Return the implementation used for this node.
  getImplementation(): ShaderNodeImpl {
    return this._impl!
  }

  // Initialize this shader node with all required data from the given node
  // and nodedef.
  initialize(node: Node, nodeDef: NodeDef, context: GenContext): void {
    // Copy input values from the given node.
    for (const nodeInput of node.getActiveInputs()) {
      const input = this.getInput(nodeInput.getName())
      const nodeDefInput = nodeDef.getActiveValueElement(nodeInput.getName())
      if (input && nodeDefInput) {
        let portValue = nodeInput.getResolvedValue()
        if (!portValue) {
          const interfaceInput = nodeInput.getInterfaceInput()
          if (interfaceInput) {
            portValue = interfaceInput.getResolvedValue()
          }
        }
        const valueString = portValue ? portValue.getValueString() : EMPTY_STRING
        if (valueString !== '') {
          const enumNames = nodeDefInput.getAttribute('enum')
          const type = context.getTypeDesc(nodeDefInput.getType())
          const enumResult = context.getShaderGenerator().getSyntax().remapEnumeration(valueString, type, enumNames)
          if (enumResult) {
            input.setValue(enumResult[1])
          } else {
            input.setValue(portValue)
          }
        }
      }
    }

    // Set implementation specific values.
    if (this._impl) {
      this._impl.setValues(node, this, context)
    }

    // Set element paths for children on the node.
    for (const nodeValue of node.getActiveValueElements()) {
      const input = this.getInput(nodeValue.getName())
      if (input) {
        let path = nodeValue.getNamePath()
        const nodeInput = nodeValue.asA(Input)
        if (nodeInput) {
          const interfaceInput = nodeInput.getInterfaceInput()
          if (interfaceInput) {
            path = interfaceInput.getNamePath()
          }
        }
        input.setPath(path)
      }
    }

    // Set element paths based on the node definition. Note that these paths
    // don't exist at generation time since there are no inputs specified on
    // the node itself.
    const nodePath = node.getNamePath()
    for (const nodeInput of nodeDef.getActiveInputs()) {
      const input = this.getInput(nodeInput.getName())
      if (input && input.getPath() === '') {
        input.setPath(nodePath + NAME_PATH_SEPARATOR + nodeInput.getName())
      }
    }
  }

  // Create metadata from the nodedef according to registered metadata.
  protected createMetadata(nodeDef: NodeDef, context: GenContext): void {
    const registry = context.getUserData(ShaderMetadataRegistry.USER_DATA_NAME) as ShaderMetadataRegistry | null
    if (!(registry && registry.getAllMetadata().length > 0)) {
      return
    }

    // Set metadata on the node according to the nodedef attributes.
    let nodeMetadataStorage = this.getMetadata()
    for (const nodedefAttr of nodeDef.getAttributeNames()) {
      const metadataEntry = registry.findMetadata(nodedefAttr)
      if (metadataEntry) {
        const attrValue = nodeDef.getAttribute(nodedefAttr)
        if (attrValue !== '') {
          let value = metadataEntry.type.createValueFromStrings(attrValue)
          if (!value) {
            value = metadataEntry.value
          }
          if (value) {
            if (!nodeMetadataStorage) {
              nodeMetadataStorage = []
              this.setMetadata(nodeMetadataStorage)
            }
            nodeMetadataStorage.push(new ShaderMetadata(metadataEntry.name, metadataEntry.type, value))
          }
        }
      }
    }

    // Set metadata on inputs according to attributes on the nodedef inputs.
    for (const nodedefPort of nodeDef.getActiveValueElements()) {
      const input = this.getInput(nodedefPort.getName())
      if (input) {
        let inputMetadataStorage = input.getMetadata()

        for (const nodedefPortAttr of nodedefPort.getAttributeNames()) {
          const metadataEntry = registry.findMetadata(nodedefPortAttr)
          if (metadataEntry) {
            const attrValue = nodedefPort.getAttribute(nodedefPortAttr)
            if (attrValue !== '') {
              const type = metadataEntry.type.notEquals(Type.NONE) ? metadataEntry.type : input.getType()
              let value = type.createValueFromStrings(attrValue)
              if (!value) {
                value = metadataEntry.value
              }
              if (value) {
                if (!inputMetadataStorage) {
                  inputMetadataStorage = []
                  input.setMetadata(inputMetadataStorage)
                }
                inputMetadataStorage.push(new ShaderMetadata(metadataEntry.name, type, value))
              }
            }
          }
        }
      }
    }
  }

  // Add an input to this node.
  addInput(name: string, type: TypeDesc): ShaderInput {
    if (this.getInput(name)) {
      throw new ExceptionShaderGenError(`An input named '${name}' already exists on node '${this._name}'`)
    }
    const input = new ShaderInput(this, type, name)
    this._inputMap.set(name, input)
    this._inputOrder.push(input)
    return input
  }

  // Add an output to this node.
  addOutput(name: string, type: TypeDesc): ShaderOutput {
    if (this.getOutput(name)) {
      throw new ExceptionShaderGenError(`An output named '${name}' already exists on node '${this._name}'`)
    }
    const output = new ShaderOutput(this, type, name)
    this._outputMap.set(name, output)
    this._outputOrder.push(output)
    return output
  }

  numInputs(): number {
    return this._inputOrder.length
  }

  numOutputs(): number {
    return this._outputOrder.length
  }

  // Get an input by index or name.
  getInput(key: number | string = 0): ShaderInput | null {
    if (typeof key === 'number') {
      return this._inputOrder[key] ?? null
    }
    return this._inputMap.get(key) ?? null
  }

  // Get an output by index or name.
  getOutput(key: number | string = 0): ShaderOutput | null {
    if (typeof key === 'number') {
      return this._outputOrder[key] ?? null
    }
    return this._outputMap.get(key) ?? null
  }

  getInputs(): ShaderInput[] {
    return this._inputOrder
  }

  getOutputs(): ShaderOutput[] {
    return this._outputOrder
  }

  setMetadata(metadata: ShaderMetadata[] | null): void {
    this._metadata = metadata
  }

  getMetadata(): ShaderMetadata[] | null {
    return this._metadata
  }

  // Returns true if an input is editable by users. Editable inputs are
  // allowed to be published as shader uniforms.
  isEditable(input: ShaderInput | ShaderOutput): boolean {
    return !this._impl || this._impl.isEditable(input)
  }
}
