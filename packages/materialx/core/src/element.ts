// Ported from MaterialX 1.39.5: source/MaterialXCore/Element.h,
//  source/MaterialXCore/Element.cpp
// Copyright Contributors to the MaterialX Project. Apache License 2.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Mirrors source/MaterialXCore/Element.h and Element.cpp
//
// Cross-module structure: later modules (node, document, definition, geom)
// subclass Element, so this module never imports them at runtime. Dynamic
// behavior that C++ implements with dynamic_cast is expressed through
// virtual predicates (isGraphElement, isInterfaceElement, isNode), virtual
// methods overridden by Document (getChild and friends), a category-keyed
// class registry that each module populates on load, and a small hook table
// (_internals) for free functions from later modules.

import { Exception } from './exceptions.ts'
import { ExceptionFoundCycle, Edge, TreeIterator, GraphIterator, InheritanceIterator } from './traversal.ts'
import {
  EMPTY_STRING,
  NAME_PATH_SEPARATOR,
  NAME_PREFIX_SEPARATOR,
  ARRAY_VALID_SEPARATORS,
  createValidName,
  isValidName,
  incrementName,
  splitString,
  replaceSubstrings,
  type StringMap,
} from './util.ts'
import { FILENAME_TYPE_STRING, GEOMNAME_TYPE_STRING } from './types.ts'
import {
  Value,
  FloatFormat,
  ScopedFloatFormatting,
  toValueString,
  fromValueString,
  type ValueData,
  type TypeDefLike,
} from './value.ts'

// Mirrors UDIM_TOKEN / UV_TILE_TOKEN from Geom.h (re-exported by the geom module).
export const UDIM_TOKEN = '<UDIM>'
export const UV_TILE_TOKEN = '<UVTILE>'

// An exception that is thrown when an Element is used after being removed
// from its Document.
export class ExceptionOrphanedElement extends Exception {}

// A constructor for a concrete element subclass.
export type ElementConstructor<T extends Element = Element> = (new (
  parent: Element | null,
  name: string,
) => T) & { CATEGORY: string }

// An abstract constructor, usable for subclass tests with Element.asA().
export type ElementClass<T extends Element> = abstract new (...args: never[]) => T

// Category-keyed registry of concrete element classes, populated by each
// module as it loads (mirrors the C++ ElementRegistry instantiations).
const elementClassRegistry = new Map<string, ElementConstructor>()

export function registerElementClass(ctor: ElementConstructor): void {
  elementClassRegistry.set(ctor.CATEGORY, ctor)
}

export function getRegisteredElementClass(category: string): ElementConstructor | undefined {
  return elementClassRegistry.get(category)
}

// Hooks filled in by later modules (see module comment).
export const _internals: {
  // geomStringsMatch from the geom module.
  geomStringsMatch?: (geom1: string, geom2: string, contains?: boolean) => boolean
  // The Node class, for instantiating unrecognized categories inside graphs.
  nodeConstructor?: ElementConstructor
} = {}

// The subset of the Document interface used from this module; the Document
// class satisfies it structurally. (Replaced by the real Document type once
// the document module lands.)
export interface DocumentShape extends Element {
  invalidateCache(): void
  getTypeDef(name: string): TypeDefLike | null
}

// A standard function taking an Element and returning a boolean.
export type ElementPredicate = (elem: Element) => boolean

// A set of options for comparing the functional equivalence of elements.
export class ElementEquivalenceOptions {
  // Perform value comparisons as opposed to literal string comparisons.
  performValueComparisons = true
  // Floating point format to use for floating point value comparisons.
  floatFormat: FloatFormat = Value.getFloatFormat()
  // Floating point precision to use for floating point value comparisons.
  floatPrecision: number = Value.getFloatPrecision()
  // The set of attributes that should be excluded when performing a
  // comparison. Name and category attributes cannot be excluded.
  attributeExclusionList = new Set<string>()
}

// The base class for MaterialX elements.
//
// An Element is a named object within a Document, which may possess any
// number of child elements and attributes.
export class Element {
  static readonly NAME_ATTRIBUTE = 'name'
  static readonly FILE_PREFIX_ATTRIBUTE = 'fileprefix'
  static readonly GEOM_PREFIX_ATTRIBUTE = 'geomprefix'
  static readonly COLOR_SPACE_ATTRIBUTE = 'colorspace'
  static readonly INHERIT_ATTRIBUTE = 'inherit'
  static readonly NAMESPACE_ATTRIBUTE = 'namespace'
  static readonly DOC_ATTRIBUTE = 'doc'
  static readonly XPOS_ATTRIBUTE = 'xpos'
  static readonly YPOS_ATTRIBUTE = 'ypos'

  protected _category: string
  protected _name: string
  protected _sourceUri = ''

  protected _childMap = new Map<string, Element>()
  protected _childOrder: Element[] = []

  protected _attributeMap = new Map<string, string>()
  protected _attributeOrder: string[] = []

  protected _parent: Element | null
  protected _root: Element | null

  constructor(parent: Element | null, category: string, name: string) {
    this._category = category
    this._name = name
    this._parent = parent
    this._root = parent ? parent.getRoot() : null
  }

  // Return true if the given element tree, including all descendants, is
  // identical to this one.
  equals(rhs: Element): boolean {
    if (this.getCategory() !== rhs.getCategory() || this.getName() !== rhs.getName()) {
      return false
    }

    // Compare attributes.
    const names = this.getAttributeNames()
    const rhsNames = rhs.getAttributeNames()
    if (names.length !== rhsNames.length || names.some((n, i) => n !== rhsNames[i])) {
      return false
    }
    for (const attr of rhsNames) {
      if (this.getAttribute(attr) !== rhs.getAttribute(attr)) return false
    }

    // Compare children.
    const c1 = this.getChildren()
    const c2 = rhs.getChildren()
    if (c1.length !== c2.length) return false
    for (let i = 0; i < c1.length; i++) {
      if (!c1[i]!.equals(c2[i]!)) return false
    }
    return true
  }

  // --- Category ---

