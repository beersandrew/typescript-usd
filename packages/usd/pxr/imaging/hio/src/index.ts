// Ported from OpenUSD 26.11.1: pxr/imaging/hio/image.h
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// typescript-usd/hio — Hio (pxr/imaging/hio): image reading, formats, field
// texture data and glslfx.

// HioImage (pxr/imaging/hio/image.h) as Storm's texture system reads it.
export {
  HioImage,
  HioImageOriginLocation,
  HioImageSourceColorSpace,
  HioImageMakeStorageSpec,
} from './hioImage.ts'
export type { HioImageStorageSpec, HioImageSharedPtr } from './hioImage.ts'
// The image types (loaded here so that the synchronous
// HioImage.OpenForReading finds them, hioImage.ts).
export { Hio_StbImage } from './stbImage.ts'
export { Hio_OpenEXRImage } from './openexrHioImage.ts'
export {
  HioFieldTextureData as FieldTextureData,
  registerFieldTextureDataFactory,
  isSupportedFieldDataFile,
} from './fieldTextureData.ts'
export type { HioFieldTextureDataFactory as FieldTextureDataFactory } from './fieldTextureData.ts'
export { HioDebugCodes as DebugCodes } from './debugCodes.ts'
export { Hio_GetDictionaryFromInput as _GetDictionaryFromInput, Hio_VtValueVectorType as _VtValueVectorType } from './dictionary.ts'
export {
  HioGlslfx as Glslfx,
  HioGlslfxTokens as GlslfxTokens,
  HioGlslfxInputStream as GlslfxInputStream,
  HioGlslfx_PrefetchAsync as Glslfx_PrefetchAsync,
  HIO_GLSLFX_API_VERSION as GLSLFX_API_VERSION,
} from './glslfx.ts'
export {
  HioGlslfxConfig as GlslfxConfig,
  HioGlslfxConfigRole as GlslfxConfigRole,
  HioGlslfxConfigParameter as GlslfxConfigParameter,
  HioGlslfxConfigTexture as GlslfxConfigTexture,
  HioGlslfxConfigAttribute as GlslfxConfigAttribute,
  HIO_GLSLFX_DEFAULT_VALUE_VALIDATION as GLSLFX_DEFAULT_VALUE_VALIDATION,
} from './glslfxConfig.ts'
export type {
  HioGlslfxConfigParameters as GlslfxConfigParameters,
  HioGlslfxConfigTextures as GlslfxConfigTextures,
  HioGlslfxConfigAttributes as GlslfxConfigAttributes,
  HioGlslfxConfigSourceKeys as GlslfxConfigSourceKeys,
  HioGlslfxConfigMetadataDictionary as GlslfxConfigMetadataDictionary,
} from './glslfxConfig.ts'
export {
  HioGlslfxResourceLayout as GlslfxResourceLayout,
  HioGlslfxResourceLayoutTokens as GlslfxResourceLayoutTokens,
  HioGlslfxResourceLayoutInOut as GlslfxResourceLayoutInOut,
  HioGlslfxResourceLayoutKind as GlslfxResourceLayoutKind,
  HioGlslfxResourceLayoutMember as GlslfxResourceLayoutMember,
  HioGlslfxResourceLayoutElement as GlslfxResourceLayoutElement,
  HioGlslfxResourceLayoutTextureType as GlslfxResourceLayoutTextureType,
  HioGlslfxResourceLayoutTextureElement as GlslfxResourceLayoutTextureElement,
} from './glslfxResourceLayout.ts'
export type {
  HioGlslfxResourceLayoutShaderStage as GlslfxResourceLayoutShaderStage,
  HioGlslfxResourceLayoutMemberVector as GlslfxResourceLayoutMemberVector,
  HioGlslfxResourceLayoutElementVector as GlslfxResourceLayoutElementVector,
  HioGlslfxResourceLayoutTextureElementVector as GlslfxResourceLayoutTextureElementVector,
} from './glslfxResourceLayout.ts'
// The glslfx surface under its upstream names as well (as the hgi barrel
// exports Hgi* names), for the hdSt port that mirrors upstream spellings.
export {
  HioGlslfx,
  HioGlslfxTokens,
  HioGlslfxInputStream,
  HioGlslfx_PrefetchAsync,
  HIO_GLSLFX_API_VERSION,
} from './glslfx.ts'
export {
  HioGlslfxConfig,
  HioGlslfxConfigRole,
  HioGlslfxConfigParameter,
  HioGlslfxConfigTexture,
  HioGlslfxConfigAttribute,
} from './glslfxConfig.ts'
export type {
  HioGlslfxConfigParameters,
  HioGlslfxConfigTextures,
  HioGlslfxConfigAttributes,
  HioGlslfxConfigSourceKeys,
  HioGlslfxConfigMetadataDictionary,
} from './glslfxConfig.ts'
export {
  HioGlslfxResourceLayout,
  HioGlslfxResourceLayoutTokens,
  HioGlslfxResourceLayoutInOut,
  HioGlslfxResourceLayoutKind,
  HioGlslfxResourceLayoutMember,
  HioGlslfxResourceLayoutElement,
  HioGlslfxResourceLayoutTextureType,
  HioGlslfxResourceLayoutTextureElement,
} from './glslfxResourceLayout.ts'
export type {
  HioGlslfxResourceLayoutShaderStage,
  HioGlslfxResourceLayoutMemberVector,
  HioGlslfxResourceLayoutElementVector,
  HioGlslfxResourceLayoutTextureElementVector,
} from './glslfxResourceLayout.ts'
// pxr/imaging/hio/types.h under upstream names and prefix-stripped aliases.
export {
  HioFormat,
  HioAddressDimension,
  HioAddressMode,
  HioType,
  HioGetFormat,
  HioGetHioType,
  HioGetComponentCount,
  HioGetDataSizeOfType,
  HioGetDataSizeOfTypeFromFormat,
  HioGetDataSizeOfFormat,
  HioIsCompressed,
  HioGetDataSize,
  HioFormat as Format,
  HioAddressDimension as AddressDimension,
  HioAddressMode as AddressMode,
  HioType as Type,
  HioGetFormat as GetFormat,
  HioGetHioType as GetHioType,
  HioGetComponentCount as GetComponentCount,
  HioGetDataSizeOfType as GetDataSizeOfType,
  HioGetDataSizeOfTypeFromFormat as GetDataSizeOfTypeFromFormat,
  HioGetDataSizeOfFormat as GetDataSizeOfFormat,
  HioIsCompressed as IsCompressed,
  HioGetDataSize as GetDataSize,
} from './types.ts'
export type { HioBlockSize, HioBlockSize as BlockSize } from './types.ts'
