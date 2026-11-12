// Ported from MaterialX 1.39.5: source/MaterialXCore/Look.h,
//  source/MaterialXCore/Look.cpp
// Copyright Contributors to the MaterialX Project. Apache License 2.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Mirrors source/MaterialXCore/Look.h and Look.cpp

import { Element, registerElementClass } from './element.ts'
import { GeomElement, geomStringsMatch, UNIVERSAL_GEOM_NAME } from './geom.ts'
import { Node, NodeGraph } from './node.ts'
import { Output } from './interface.ts'
import { PropertyAssign, PropertySetAssign } from './property.ts'
import { VariantAssign } from './variant.ts'
import { EMPTY_STRING } from './util.ts'

// The shape of the Document methods used from this module.
interface DocumentLookShape {
  getLooks(): Look[]
}

// A look element within a Document.
export class Look extends Element {
  static readonly CATEGORY = 'look'

  constructor(parent: Element | null, name: string) {
    super(parent, Look.CATEGORY, name)
  }

  // --- MaterialAssign Elements ---

  // Add a MaterialAssign to the look, with an optional material string
  // matching the name of the material node to be assigned.
  addMaterialAssign(name = EMPTY_STRING, material = EMPTY_STRING): MaterialAssign {
    const matAssign = this.addChild(MaterialAssign, name)
    if (material !== '') {
      matAssign.setMaterial(material)
    }
    return matAssign
  }

  // Return the MaterialAssign, if any, with the given name.
  getMaterialAssign(name: string): MaterialAssign | null {
    return this.getChildOfType(MaterialAssign, name)
  }

  // Return a vector of all MaterialAssign elements in the look.
  getMaterialAssigns(): MaterialAssign[] {
    return this.getChildrenOfType(MaterialAssign)
  }

  // Return all MaterialAssign elements that belong to this look, taking
  // look inheritance into account.
  getActiveMaterialAssigns(): MaterialAssign[] {
    const activeAssigns: MaterialAssign[] = []
    for (const elem of this.traverseInheritance()) {
      activeAssigns.push(...(elem as Look).getMaterialAssigns())
    }
    return activeAssigns
  }

  // Remove the MaterialAssign, if any, with the given name.
  removeMaterialAssign(name: string): void {
    this.removeChildOfType(MaterialAssign, name)
  }

  // --- PropertyAssign Elements ---

  // Add a PropertyAssign to the look.
  addPropertyAssign(name = EMPTY_STRING): PropertyAssign {
    return this.addChild(PropertyAssign, name)
  }

  // Return the PropertyAssign, if any, with the given name.
  getPropertyAssign(name: string): PropertyAssign | null {
    return this.getChildOfType(PropertyAssign, name)
  }

  // Return a vector of all PropertyAssign elements in the look.
  getPropertyAssigns(): PropertyAssign[] {
    return this.getChildrenOfType(PropertyAssign)
  }

  // Return all PropertyAssign elements that belong to this look, taking
  // look inheritance into account.
  getActivePropertyAssigns(): PropertyAssign[] {
    const activeAssigns: PropertyAssign[] = []
    for (const elem of this.traverseInheritance()) {
      activeAssigns.push(...(elem as Look).getPropertyAssigns())
    }
    return activeAssigns
  }

  // Remove the PropertyAssign, if any, with the given name.
  removePropertyAssign(name: string): void {
    this.removeChildOfType(PropertyAssign, name)
  }

  // --- PropertySetAssign Elements ---

  // Add a PropertySetAssign to the look.
  addPropertySetAssign(name = EMPTY_STRING): PropertySetAssign {
    return this.addChild(PropertySetAssign, name)
  }

  // Return the PropertySetAssign, if any, with the given name.
  getPropertySetAssign(name: string): PropertySetAssign | null {
    return this.getChildOfType(PropertySetAssign, name)
  }

  // Return a vector of all PropertySetAssign elements in the look.
  getPropertySetAssigns(): PropertySetAssign[] {
    return this.getChildrenOfType(PropertySetAssign)
  }

  // Return all PropertySetAssign elements that belong to this look, taking
  // look inheritance into account.
  getActivePropertySetAssigns(): PropertySetAssign[] {
    const activeAssigns: PropertySetAssign[] = []
    for (const elem of this.traverseInheritance()) {
      activeAssigns.push(...(elem as Look).getPropertySetAssigns())
    }
    return activeAssigns
  }

  // Remove the PropertySetAssign, if any, with the given name.
  removePropertySetAssign(name: string): void {
    this.removeChildOfType(PropertySetAssign, name)
  }

