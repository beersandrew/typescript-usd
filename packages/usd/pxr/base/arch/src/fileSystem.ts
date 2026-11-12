// Ported from OpenUSD 26.11.1: pxr/base/arch/fileSystem.cpp,
//  pxr/base/arch/fileSystem.h
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// ArchNormPath, ported from OpenUSD 26.11.1 pxr/base/arch/fileSystem.{h,cpp}.
// Only the path normalization of Arch's file system surface is ported; the
// rest of it (file mappings, temporary files, permissions) has no browser
// counterpart.

type TokenType = 'Elem' | 'Dot' | 'DotDot'

// _GetTokenType (fileSystem.cpp:329-341).
function getTokenType(token: string): TokenType {
  if (token === '.') return 'Dot'
  if (token === '..') return 'DotDot'
  return 'Elem'
}

/**
 * _NormPath (fileSystem.cpp:356-484): zero, one or two leading slashes are
 * kept, per POSIX, and three or more collapse to one; '.' elements are
 * dropped; '..' consumes the preceding element, or is kept when there is
 * none in a relative path; a trailing slash is removed; an empty result is
 * '.'.
 */
function normPath(inPath: string): string {
  let numLeadingSlashes = 0
  while (numLeadingSlashes < inPath.length && inPath[numLeadingSlashes] === '/') ++numLeadingSlashes
  const prefix = '/'.repeat(numLeadingSlashes >= 3 ? 1 : numLeadingSlashes)
  const out: string[] = []
  for (const token of inPath.slice(numLeadingSlashes).split('/')) {
    if (token === '') continue
    switch (getTokenType(token)) {
      case 'Elem':
        out.push(token)
        break
      case 'Dot':
        // Dots are simply ignored.
        break
      case 'DotDot':
        // With no element to consume in a relative path, or after another
        // '..', the '..' is kept; at the root of an absolute path it is
        // dropped.
        if (out.length === 0 ? prefix === '' : out[out.length - 1] === '..') out.push('..')
        else if (out.length > 0) out.pop()
        break
    }
  }
  const path = prefix + out.join('/')
  return path === '' ? '.' : path
}

/**
 * ArchNormPath (fileSystem.h:241-251; fileSystem.cpp:486-512). On Windows
 * backslashes become slashes and a drive specifier is kept (or stripped);
 * this port normalizes POSIX paths, as the non-Windows build does.
 */
export function ArchNormPath(inPath: string, _stripDriveSpecifier = false): string {
  return normPath(inPath)
}