  // Set the element's category string.
  setCategory(category: string): void {
    this._category = category
  }

  // Return the element's category string.
  getCategory(): string {
    return this._category
  }

  // --- Name ---

  // Set the element's name string, which must be unique among all elements
  // at the same scope.
  setName(name: string): void {
    const parent = this.getParent()
    if (parent && parent._childMap.has(name) && name !== this.getName()) {
      throw new Exception('Element name is not unique at the given scope: ' + name)
    }

    this.getDocument().invalidateCache()

    if (parent) {
      parent._childMap.delete(this.getName())
      parent._childMap.set(name, this)
    }
    this._name = name
  }

  // Return the element's name string.
  getName(): string {
    return this._name
  }

  // Return the element's hierarchical name path, relative to the root
  // document (or the given ancestor).
  getNamePath(relativeTo?: Element | null): string {
    if (!relativeTo) {
      relativeTo = this.getDocument()
    }

    let res = ''
    for (let elem: Element | null = this; elem; elem = elem.getParent()) {
      if (elem === relativeTo) break
      res = res === '' ? elem.getName() : elem.getName() + NAME_PATH_SEPARATOR + res
    }
    return res
  }

  // Return the element specified by the given hierarchical name path,
  // relative to the current element.
  getDescendant(namePath: string): Element | null {
    const nameVec = splitString(namePath, NAME_PATH_SEPARATOR)
    let elem: Element | null = this
    for (const name of nameVec) {
      elem = elem.getChild(name)
      if (!elem) return null
    }
    return elem
  }

  // --- File Prefix ---

  setFilePrefix(prefix: string): void {
    this.setAttribute(Element.FILE_PREFIX_ATTRIBUTE, prefix)
  }

  hasFilePrefix(): boolean {
    return this.hasAttribute(Element.FILE_PREFIX_ATTRIBUTE)
  }

  getFilePrefix(): string {
    return this.getAttribute(Element.FILE_PREFIX_ATTRIBUTE)
  }

  // Return the file prefix string that is active at the scope of this
  // element, taking all ancestor elements into account.
  getActiveFilePrefix(): string {
    for (let elem: Element | null = this; elem; elem = elem.getParent()) {
      if (elem.hasFilePrefix()) return elem.getFilePrefix()
    }
    return EMPTY_STRING
  }

  // --- Geom Prefix ---

  setGeomPrefix(prefix: string): void {
    this.setAttribute(Element.GEOM_PREFIX_ATTRIBUTE, prefix)
  }

  hasGeomPrefix(): boolean {
    return this.hasAttribute(Element.GEOM_PREFIX_ATTRIBUTE)
  }

  getGeomPrefix(): string {
    return this.getAttribute(Element.GEOM_PREFIX_ATTRIBUTE)
  }

  getActiveGeomPrefix(): string {
    for (let elem: Element | null = this; elem; elem = elem.getParent()) {
      if (elem.hasGeomPrefix()) return elem.getGeomPrefix()
    }
    return EMPTY_STRING
  }

  // --- Color Space ---

  setColorSpace(colorSpace: string): void {
    this.setAttribute(Element.COLOR_SPACE_ATTRIBUTE, colorSpace)
  }

  hasColorSpace(): boolean {
    return this.hasAttribute(Element.COLOR_SPACE_ATTRIBUTE)
  }

  getColorSpace(): string {
    return this.getAttribute(Element.COLOR_SPACE_ATTRIBUTE)
  }

  getActiveColorSpace(): string {
    for (let elem: Element | null = this; elem; elem = elem.getParent()) {
      if (elem.hasColorSpace()) return elem.getColorSpace()
    }
    return EMPTY_STRING
  }

  // --- Inheritance ---

  setInheritString(inherit: string): void {
    this.setAttribute(Element.INHERIT_ATTRIBUTE, inherit)
  }

  hasInheritString(): boolean {
    return this.hasAttribute(Element.INHERIT_ATTRIBUTE)
  }

  getInheritString(): string {
    return this.getAttribute(Element.INHERIT_ATTRIBUTE)
  }

  // Set the element that this one directly inherits from.
  setInheritsFrom(superElem: Element | null): void {
    if (superElem) {
      this.setInheritString(superElem.getName())
    } else {
      this.removeAttribute(Element.INHERIT_ATTRIBUTE)
    }
  }

  // Return the element, if any, that this one directly inherits from.
  getInheritsFrom(): Element | null {
    return this.hasInheritString() ? this.resolveNameReference(Element, this.getInheritString()) : null
  }

  // Return true if this element has the given element as an inherited base,
  // taking the full inheritance chain into account.
  hasInheritedBase(base: Element): boolean {
    for (const elem of this.traverseInheritance()) {
      if (elem === base) return true
    }
    return false
  }

  // Return true if the inheritance chain for this element contains a cycle.
  hasInheritanceCycle(): boolean {
    try {
      for (const _elem of this.traverseInheritance()) {
        // Iterate the full chain looking for a cycle.
      }
    } catch (err) {
      if (err instanceof ExceptionFoundCycle) return true
      throw err
    }
    return false
  }

  // --- Namespace ---

  setNamespace(space: string): void {
    this.setAttribute(Element.NAMESPACE_ATTRIBUTE, space)
  }

  hasNamespace(): boolean {
    return this.hasAttribute(Element.NAMESPACE_ATTRIBUTE)
  }

  getNamespace(): string {
    return this.getAttribute(Element.NAMESPACE_ATTRIBUTE)
  }

  // Return a qualified version of the given name, taking the namespace at
  // the scope of this element into account.
  getQualifiedName(name: string): string {
    for (let elem: Element | null = this; elem; elem = elem.getParent()) {
      const namespaceStr = elem.getNamespace()
      if (namespaceStr !== '') {
        // Check if the name is qualified already.
        const i = name.indexOf(NAME_PREFIX_SEPARATOR)
        if (i !== -1 && name.slice(0, i) === namespaceStr) {
          return name
        }
        return namespaceStr + NAME_PREFIX_SEPARATOR + name
      }
    }
    return name
  }

