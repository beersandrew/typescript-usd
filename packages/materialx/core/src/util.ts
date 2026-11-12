// Ported from MaterialX 1.39.5: source/MaterialXCore/Util.h,
//  source/MaterialXCore/Util.cpp
// Copyright Contributors to the MaterialX Project. Apache License 2.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Mirrors source/MaterialXCore/Util.h and Util.cpp

export const EMPTY_STRING = ''

// Mirrors the version set in the upstream CMakeLists recorded in packages/materialx/PROVENANCE.md.
export const MATERIALX_MAJOR_VERSION = 1
export const MATERIALX_MINOR_VERSION = 39
export const MATERIALX_BUILD_VERSION = 6

export const NAME_PREFIX_SEPARATOR = ':'
export const NAME_PATH_SEPARATOR = '/'
export const ARRAY_VALID_SEPARATORS = ', '
export const ARRAY_PREFERRED_SEPARATOR = ', '

// Maps to string for both keys and values.
export type StringMap = Map<string, string>

// Return the version of the MaterialX library as a string.
export function getVersionString(): string {
  return `${MATERIALX_MAJOR_VERSION}.${MATERIALX_MINOR_VERSION}.${MATERIALX_BUILD_VERSION}`
}

// Return the major, minor, and build versions of the MaterialX library.
export function getVersionIntegers(): [number, number, number] {
  return [MATERIALX_MAJOR_VERSION, MATERIALX_MINOR_VERSION, MATERIALX_BUILD_VERSION]
}

function isValidNameChar(c: string): boolean {
  return /[A-Za-z0-9_:]/.test(c)
}

// Create a valid MaterialX name from the given string.
export function createValidName(name: string, replaceChar = '_'): string {
  let res = ''
  for (const c of name) res += isValidNameChar(c) ? c : replaceChar
  return res
}

// Return true if the given string is a valid MaterialX name.
export function isValidName(name: string): boolean {
  for (const c of name) {
    if (!isValidNameChar(c)) return false
  }
  return true
}

// Increment the numeric suffix of a name.
export function incrementName(name: string): string {
  let split = name.length
  while (split > 0) {
    const c = name[split - 1]!
    if (c < '0' || c > '9') break
    split--
  }
  if (split < name.length) {
    return name.slice(0, split) + String(parseInt(name.slice(split), 10) + 1)
  }
  return name + '2'
}

// Split a string into substrings using the given set of separator characters.
export function splitString(str: string, sep: string): string[] {
  const split: string[] = []
  let current = ''
  for (const c of str) {
    if (sep.includes(c)) {
      if (current.length > 0) {
        split.push(current)
        current = ''
      }
    } else {
      current += c
    }
  }
  if (current.length > 0) split.push(current)
  return split
}

// Join substrings into a single string with the given separator between each.
export function joinStrings(strVec: readonly string[], sep: string): string {
  return strVec.join(sep)
}

// Apply the given substring substitutions to the input string.
export function replaceSubstrings(str: string, stringMap: StringMap): string {
  for (const [key, value] of stringMap) {
    if (!key) continue
    str = str.split(key).join(value)
  }
  return str
}

// Return a copy of the given string with letters converted to lower case.
export function stringToLower(str: string): string {
  return str.toLowerCase()
}

// Return true if the given string starts with the given prefix.
export function stringStartsWith(str: string, prefix: string): boolean {
  return str.startsWith(prefix)
}

// Return true if the given string ends with the given suffix.
export function stringEndsWith(str: string, suffix: string): boolean {
  return str.endsWith(suffix)
}

// Trim leading and trailing spaces from a string.
export function trimSpaces(str: string): string {
  const start = str.search(/[^ ]/)
  if (start === -1) return EMPTY_STRING
  const end = str.length - [...str].reverse().join('').search(/[^ ]/)
  return str.slice(start, end)
}

// Split a name path into a string vector.
export function splitNamePath(namePath: string): string[] {
  return splitString(namePath, NAME_PATH_SEPARATOR)
}

// Create a name path from a string vector.
export function createNamePath(nameVec: readonly string[]): string {
  return joinStrings(nameVec, NAME_PATH_SEPARATOR)
}

// Given a name path, return the parent name path.
export function parentNamePath(namePath: string): string {
  const nameVec = splitNamePath(namePath)
  if (nameVec.length > 0) {
    nameVec.pop()
    return createNamePath(nameVec)
  }
  return EMPTY_STRING
}
