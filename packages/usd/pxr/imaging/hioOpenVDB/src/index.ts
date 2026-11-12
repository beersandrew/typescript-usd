// Ported from OpenUSD 26.11.1: pxr/imaging/hioOpenVDB/plugInfo.json
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// typescript-usd/hioOpenVDB — OpenUSD v26.11.1 pxr/imaging/hioOpenVDB.
// Importing this entry registers the OpenVDB field texture data for the
// "vdb" field data type with hio (hioOpenVDB/plugInfo.json), which Storm's
// field texture loading then finds by file extension. It depends on the
// vendored @vdb/openvdb package; without this import, volumes bound to .vdb
// fields fall back to Storm's 1x1x1 fallback field texture.
export { HioOpenVDB_TextureData as TextureData } from './vdbTextureData.ts'
export { HioOpenVDBDebugCodes as DebugCodes } from './debugCodes.ts'