  // --- Documentation String ---

  setDocString(doc: string): void {
    this.setAttribute(Element.DOC_ATTRIBUTE, doc)
  }

  getDocString(): string {
    return this.getAttribute(Element.DOC_ATTRIBUTE)
  }

  // --- Subclass ---

  // Return this element as an instance of the given subclass, or null if
  // it does not belong to it (mirrors the C++ asA<T>()).
  asA<T extends Element>(cls: ElementClass<T>): T | null {
    return this instanceof cls ? (this as Element as T) : null
  }

  // Return true if this element belongs to the given subclass, optionally
  // requiring a category match as well.
  isA<T extends Element>(cls: ElementClass<T>, category = EMPTY_STRING): boolean {
    if (!(this instanceof cls)) return false
    if (category !== '' && this.getCategory() !== category) return false
    return true
  }

  // Virtual predicates standing in for C++ dynamic_cast within this module.
  isGraphElement(): boolean {
    return false
  }

  isInterfaceElement(): boolean {
    return false
  }

  isNode(): boolean {
    return false
  }

  // --- Child Elements ---

  // Add a child element of the given subclass and name; a unique name is
  // generated when none is given.
  addChild<T extends Element>(cls: ElementConstructor<T> & (new (parent: Element, name: string) => T), name = EMPTY_STRING): T {
    let childName = name
    if (childName === '') {
      childName = this.createValidChildName(cls.CATEGORY + '1')
    }

    if (this._childMap.has(childName)) {
      throw new Exception('Child name is not unique: ' + childName)
    }

    const child = new cls(this, childName)
    this.registerChildElement(child)

    return child
  }

  // Add a child element of the given category and name. If the category
  // string is recognized, the corresponding Element subclass is generated;
  // otherwise a GenericElement (or a Node, inside graphs) is generated.
  addChildOfCategory(category: string, name = EMPTY_STRING): Element {
    if (name === '') {
      name = this.createValidChildName(category + '1')
    }
    if (this._childMap.has(name)) {
      throw new Exception('Child name is not unique: ' + name)
    }

    let child: Element | null = null

    // Check for this category in the creator map.
    const ctor = elementClassRegistry.get(category)
    if (ctor) {
      child = new ctor(this, name)
    }

    // Check for a node within a graph.
    if (!child && this.isGraphElement() && _internals.nodeConstructor) {
      child = new _internals.nodeConstructor(this, name)
      child.setCategory(category)
    }

    // If no match was found, then create a generic element.
    if (!child) {
      child = new GenericElement(this, name)
      child.setCategory(category)
    }

    this.registerChildElement(child)

    return child
  }

  // Change the category of the given child element, returning a new child
  // element containing the contents of the original.
  changeChildCategory(child: Element, category: string): Element | null {
    const childIndex = this.getChildIndex(child.getName())
    if (childIndex === -1) {
      return null
    }

    this.removeChild(child.getName())
    const newChild = this.addChildOfCategory(category, child.getName())
    this.setChildIndex(child.getName(), childIndex)
    newChild.copyContentFrom(child)
    return newChild
  }

  // Return the child element, if any, with the given name.
  // (Document overrides this to also search its data library.)
  getChild(name: string): Element | null {
    return this._childMap.get(name) ?? null
  }

  // Return the child element, if any, with the given name and subclass.
  // (Document overrides this to also search its data library.)
  getChildOfType<T extends Element>(cls: ElementClass<T>, name: string): T | null {
    const child = this.getChild(name)
    return child ? child.asA(cls) : null
  }

  // Return all child elements that are instances of the given subclass,
  // optionally filtered by category, in the order they were added.
  // (Document overrides this to prepend its data library's children.)
  getChildrenOfType<T extends Element>(cls: ElementClass<T>, category = EMPTY_STRING): T[] {
    const children: T[] = []
    for (const child of this._childOrder) {
      const instance = child.asA(cls)
      if (!instance) continue
      if (category !== '' && child.getCategory() !== category) continue
      children.push(instance)
    }
    return children
  }

  // Return a vector of all child elements in the order they were added.
  getChildren(): Element[] {
    return this._childOrder
  }

  // Set the index of the child with the given name; throws if the index is
  // out of bounds.
  setChildIndex(name: string, index: number): void {
    const child = this.getChild(name)
    if (!child) return
    const it = this._childOrder.indexOf(child)
    if (it === -1) return

    if (index < 0 || index >= this._childOrder.length) {
      throw new Exception('Invalid child index')
    }

    this._childOrder.splice(it, 1)
    this._childOrder.splice(index, 0, child)
  }

  // Return the index of the child with the given name, or -1 if not found.
  getChildIndex(name: string): number {
    const child = this.getChild(name)
    if (!child) return -1
    return this._childOrder.indexOf(child)
  }

  // Remove the child element, if any, with the given name.
  removeChild(name: string): void {
    const child = this._childMap.get(name)
    if (!child) return
    this.unregisterChildElement(child)
  }

  // Remove the child element, if any, with the given name and subclass.
  removeChildOfType<T extends Element>(cls: ElementClass<T>, name: string): void {
    if (this.getChildOfType(cls, name)) this.removeChild(name)
  }

  // --- Attributes ---

  // Set the value string of the given attribute.
  setAttribute(attrib: string, value: string): void {
    this.getDocument().invalidateCache()

    if (!this._attributeMap.has(attrib)) {
      this._attributeOrder.push(attrib)
    }
    this._attributeMap.set(attrib, value)
  }

  // Return true if the given attribute is present.
  hasAttribute(attrib: string): boolean {
    return this._attributeMap.has(attrib)
  }

  // Return the value string of the given attribute, or the empty string if
  // not present.
  getAttribute(attrib: string): string {
    return this._attributeMap.get(attrib) ?? EMPTY_STRING
  }

  // Return a vector of stored attribute names, in the order they were set.
  getAttributeNames(): string[] {
    return this._attributeOrder
  }

