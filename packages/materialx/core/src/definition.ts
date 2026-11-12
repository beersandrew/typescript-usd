// Ported from MaterialX 1.39.5: source/MaterialXCore/Definition.h,
//  source/MaterialXCore/Definition.cpp
// Copyright Contributors to the MaterialX Project. Apache License 2.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Mirrors source/MaterialXCore/Definition.h and Definition.cpp

import { Exception } from './exceptions.ts'
import {
  Element,
  TypedElement,
  ValueElement,
  registerElementClass,
  targetStringsMatch,
} from './element.ts'
import { InterfaceElement } from './interface.ts'
import { DEFAULT_TYPE_STRING, MULTI_OUTPUT_TYPE_STRING } from './types.ts'
import { EMPTY_STRING, type StringMap } from './util.ts'
import { Value } from './value.ts'
import type { NodeGraph } from './node.ts'

export const COLOR_SEMANTIC = 'color'
export const SHADER_SEMANTIC = 'shader'

// The shape of the Document methods used from this module.
interface DocumentDefinitionShape {
  getMatchingImplementations(nodeDef: string): InterfaceElement[]
  getNodeGraph(name: string): NodeGraph | null
  getTargetDef(name: string): TargetDef | null
  getTypeDef(name: string): TypeDef | null
  getChildrenOfType<T extends Element>(cls: abstract new (...args: never[]) => T): T[]
}

// A node definition element within a Document.
//
// A NodeDef provides the declaration of a node interface, which may then be
// instantiated as a Node.
export class NodeDef extends InterfaceElement {
  static readonly CATEGORY = 'nodedef'
  static readonly NODE_ATTRIBUTE = 'node'
  static readonly NODE_GROUP_ATTRIBUTE = 'nodegroup'

  static readonly TEXTURE_NODE_GROUP = 'texture'
  static readonly PROCEDURAL_NODE_GROUP = 'procedural'
  static readonly GEOMETRIC_NODE_GROUP = 'geometric'
  static readonly ADJUSTMENT_NODE_GROUP = 'adjustment'
  static readonly CONDITIONAL_NODE_GROUP = 'conditional'
  static readonly CHANNEL_NODE_GROUP = 'channel'
  static readonly ORGANIZATION_NODE_GROUP = 'organization'
  static readonly TRANSLATION_NODE_GROUP = 'translation'

  constructor(parent: Element | null, name: string) {
    super(parent, NodeDef.CATEGORY, name)
  }

  // --- Node String ---

  setNodeString(node: string): void {
    this.setAttribute(NodeDef.NODE_ATTRIBUTE, node)
  }

  hasNodeString(): boolean {
    return this.hasAttribute(NodeDef.NODE_ATTRIBUTE)
  }

  getNodeString(): string {
    return this.getAttribute(NodeDef.NODE_ATTRIBUTE)
  }

  // Return the element's output type.
  override getType(): string {
    const activeOutputs = this.getActiveOutputs()
    if (activeOutputs.length > 1) {
      return MULTI_OUTPUT_TYPE_STRING
    } else if (activeOutputs.length === 1) {
      return activeOutputs[0]!.getType()
    }
    return DEFAULT_TYPE_STRING
  }

  // --- Node Group ---

  setNodeGroup(category: string): void {
    this.setAttribute(NodeDef.NODE_GROUP_ATTRIBUTE, category)
  }

  hasNodeGroup(): boolean {
    return this.hasAttribute(NodeDef.NODE_GROUP_ATTRIBUTE)
  }

  getNodeGroup(): string {
    return this.getAttribute(NodeDef.NODE_GROUP_ATTRIBUTE)
  }

  // --- Implementation References ---

