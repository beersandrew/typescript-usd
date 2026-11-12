// Ported from OpenUSD 26.11.1: pxr/imaging/hio/glslfx.cpp
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Reading glslfx files ahead of HioGlslfx's synchronous constructor
// (glslfx.ts header, "Files and assets"): the one adaptation of
// pxr/imaging/hio/glslfx.cpp (OpenUSD 26.11.1) to the browser's asynchronous
// I/O. A separate module so that a client that loads imaging lazily can
// register the read ahead before it opens a stage (it depends only on Ar and
// Tf).

import { GetResolver as ArGetResolver, ResolvedPath as ArResolvedPath } from 'typescript-usd/ar'
import {
  _ArDefaultAssetReader,
  _ArReadAhead,
  _ArRegisterAssetPrefetcher,
  type _ArAssetReader,
} from 'typescript-usd/ar/_internal'
import { TfStringStartsWith, TfStringTokenize, TfStringTrimRight } from 'typescript-usd/tf'

// glslfx.cpp:47-58 (_tokens) and glslfx.h:31-50 (HioGlslfxTokens->glslfx).
const _tokens = {
  glslfx: 'glslfx',
  sectionDelimiter: '--',
  commentDelimiter: '---',
  import: '#import',
  toolSubst: '$TOOLS',
} as const

/**
 * Reads the glslfx file `filePath` names, and the files its imports name,
 * through Ar ahead of a synchronous HioGlslfx(filePath): each path is
 * resolved as _ComputeResolvedPath resolves it and read as _ProcessFile and
 * _ProcessImport read it (glslfx.cpp:151-170,252-271,372-403), with
 * `reader`'s resolver. $TOOLS paths name plugin resource files, which need no
 * read ahead. Never rejects; what cannot be read is missing to HioGlslfx.
 */
export async function HioGlslfx_PrefetchAsync(
  filePath: string,
  reader: _ArAssetReader = _ArDefaultAssetReader(),
): Promise<void> {
  await _PrefetchFile('', filePath, reader, new Set())
}

async function _PrefetchFile(containingFile: string, filename: string,
  reader: _ArAssetReader, seenFiles: Set<string>): Promise<void> {
  if (TfStringStartsWith(filename, `${_tokens.toolSubst}/`)) return
  const assetPath =
    ArGetResolver().createIdentifier(filename, new ArResolvedPath(containingFile))
  let read: Awaited<ReturnType<typeof _ArReadAhead>>
  try {
    read = await _ArReadAhead(assetPath, reader)
  } catch {
    return
  }
  if (!read) return
  const resolvedPath = read.resolvedPath.toString()
  if (seenFiles.has(resolvedPath)) return
  seenFiles.add(resolvedPath)

  // The #import lines _ProcessInput hands to _ProcessImport
  // (glslfx.cpp:294-370): in the glslfx section, outside comments.
  const imports: string[] = []
  let sectionType = ''
  const text = new TextDecoder().decode(read.bytes)
  for (const rawLine of text.split('\n')) {
    const line = TfStringTrimRight(rawLine)
    if (line.indexOf(_tokens.commentDelimiter) === 0) continue
    if (line.indexOf(_tokens.sectionDelimiter) === 0) {
      sectionType = TfStringTokenize(line)[1] ?? ''
    } else if (sectionType === _tokens.glslfx && line.indexOf(_tokens.import) === 0) {
      const tokens = TfStringTokenize(line)
      if (tokens.length === 2) imports.push(tokens[1]!)
    }
  }
  await Promise.all(imports.map(file => _PrefetchFile(resolvedPath, file, reader, seenFiles)))
}

// A UsdStage reads ahead the glslfx files its asset-valued attributes name.
_ArRegisterAssetPrefetcher([_tokens.glslfx],
  (resolvedPath, reader) => HioGlslfx_PrefetchAsync(resolvedPath.toString(), reader))
