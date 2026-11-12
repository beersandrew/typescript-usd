// Ported from MaterialX 1.39.5: source/MaterialXCore/Document.h,
//  source/MaterialXCore/Document.cpp
// Copyright Contributors to the MaterialX Project. Apache License 2.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Mirrors source/MaterialXCore/Document.h and Document.cpp
//
// Accessors for the geom/look/property/variant element families are added
// alongside those modules. The version-upgrade path (upstream Version.cpp)
// arrives with the XML format package, which is where upstream invokes it.

import { Exception } from './exceptions.ts'
import { Element, registerElementClass, type ElementClass } from './element.ts'
import { InterfaceElement, Input, Output, PortElement } from './interface.ts'
import { GraphElement, Node, NodeGraph } from './node.ts'
import {
  AttributeDef,
  Implementation,
  NodeDef,
  TargetDef,
  TypeDef,
  UnitDef,
  UnitTypeDef,
} from './definition.ts'
import { GeomInfo, GeomPropDef, Collection, geomStringsMatch, UNIVERSAL_GEOM_NAME } from './geom.ts'
import { upgradeDocumentVersion } from './version.ts'
import { Look, LookGroup } from './look.ts'
import { PropertySet } from './property.ts'
import { VariantSet } from './variant.ts'
import { DEFAULT_TYPE_STRING, MULTI_OUTPUT_TYPE_STRING } from './types.ts'
import { Value } from './value.ts'
import {
  EMPTY_STRING,
  MATERIALX_MAJOR_VERSION,
  MATERIALX_MINOR_VERSION,
} from './util.ts'

// A MaterialX document, which represents the top-level element in the
// MaterialX ownership hierarchy.
//
// Use the factory function createDocument() to create a Document instance.
export class Document extends GraphElement {
  static readonly CATEGORY = 'materialx'
  static readonly CMS_ATTRIBUTE = 'cms'
  static readonly CMS_CONFIG_ATTRIBUTE = 'cmsconfig'

  private _dataLibrary: Document | null = null

  // Cached lookup maps, mirroring the upstream Document::Cache.
  private _cacheValid = false
  private _portElementMap = new Map<string, PortElement[]>()
  private _nodeDefMap = new Map<string, NodeDef[]>()
  private _implementationMap = new Map<string, InterfaceElement[]>()

  constructor(parent: Element | null, name: string) {
    super(parent, Document.CATEGORY, name)
  }

  // Initialize the document, removing any existing content.
  initialize(): void {
    this._root = this
    this.clearContent()
    this.setVersionIntegers(MATERIALX_MAJOR_VERSION, MATERIALX_MINOR_VERSION)
  }

  // Create a deep copy of the document.
  copy(): Document {
    const doc = createDocument()
    doc.copyContentFrom(this)
    doc.setDataLibrary(this.getDataLibrary())
    return doc
  }

  // Get a list of source URIs referenced by the document.
  getReferencedSourceUris(): Set<string> {
    const sourceUris = new Set<string>()
    for (const elem of this.traverseTree()) {
      if (elem.hasSourceUri()) {
        sourceUris.add(elem.getSourceUri())
      }
    }
    return sourceUris
  }

  // --- Data Libraries ---

  // Store a reference to a data library in this document.
  setDataLibrary(dataLibrary: Document | null): void {
    this._dataLibrary = dataLibrary
  }

  // Return true if this document has a data library.
  hasDataLibrary(): boolean {
    return this._dataLibrary !== null
  }

  // Return the data library, if any, referenced by this document.
  getDataLibrary(): Document | null {
    return this._dataLibrary
  }

  // Import the given data library into this document. The contents of the
  // data library are copied in, and assigned the library's source URI.
  importLibrary(library: Document | null): void {
    if (!library) return

    for (const child of library.getChildren()) {
      if (child.getCategory() === '') {
        throw new Exception('Trying to import child without a category: ' + child.getName())
      }

      const childName = child.getQualifiedName(child.getName())

      // Check for duplicate elements.
      if (this.getChild(childName)) continue

      // Create the imported element.
      const childCopy = this.addChildOfCategory(child.getCategory(), childName)
      childCopy.copyContentFrom(child)
      if (!childCopy.hasFilePrefix() && library.hasFilePrefix()) {
        childCopy.setFilePrefix(library.getFilePrefix())
      }
      if (!childCopy.hasGeomPrefix() && library.hasGeomPrefix()) {
        childCopy.setGeomPrefix(library.getGeomPrefix())
      }
      if (!childCopy.hasColorSpace() && library.hasColorSpace()) {
        childCopy.setColorSpace(library.getColorSpace())
      }
      if (!childCopy.hasNamespace() && library.hasNamespace()) {
        childCopy.setNamespace(library.getNamespace())
      }
      if (!childCopy.hasSourceUri() && library.hasSourceUri()) {
        childCopy.setSourceUri(library.getSourceUri())
      }
    }
  }

