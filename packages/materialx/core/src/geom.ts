// Ported from MaterialX 1.39.5: source/MaterialXCore/Geom.h,
//  source/MaterialXCore/Geom.cpp
// Copyright Contributors to the MaterialX Project. Apache License 2.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Mirrors source/MaterialXCore/Geom.h and Geom.cpp

import {
  Element,
  TypedElement,
  ValueElement,
  Token,
  StringResolver,
  registerElementClass,
  _internals,
  UDIM_TOKEN,
  UV_TILE_TOKEN,
} from './element.ts'
import { ExceptionFoundCycle } from './traversal.ts'
import { GEOMNAME_TYPE_STRING } from './types.ts'
import { ARRAY_VALID_SEPARATORS, EMPTY_STRING, joinStrings, splitString } from './util.ts'
import type { ValueData } from './value.ts'

export const GEOM_PATH_SEPARATOR = '/'
export const UNIVERSAL_GEOM_NAME = GEOM_PATH_SEPARATOR
export const UDIM_SET_PROPERTY = 'udimset'
export { UDIM_TOKEN, UV_TILE_TOKEN }

// A MaterialX geometry path, representing the hierarchical location
// expressed by a geometry name.
export class GeomPath {
  private _vec: string[]
  private _empty: boolean

  constructor(geom = '') {
    this._vec = splitString(geom, GEOM_PATH_SEPARATOR)
    this._empty = geom === ''
  }

  // Convert a path to a geometry name string.
  toString(): string {
    if (this._vec.length === 0) {
      return this._empty ? EMPTY_STRING : UNIVERSAL_GEOM_NAME
    }
    return GEOM_PATH_SEPARATOR + joinStrings(this._vec, GEOM_PATH_SEPARATOR)
  }

  equals(rhs: GeomPath): boolean {
    return this._empty === rhs._empty && this._vec.length === rhs._vec.length && this._vec.every((v, i) => v === rhs._vec[i])
  }

  // Return true if there is any geometry in common between the two paths.
  // When contains is true, the first path must completely contain the
  // second one.
  isMatching(rhs: GeomPath, contains = false): boolean {
    if (this._empty || rhs._empty) {
      return false
    }
    if (contains && this._vec.length > rhs._vec.length) {
      return false
    }
    const minSize = Math.min(this._vec.length, rhs._vec.length)
    for (let i = 0; i < minSize; i++) {
      if (this._vec[i] !== rhs._vec[i]) {
        return false
      }
    }
    return true
  }

  // Return true if this geometry path is empty. An empty path matches no
  // other geometry paths.
  isEmpty(): boolean {
    return this._empty
  }

  // Return true if this geometry path is universal. A universal path
  // matches all non-empty geometry paths.
  isUniversal(): boolean {
    return this._vec.length === 0 && !this._empty
  }
}

// Given two geometry strings, each containing an array of geom names,
// return true if they have any geometries in common.
//
// An empty geometry string matches no geometries, while the universal
// geometry string "/" matches all non-empty geometries.
export function geomStringsMatch(geom1: string, geom2: string, contains = false): boolean {
  const paths1 = splitString(geom1, ARRAY_VALID_SEPARATORS).map((name) => new GeomPath(name))
  for (const name2 of splitString(geom2, ARRAY_VALID_SEPARATORS)) {
    const path2 = new GeomPath(name2)
    for (const path1 of paths1) {
      if (path1.isMatching(path2, contains)) {
        return true
      }
    }
  }
  return false
}

// The base class for geometric elements, which support bindings to
// geometries and geometric collections.
export class GeomElement extends Element {
  static readonly GEOM_ATTRIBUTE = 'geom'
  static readonly COLLECTION_ATTRIBUTE = 'collection'

  // --- Geometry ---

  setGeom(geom: string): void {
    this.setAttribute(GeomElement.GEOM_ATTRIBUTE, geom)
  }

  hasGeom(): boolean {
    return this.hasAttribute(GeomElement.GEOM_ATTRIBUTE)
  }

  getGeom(): string {
    return this.getAttribute(GeomElement.GEOM_ATTRIBUTE)
  }

  // Return the active geometry string of this element, taking all geometry
  // string substitutions at this scope into account.
  getActiveGeom(): string {
    return this.hasGeom()
      ? this.createStringResolver().resolve(this.getGeom(), GEOMNAME_TYPE_STRING)
      : EMPTY_STRING
  }

  // --- Collection ---

  setCollectionString(collection: string): void {
    this.setAttribute(GeomElement.COLLECTION_ATTRIBUTE, collection)
  }

  hasCollectionString(): boolean {
    return this.hasAttribute(GeomElement.COLLECTION_ATTRIBUTE)
  }

  getCollectionString(): string {
    return this.getAttribute(GeomElement.COLLECTION_ATTRIBUTE)
  }