  // Return the first implementation for this nodedef, optionally filtered
  // by the given target name, resolving any indirection chain in the
  // implementations. A node implementation may be either an Implementation
  // element or a NodeGraph element.
  getImplementation(target = EMPTY_STRING, resolveNodeGraph = true): InterfaceElement | null {
    const doc = this.getDocument() as unknown as DocumentDefinitionShape
    const interfaces = doc.getMatchingImplementations(this.getQualifiedName(this.getName()))
    interfaces.push(...doc.getMatchingImplementations(this.getName()))

    // If requested, resolve Implementation elements to their linked
    // NodeGraph elements.
    if (resolveNodeGraph) {
      for (let i = 0; i < interfaces.length; i++) {
        const impl = interfaces[i]!.asA(Implementation)
        if (impl && impl.hasNodeGraph()) {
          const nodeGraph = doc.getNodeGraph(impl.getNodeGraph())
          if (nodeGraph) {
            interfaces[i] = nodeGraph as unknown as InterfaceElement
          }
        }
      }
    }

    // Return the first implementation when no target is specified.
    if (target === '') {
      return interfaces.length > 0 ? interfaces[0]! : null
    }

    // Get all candidate targets matching the given target, taking
    // inheritance into account.
    const targetDef = doc.getTargetDef(target)
    const candidateTargets = targetDef ? targetDef.getMatchingTargets() : []

    // First, search for a target-specific match.
    for (const candidateTarget of candidateTargets) {
      for (const iface of interfaces) {
        const interfaceTarget = iface.getTarget()
        if (interfaceTarget !== '' && targetStringsMatch(interfaceTarget, candidateTarget)) {
          return iface
        }
      }
    }

    // Then search for a generic match.
    for (const iface of interfaces) {
      if (iface.getTarget() === '') {
        return iface
      }
    }

    return null
  }

  // --- Hints ---

  // Return a map of input hint pairs of the form { input_name: hint_string }.
  getInputHints(): StringMap {
    const hints: StringMap = new Map()
    for (const input of this.getActiveInputs()) {
      if (input.hasHint()) {
        hints.set(input.getName(), input.getHint())
      }
    }
    return hints
  }

  // --- Validation ---

  override validate(message?: string[]): boolean {
    let res = true
    res = this.validateRequire(!this.hasType(), res, message, 'Nodedef should not have a type but an explicit output')
    return super.validate(message) && res
  }

  // --- Utility ---

  // Return true if the given version string is compatible with this
  // NodeDef. This may be used to test, for example, whether a NodeDef and
  // Node may be used together.
  isVersionCompatible(version: string): boolean {
    if (this.getVersionString() === version) {
      return true
    }
    if (this.getDefaultVersion() && version === '') {
      return true
    }
    return false
  }

  override getDeclaration(_target = EMPTY_STRING): InterfaceElement | null {
    return this
  }
}

// An implementation element within a Document.
//
// An Implementation is used to associate external source code with a
// specific NodeDef, providing a definition for the node that may either be
// universal or restricted to a specific target.
export class Implementation extends InterfaceElement {
  static readonly CATEGORY = 'implementation'
  static readonly FILE_ATTRIBUTE = 'file'
  static readonly FUNCTION_ATTRIBUTE = 'function'
  static readonly NODE_GRAPH_ATTRIBUTE = 'nodegraph'

  constructor(parent: Element | null, name: string) {
    super(parent, Implementation.CATEGORY, name)
  }

  // --- File String ---

  setFile(file: string): void {
    this.setAttribute(Implementation.FILE_ATTRIBUTE, file)
  }

  hasFile(): boolean {
    return this.hasAttribute(Implementation.FILE_ATTRIBUTE)
  }

  getFile(): string {
    return this.getAttribute(Implementation.FILE_ATTRIBUTE)
  }

  // --- Function String ---

  setFunction(func: string): void {
    this.setAttribute(Implementation.FUNCTION_ATTRIBUTE, func)
  }

  hasFunction(): boolean {
    return this.hasAttribute(Implementation.FUNCTION_ATTRIBUTE)
  }

  getFunction(): string {
    return this.getAttribute(Implementation.FUNCTION_ATTRIBUTE)
  }

  // --- Nodegraph String ---

  setNodeGraph(nodegraph: string): void {
    this.setAttribute(Implementation.NODE_GRAPH_ATTRIBUTE, nodegraph)
  }

  hasNodeGraph(): boolean {
    return this.hasAttribute(Implementation.NODE_GRAPH_ATTRIBUTE)
  }

  getNodeGraph(): string {
    return this.getAttribute(Implementation.NODE_GRAPH_ATTRIBUTE)
  }

  // --- NodeDef References ---

  // Set the NodeDef element referenced by the Implementation.
  setNodeDef(nodeDef: NodeDef | null): void {
    if (nodeDef) {
      this.setNodeDefString(nodeDef.getName())
    } else {
      this.removeAttribute(InterfaceElement.NODE_DEF_ATTRIBUTE)
    }
  }