  // --- Child lookups (consult the data library, mirroring Element.cpp) ---

  override getChild(name: string): Element | null {
    const local = super.getChild(name)
    if (local) return local
    return this._dataLibrary ? this._dataLibrary.getChild(name) : null
  }

  override getChildOfType<T extends Element>(cls: ElementClass<T>, name: string): T | null {
    let child: Element | null = null
    if (this._dataLibrary) {
      child = this._dataLibrary.getChild(name)
    }
    if (!child) {
      child = this.getChild(name)
    }
    return child ? child.asA(cls) : null
  }

  override getChildrenOfType<T extends Element>(cls: ElementClass<T>, category = EMPTY_STRING): T[] {
    const children: T[] = this._dataLibrary ? this._dataLibrary.getChildrenOfType(cls, category) : []
    children.push(...super.getChildrenOfType(cls, category))
    return children
  }

  // --- NodeGraph Elements ---

  // Add a NodeGraph to the document.
  addNodeGraph(name = EMPTY_STRING): NodeGraph {
    return this.addChild(NodeGraph, name)
  }

  // Return the NodeGraph, if any, with the given name.
  getNodeGraph(name: string): NodeGraph | null {
    return this.getChildOfType(NodeGraph, name)
  }

  // Return a vector of all NodeGraph elements in the document.
  getNodeGraphs(): NodeGraph[] {
    return this.getChildrenOfType(NodeGraph)
  }

  // Remove the NodeGraph, if any, with the given name.
  removeNodeGraph(name: string): void {
    this.removeChildOfType(NodeGraph, name)
  }

  // Return a vector of all port elements that match the given node name.
  getMatchingPorts(nodeName: string): PortElement[] {
    this.refreshCache()
    return [...(this._portElementMap.get(nodeName) ?? [])]
  }

  // --- GeomInfo Elements ---

  // Add a GeomInfo to the document, with an optional geometry string.
  addGeomInfo(name = EMPTY_STRING, geom: string = UNIVERSAL_GEOM_NAME): GeomInfo {
    const geomInfo = this.addChild(GeomInfo, name)
    geomInfo.setGeom(geom)
    return geomInfo
  }

  // Return the GeomInfo, if any, with the given name.
  getGeomInfo(name: string): GeomInfo | null {
    return this.getChildOfType(GeomInfo, name)
  }

  // Return a vector of all GeomInfo elements in the document.
  getGeomInfos(): GeomInfo[] {
    return this.getChildrenOfType(GeomInfo)
  }

  // Remove the GeomInfo, if any, with the given name.
  removeGeomInfo(name: string): void {
    this.removeChildOfType(GeomInfo, name)
  }

  // Return the value of a geometric property for the given geometry string.
  getGeomPropValue(geomPropName: string, geom: string = UNIVERSAL_GEOM_NAME): Value | null {
    let value: Value | null = null
    for (const geomInfo of this.getGeomInfos()) {
      if (!geomStringsMatch(geom, geomInfo.getActiveGeom())) {
        continue
      }
      const geomProp = geomInfo.getGeomProp(geomPropName)
      if (geomProp) {
        value = geomProp.getValue()
      }
    }
    return value
  }

  // --- GeomPropDef Elements ---

  // Add a GeomPropDef to the document for the given geometric property.
  addGeomPropDef(name: string, geomprop: string): GeomPropDef {
    const geomPropDef = this.addChild(GeomPropDef, name)
    geomPropDef.setGeomProp(geomprop)
    return geomPropDef
  }

  // Return the GeomPropDef, if any, with the given name.
  getGeomPropDef(name: string): GeomPropDef | null {
    return this.getChildOfType(GeomPropDef, name)
  }

  // Return a vector of all GeomPropDef elements in the document.
  getGeomPropDefs(): GeomPropDef[] {
    return this.getChildrenOfType(GeomPropDef)
  }