  // Set the value of an implicitly typed attribute. The same type must be
  // used in corresponding calls to getTypedAttribute.
  setTypedAttribute(attrib: string, data: ValueData, type?: string): void {
    this.setAttribute(attrib, toValueString(data, type))
  }

  // Return the value of an implicitly typed attribute, or null if the
  // attribute is not present or cannot be converted to the given type.
  getTypedAttribute(attrib: string, type: string): ValueData | null {
    if (this.hasAttribute(attrib)) {
      try {
        return fromValueString(this.getAttribute(attrib), type)
      } catch {
        // Mirrors the C++ behavior of returning the zero value on failure.
      }
    }
    return null
  }

  // Remove the given attribute, if present.
  removeAttribute(attrib: string): void {
    if (this._attributeMap.has(attrib)) {
      this.getDocument().invalidateCache()

      this._attributeMap.delete(attrib)
      const it = this._attributeOrder.indexOf(attrib)
      if (it !== -1) this._attributeOrder.splice(it, 1)
    }
  }

  // --- Self And Ancestor Elements ---

  // Return our parent element.
  getParent(): Element | null {
    return this._parent
  }

  // Return the root element of our tree.
  getRoot(): Element {
    return this._root ?? this
  }

  // Return the root document of our tree.
  getDocument(): DocumentShape {
    const root = this.getRoot()
    if (root.getCategory() !== 'materialx') {
      throw new ExceptionOrphanedElement('Requested document of orphaned element: ' + this.asString())
    }
    return root as DocumentShape
  }

  // Return the first ancestor of the given subclass, or null if no ancestor
  // of this subclass is found.
  getAncestorOfType<T extends Element>(cls: ElementClass<T>): T | null {
    for (let elem: Element | null = this; elem; elem = elem.getParent()) {
      const typedElem = elem.asA(cls)
      if (typedElem) return typedElem
    }
    return null
  }

  // --- Functional Equivalence ---

  // Whether children compare without ordering in isEquivalent (true for
  // compound graphs: Documents, and NodeGraphs without a nodedef).
  protected usesUnorderedChildEquivalence(): boolean {
    return false
  }

  // Return true if the given element tree is considered functionally
  // equivalent to this one based on the given criteria. Differences are
  // appended to the optional message list.
  isEquivalent(rhs: Element, options: ElementEquivalenceOptions = new ElementEquivalenceOptions(), message?: string[]): boolean {
    if (this.getName() !== rhs.getName()) {
      message?.push(`Name of ${this.getNamePath()} differs from ${rhs.getNamePath()}`)
      return false
    }
    if (this.getCategory() !== rhs.getCategory()) {
      message?.push(`Category of ${this.getNamePath()} differs from ${rhs.getNamePath()}`)
      return false
    }

    // Compare attribute names, filtering exclusions and ignoring ordering.
    const exclusions = options.attributeExclusionList
    const attributeNames = this.getAttributeNames()
      .filter((a) => !exclusions.has(a))
      .sort()
    const rhsAttributeNames = rhs
      .getAttributeNames()
      .filter((a) => !exclusions.has(a))
      .sort()

    if (
      attributeNames.length !== rhsAttributeNames.length ||
      attributeNames.some((a, i) => a !== rhsAttributeNames[i])
    ) {
      message?.push(`Attribute names of '${this.getNamePath()}' differ from '${rhs.getNamePath()}'`)
      return false
    }

    for (const attr of rhsAttributeNames) {
      if (!this.isAttributeEquivalent(rhs, attr, options, message)) {
        return false
      }
    }

    // Compare all child elements that affect functional equivalence.
    const children = this.getChildren().filter((c) => c.getCategory() !== CommentElement.CATEGORY)
    const rhsChildren = rhs.getChildren().filter((c) => c.getCategory() !== CommentElement.CATEGORY)
    if (children.length !== rhsChildren.length) {
      message?.push(`Child count of ${this.getNamePath()} differs from ${rhs.getNamePath()}`)
      return false
    }
    for (let i = 0; i < children.length; i++) {
      let rhsElement: Element | null = rhsChildren[i]!
      // Handle unordered children if this is a compound graph.
      if (this.usesUnorderedChildEquivalence()) {
        const childName = children[i]!.getName()
        rhsElement = rhs.getChild(childName)
        if (!rhsElement) {
          message?.push(`Child name \`${childName}\` of ${this.getNamePath()} differs from ${rhs.getNamePath()}`)
          return false
        }
      }
      if (!children[i]!.isEquivalent(rhsElement, options, message)) return false
    }
    return true
  }

  // Return true if the given attribute is equivalent on both elements.
  isAttributeEquivalent(
    rhs: Element,
    attributeName: string,
    _options?: ElementEquivalenceOptions,
    message?: string[],
  ): boolean {
    if (this.getAttribute(attributeName) !== rhs.getAttribute(attributeName)) {
      message?.push(`Attribute name \`${attributeName}\` of ${this.getNamePath()} differs from ${rhs.getNamePath()}`)
      return false
    }
    return true
  }

  // --- Traversal ---

  // Traverse the tree from this element to each of its descendants in
  // depth-first order, using pre-order visitation.
  traverseTree(): TreeIterator {
    return new TreeIterator(this)
  }

  // Traverse the dataflow graph from this element to each of its upstream
  // sources in depth-first order. Throws ExceptionFoundCycle on cycles.
  traverseGraph(): GraphIterator {
    return new GraphIterator(this)
  }

  // Return the Edge with the given index that lies directly upstream from
  // this element in the dataflow graph, or null.
  getUpstreamEdge(_index = 0): Edge | null {
    return null
  }

  // Return the number of queryable upstream edges for this element.
  getUpstreamEdgeCount(): number {
    return 0
  }

  // Return the Element with the given index that lies directly upstream
  // from this one in the dataflow graph, or null.
  getUpstreamElement(index = 0): Element | null {
    return this.getUpstreamEdge(index)?.getUpstreamElement() ?? null
  }