  // Assign a Collection to this element.
  setCollection(collection: Collection | null): void {
    if (collection) {
      this.setCollectionString(collection.getName())
    } else {
      this.removeAttribute(GeomElement.COLLECTION_ATTRIBUTE)
    }
  }

  // Return the Collection that is assigned to this element.
  getCollection(): Collection | null {
    return this.resolveNameReference(Collection, this.getCollectionString())
  }

  // --- Validation ---

  override validate(message?: string[]): boolean {
    let res = true
    if (this.hasCollectionString()) {
      res = this.validateRequire(this.getCollection() !== null, res, message, 'Invalid collection string')
    }
    return super.validate(message) && res
  }
}

// A geometry info element within a Document.
export class GeomInfo extends GeomElement {
  static readonly CATEGORY = 'geominfo'

  constructor(parent: Element | null, name: string) {
    super(parent, GeomInfo.CATEGORY, name)
  }

  // --- GeomProp Elements ---

  // Add a GeomProp to this element.
  addGeomProp(name = EMPTY_STRING): GeomProp {
    return this.addChild(GeomProp, name)
  }

  // Return the GeomProp, if any, with the given name.
  getGeomProp(name: string): GeomProp | null {
    return this.getChildOfType(GeomProp, name)
  }

  // Return a vector of all GeomProp elements.
  getGeomProps(): GeomProp[] {
    return this.getChildrenOfType(GeomProp)
  }

  // Remove the GeomProp, if any, with the given name.
  removeGeomProp(name: string): void {
    this.removeChildOfType(GeomProp, name)
  }

  // --- Tokens ---

  // Add a Token to this element.
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

  // --- Values ---

  // Set the value of a GeomProp by its name, creating a child element to
  // hold the GeomProp if needed.
  setGeomPropValue(name: string, value: ValueData, type = EMPTY_STRING): GeomProp {
    let geomProp = this.getChildOfType(GeomProp, name)
    if (!geomProp) {
      geomProp = this.addGeomProp(name)
    }
    geomProp.setValue(value, type)
    return geomProp
  }

  // Set the string value of a Token by its name, creating a child element
  // to hold the Token if needed.
  setTokenValue(name: string, value: string): Token {
    let token = this.getToken(name)
    if (!token) token = this.addToken(name)
    token.setValue(value, 'string')
    return token
  }
}

// A geometric property element within a GeomInfo.
export class GeomProp extends ValueElement {
  static readonly CATEGORY = 'geomprop'

  constructor(parent: Element | null, name: string) {
    super(parent, GeomProp.CATEGORY, name)
  }
}

// An element representing a declaration of geometric property data.
//
// A GeomPropDef element contains a reference to a geometric node and a set
// of modifiers for that node.
export class GeomPropDef extends TypedElement {
  static readonly CATEGORY = 'geompropdef'
  static readonly GEOM_PROP_ATTRIBUTE = 'geomprop'
  static readonly SPACE_ATTRIBUTE = 'space'
  static readonly INDEX_ATTRIBUTE = 'index'

  constructor(parent: Element | null, name: string) {
    super(parent, GeomPropDef.CATEGORY, name)
  }

  // --- Geometric Property ---

  setGeomProp(node: string): void {
    this.setAttribute(GeomPropDef.GEOM_PROP_ATTRIBUTE, node)
  }

  hasGeomProp(): boolean {
    return this.hasAttribute(GeomPropDef.GEOM_PROP_ATTRIBUTE)
  }

  getGeomProp(): string {
    return this.getAttribute(GeomPropDef.GEOM_PROP_ATTRIBUTE)
  }

  // --- Geometric Space ---

  setSpace(space: string): void {
    this.setAttribute(GeomPropDef.SPACE_ATTRIBUTE, space)
  }

  hasSpace(): boolean {
    return this.hasAttribute(GeomPropDef.SPACE_ATTRIBUTE)
  }

  getSpace(): string {
    return this.getAttribute(GeomPropDef.SPACE_ATTRIBUTE)
  }

  // --- Geometric Index ---

  setIndex(index: string): void {
    this.setAttribute(GeomPropDef.INDEX_ATTRIBUTE, index)
  }

  hasIndex(): boolean {
    return this.hasAttribute(GeomPropDef.INDEX_ATTRIBUTE)
  }

  getIndex(): string {
    return this.getAttribute(GeomPropDef.INDEX_ATTRIBUTE)
  }
}

// A collection element within a Document.
export class Collection extends Element {
  static readonly CATEGORY = 'collection'
  static readonly INCLUDE_GEOM_ATTRIBUTE = 'includegeom'
  static readonly EXCLUDE_GEOM_ATTRIBUTE = 'excludegeom'
  static readonly INCLUDE_COLLECTION_ATTRIBUTE = 'includecollection'

  constructor(parent: Element | null, name: string) {
    super(parent, Collection.CATEGORY, name)
  }

  // --- Include Geometry ---

  setIncludeGeom(geom: string): void {
    this.setAttribute(Collection.INCLUDE_GEOM_ATTRIBUTE, geom)
  }