  // Return the NodeDef element referenced by the Implementation.
  getNodeDef(): NodeDef | null {
    return this.resolveNameReference(NodeDef, this.getNodeDefString())
  }

  // --- Validation ---

  override validate(message?: string[]): boolean {
    let res = true
    res = this.validateRequire(
      !this.hasVersionString(),
      res,
      message,
      'Implementation elements do not support version strings',
    )
    return super.validate(message) && res
  }

  override getDeclaration(_target = EMPTY_STRING): InterfaceElement | null {
    return this.getNodeDef()
  }
}

// A type definition element within a Document.
export class TypeDef extends Element {
  static readonly CATEGORY = 'typedef'
  static readonly SEMANTIC_ATTRIBUTE = 'semantic'
  static readonly CONTEXT_ATTRIBUTE = 'context'

  constructor(parent: Element | null, name: string) {
    super(parent, TypeDef.CATEGORY, name)
  }

  // --- Semantic ---

  setSemantic(semantic: string): void {
    this.setAttribute(TypeDef.SEMANTIC_ATTRIBUTE, semantic)
  }

  hasSemantic(): boolean {
    return this.hasAttribute(TypeDef.SEMANTIC_ATTRIBUTE)
  }

  getSemantic(): string {
    return this.getAttribute(TypeDef.SEMANTIC_ATTRIBUTE)
  }

  // --- Context ---

  setContext(context: string): void {
    this.setAttribute(TypeDef.CONTEXT_ATTRIBUTE, context)
  }

  hasContext(): boolean {
    return this.hasAttribute(TypeDef.CONTEXT_ATTRIBUTE)
  }

  getContext(): string {
    return this.getAttribute(TypeDef.CONTEXT_ATTRIBUTE)
  }

  // --- Member Elements ---

  // Add a Member to the TypeDef.
  addMember(name = EMPTY_STRING): Member {
    return this.addChild(Member, name)
  }

  // Return the Member, if any, with the given name.
  getMember(name: string): Member | null {
    return this.getChildOfType(Member, name)
  }

  // Return a vector of all Member elements in the TypeDef.
  getMembers(): Member[] {
    return this.getChildrenOfType(Member)
  }

  // Remove the Member, if any, with the given name.
  removeMember(name: string): void {
    this.removeChildOfType(Member, name)
  }
}

// A definition of an implementation target.
export class TargetDef extends TypedElement {
  static readonly CATEGORY = 'targetdef'

  constructor(parent: Element | null, name: string) {
    super(parent, TargetDef.CATEGORY, name)
  }

  // Return a vector of target names that match this targetdef either by
  // itself or by its inheritance, ordered by priority starting with this
  // targetdef itself.
  getMatchingTargets(): string[] {
    const result = [this.getName()]
    let base = this.getInheritsFrom()
    while (base) {
      result.push(base.getName())
      base = base.getInheritsFrom()
    }
    return result
  }
}

// A member element within a TypeDef.
export class Member extends ValueElement {
  static readonly CATEGORY = 'member'

  constructor(parent: Element | null, name: string) {
    super(parent, Member.CATEGORY, name)
  }
}

// A unit declaration within a UnitDef.
export class Unit extends Element {
  static readonly CATEGORY = 'unit'

  constructor(parent: Element | null, name: string) {
    super(parent, Unit.CATEGORY, name)
  }
}

// A unit definition element within a Document.
export class UnitDef extends Element {
  static readonly CATEGORY = 'unitdef'
  static readonly UNITTYPE_ATTRIBUTE = 'unittype'

  constructor(parent: Element | null, name: string) {
    super(parent, UnitDef.CATEGORY, name)
  }

  // --- Unit Type methods ---

  setUnitType(type: string): void {
    this.setAttribute(UnitDef.UNITTYPE_ATTRIBUTE, type)
  }

  hasUnitType(): boolean {
    return this.hasAttribute(UnitDef.UNITTYPE_ATTRIBUTE)
  }

  getUnitType(): string {
    return this.getAttribute(UnitDef.UNITTYPE_ATTRIBUTE)
  }

  // --- Unit methods ---

  // Add a Unit to the UnitDef; throws if the name is empty.
  addUnit(name: string): Unit {
    if (name === '') {
      throw new Exception('A unit definition name cannot be empty')
    }
    return this.addChild(Unit, name)
  }