  // Traverse the inheritance chain from this element to each element from
  // which it inherits. Throws ExceptionFoundCycle on cycles.
  traverseInheritance(): InheritanceIterator {
    return new InheritanceIterator(this)
  }

  // --- Source URI ---

  // Set the element's source URI, representing the resource from which this
  // element originates.
  setSourceUri(sourceUri: string): void {
    this._sourceUri = sourceUri
  }

  // Return true if this element has a source URI.
  hasSourceUri(): boolean {
    return this._sourceUri !== ''
  }

  // Return the element's source URI.
  getSourceUri(): string {
    return this._sourceUri
  }

  // Return the source URI that is active at the scope of this element,
  // taking all ancestor elements into account.
  getActiveSourceUri(): string {
    for (let elem: Element | null = this; elem; elem = elem.getParent()) {
      if (elem.hasSourceUri()) return elem.getSourceUri()
    }
    return EMPTY_STRING
  }

  // Return true if this element belongs to its content document, and not to
  // an imported library with a distinct source URI.
  belongsToContentDocument(): boolean {
    return this.getActiveSourceUri() === this.getDocument().getSourceUri()
  }

  // --- Validation ---

  // Validate that the given element tree, including all descendants, is
  // consistent with the MaterialX specification.
  validate(message?: string[]): boolean {
    let res = true
    res = this.validateRequire(isValidName(this.getName()), res, message, 'Invalid element name')
    if (this.hasInheritString()) {
      const inheritsFrom = this.getInheritsFrom()
      const validInherit = inheritsFrom !== null && inheritsFrom.getCategory() === this.getCategory()
      res = this.validateRequire(validInherit, res, message, 'Invalid element inheritance')
    }
    for (const child of this.getChildren()) {
      res = child.validate(message) && res
    }
    res = this.validateRequire(!this.hasInheritanceCycle(), res, message, 'Cycle in element inheritance chain')
    return res
  }

  // --- Utility ---

  // Copy all attributes and descendants from the given element to this one.
  copyContentFrom(source: Element): void {
    this.getDocument().invalidateCache()

    this._sourceUri = source._sourceUri
    this._attributeMap = new Map(source._attributeMap)
    this._attributeOrder = [...source._attributeOrder]

    for (const child of source.getChildren()) {
      const name = child.getName()

      // Check for duplicate elements.
      if (this.getChild(name)) continue

      // Create the copied element.
      const childCopy = this.addChildOfCategory(child.getCategory(), name)
      childCopy.copyContentFrom(child)
    }
  }

  // Clear all attributes and descendants from this element.
  clearContent(): void {
    this.getDocument().invalidateCache()

    this._sourceUri = ''
    this._attributeMap.clear()
    this._attributeOrder = []
    this._childMap.clear()
    this._childOrder = []
  }

  // Using the input name as a starting point, modify it to create a valid,
  // unique name for a child element.
  createValidChildName(name: string): string {
    name = name === '' ? '_' : createValidName(name)
    while (this.getChild(name)) {
      name = incrementName(name)
    }
    return name
  }

  // Construct a StringResolver at the scope of this element, used to apply
  // substring modifiers to data values. If the geometry name "/" is given,
  // then all geometry token substitutions are applied.
  createStringResolver(geom = EMPTY_STRING): StringResolver {
    const resolver = StringResolver.create()

    // Compute file and geom prefixes at this scope.
    resolver.setFilePrefix(this.getActiveFilePrefix())
    resolver.setGeomPrefix(this.getActiveGeomPrefix())

    // If a geometry name is specified, then apply it to the filename map.
    if (geom !== '' && _internals.geomStringsMatch) {
      type GeomInfoShape = Element & {
        getActiveGeom(): string
        getTokens(): Token[]
      }
      const doc = this.getDocument() as DocumentShape & { getGeomInfos?: () => GeomInfoShape[] }
      for (const geomInfo of doc.getGeomInfos?.() ?? []) {
        if (!_internals.geomStringsMatch(geom, geomInfo.getActiveGeom())) continue
        for (const token of geomInfo.getTokens()) {
          const key = '<' + token.getName() + '>'
          resolver.setFilenameSubstitution(key, token.getResolvedValueString())
        }
      }
    }

    // Add in token substitutions.
    resolver.addTokenSubstitutions(this)

    return resolver
  }

  // Return a single-line description of this element, including its
  // category, name, and attributes.
  asString(): string {
    let res = '<' + this.getCategory()
    if (this.getName() !== EMPTY_STRING) {
      res += ` name="${this.getName()}"`
    }
    for (const attrName of this.getAttributeNames()) {
      res += ` ${attrName}="${this.getAttribute(attrName)}"`
    }
    res += '>'
    return res
  }

  // --- Protected helpers ---

  protected registerChildElement(child: Element): void {
    this.getDocument().invalidateCache()

    this._childMap.set(child.getName(), child)
    this._childOrder.push(child)
  }

  protected unregisterChildElement(child: Element): void {
    this.getDocument().invalidateCache()

    this._childMap.delete(child.getName())
    const it = this._childOrder.indexOf(child)
    if (it !== -1) this._childOrder.splice(it, 1)
  }

  // Resolve a reference to a named element at the scope of the given parent,
  // taking the namespace at the scope of this element into account. If no
  // parent is provided, then the root scope of the document is used.
  protected resolveNameReference<T extends Element>(cls: ElementClass<T>, name: string, parent?: Element | null): T | null {
    const scope = parent ?? this.getRoot()
    const child = scope.getChildOfType(cls, this.getQualifiedName(name))
    return child ?? scope.getChildOfType(cls, name)
  }

  // Enforce a requirement within a validate method, returning the updated
  // validation state and appending to the optional message list on failure.
  protected validateRequire(expression: boolean, res: boolean, message: string[] | undefined, errorDesc: string): boolean {
    if (!expression) {
      res = false
      message?.push(errorDesc + ': ' + this.asString())
    }
    return res
  }
}

// The base class for typed elements.
export class TypedElement extends Element {
  static readonly TYPE_ATTRIBUTE = 'type'

