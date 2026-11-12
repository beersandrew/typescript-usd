// Ported from OpenUSD 26.11.1: pxr/usd/ar/resolvedPath.cpp,
//  pxr/usd/ar/resolvedPath.h
// Copyright 2020 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// ArResolvedPath — a branded value type wrapping a resolved asset path string.
// Mirrors pxr/usd/ar/resolvedPath.h. The wrapped path is whatever the resolver
// produced; this type exists so a "resolved" path is distinguishable from an
// unresolved asset path in the type system, and so ordering/equality/repr match
// upstream exactly. Comparisons are plain lexicographic string comparisons, and
// (as in C++/Python) an ArResolvedPath compares transparently against a raw
// string.

export class ArResolvedPath {
  private readonly _path: string

  constructor(resolvedPath: string | ArResolvedPath = '') {
    this._path = resolvedPath instanceof ArResolvedPath
      ? resolvedPath._path
      : resolvedPath
  }

  // GetPathString(): the underlying resolved path string.
  getPathString(): string {
    return this._path
  }

  // bool(ArResolvedPath()) is false; any non-empty path is true.
  get valid(): boolean {
    return this._path.length > 0
  }

  // Accepts another ArResolvedPath or a raw string, matching the C++/Python
  // comparison operators that are defined against both.
  private _str(rhs: ArResolvedPath | string): string {
    return rhs instanceof ArResolvedPath ? rhs._path : rhs
  }

  equals(rhs: ArResolvedPath | string): boolean {
    return this._path === this._str(rhs)
  }

  notEquals(rhs: ArResolvedPath | string): boolean {
    return this._path !== this._str(rhs)
  }

  lt(rhs: ArResolvedPath | string): boolean {
    return this._path < this._str(rhs)
  }

  le(rhs: ArResolvedPath | string): boolean {
    return this._path <= this._str(rhs)
  }

  gt(rhs: ArResolvedPath | string): boolean {
    return this._path > this._str(rhs)
  }

  ge(rhs: ArResolvedPath | string): boolean {
    return this._path >= this._str(rhs)
  }

  // str(ArResolvedPath) yields the bare path string.
  toString(): string {
    return this._path
  }

  // repr(ArResolvedPath()) == "Ar.ResolvedPath()";
  // repr(ArResolvedPath("/foo")) == "Ar.ResolvedPath('/foo')".
  repr(): string {
    return this._path ? `Ar.ResolvedPath('${this._path}')` : 'Ar.ResolvedPath()'
  }

  // Hashable on the path string (here, the string itself is the hash key).
  get hash(): string {
    return this._path
  }
}