  // Return the Unit, if any, with the given name.
  getUnit(name: string): Unit | null {
    return this.getChildOfType(Unit, name)
  }

  // Return a vector of all Unit elements in the UnitDef.
  getUnits(): Unit[] {
    return this.getChildrenOfType(Unit)
  }

  // Remove the Unit, if any, with the given name.
  removeUnit(name: string): void {
    this.removeChildOfType(Unit, name)
  }
}

// A unit type definition element within a Document.
export class UnitTypeDef extends Element {
  static readonly CATEGORY = 'unittypedef'

  constructor(parent: Element | null, name: string) {
    super(parent, UnitTypeDef.CATEGORY, name)
  }

  // Find all UnitDefs for the UnitTypeDef.
  getUnitDefs(): UnitDef[] {
    const unitDefs: UnitDef[] = []
    for (const unitDef of this.getDocument().getChildrenOfType(UnitDef)) {
      if (unitDef.getUnitType() === this.getName()) {
        unitDefs.push(unitDef)
      }
    }
    return unitDefs
  }
}

// An attribute definition element within a Document.
export class AttributeDef extends TypedElement {
  static readonly CATEGORY = 'attributedef'
  static readonly ATTRNAME_ATTRIBUTE = 'attrname'
  static readonly VALUE_ATTRIBUTE = 'value'
  static readonly ELEMENTS_ATTRIBUTE = 'elements'
  static readonly EXPORTABLE_ATTRIBUTE = 'exportable'

  constructor(parent: Element | null, name: string) {
    super(parent, AttributeDef.CATEGORY, name)
  }

  // --- Attribute name ---

  setAttrName(name: string): void {
    this.setAttribute(AttributeDef.ATTRNAME_ATTRIBUTE, name)
  }

  hasAttrName(): boolean {
    return this.hasAttribute(AttributeDef.ATTRNAME_ATTRIBUTE)
  }

  getAttrName(): string {
    return this.getAttribute(AttributeDef.ATTRNAME_ATTRIBUTE)
  }

  // --- Value String ---

  setValueString(value: string): void {
    this.setAttribute(AttributeDef.VALUE_ATTRIBUTE, value)
  }

  hasValueString(): boolean {
    return this.hasAttribute(AttributeDef.VALUE_ATTRIBUTE)
  }

  getValueString(): string {
    return this.getAttribute(AttributeDef.VALUE_ATTRIBUTE)
  }

  // --- Typed Value ---

  // Set the typed value of the element.
  setValue(value: import('./value.ts').ValueData, type = EMPTY_STRING): void {
    const v = Value.createValue(value, type !== '' ? type : undefined)
    this.setType(v.getTypeString())
    this.setValueString(v.getValueString())
  }

  // Return true if the element possesses a typed value.
  hasValue(): boolean {
    return this.hasAttribute(AttributeDef.VALUE_ATTRIBUTE)
  }

  // Return the typed value of the element as a generic value object, or
  // null if no value is present.
  getValue(): Value | null {
    if (!this.hasValue()) return null
    return Value.createValueFromStrings(this.getValueString(), this.getType(), this.getDocument().getTypeDef(this.getType()))
  }

  // --- Elements ---

  setElements(elements: string): void {
    this.setAttribute(AttributeDef.ELEMENTS_ATTRIBUTE, elements)
  }

  hasElements(): boolean {
    return this.hasAttribute(AttributeDef.ELEMENTS_ATTRIBUTE)
  }

  getElements(): string {
    return this.getAttribute(AttributeDef.ELEMENTS_ATTRIBUTE)
  }

  // --- Exportable ---

  setExportable(value: boolean): void {
    this.setTypedAttribute(AttributeDef.EXPORTABLE_ATTRIBUTE, value)
  }

  // Return the exportable boolean for the element, defaulting to false.
  getExportable(): boolean {
    return this.getTypedAttribute(AttributeDef.EXPORTABLE_ATTRIBUTE, 'boolean') === true
  }
}

registerElementClass(NodeDef)
registerElementClass(Implementation)
registerElementClass(TypeDef)
registerElementClass(TargetDef)
registerElementClass(Member)
registerElementClass(Unit)
registerElementClass(UnitDef)
registerElementClass(UnitTypeDef)
registerElementClass(AttributeDef)