  // Set the element's type string.
  setType(type: string): void {
    this.setAttribute(TypedElement.TYPE_ATTRIBUTE, type)
  }

  // Return true if the given element has a type string.
  hasType(): boolean {
    return this.hasAttribute(TypedElement.TYPE_ATTRIBUTE)
  }

  // Return the element's type string.
  getType(): string {
    return this.getAttribute(TypedElement.TYPE_ATTRIBUTE)
  }

  // Return true if the element is of color type.
  isColorType(): boolean {
    return this.getType() === 'color3' || this.getType() === 'color4'
  }

  // Return true if the element is of multi-output type.
  isMultiOutputType(): boolean {
    return this.getType() === 'multioutput'
  }

  // Return the TypeDef declaring the type string of this element, if any.
  getTypeDef(): Element | null {
    const cls = elementClassRegistry.get('typedef')
    return cls ? this.resolveNameReference(cls, this.getType()) : null
  }
}

// The base class for elements that support typed values.
export class ValueElement extends TypedElement {
  static readonly VALUE_ATTRIBUTE = 'value'
  static readonly INTERFACE_NAME_ATTRIBUTE = 'interfacename'
  static readonly IMPLEMENTATION_NAME_ATTRIBUTE = 'implname'
  static readonly IMPLEMENTATION_TYPE_ATTRIBUTE = 'impltype'
  static readonly ENUM_ATTRIBUTE = 'enum'
  static readonly ENUM_VALUES_ATTRIBUTE = 'enumvalues'
  static readonly UI_NAME_ATTRIBUTE = 'uiname'
  static readonly UI_FOLDER_ATTRIBUTE = 'uifolder'
  static readonly UI_MIN_ATTRIBUTE = 'uimin'
  static readonly UI_MAX_ATTRIBUTE = 'uimax'
  static readonly UI_SOFT_MIN_ATTRIBUTE = 'uisoftmin'
  static readonly UI_SOFT_MAX_ATTRIBUTE = 'uisoftmax'
  static readonly UI_STEP_ATTRIBUTE = 'uistep'
  static readonly UI_ADVANCED_ATTRIBUTE = 'uiadvanced'
  static readonly UNIT_ATTRIBUTE = 'unit'
  static readonly UNITTYPE_ATTRIBUTE = 'unittype'
  static readonly UNIFORM_ATTRIBUTE = 'uniform'

  // --- Value String ---

  // Set the value string of an element.
  setValueString(value: string): void {
    this.setAttribute(ValueElement.VALUE_ATTRIBUTE, value)
  }

  // Return true if the given element has a value string.
  hasValueString(): boolean {
    return this.hasAttribute(ValueElement.VALUE_ATTRIBUTE)
  }

  // Get the value string of an element.
  getValueString(): string {
    return this.getAttribute(ValueElement.VALUE_ATTRIBUTE)
  }

  // Return the resolved value string of an element, applying any string
  // substitutions defined at the element's scope.
  getResolvedValueString(resolver?: StringResolver | null): string {
    if (!StringResolver.isResolvedType(this.getType())) {
      return this.getValueString()
    }
    if (!resolver) {
      resolver = this.createStringResolver()
    }
    return resolver.resolve(this.getValueString(), this.getType())
  }

  // --- Interface Names ---

  setInterfaceName(name: string): void {
    this.setAttribute(ValueElement.INTERFACE_NAME_ATTRIBUTE, name)
  }

  hasInterfaceName(): boolean {
    return this.hasAttribute(ValueElement.INTERFACE_NAME_ATTRIBUTE)
  }

  getInterfaceName(): string {
    return this.getAttribute(ValueElement.INTERFACE_NAME_ATTRIBUTE)
  }

  // --- Implementation Names ---

  setImplementationName(name: string): void {
    this.setAttribute(ValueElement.IMPLEMENTATION_NAME_ATTRIBUTE, name)
  }

  hasImplementationName(): boolean {
    return this.hasAttribute(ValueElement.IMPLEMENTATION_NAME_ATTRIBUTE)
  }

  getImplementationName(): string {
    return this.getAttribute(ValueElement.IMPLEMENTATION_NAME_ATTRIBUTE)
  }

  // --- Typed Value ---

  // Set the typed value of an element. The MaterialX type is inferred from
  // the data object where unambiguous; pass an explicit type for integer
  // values and empty arrays.
  setValue(value: ValueData, type = EMPTY_STRING): void {
    const v = Value.createValue(value, type !== '' ? type : undefined)
    this.setType(v.getTypeString())
    this.setValueString(v.getValueString())
  }

  // Return true if the element possesses a typed value.
  hasValue(): boolean {
    return this.hasAttribute(ValueElement.VALUE_ATTRIBUTE)
  }

  // Return the typed value of an element as a generic value object, or null
  // if no value is present.
  getValue(): Value | null {
    if (!this.hasValue()) return null
    return Value.createValueFromStrings(this.getValueString(), this.getType(), this.getDocument().getTypeDef(this.getType()))
  }

  // Return the resolved value of an element as a generic value object, or
  // null if no value is present.
  getResolvedValue(resolver?: StringResolver | null): Value | null {
    if (!this.hasValue()) return null
    return Value.createValueFromStrings(
      this.getResolvedValueString(resolver),
      this.getType(),
      this.getDocument().getTypeDef(this.getType()),
    )
  }

  // Return the default value for this element as a generic value object, or
  // null if no default value was found.
  getDefaultValue(): Value | null {
    const parent = this.getParent()
    if (parent && parent.isInterfaceElement()) {
      const iface = parent as InterfaceElementShape
      const decl = iface.getDeclaration()
      if (decl) {
        const value = decl.getActiveValueElement(this.getName())
        if (value) return value.getValue()
      }
    }
    return null
  }

  // --- Units ---

  setUnit(unit: string): void {
    this.setAttribute(ValueElement.UNIT_ATTRIBUTE, unit)
  }

  hasUnit(): boolean {
    return this.hasAttribute(ValueElement.UNIT_ATTRIBUTE)
  }

