// Ported from MaterialX 1.39.5: source/MaterialXCore/Property.h,
//  source/MaterialXCore/Property.cpp
// Copyright Contributors to the MaterialX Project. Apache License 2.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Mirrors source/MaterialXCore/Property.h and Property.cpp

import { Element, ValueElement, registerElementClass } from './element.ts'
import { GeomElement, Collection } from './geom.ts'
import { EMPTY_STRING } from './util.ts'
import { Value, type ValueData } from './value.ts'

// A property element within a PropertySet.
export class Property extends ValueElement {
  static readonly CATEGORY = 'property'

  constructor(parent: Element | null, name: string) {
    super(parent, Property.CATEGORY, name)
  }
}

// A property assignment element within a Look.
export class PropertyAssign extends ValueElement {
  static readonly CATEGORY = 'propertyassign'
  static readonly PROPERTY_ATTRIBUTE = 'property'
  static readonly GEOM_ATTRIBUTE = 'geom'
  static readonly COLLECTION_ATTRIBUTE = 'collection'

  constructor(parent: Element | null, name: string) {
    super(parent, PropertyAssign.CATEGORY, name)
  }

  // --- Property ---

  setProperty(property: string): void {
    this.setAttribute(PropertyAssign.PROPERTY_ATTRIBUTE, property)
  }

  hasProperty(): boolean {
    return this.hasAttribute(PropertyAssign.PROPERTY_ATTRIBUTE)
  }

  getProperty(): string {
    return this.getAttribute(PropertyAssign.PROPERTY_ATTRIBUTE)
  }

  // --- Geometry ---

  setGeom(geom: string): void {
    this.setAttribute(PropertyAssign.GEOM_ATTRIBUTE, geom)
  }

  hasGeom(): boolean {
    return this.hasAttribute(PropertyAssign.GEOM_ATTRIBUTE)
  }

  getGeom(): string {
    return this.getAttribute(PropertyAssign.GEOM_ATTRIBUTE)
  }

  // --- Collection ---

  setCollectionString(collection: string): void {
    this.setAttribute(PropertyAssign.COLLECTION_ATTRIBUTE, collection)
  }

  hasCollectionString(): boolean {
    return this.hasAttribute(PropertyAssign.COLLECTION_ATTRIBUTE)
  }

  getCollectionString(): string {
    return this.getAttribute(PropertyAssign.COLLECTION_ATTRIBUTE)
  }

  // Assign a Collection to this element.
  setCollection(collection: Collection | null): void {
    if (collection) {
      this.setCollectionString(collection.getName())
    } else {
      this.removeAttribute(PropertyAssign.COLLECTION_ATTRIBUTE)
    }
  }

  // Return the Collection that is assigned to this element.
  getCollection(): Collection | null {
    return this.resolveNameReference(Collection, this.getCollectionString())
  }
}

// A property set element within a Document.
export class PropertySet extends Element {
  static readonly CATEGORY = 'propertyset'

  constructor(parent: Element | null, name: string) {
    super(parent, PropertySet.CATEGORY, name)
  }

  // --- Properties ---

  // Add a Property to the set.
  addProperty(name: string): Property {
    return this.addChild(Property, name)
  }

  // Return the Property, if any, with the given name.
  getProperty(name: string): Property | null {
    return this.getChildOfType(Property, name)
  }

  // Return a vector of all Property elements in the set.
  getProperties(): Property[] {
    return this.getChildrenOfType(Property)
  }

  // Remove the Property with the given name, if present.
  removeProperty(name: string): void {
    this.removeChildOfType(Property, name)
  }

  // --- Values ---

  // Set the typed value of a property by its name, creating a child element
  // to hold the property if needed.
  setPropertyValue(name: string, value: ValueData, type = EMPTY_STRING): Property {
    let property = this.getChildOfType(Property, name)
    if (!property) {
      property = this.addProperty(name)
    }
    property.setValue(value, type)
    return property
  }

  // Return the typed value of a property by its name, or null if the given
  // property is not found.
  getPropertyValue(name: string): Value | null {
    const property = this.getProperty(name)
    return property ? property.getValue() : null
  }
}

// A property set assignment element within a Look.
export class PropertySetAssign extends GeomElement {
  static readonly CATEGORY = 'propertysetassign'
  static readonly PROPERTY_SET_ATTRIBUTE = 'propertyset'

  constructor(parent: Element | null, name: string) {
    super(parent, PropertySetAssign.CATEGORY, name)
  }

  // --- Property Set ---

  setPropertySetString(propertySet: string): void {
    this.setAttribute(PropertySetAssign.PROPERTY_SET_ATTRIBUTE, propertySet)
  }

  hasPropertySetString(): boolean {
    return this.hasAttribute(PropertySetAssign.PROPERTY_SET_ATTRIBUTE)
  }

  getPropertySetString(): string {
    return this.getAttribute(PropertySetAssign.PROPERTY_SET_ATTRIBUTE)
  }

  // Assign a property set to this element.
  setPropertySet(propertySet: PropertySet | null): void {
    if (propertySet) {
      this.setPropertySetString(propertySet.getName())
    } else {
      this.removeAttribute(PropertySetAssign.PROPERTY_SET_ATTRIBUTE)
    }
  }

  // Return the property set that is assigned to this element.
  getPropertySet(): PropertySet | null {
    return this.resolveNameReference(PropertySet, this.getPropertySetString())
  }
}

registerElementClass(Property)
registerElementClass(PropertyAssign)
registerElementClass(PropertySet)
registerElementClass(PropertySetAssign)
