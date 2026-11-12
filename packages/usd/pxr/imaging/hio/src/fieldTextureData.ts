// Ported from OpenUSD 26.11.1: pxr/imaging/hio/fieldTextureData.cpp,
//  pxr/imaging/hio/fieldTextureData.h
// Copyright 2021 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// OpenUSD v26.11.1 pxr/imaging/hio/fieldTextureData.{h,cpp}: volume field
// data read from a file, constructed by the factory registered for the
// file's extension ("fieldDataTypes" in a plugin's plugInfo.json; for .vdb,
// pxr/imaging/hioOpenVDB/plugInfo.json). The raw buffer is a dense voxel
// array of GetFormat() texels, ResizedWidth() x ResizedHeight() x
// ResizedDepth(), x fastest, as upstream's.
//
// Deliberate divergences, forced by the browser and kept together here:
// - Read() is asynchronous: bytes come from the asset resolver, which is
//   asynchronous in the browser (ArResolver::OpenAsset analog).
// - Plugins register a factory at import time (registerFieldTextureData
//   Factory) instead of being discovered from plugInfo.json; the extension
//   lookup and the precedence rank follow HioRankedTypeMap.
import { BBox3d as GfBBox3d } from 'typescript-usd/gf'
import { GetResolver as ArGetResolver } from 'typescript-usd/ar'
import type { ArResolverContext } from 'typescript-usd/ar/_internal'
import type { HioFormat } from './types.ts'
import { TfDiagnosticMgr, TfDiagnosticType, Error as TfError } from 'typescript-usd/tf'

export abstract class HioFieldTextureData {
  // HioFieldTextureData::New (fieldTextureData.cpp:90-121).
  static new(
    filePath: string,
    fieldName: string,
    fieldIndex: number,
    fieldPurpose: string,
    targetMemory: number,
  ): HioFieldTextureData | null {
    const factory = _GetFactory(filePath)
    if (!factory) return null
    const data = factory(filePath, fieldName, fieldIndex, fieldPurpose, targetMemory)
    if (!data) {
      _CodingError(`Cannot get construct field texture data for file '${filePath}'\n`)
      return null
    }
    return data
  }

  /** fieldTextureData.h:58-62. Bounding box describing how the 3d texture
   *  maps into world space. */
  abstract getBoundingBox(): GfBBox3d
  /** fieldTextureData.h:64-68 */
  abstract resizedWidth(): number
  abstract resizedHeight(): number
  abstract resizedDepth(): number
  /** fieldTextureData.h:70 */
  abstract GetFormat(): HioFormat
  /** fieldTextureData.h:72. Resolves false (with a warning) when the field
   *  cannot be read; asynchronous (see the header). */
  abstract Read(resolverContext?: ArResolverContext): Promise<boolean>
  /** fieldTextureData.h:74-76 */
  abstract hasRawBuffer(): boolean
  abstract getRawBuffer(): Uint8Array | null
}

export type HioFieldTextureDataFactory = (
  filePath: string,
  fieldName: string,
  fieldIndex: number,
  fieldPurpose: string,
  targetMemory: number,
) => HioFieldTextureData | null

interface _Registration { factory: HioFieldTextureDataFactory, precedence: number }
const _factories = new Map<string, _Registration>()

// The plugInfo.json "fieldDataTypes" and "precedence" a field texture data
// plugin declares (hioOpenVDB/plugInfo.json). As in HioRankedTypeMap::Add,
// a lower precedence value wins for an extension already registered.
export function registerFieldTextureDataFactory(
  fieldDataTypes: readonly string[],
  factory: HioFieldTextureDataFactory,
  precedence = 0,
): void {
  for (const type of fieldDataTypes) {
    const key = type.toLowerCase()
    const existing = _factories.get(key)
    if (!existing || precedence < existing.precedence) _factories.set(key, { factory, precedence })
  }
}

export function isSupportedFieldDataFile(filePath: string): boolean {
  return _factories.has(ArGetResolver().getExtension(filePath).toLowerCase())
}

// _FieldTextureDataFactoryRegistry::GetFactory (fieldTextureData.cpp:45-74).
function _GetFactory(filePath: string): HioFieldTextureDataFactory | undefined {
  const fileExtension = ArGetResolver().getExtension(filePath).toLowerCase()
  const registration = _factories.get(fileExtension)
  if (!registration) {
    _CodingError(`[PluginLoad] Unknown field data type '${fileExtension}' for file '${filePath}'\n`)
    return undefined
  }
  return registration.factory
}

function _CodingError(message: string): void {
  TfDiagnosticMgr.GetInstance().postError(new TfError(message, TfDiagnosticType.CodingError))
}