  hasIncludeGeom(): boolean {
    return this.hasAttribute(Collection.INCLUDE_GEOM_ATTRIBUTE)
  }

  getIncludeGeom(): string {
    return this.getAttribute(Collection.INCLUDE_GEOM_ATTRIBUTE)
  }

  // Return the active include geometry string of this element, taking all
  // geometry string substitutions at this scope into account.
  getActiveIncludeGeom(): string {
    return this.hasIncludeGeom()
      ? this.createStringResolver().resolve(this.getIncludeGeom(), GEOMNAME_TYPE_STRING)
      : EMPTY_STRING
  }

  // --- Exclude Geometry ---

  setExcludeGeom(geom: string): void {
    this.setAttribute(Collection.EXCLUDE_GEOM_ATTRIBUTE, geom)
  }

  hasExcludeGeom(): boolean {
    return this.hasAttribute(Collection.EXCLUDE_GEOM_ATTRIBUTE)
  }

  getExcludeGeom(): string {
    return this.getAttribute(Collection.EXCLUDE_GEOM_ATTRIBUTE)
  }

  // Return the active exclude geometry string of this element, taking all
  // geometry string substitutions at this scope into account.
  getActiveExcludeGeom(): string {
    return this.hasExcludeGeom()
      ? this.createStringResolver().resolve(this.getExcludeGeom(), GEOMNAME_TYPE_STRING)
      : EMPTY_STRING
  }

  // --- Include Collection ---

  setIncludeCollectionString(collection: string): void {
    this.setAttribute(Collection.INCLUDE_COLLECTION_ATTRIBUTE, collection)
  }

  hasIncludeCollectionString(): boolean {
    return this.hasAttribute(Collection.INCLUDE_COLLECTION_ATTRIBUTE)
  }

  getIncludeCollectionString(): string {
    return this.getAttribute(Collection.INCLUDE_COLLECTION_ATTRIBUTE)
  }

  // Set the collection that is directly included by this element.
  setIncludeCollection(collection: Collection | null): void {
    if (collection) {
      this.setIncludeCollectionString(collection.getName())
    } else {
      this.removeAttribute(Collection.INCLUDE_COLLECTION_ATTRIBUTE)
    }
  }

  // Set the vector of collections that are directly included by this
  // element.
  setIncludeCollections(collections: Collection[]): void {
    if (collections.length > 0) {
      this.setTypedAttribute(
        Collection.INCLUDE_COLLECTION_ATTRIBUTE,
        collections.map((c) => c.getName()),
        'stringarray',
      )
    } else {
      this.removeAttribute(Collection.INCLUDE_COLLECTION_ATTRIBUTE)
    }
  }

  // Return the vector of collections that are directly included by this
  // element.
  getIncludeCollections(): Collection[] {
    const vec: Collection[] = []
    const names = (this.getTypedAttribute(Collection.INCLUDE_COLLECTION_ATTRIBUTE, 'stringarray') as string[] | null) ?? []
    for (const str of names) {
      const collection = this.resolveNameReference(Collection, str)
      if (collection) {
        vec.push(collection)
      }
    }
    return vec
  }

  // Return true if the include chain for this element contains a cycle.
  hasIncludeCycle(): boolean {
    try {
      this.matchesGeomString(UNIVERSAL_GEOM_NAME)
    } catch (err) {
      if (err instanceof ExceptionFoundCycle) return true
      throw err
    }
    return false
  }

  // --- Geometry Matching ---

  // Return true if this collection and the given geometry string have any
  // geometries in common. Throws ExceptionFoundCycle on include cycles.
  matchesGeomString(geom: string): boolean {
    if (geomStringsMatch(this.getActiveExcludeGeom(), geom, true)) {
      return false
    }
    if (geomStringsMatch(this.getActiveIncludeGeom(), geom)) {
      return true
    }

    const includedSet = new Set<Collection>()
    const includedVec = this.getIncludeCollections()
    for (let i = 0; i < includedVec.length; i++) {
      const collection = includedVec[i]!
      if (includedSet.has(collection)) {
        throw new ExceptionFoundCycle('Encountered a cycle in collection: ' + this.getName())
      }
      includedSet.add(collection)
      includedVec.push(...collection.getIncludeCollections())
    }
    for (const collection of includedSet) {
      if (collection.matchesGeomString(geom)) {
        return true
      }
    }

    return false
  }

  // --- Validation ---

  override validate(message?: string[]): boolean {
    let res = true
    res = this.validateRequire(!this.hasIncludeCycle(), res, message, 'Cycle in collection include chain')
    return super.validate(message) && res
  }
}

registerElementClass(GeomInfo)
registerElementClass(GeomProp)
registerElementClass(GeomPropDef)
registerElementClass(Collection)
_internals.geomStringsMatch = geomStringsMatch

// Re-exported so consumers can construct resolvers directly.
export { StringResolver }
