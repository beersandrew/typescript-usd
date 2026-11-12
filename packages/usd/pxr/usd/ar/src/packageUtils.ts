// Ported from OpenUSD 26.11.1: pxr/usd/ar/packageUtils.cpp,
//  pxr/usd/ar/packageUtils.h
// Copyright 2018 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Package-relative path utilities — a 1:1 port of pxr/usd/ar/packageUtils.cpp.
//
// A package-relative path looks like `foo.pack[bar.file]`, and packages may be
// nested: `foo.pack[bar.pack[baz.file]]`. Delimiter characters ('[' and ']')
// that appear literally inside a packaged path are escaped with a backslash so
// the nesting stays unambiguous. All four public functions below preserve that
// escaping exactly as upstream does.

// Returns the index of the outermost ']' delimiter, or path.length if there is
// none (the path does not end in ']').
function findOutermostClosingDelimiter(path: string): number {
  if (path.length === 0 || path[path.length - 1] !== ']') return path.length
  return path.length - 1
}

// Returns the index of the innermost ']' delimiter, or path.length if none.
function findInnermostClosingDelimiter(path: string): number {
  const n = path.length
  if (n === 0 || path[n - 1] !== ']') return n
  for (let r = 0; r < n; r++) {
    const f = n - 1 - r
    if (path[f] === '\\') {
      // The previous ']' was escaped, so the innermost delimiter is the one
      // just after this escaped character.
      return n - r + 1
    } else if (path[f] !== ']') {
      return n - r
    }
  }
  return n
}

// Given the index of a ']' delimiter, returns the index of the matching '['
// delimiter, or path.length if one can't be found. Escaped delimiters
// (preceded by '\\') are ignored.
function findMatchingOpeningDelimiter(path: string, closingDelim: number): number {
  let numOpenNeeded = 1
  for (let f = closingDelim - 1; f >= 0; f--) {
    const ch = path[f]
    if (ch === '[' || ch === ']') {
      if (f - 1 >= 0 && path[f - 1] === '\\') continue // escaped — ignore
      numOpenNeeded += ch === '[' ? -1 : 1
      if (numOpenNeeded === 0) return f
    }
  }
  return path.length
}

// Escape '[' and ']' in the package portion of a path so they survive being
// enclosed in delimiters. If the path is itself package-relative, the packaged
// portion is assumed already escaped, so only the leading package portion (up
// to the outermost '[') is processed.
function escapeDelimiters(path: string): string {
  if (path.length === 0) return path
  let escapeRangeEnd = path.length
  if (path[path.length - 1] === ']') {
    const outermostOpen = findMatchingOpeningDelimiter(path, path.length - 1)
    if (outermostOpen !== path.length) escapeRangeEnd = outermostOpen
  }
  const head = path.slice(0, escapeRangeEnd)
  return head.replaceAll('[', '\\[').replaceAll(']', '\\]') + path.slice(escapeRangeEnd)
}

// Inverse of escapeDelimiters: restore the 'real' path when extracting a
// packaged path from its delimiters.
function unescapeDelimiters(path: string): string {
  if (path.length === 0) return path
  let escapeRangeEnd = path.length
  if (path[path.length - 1] === ']') {
    const outermostOpen = findMatchingOpeningDelimiter(path, path.length - 1)
    if (outermostOpen !== path.length) escapeRangeEnd = outermostOpen
  }
  const head = path.slice(0, escapeRangeEnd)
  return head.replaceAll('\\[', '[').replaceAll('\\]', ']') + path.slice(escapeRangeEnd)
}

// ArIsPackageRelativePath: true iff the path ends in ']' and that ']' has a
// matching '[' delimiter.
export function ArIsPackageRelativePath(path: string): boolean {
  return path.length > 0 && path[path.length - 1] === ']'
    && findMatchingOpeningDelimiter(path, path.length - 1) !== path.length
}

// ArJoinPackageRelativePath: combine the given paths into a single
// (possibly nested) package-relative path, escaping delimiters as needed.
// Empty paths in the list are skipped.
export function ArJoinPackageRelativePath(paths: string[]): string {
  let i = 0
  while (i < paths.length && paths[i] === '') i++
  if (i >= paths.length) return ''

  let result = paths[i++] as string
  let insertIdx = result.length
  if (result[result.length - 1] === ']') {
    // Insert just before the run of trailing ']' delimiters (i.e. before the
    // innermost closing delimiter).
    let r = 0
    while (r < result.length && result[result.length - 1 - r] === ']') r++
    insertIdx = result.length - r
  }

  for (; i < paths.length; i++) {
    const p = paths[i] as string
    if (p === '') continue
    const pathToInsert = '[' + escapeDelimiters(p) + ']'
    result = result.slice(0, insertIdx) + pathToInsert + result.slice(insertIdx)
    insertIdx += pathToInsert.length - 1
  }

  return result
}

// ArSplitPackageRelativePathOuter: split off the outermost package, e.g.
// "foo.pack[bar.pack[baz.file]]" -> ("foo.pack", "bar.pack[baz.file]").
export function ArSplitPackageRelativePathOuter(path: string): [string, string] {
  const outermostClose = findOutermostClosingDelimiter(path)
  if (outermostClose === path.length) return [path, '']
  const outermostOpen = findMatchingOpeningDelimiter(path, outermostClose)
  if (outermostOpen === path.length) return [path, '']

  const packagePath = path.slice(0, outermostOpen)
  const packagedPath = unescapeDelimiters(path.slice(outermostOpen + 1, outermostClose))
  return [packagePath, packagedPath]
}

// ArSplitPackageRelativePathInner: split off the innermost package, e.g.
// "foo.pack[bar.pack[baz.file]]" -> ("foo.pack[bar.pack]", "baz.file").
export function ArSplitPackageRelativePathInner(path: string): [string, string] {
  const innermostClose = findInnermostClosingDelimiter(path)
  if (innermostClose === path.length) return [path, '']
  const innermostOpen = findMatchingOpeningDelimiter(path, innermostClose)
  if (innermostOpen === path.length) return [path, '']

  const packagePath = path.slice(0, innermostOpen) + path.slice(innermostClose + 1)
  const packagedPath = unescapeDelimiters(path.slice(innermostOpen + 1, innermostClose))
  return [packagePath, packagedPath]
}