  // Remove the GeomPropDef, if any, with the given name.
  removeGeomPropDef(name: string): void {
    this.removeChildOfType(GeomPropDef, name)
  }

  // --- Look Elements ---

  // Add a Look to the document.
  addLook(name = EMPTY_STRING): Look {
    return this.addChild(Look, name)
  }

  // Return the Look, if any, with the given name.
  getLook(name: string): Look | null {
    return this.getChildOfType(Look, name)
  }

  // Return a vector of all Look elements in the document.
  getLooks(): Look[] {
    return this.getChildrenOfType(Look)
  }

  // Remove the Look, if any, with the given name.
  removeLook(name: string): void {
    this.removeChildOfType(Look, name)
  }

  // --- LookGroup Elements ---

  // Add a LookGroup to the document.
  addLookGroup(name = EMPTY_STRING): LookGroup {
    return this.addChild(LookGroup, name)
  }

  // Return the LookGroup, if any, with the given name.
  getLookGroup(name: string): LookGroup | null {
    return this.getChildOfType(LookGroup, name)
  }

  // Return a vector of all LookGroup elements in the document.
  getLookGroups(): LookGroup[] {
    return this.getChildrenOfType(LookGroup)
  }

  // Remove the LookGroup, if any, with the given name.
  removeLookGroup(name: string): void {
    this.removeChildOfType(LookGroup, name)
  }

  // --- Collection Elements ---

  // Add a Collection to the document.
  addCollection(name = EMPTY_STRING): Collection {
    return this.addChild(Collection, name)
  }

  // Return the Collection, if any, with the given name.
  getCollection(name: string): Collection | null {
    return this.getChildOfType(Collection, name)
  }

  // Return a vector of all Collection elements in the document.
  getCollections(): Collection[] {
    return this.getChildrenOfType(Collection)
  }

  // Remove the Collection, if any, with the given name.
  removeCollection(name: string): void {
    this.removeChildOfType(Collection, name)
  }

  // --- PropertySet Elements ---

  // Add a PropertySet to the document.
  addPropertySet(name = EMPTY_STRING): PropertySet {
    return this.addChild(PropertySet, name)
  }

  // Return the PropertySet, if any, with the given name.
  getPropertySet(name: string): PropertySet | null {
    return this.getChildOfType(PropertySet, name)
  }

  // Return a vector of all PropertySet elements in the document.
  getPropertySets(): PropertySet[] {
    return this.getChildrenOfType(PropertySet)
  }

  // Remove the PropertySet, if any, with the given name.
  removePropertySet(name: string): void {
    this.removeChildOfType(PropertySet, name)
  }

  // --- VariantSet Elements ---

  // Add a VariantSet to the document.
  addVariantSet(name = EMPTY_STRING): VariantSet {
    return this.addChild(VariantSet, name)
  }

  // Return the VariantSet, if any, with the given name.
  getVariantSet(name: string): VariantSet | null {
    return this.getChildOfType(VariantSet, name)
  }

  // Return a vector of all VariantSet elements in the document.
  getVariantSets(): VariantSet[] {
    return this.getChildrenOfType(VariantSet)
  }

  // Remove the VariantSet, if any, with the given name.
  removeVariantSet(name: string): void {
    this.removeChildOfType(VariantSet, name)
  }

  // --- Material Outputs ---

  // Return material-type outputs for all nodegraphs in the document.
  getMaterialOutputs(): Output[] {
    const materialOutputs: Output[] = []

    const documentUri = this.getSourceUri()
    for (const docNodeGraph of this.getNodeGraphs()) {
      // Skip nodegraphs which are either definitions or from included files.
      const graphUri = docNodeGraph.getSourceUri()
      if (docNodeGraph.getNodeDef() || (graphUri !== '' && documentUri !== graphUri)) {
        continue
      }

      materialOutputs.push(...docNodeGraph.getMaterialOutputs())
    }
    return materialOutputs
  }

  // --- TypeDef Elements ---

  // Add a TypeDef to the document.
  addTypeDef(name: string): TypeDef {
    return this.addChild(TypeDef, name)
  }

  // Return the TypeDef, if any, with the given name. (The optional
  // parameter keeps the override compatible with TypedElement.getTypeDef,
  // which C++ resolves by overload shadowing.)
  override getTypeDef(name = EMPTY_STRING): TypeDef | null {
    return this.getChildOfType(TypeDef, name)
  }

