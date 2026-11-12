// Ported from OpenUSD 26.11.1: pxr/usd/ar/resolverContext.cpp,
//  pxr/usd/ar/resolverContext.h
// Copyright 2020 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

import { _cwd } from './platformFilesystem.ts'

// A context object participates in ArResolverContext identity through the
// operators resolverContext.h:80-90 requires of it: equals (operator==),
// lessThan (operator<) and hash (hash_value).
interface ContextObjectOperators {
  equals?(other: object): boolean
  lessThan?(other: object): boolean
  hash?(): number
}

type ContextArgument = object | ArResolverContext | readonly ArResolverContext[]

export class ArResolverContext {
  // Held objects sorted by type with at most one object per type
  // (resolverContext.cpp:86-103).
  private readonly objects: object[] = []

  // Arguments are ordered strong-to-weak; an ArResolverContext (or a list of
  // them, resolverContext.cpp:21-36) contributes every object it holds, and an
  // object whose type was already added is ignored (resolverContext.h:120-147).
  constructor(...objects: ContextArgument[]) {
    for (const object of objects) {
      if (Array.isArray(object)) {
        for (const context of object as readonly ArResolverContext[]) this._add(context)
      } else {
        this._add(object as object)
      }
    }
  }

  private _add(object: object): void {
    if (object instanceof ArResolverContext) {
      for (const held of object.objects) this._addObject(held)
      return
    }
    this._addObject(object)
  }

  // ArResolverContext::_Add (resolverContext.cpp:86-103).
  private _addObject(object: object): void {
    let index = 0
    for (; index < this.objects.length; index++) {
      const order = compareTypes(this.objects[index]!, object)
      if (order === 0) return
      if (order > 0) break
    }
    this.objects.splice(index, 0, object)
  }

  get empty(): boolean { return this.objects.length === 0 }
  isEmpty(): boolean { return this.objects.length === 0 }

  // ArResolverContext::Get (resolverContext.h:156-168) matches the held
  // object's exact type.
  get<T extends object>(type: abstract new (...args: never[]) => T): T | undefined {
    return this.objects.find(value => value.constructor === type) as T | undefined
  }

  // ArResolverContext::Contains (resolverContext.h:157-172,
  // resolverContext.cpp:29-43): every object of a context, or the one context
  // object, is held here with the same type and an equal value.
  contains(contextOrObject: ArResolverContext | object): boolean {
    const objects = contextOrObject instanceof ArResolverContext
      ? contextOrObject.objects : [contextOrObject]
    return objects.every(obj => this.objects.some(selfObj =>
      selfObj.constructor === obj.constructor && objectEquals(obj, selfObj)))
  }

  getDebugString(): string { return this.objects.map(value => value.constructor.name).join(', ') }

  // ArResolverContext::operator== (resolverContext.cpp:37-55).
  equals(other: ArResolverContext): boolean {
    return this.objects.length === other.objects.length &&
      this.objects.every((value, index) => {
        const candidate = other.objects[index]!
        return value.constructor === candidate.constructor && objectEquals(value, candidate)
      })
  }

  // ArResolverContext::operator< (resolverContext.cpp:57-84).
  lessThan(other: ArResolverContext): boolean {
    if (this.objects.length !== other.objects.length) {
      return this.objects.length < other.objects.length
    }
    for (let index = 0; index < this.objects.length; index++) {
      const lhs = this.objects[index]!
      const rhs = other.objects[index]!
      if (lhs.constructor === rhs.constructor) {
        if (objectLessThan(lhs, rhs)) return true
        if (!objectEquals(lhs, rhs)) return false
      } else {
        return compareTypes(lhs, rhs) < 0
      }
    }
    return false
  }

  // hash_value(ArResolverContext) (resolverContext.h:190-194).
  hash(): number {
    let hash = 0x811c9dc5
    for (const value of this.objects) {
      const objectHash = (value as ContextObjectOperators).hash?.() ?? stringHash(value.constructor.name)
      hash = Math.imul(hash ^ (objectHash >>> 0), 0x01000193) >>> 0
    }
    return hash
  }
}