  getUnit(): string {
    return this.getAttribute(ValueElement.UNIT_ATTRIBUTE)
  }

  // Return the unit defined by the associated NodeDef if this element is a
  // child of a Node.
  getActiveUnit(): string {
    const parent = this.getParent()
    if (parent && parent.isInterfaceElement()) {
      const iface = parent as InterfaceElementShape
      const decl = iface.getDeclaration()
      if (decl) {
        const value = decl.getActiveValueElement(this.getName())
        if (value) return value.getUnit()
      }
    }
    return EMPTY_STRING
  }

  setUnitType(unit: string): void {
    this.setAttribute(ValueElement.UNITTYPE_ATTRIBUTE, unit)
  }

  hasUnitType(): boolean {
    return this.hasAttribute(ValueElement.UNITTYPE_ATTRIBUTE)
  }

  getUnitType(): string {
    return this.getAttribute(ValueElement.UNITTYPE_ATTRIBUTE)
  }

  // --- Uniform attribute ---

  setIsUniform(value: boolean): void {
    this.setTypedAttribute(ValueElement.UNIFORM_ATTRIBUTE, value)
  }

  getIsUniform(): boolean {
    return this.getTypedAttribute(ValueElement.UNIFORM_ATTRIBUTE, 'boolean') === true
  }

  // --- Functional Equivalence ---

  override isAttributeEquivalent(
    rhs: Element,
    attributeName: string,
    options: ElementEquivalenceOptions = new ElementEquivalenceOptions(),
    message?: string[],
  ): boolean {
    // Perform value comparisons.
    let performedValueComparison = false
    if (options.performValueComparisons) {
      const uiAttributes = new Set([
        ValueElement.UI_MIN_ATTRIBUTE,
        ValueElement.UI_MAX_ATTRIBUTE,
        ValueElement.UI_SOFT_MIN_ATTRIBUTE,
        ValueElement.UI_SOFT_MAX_ATTRIBUTE,
        ValueElement.UI_STEP_ATTRIBUTE,
      ])

      // Get precision and format options.
      const fmt = new ScopedFloatFormatting(options.floatFormat, options.floatPrecision)
      try {
        // Check value equality.
        const rhsValueElement = rhs.asA(ValueElement)
        if (rhsValueElement && attributeName === ValueElement.VALUE_ATTRIBUTE) {
          const thisValue = this.getValue()
          const rhsValue = rhsValueElement.getValue()
          if (thisValue && rhsValue) {
            if (thisValue.getValueString() !== rhsValue.getValueString()) {
              message?.push(
                `Attribute \`${attributeName}\` of ${this.getNamePath()} differs from ${rhs.getNamePath()}`,
              )
              return false
            }
          }
          performedValueComparison = true
        }
        // Check ui attribute value equality.
        else if (uiAttributes.has(attributeName)) {
          const uiAttribute = this.getAttribute(attributeName)
          const rhsUiAttribute = rhs.getAttribute(attributeName)
          const uiValue = rhsUiAttribute !== '' ? Value.createValueFromStrings(uiAttribute, this.getType()) : null
          const rhsUiValue = rhsUiAttribute !== '' ? Value.createValueFromStrings(rhsUiAttribute, this.getType()) : null
          if (uiValue && rhsUiValue) {
            if (uiValue.getValueString() !== rhsUiValue.getValueString()) {
              message?.push(
                `Attribute \`${attributeName}\` of ${this.getNamePath()} differs from ${rhs.getNamePath()}`,
              )
              return false
            }
          }
          performedValueComparison = true
        }
      } finally {
        fmt.restore()
      }
    }

    // If no value comparison was performed, perform the default comparison.
    if (!performedValueComparison) {
      return super.isAttributeEquivalent(rhs, attributeName, options, message)
    }

    return true
  }

  // --- Validation ---

  override validate(message?: string[]): boolean {
    let res = true
    if (this.hasType() && this.hasValueString()) {
      res = this.validateRequire(this.getValue() !== null, res, message, 'Invalid value')
    }

    if (this.hasInterfaceName()) {
      res = this.validateRequire(
        this.getCategory() === 'input' || this instanceof Token,
        res,
        message,
        'Only input and token elements support interface names',
      )
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
        const graphParent: Element | null = graph.getParent()
        graph = null
        for (let elem: Element | null = graphParent; elem; elem = elem.getParent()) {
          if (elem.isGraphElement()) {
            graph = elem
            break
          }
        }
      }
      if (graph) {
        const graphIface = graph as InterfaceElementShape
        const decl = graphIface.getDeclaration() ?? graphIface
        const valueElem = decl.getActiveValueElement(this.getInterfaceName())
        res = this.validateRequire(valueElem !== null, res, message, 'Interface name not found in referenced declaration')
        if (valueElem) {
          res = this.validateRequire(
            this.getType() === valueElem.getType(),
            res,
            message,
            'Interface name refers to value element of a different type',
          )
        }
      }
    }

    type UnitTypeDefShape = Element & { getUnitDefs(): Array<Element & { getUnit(name: string): Element | null }> }
    const doc = this.getDocument() as DocumentShape & { getUnitTypeDef?: (name: string) => UnitTypeDefShape | null }
    let unitTypeDef: UnitTypeDefShape | null = null
    if (this.hasUnitType()) {
      const unittype = this.getUnitType()
      if (unittype !== '') {
        unitTypeDef = doc.getUnitTypeDef?.(unittype) ?? null
        res = this.validateRequire(unitTypeDef !== null, res, message, 'Unit type definition does not exist in document')
      }
    }
    if (this.hasUnit()) {
      let foundUnit = false
      if (unitTypeDef) {
        const unit = this.getUnit()
        for (const unitDef of unitTypeDef.getUnitDefs()) {
          if (unitDef.getUnit(unit)) {
            foundUnit = true
            break
          }
        }
      }
      res = this.validateRequire(foundUnit, res, message, 'Unit definition does not exist in document')
    }
    return super.validate(message) && res
  }
}

