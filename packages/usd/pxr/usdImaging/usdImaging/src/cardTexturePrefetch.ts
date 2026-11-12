// Ported from OpenUSD 26.11.1: pxr/usdImaging/usdImaging/drawModeStandin.cpp
// Copyright 2022 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Reading the cards draw mode's textures ahead of the synchronous
// HioImage::OpenForReading in GetWorldToScreenFromImageMetadata
// (pxr/usdImaging/usdImaging/drawModeStandin.cpp:1148-1230, OpenUSD 26.11.1),
// which opens each card texture of a prim whose model:cardGeometry is
// fromTexture to read its worldtoscreen matrix: the one adaptation of that
// function to the browser's asynchronous I/O (drawModeStandin.ts header). A
// separate module so that a client that loads imaging lazily can register
// the read ahead before it opens a stage (it depends only on Ar).
//
// A UsdStage reads ahead the asset each model:cardTexture* attribute holds
// (default and time samples, in every used layer) while it opens and on
// flushChanges (usd/src/stage.ts _prepareAssetPaths), before the scene index
// reads it. Every card texture is read ahead, whatever the prim's
// model:cardGeometry: an edit of model:cardGeometry alone (box to
// fromTexture) re-reads the texture metadata without changing any asset
// path, so it would find nothing read ahead. Only the bytes are read here;
// HioImage.OpenForReading opens their header when the cards need it.

import { _ArOpenAssetAhead, _ArRegisterAssetPropertyPrefetcher } from 'typescript-usd/ar/_internal'

/** The card texture attributes of UsdGeomModelAPI (usdGeom/tokens.h,
 *  model:cardTexture{X,Y,Z}{Pos,Neg}), as drawModeStandin.cpp:1243-1248
 *  reads them through UsdImagingGeomModelSchema. */
export const UsdImaging_CardTextureAttributeNames: readonly string[] = [
  'model:cardTextureXPos',
  'model:cardTextureYPos',
  'model:cardTextureZPos',
  'model:cardTextureXNeg',
  'model:cardTextureYNeg',
  'model:cardTextureZNeg',
]

_ArRegisterAssetPropertyPrefetcher(UsdImaging_CardTextureAttributeNames,
  (resolvedPath, reader) => _ArOpenAssetAhead(resolvedPath, reader))