  // --- VariantAssign Elements ---

  // Add a VariantAssign to the look.
  addVariantAssign(name = EMPTY_STRING): VariantAssign {
    return this.addChild(VariantAssign, name)
  }

  // Return the VariantAssign, if any, with the given name.
  getVariantAssign(name: string): VariantAssign | null {
    return this.getChildOfType(VariantAssign, name)
  }

  // Return a vector of all VariantAssign elements in the look.
  getVariantAssigns(): VariantAssign[] {
    return this.getChildrenOfType(VariantAssign)
  }

  // Return all VariantAssign elements that belong to this look, taking look
  // inheritance into account.
  getActiveVariantAssigns(): VariantAssign[] {
    const activeAssigns: VariantAssign[] = []
    for (const elem of this.traverseInheritance()) {
      activeAssigns.push(...(elem as Look).getVariantAssigns())
    }
    return activeAssigns
  }

  // Remove the VariantAssign, if any, with the given name.
  removeVariantAssign(name: string): void {
    this.removeChildOfType(VariantAssign, name)
  }

  // --- Visibility Elements ---

  // Add a Visibility to the look.
  addVisibility(name = EMPTY_STRING): Visibility {
    return this.addChild(Visibility, name)
  }

  // Return the Visibility, if any, with the given name.
  getVisibility(name: string): Visibility | null {
    return this.getChildOfType(Visibility, name)
  }

  // Return a vector of all Visibility elements in the look.
  getVisibilities(): Visibility[] {
    return this.getChildrenOfType(Visibility)
  }

  // Return all Visibility elements that belong to this look, taking look
  // inheritance into account.
  getActiveVisibilities(): Visibility[] {
    const activeVisibilities: Visibility[] = []
    for (const elem of this.traverseInheritance()) {
      activeVisibilities.push(...(elem as Look).getVisibilities())
    }
    return activeVisibilities
  }

  // Remove the Visibility, if any, with the given name.
  removeVisibility(name: string): void {
    this.removeChildOfType(Visibility, name)
  }
}

// A look group element within a Document.
export class LookGroup extends Element {
  static readonly CATEGORY = 'lookgroup'
  static readonly LOOKS_ATTRIBUTE = 'looks'
  static readonly ACTIVE_ATTRIBUTE = 'active'

  constructor(parent: Element | null, name: string) {
    super(parent, LookGroup.CATEGORY, name)
  }

  // Set the comma-separated list of looks.
  setLooks(looks: string): void {
    this.setAttribute(LookGroup.LOOKS_ATTRIBUTE, looks)
  }

  // Get the comma-separated list of looks.
  getLooks(): string {
    return this.getAttribute(LookGroup.LOOKS_ATTRIBUTE)
  }

  // Set the active look.
  setActiveLook(look: string): void {
    this.setAttribute(LookGroup.ACTIVE_ATTRIBUTE, look)
  }

  // Return the active look, if any.
  getActiveLook(): string {
    return this.getAttribute(LookGroup.ACTIVE_ATTRIBUTE)
  }
}

// A material assignment element within a Look.
export class MaterialAssign extends GeomElement {
  static readonly CATEGORY = 'materialassign'
  static readonly MATERIAL_ATTRIBUTE = 'material'
  static readonly EXCLUSIVE_ATTRIBUTE = 'exclusive'

  constructor(parent: Element | null, name: string) {
    super(parent, MaterialAssign.CATEGORY, name)
  }

  // --- Material String ---

  setMaterial(material: string): void {
    this.setAttribute(MaterialAssign.MATERIAL_ATTRIBUTE, material)
  }

  hasMaterial(): boolean {
    return this.hasAttribute(MaterialAssign.MATERIAL_ATTRIBUTE)
  }

  getMaterial(): string {
    return this.getAttribute(MaterialAssign.MATERIAL_ATTRIBUTE)
  }

  // Return the outputs on any referenced material.
  getMaterialOutputs(): Output[] {
    const materialGraph = this.resolveNameReference(NodeGraph, this.getMaterial())
    if (materialGraph) {
      return materialGraph.getMaterialOutputs()
    }
    return []
  }

  // --- Exclusive ---

  setExclusive(value: boolean): void {
    this.setTypedAttribute(MaterialAssign.EXCLUSIVE_ATTRIBUTE, value)
  }

  getExclusive(): boolean {
    return this.getTypedAttribute(MaterialAssign.EXCLUSIVE_ATTRIBUTE, 'boolean') === true
  }

  // --- Material References ---