// The duck-typed surface of InterfaceElement that this module needs; the
// InterfaceElement class satisfies it structurally.
interface InterfaceElementShape extends Element {
  getDeclaration(target?: string): InterfaceElementShape | null
  getActiveValueElement(name: string): ValueElement | null
  getActiveTokens(): Token[]
}

// A token element representing a string value, used to define input and
// output values for string substitutions in image filenames.
export class Token extends ValueElement {
  static readonly CATEGORY = 'token'

  constructor(parent: Element | null, name: string) {
    super(parent, Token.CATEGORY, name)
  }
}

// An element representing a block of descriptive text within a document,
// which is stored as a comment when the document is written out.
export class CommentElement extends Element {
  static readonly CATEGORY = 'comment'

  constructor(parent: Element | null, name: string) {
    super(parent, CommentElement.CATEGORY, name)
  }
}

// An element representing a newline within a document.
export class NewlineElement extends Element {
  static readonly CATEGORY = 'newline'

  constructor(parent: Element | null, name: string) {
    super(parent, NewlineElement.CATEGORY, name)
  }
}

// A generic element subclass, for instantiating elements with unrecognized
// categories.
export class GenericElement extends Element {
  static readonly CATEGORY = 'generic'

  constructor(parent: Element | null, name: string) {
    super(parent, GenericElement.CATEGORY, name)
  }
}

// A helper object for applying string modifiers to data values in the
// context of a specific element and geometry.
export class StringResolver {
  protected _filePrefix = ''
  protected _geomPrefix = ''
  protected _filenameMap: StringMap = new Map()
  protected _geomNameMap: StringMap = new Map()

  protected constructor() {}

  // Create a new string resolver.
  static create(): StringResolver {
    return new StringResolver()
  }

  // --- File Prefix ---

  setFilePrefix(filePrefix: string): void {
    this._filePrefix = filePrefix
  }

  getFilePrefix(): string {
    return this._filePrefix
  }

  // --- Geom Prefix ---

  setGeomPrefix(geomPrefix: string): void {
    this._geomPrefix = geomPrefix
  }

  getGeomPrefix(): string {
    return this._geomPrefix
  }

  // --- Filename Substitutions ---

  // Set the UDIM substring substitution for filename data values.
  setUdimString(udim: string): void {
    this.setFilenameSubstitution(UDIM_TOKEN, udim)
  }

  // Set the UV-tile substring substitution for filename data values.
  setUvTileString(uvTile: string): void {
    this.setFilenameSubstitution(UV_TILE_TOKEN, uvTile)
  }

  // Set an arbitrary substring substitution for filename data values.
  setFilenameSubstitution(key: string, value: string): void {
    this._filenameMap.set(key, value)
  }

  // Add filename token substitutions for a given element. Child tokens
  // override any parent tokens.
  addTokenSubstitutions(element: Element): void {
    const DELIMITER_PREFIX = '['
    const DELIMITER_POSTFIX = ']'

    let parent = element.getParent()
    while (parent) {
      if (parent.isInterfaceElement()) {
        const interfaceElem = parent as InterfaceElementShape
        for (const token of interfaceElem.getActiveTokens()) {
          const key = DELIMITER_PREFIX + token.getName() + DELIMITER_POSTFIX
          if (!this._filenameMap.has(key)) {
            this.setFilenameSubstitution(key, token.getResolvedValueString())
          }
        }

        // This is a functional nodegraph: get the corresponding nodedef and
        // check for tokens on it.
        if (parent.getCategory() === 'nodegraph') {
          const nodegraph = parent as Element & { getNodeDef(): InterfaceElementShape | null }
          const nodedef = nodegraph.getNodeDef()
          if (nodedef) {
            for (const token of nodedef.getActiveTokens()) {
              const key = DELIMITER_PREFIX + token.getName() + DELIMITER_POSTFIX
              if (!this._filenameMap.has(key)) {
                this.setFilenameSubstitution(key, token.getResolvedValueString())
              }
            }
          }
        }
      }
      parent = parent.getParent()
    }
  }

  // Return the map of filename substring substitutions.
  getFilenameSubstitutions(): StringMap {
    return this._filenameMap
  }

  // --- Geometry Name Substitutions ---

  // Set an arbitrary substring substitution for geometry name data values.
  setGeomNameSubstitution(key: string, value: string): void {
    this._geomNameMap.set(key, value)
  }

  // Return the map of geometry name substring substitutions.
  getGeomNameSubstitutions(): StringMap {
    return this._geomNameMap
  }

  // --- Resolution ---

  // Given an input string and type, apply all appropriate modifiers and
  // return the resulting string.
  resolve(str: string, type: string): string {
    if (type === FILENAME_TYPE_STRING) {
      return this._filePrefix + replaceSubstrings(str, this._filenameMap)
    }
    if (type === GEOMNAME_TYPE_STRING) {
      return this._geomPrefix + replaceSubstrings(str, this._geomNameMap)
    }
    return str
  }

  // Return true if the given type may be resolved by this class.
  static isResolvedType(type: string): boolean {
    return type === FILENAME_TYPE_STRING || type === GEOMNAME_TYPE_STRING
  }
}

// Given two target strings, each containing a string array of target names,
// return true if they have any targets in common. An empty target string
// matches all targets.
export function targetStringsMatch(target1: string, target2: string): boolean {
  if (target1 === '' || target2 === '') return true

  const set1 = new Set(splitString(target1, ARRAY_VALID_SEPARATORS))
  const set2 = new Set(splitString(target2, ARRAY_VALID_SEPARATORS))
  for (const t of set1) {
    if (set2.has(t)) return true
  }
  return false
}

// Pretty print the given element tree, calling asString recursively on each
// element in depth-first order.
export function prettyPrint(elem: Element): string {
  let text = ''
  const it = elem.traverseTree()
  for (const e of it) {
    text += ' '.repeat(it.getElementDepth() * 2) + e.asString() + '\n'
  }
  return text
}

registerElementClass(Token)
registerElementClass(CommentElement)
registerElementClass(NewlineElement)
registerElementClass(GenericElement)
