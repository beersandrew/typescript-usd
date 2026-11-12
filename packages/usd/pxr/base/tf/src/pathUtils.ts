// Ported from OpenUSD 26.11.1: pxr/base/tf/pathUtils.cpp,
//  pxr/base/tf/pathUtils.h
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// TfNormPath and TfGetExtension, ported from OpenUSD 26.11.1
// pxr/base/tf/pathUtils.{h,cpp}. The functions that query the file system
// (TfRealPath, TfGlob, TfReadLink) are not ported here: Tf has no file system
// access in a browser.

import { ArchNormPath } from 'typescript-usd/arch'
import { stringGetBeforeSuffix, stringGetSuffix, TfGetBaseName } from './stringUtils.ts'

/** TfNormPath (pathUtils.h:56-70; pathUtils.cpp:209-213). */
export function TfNormPath(inPath: string, stripDriveSpecifier = false): string {
  return ArchNormPath(inPath, stripDriveSpecifier)
}

/** TfGetExtension (pathUtils.h:103-116; pathUtils.cpp:221-239): the
 *  extension of the path's base name, without the dot; empty for a dot file
 *  with no extension. */
export function TfGetExtension(path: string): string {
  if (path === '') return ''
  const fileName = TfGetBaseName(path)
  // If this is a dot file with no extension (e.g. /some/path/.folder), then
  // we return an empty string.
  if (stringGetBeforeSuffix(fileName) === '') return ''
  return stringGetSuffix(fileName)
}