  // Return a vector of all TypeDef elements in the document.
  getTypeDefs(): TypeDef[] {
    return this.getChildrenOfType(TypeDef)
  }

  // Remove the TypeDef, if any, with the given name.
  removeTypeDef(name: string): void {
    this.removeChildOfType(TypeDef, name)
  }

  // --- NodeDef Elements ---

  // Add a NodeDef to the document. When a non-multioutput type is given,
  // the new NodeDef is assigned an output of that type.
  addNodeDef(name = EMPTY_STRING, type: string = DEFAULT_TYPE_STRING, node = EMPTY_STRING): NodeDef {
    const child = this.addChild(NodeDef, name)
    if (type !== '' && type !== MULTI_OUTPUT_TYPE_STRING) {
      child.addOutput('out', type)
    }
    if (node !== '') {
      child.setNodeString(node)
    }
    return child
  }

  // Create a NodeDef and functional graph based on a compound NodeGraph.
  addNodeDefFromGraph(nodeGraph: NodeGraph, nodeDefName: string, category: string, newGraphName: string): NodeDef {
    if (category === '') {
      throw new Exception('Cannot create a nodedef without a category identifier')
    }

    if (this.getNodeDef(nodeDefName)) {
      throw new Exception('Cannot create duplicate nodedef: ' + nodeDefName)
    }

    if (this.getNodeGraph(newGraphName)) {
      throw new Exception('Cannot create duplicate nodegraph: ' + newGraphName)
    }

    // Create a new functional nodegraph, and copy over the contents from
    // the compound nodegraph.
    const graph = this.addNodeGraph(newGraphName)
    graph.copyContentFrom(nodeGraph)

    for (const graphChild of graph.getChildren()) {
      graphChild.removeAttribute(Element.XPOS_ATTRIBUTE)
      graphChild.removeAttribute(Element.YPOS_ATTRIBUTE)
    }
    graph.setNodeDefString(nodeDefName)

    // Create a new nodedef and set its category.
    const nodeDef = this.addNodeDef(nodeDefName, EMPTY_STRING)
    nodeDef.setNodeString(category)

    // Expose any existing interfaces from the graph; connection attributes
    // and layout attributes are not copied to the definition.
    const filterAttributes = [
      PortElement.NODE_GRAPH_ATTRIBUTE,
      PortElement.NODE_NAME_ATTRIBUTE,
      PortElement.INTERFACE_NAME_ATTRIBUTE,
      Element.XPOS_ATTRIBUTE,
      Element.YPOS_ATTRIBUTE,
    ]

    // Transfer the input interface from the graph to the nodedef.
    for (const input of graph.getInputs()) {
      const nodeDefInput = nodeDef.addInput(input.getName(), input.getType())
      nodeDefInput.copyContentFrom(input)
      for (const filterAttribute of filterAttributes) {
        nodeDefInput.removeAttribute(filterAttribute)
      }
      nodeDefInput.setSourceUri(EMPTY_STRING)
      input.setInterfaceName(nodeDefInput.getName())
    }
    // Remove interfaces from the nodegraph.
    for (const input of graph.getInputs()) {
      graph.removeInput(input.getName())
    }

    // Copy the output interface from the graph to the nodedef.
    for (const output of graph.getOutputs()) {
      const nodeDefOutput = nodeDef.addOutput(output.getName(), output.getType())
      nodeDefOutput.copyContentFrom(output)
      for (const filterAttribute of filterAttributes) {
        nodeDefOutput.removeAttribute(filterAttribute)
      }
      nodeDefOutput.setSourceUri(EMPTY_STRING)
    }

    return nodeDef
  }

  // Return the NodeDef, if any, with the given name.
  getNodeDef(name: string): NodeDef | null {
    return this.getChildOfType(NodeDef, name)
  }

  // Return a vector of all NodeDef elements in the document.
  getNodeDefs(): NodeDef[] {
    return this.getChildrenOfType(NodeDef)
  }

  // Remove the NodeDef, if any, with the given name.
  removeNodeDef(name: string): void {
    this.removeChildOfType(NodeDef, name)
  }