  // Return the material node, if any, referenced by the MaterialAssign.
  getReferencedMaterial(): Node | null {
    return this.resolveNameReference(Node, this.getMaterial())
  }

  // --- VariantAssign Elements ---

  // Add a VariantAssign to the material assignment.
  addVariantAssign(name = EMPTY_STRING): VariantAssign {
    return this.addChild(VariantAssign, name)
  }

  // Return the VariantAssign, if any, with the given name.
  getVariantAssign(name: string): VariantAssign | null {
    return this.getChildOfType(VariantAssign, name)
  }

  // Return a vector of all VariantAssign elements in the material
  // assignment.
  getVariantAssigns(): VariantAssign[] {
    return this.getChildrenOfType(VariantAssign)
  }

  // Return all VariantAssign elements that belong to this material
  // assignment, taking inheritance into account.
  getActiveVariantAssigns(): VariantAssign[] {
    const activeAssigns: VariantAssign[] = []
    for (const elem of this.traverseInheritance()) {
      activeAssigns.push(...(elem as MaterialAssign).getVariantAssigns())
    }
    return activeAssigns
  }

  // Remove the VariantAssign, if any, with the given name.
  removeVariantAssign(name: string): void {
    this.removeChildOfType(VariantAssign, name)
  }
}

// A visibility element within a Look, describing the visibility
// relationship between two geometries or geometric collections.
export class Visibility extends GeomElement {
  static readonly CATEGORY = 'visibility'
  static readonly VIEWER_GEOM_ATTRIBUTE = 'viewergeom'
  static readonly VIEWER_COLLECTION_ATTRIBUTE = 'viewercollection'
  static readonly VISIBILITY_TYPE_ATTRIBUTE = 'vistype'
  static readonly VISIBLE_ATTRIBUTE = 'visible'

  constructor(parent: Element | null, name: string) {
    super(parent, Visibility.CATEGORY, name)
  }

  // --- Viewer Geom ---

  setViewerGeom(geom: string): void {
    this.setAttribute(Visibility.VIEWER_GEOM_ATTRIBUTE, geom)
  }

  hasViewerGeom(): boolean {
    return this.hasAttribute(Visibility.VIEWER_GEOM_ATTRIBUTE)
  }

  getViewerGeom(): string {
    return this.getAttribute(Visibility.VIEWER_GEOM_ATTRIBUTE)
  }

  // --- Viewer Collection ---

  setViewerCollection(collection: string): void {
    this.setAttribute(Visibility.VIEWER_COLLECTION_ATTRIBUTE, collection)
  }

  hasViewerCollection(): boolean {
    return this.hasAttribute(Visibility.VIEWER_COLLECTION_ATTRIBUTE)
  }

  getViewerCollection(): string {
    return this.getAttribute(Visibility.VIEWER_COLLECTION_ATTRIBUTE)
  }

  // --- Visibility Type ---

  setVisibilityType(type: string): void {
    this.setAttribute(Visibility.VISIBILITY_TYPE_ATTRIBUTE, type)
  }

  hasVisibilityType(): boolean {
    return this.hasAttribute(Visibility.VISIBILITY_TYPE_ATTRIBUTE)
  }

  getVisibilityType(): string {
    return this.getAttribute(Visibility.VISIBILITY_TYPE_ATTRIBUTE)
  }

  // --- Visible ---

  setVisible(visible: boolean): void {
    this.setTypedAttribute(Visibility.VISIBLE_ATTRIBUTE, visible)
  }

  getVisible(): boolean {
    return this.getTypedAttribute(Visibility.VISIBLE_ATTRIBUTE, 'boolean') === true
  }
}

// Return all MaterialAssign elements that bind this material node to the
// given geometry string.
export function getGeometryBindings(materialNode: Node, geom: string = UNIVERSAL_GEOM_NAME): MaterialAssign[] {
  const matAssigns: MaterialAssign[] = []
  const doc = materialNode.getDocument() as unknown as DocumentLookShape
  for (const look of doc.getLooks()) {
    for (const matAssign of look.getMaterialAssigns()) {
      if (matAssign.getReferencedMaterial() === materialNode) {
        if (geomStringsMatch(matAssign.getActiveGeom(), geom, true)) {
          matAssigns.push(matAssign)
          continue
        }
        const coll = matAssign.getCollection()
        if (coll && coll.matchesGeomString(geom)) {
          matAssigns.push(matAssign)
          continue
        }
      }
    }
  }
  return matAssigns
}

registerElementClass(Look)
registerElementClass(LookGroup)
registerElementClass(MaterialAssign)
registerElementClass(Visibility)
