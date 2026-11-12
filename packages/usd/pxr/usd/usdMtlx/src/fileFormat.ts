// Ported from OpenUSD 26.11.1: pxr/usd/usdMtlx/fileFormat.cpp,
//  pxr/usd/usdMtlx/fileFormat.h
// Copyright 2018 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Mirrors pxr/usd/usdMtlx/fileFormat.cpp — registers ".mtlx" as a USD layer
// format. Opening (or referencing) a .mtlx file parses the MaterialX XML,
// resolves nodedefs against the standard library, and authors the UsdMtlxRead
// prim structure into the layer.
//
// The usdMtlx plugin registers this format on import. Bundled MaterialX
// library XML keeps the default document available in browser hosts.

import { FileFormat as SdfFileFormat } from 'typescript-usd/sdf'
import type { Document } from '@mtlx/core'
import { UsdMtlxRead } from './reader.ts'
import { UsdMtlxGetDocument, UsdMtlxReadDocumentFromAsset } from './document.ts'

function getBundledStandardLibraryDocument(): Document {
  const doc = UsdMtlxGetDocument('')
  if (!doc) throw new Error('MaterialX standard library is unavailable')
  return doc
}

export class UsdMtlxFileFormat extends SdfFileFormat {
  // The TfType usdMtlx/plugInfo.json declares for this format.
  static override readonly typeName: string = 'UsdMtlxFileFormat'
  readonly formatId = 'mtlx'
  readonly extensions = ['mtlx']
  read(bytes: Uint8Array, layer: import('typescript-usd/sdf').Layer): void {
    getBundledStandardLibraryDocument()
    // fileFormat.cpp:96-112: UsdMtlxReadDocument(resolvedPath). The bytes
    // are the asset's, read through Ar, so this is utils.cpp's asset branch
    // (_ReadFromAsset, utils.cpp:308-334), XIncludes included; upstream
    // reads a plain file with MaterialX's own file reader instead, which
    // finds XIncludes beside the document as Ar's anchoring does.
    const doc = UsdMtlxReadDocumentFromAsset(layer.resolvedPath || layer.identifier, new TextDecoder().decode(bytes))
    UsdMtlxRead(doc, layer)
  }
}