  // Return a vector of all NodeDef elements that match the given node name.
  getMatchingNodeDefs(nodeName: string): NodeDef[] {
    // Recurse to the data library if present.
    const matchingNodeDefs: NodeDef[] = this._dataLibrary ? this._dataLibrary.getMatchingNodeDefs(nodeName) : []

    // Append all nodedefs matching the given node name.
    this.refreshCache()
    matchingNodeDefs.push(...(this._nodeDefMap.get(nodeName) ?? []))

    return matchingNodeDefs
  }

  // --- AttributeDef Elements ---

  // Add an AttributeDef to the document.
  addAttributeDef(name = EMPTY_STRING): AttributeDef {
    return this.addChild(AttributeDef, name)
  }

  // Return the AttributeDef, if any, with the given name.
  getAttributeDef(name: string): AttributeDef | null {
    return this.getChildOfType(AttributeDef, name)
  }

  // Return a vector of all AttributeDef elements in the document.
  getAttributeDefs(): AttributeDef[] {
    return this.getChildrenOfType(AttributeDef)
  }

  // Remove the AttributeDef, if any, with the given name.
  removeAttributeDef(name: string): void {
    this.removeChildOfType(AttributeDef, name)
  }

  // --- TargetDef Elements ---

  // Add a TargetDef to the document.
  addTargetDef(name = EMPTY_STRING): TargetDef {
    return this.addChild(TargetDef, name)
  }

  // Return the TargetDef, if any, with the given name.
  getTargetDef(name: string): TargetDef | null {
    return this.getChildOfType(TargetDef, name)
  }

  // Return a vector of all TargetDef elements in the document.
  getTargetDefs(): TargetDef[] {
    return this.getChildrenOfType(TargetDef)
  }

  // Remove the TargetDef, if any, with the given name.
  removeTargetDef(name: string): void {
    this.removeChildOfType(TargetDef, name)
  }

  // --- Implementation Elements ---

  // Add an Implementation to the document.
  addImplementation(name = EMPTY_STRING): Implementation {
    return this.addChild(Implementation, name)
  }

  // Return the Implementation, if any, with the given name.
  getImplementation(name: string): Implementation | null {
    return this.getChildOfType(Implementation, name)
  }

  // Return a vector of all Implementation elements in the document.
  getImplementations(): Implementation[] {
    return this.getChildrenOfType(Implementation)
  }

  // Remove the Implementation, if any, with the given name.
  removeImplementation(name: string): void {
    this.removeChildOfType(Implementation, name)
  }

  // Return all node implementations that match the given NodeDef string. A
  // node implementation may be either an Implementation or NodeGraph.
  getMatchingImplementations(nodeDef: string): InterfaceElement[] {
    // Recurse to the data library if present.
    const matchingImplementations: InterfaceElement[] = this._dataLibrary
      ? this._dataLibrary.getMatchingImplementations(nodeDef)
      : []

    // Append all implementations matching the given nodedef string.
    this.refreshCache()
    matchingImplementations.push(...(this._implementationMap.get(nodeDef) ?? []))

    return matchingImplementations
  }

  // --- UnitDef Elements ---

  // Add a UnitDef to the document; throws if the name is empty.
  addUnitDef(name: string): UnitDef {
    if (name === '') {
      throw new Exception('A unit definition name cannot be empty')
    }
    return this.addChild(UnitDef, name)
  }

  // Return the UnitDef, if any, with the given name.
  getUnitDef(name: string): UnitDef | null {
    return this.getChildOfType(UnitDef, name)
  }

  // Return a vector of all UnitDef elements in the document.
  getUnitDefs(): UnitDef[] {
    return this.getChildrenOfType(UnitDef)
  }

  // Remove the UnitDef, if any, with the given name.
  removeUnitDef(name: string): void {
    this.removeChildOfType(UnitDef, name)
  }

  // --- UnitTypeDef Elements ---

  // Add a UnitTypeDef to the document; throws if the name is empty.
  addUnitTypeDef(name: string): UnitTypeDef {
    if (name === '') {
      throw new Exception('A unit type definition name cannot be empty')
    }
    return this.addChild(UnitTypeDef, name)
  }

  // Return the UnitTypeDef, if any, with the given name.
  getUnitTypeDef(name: string): UnitTypeDef | null {
    return this.getChildOfType(UnitTypeDef, name)
  }

  // Return a vector of all UnitTypeDef elements in the document.
  getUnitTypeDefs(): UnitTypeDef[] {
    return this.getChildrenOfType(UnitTypeDef)
  }

