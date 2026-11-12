// Ported from OpenUSD 26.11.1: pxr/usd/sdf/assetPathResolver.cpp,
//  pxr/usd/sdf/assetPathResolver.h
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Compatibility path for Sdf's layer-relative asset helpers. Resolver and
// asset ownership live entirely in typescript-usd/ar.
export {
  dirname,
  isAbsolute,
  joinPackagePath,
  normalizePath,
  normalizeRelative,
  resolveAssetPath,
  resolvePath,
  splitPackagePath,
} from 'typescript-usd/ar/_internal'