function objectEquals(lhs: object, rhs: object): boolean {
  if (lhs === rhs) return true
  const equals = (lhs as ContextObjectOperators).equals
  return equals?.call(lhs, rhs) ?? false
}

function objectLessThan(lhs: object, rhs: object): boolean {
  const lessThan = (lhs as ContextObjectOperators).lessThan
  return lessThan?.call(lhs, rhs) ?? false
}

// std::type_index ordering stand-in: a stable order over context object types
// (type name, then first-seen order for distinct types sharing a name).
const typeSequence = new WeakMap<object, number>()
let nextTypeSequence = 0

function typeOrder(type: object): number {
  let order = typeSequence.get(type)
  if (order === undefined) {
    order = nextTypeSequence++
    typeSequence.set(type, order)
  }
  return order
}

function compareTypes(lhs: object, rhs: object): number {
  const lhsType = lhs.constructor
  const rhsType = rhs.constructor
  if (lhsType === rhsType) return 0
  if (lhsType.name !== rhsType.name) return lhsType.name < rhsType.name ? -1 : 1
  return typeOrder(lhsType) - typeOrder(rhsType)
}

function stringHash(value: string): number {
  let hash = 0x811c9dc5
  for (let index = 0; index < value.length; index++) {
    hash = Math.imul(hash ^ value.charCodeAt(index), 0x01000193) >>> 0
  }
  return hash
}

// The resolver-implementation carrier of ar-host-resolver-carrier
// (ar/src/internal.ts): resolver types are registered through Plug/TfType
// (ArDefineResolver); tests and usdGenSchema still carry an implementation in
// a context. This type is private to typescript-usd/ar/_internal.
export class _ArResolverImplementationContext {
  constructor(readonly resolver: import('./resolver.ts').ArResolver) {}
}

// Default resolver search-path context (defaultResolverContext.h).
export class ArDefaultResolverContext {
  readonly searchPath: readonly string[]
  constructor(searchPath: readonly string[] = []) {
    this.searchPath = searchPath
      .filter(path => path !== '')
      .map(path => absoluteSearchPath(path))
  }
  // ArDefaultResolverContext::operator== (defaultResolverContext.cpp:45-49).
  equals(other: ArDefaultResolverContext): boolean {
    return this.searchPath.length === other.searchPath.length
      && this.searchPath.every((path, index) => path === other.searchPath[index])
  }
  // ArDefaultResolverContext::operator< (defaultResolverContext.cpp:39-43):
  // lexicographic comparison of the search paths.
  lessThan(other: ArDefaultResolverContext): boolean {
    const count = Math.min(this.searchPath.length, other.searchPath.length)
    for (let index = 0; index < count; index++) {
      const lhs = this.searchPath[index]!
      const rhs = other.searchPath[index]!
      if (lhs !== rhs) return lhs < rhs
    }
    return this.searchPath.length < other.searchPath.length
  }
  // hash_value(ArDefaultResolverContext) (defaultResolverContext.cpp:72-76).
  hash(): number { return stringHash(this.searchPath.join('\0')) }
}

function absoluteSearchPath(path: string): string {
  if (path.startsWith('/') || /^[a-zA-Z]:[\\/]/.test(path)) return normalizeSearchPath(path)
  const cwd = _cwd()
  return normalizeSearchPath(cwd ? `${cwd}/${path}` : path)
}

function normalizeSearchPath(path: string): string {
  const absolute = path.startsWith('/')
  const prefix = /^[a-zA-Z]:/.exec(path)?.[0] ?? ''
  const parts: string[] = []
  for (const part of path.replaceAll('\\', '/').replace(/^[a-zA-Z]:/, '').split('/')) {
    if (!part || part === '.') continue
    if (part === '..' && parts.length > 0) parts.pop()
    else parts.push(part)
  }
  return `${prefix}${absolute ? '/' : ''}${parts.join('/')}`
}