  // Remove the UnitTypeDef, if any, with the given name.
  removeUnitTypeDef(name: string): void {
    this.removeChildOfType(UnitTypeDef, name)
  }

  // --- Version ---

  // Return the major and minor versions as an integer pair.
  override getVersionIntegers(): [number, number] {
    if (!this.hasVersionString()) {
      return [MATERIALX_MAJOR_VERSION, MATERIALX_MINOR_VERSION]
    }
    return super.getVersionIntegers()
  }

  // Upgrade the content of this document from earlier supported versions
  // to the library version (1.38 -> 1.39 only; see version.ts).
  upgradeVersion(): void {
    upgradeDocumentVersion(this)
  }

  // --- Color Management System ---

  setColorManagementSystem(cms: string): void {
    this.setAttribute(Document.CMS_ATTRIBUTE, cms)
  }

  hasColorManagementSystem(): boolean {
    return this.hasAttribute(Document.CMS_ATTRIBUTE)
  }

  getColorManagementSystem(): string {
    return this.getAttribute(Document.CMS_ATTRIBUTE)
  }

  // --- Color Management Config ---

  setColorManagementConfig(cmsConfig: string): void {
    this.setAttribute(Document.CMS_CONFIG_ATTRIBUTE, cmsConfig)
  }

  hasColorManagementConfig(): boolean {
    return this.hasAttribute(Document.CMS_CONFIG_ATTRIBUTE)
  }

  getColorManagementConfig(): string {
    return this.getAttribute(Document.CMS_CONFIG_ATTRIBUTE)
  }

  // --- Validation ---

  override validate(message?: string[]): boolean {
    let res = true
    const [major, minor] = this.getVersionIntegers()
    const versionIndex = major * 1000 + minor
    const expectedIndex = MATERIALX_MAJOR_VERSION * 1000 + MATERIALX_MINOR_VERSION
    res = this.validateRequire(versionIndex >= expectedIndex, res, message, 'Unsupported document version')
    res = this.validateRequire(versionIndex <= expectedIndex, res, message, 'Future document version')
    return super.validate(message) && res
  }

  protected override usesUnorderedChildEquivalence(): boolean {
    return true
  }

  // --- Utility ---

  // Invalidate cached data for optimized lookups within this document.
  invalidateCache(): void {
    this._cacheValid = false
  }

  private refreshCache(): void {
    if (this._cacheValid) return

    // Clear the existing cache.
    this._portElementMap.clear()
    this._nodeDefMap.clear()
    this._implementationMap.clear()

    // Traverse the document to build a new cache.
    for (const elem of this.traverseTree()) {
      const nodeName = elem.getAttribute(PortElement.NODE_NAME_ATTRIBUTE)
      const nodeGraphName = elem.getAttribute(PortElement.NODE_GRAPH_ATTRIBUTE)
      const nodeString = elem.getAttribute(NodeDef.NODE_ATTRIBUTE)
      const nodeDefString = elem.getAttribute(InterfaceElement.NODE_DEF_ATTRIBUTE)

      const portKey = nodeName !== '' ? nodeName : nodeGraphName
      if (portKey !== '') {
        const portElem = elem.asA(PortElement)
        if (portElem) {
          const key = portElem.getQualifiedName(portKey)
          if (!this._portElementMap.has(key)) this._portElementMap.set(key, [])
          this._portElementMap.get(key)!.push(portElem)
        }
      }
      if (nodeString !== '') {
        const nodeDef = elem.asA(NodeDef)
        if (nodeDef) {
          const key = nodeDef.getQualifiedName(nodeString)
          if (!this._nodeDefMap.has(key)) this._nodeDefMap.set(key, [])
          this._nodeDefMap.get(key)!.push(nodeDef)
        }
      }
      if (nodeDefString !== '') {
        const iface = elem.asA(InterfaceElement)
        if (iface && (iface instanceof Implementation || iface instanceof NodeGraph)) {
          const key = iface.getQualifiedName(nodeDefString)
          if (!this._implementationMap.has(key)) this._implementationMap.set(key, [])
          this._implementationMap.get(key)!.push(iface)
        }
      }
    }

    this._cacheValid = true
  }
}

// Create a new Document.
export function createDocument(): Document {
  const doc = new Document(null, EMPTY_STRING)
  doc.initialize()
  return doc
}

registerElementClass(Document)
