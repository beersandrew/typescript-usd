// Ported from OpenUSD 26.11.1: pxr/usd/usdUtils/usdzPackage.cpp,
//  pxr/usd/usdUtils/usdzPackage.h
// Copyright 2023 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/usd/usdUtils/usdzPackage.{h,cpp} (OpenUSD 26.11.1).
//
// Packaging resolves and opens assets and writes the archive, which are
// asynchronous in this port, so both functions return Promises.

import {
  AssetPath as SdfAssetPath, ZipFileWriter as SdfZipFileWriter,
} from 'typescript-usd/sdf'
import { GetResolver as ArGetResolver } from 'typescript-usd/ar'
import { _deleteFile, _makeTmpFileName } from 'typescript-usd/ar/_internal'
import { Stage as UsdStage } from 'typescript-usd/usd'
import { ArchNormPath } from 'typescript-usd/arch'
import { Debug as TfDebug, TF_WARN, TfGetBaseName } from 'typescript-usd/tf'
import { UsdUtils_ExtractExternalReferences, UsdUtils_LocalizationReferenceType } from './assetLocalization.ts'
import { UsdUtils_AssetLocalizationPackage } from './assetLocalizationPackage.ts'
import { UsdUtilsDebugCodes } from './debugCodes.ts'
import { UsdUtilsExtractExternalReferencesParams } from './dependencies.ts'

// usdzPackage.cpp:27-63
class UsdUtils_UsdzPackageBuilder extends UsdUtils_AssetLocalizationPackage {
  #writer: SdfZipFileWriter | undefined

  // Creates the usdz archive from all discovered dependencies of the asset.
  override async write(usdzFilePath: string): Promise<boolean> {
    this.#writer = await SdfZipFileWriter.createNew(usdzFilePath)

    const success = await super.write(usdzFilePath)

    // `success && _writer.Save()`: a writer that is not saved is saved by
    // its destructor upstream (zipFile.cpp:965-970).
    const saved = this.#writer.isValid() ? await this.#writer.save() : false
    return success && saved
  }

  protected override async _writeToPackage(source: string, dest: string): Promise<boolean> {
    const resolvedPath = await ArGetResolver().resolve(source)

    if (!resolvedPath.valid) return false

    const inPackagePath = this.#writer!.addFile(resolvedPath.toString(), dest)

    return inPackagePath !== ''
  }
}

// usdzPackage.cpp:65-85
async function createNewUsdzPackage(
  assetPath: SdfAssetPath,
  usdzFilePath: string,
  firstLayerName: string,
  origRootFilePath = '',
  dependenciesToSkip: readonly string[] = [],
  editLayersInPlace = false,
): Promise<boolean> {
  const builder = new UsdUtils_UsdzPackageBuilder()
  builder.setOriginalRootFilePath(origRootFilePath)
  builder.setDependenciesToSkip(dependenciesToSkip)
  builder.setEditLayersInPlace(editLayersInPlace)

  if (!await builder.build(assetPath, firstLayerName)) return false

  return builder.write(usdzFilePath)
}

const toAssetPath = (assetPath: SdfAssetPath | string): SdfAssetPath =>
  assetPath instanceof SdfAssetPath ? assetPath : new SdfAssetPath(assetPath)

/**
 * Creates a USDZ package containing the specified asset, identified by its
 * `assetPath`, with a localized version of the asset itself and all of its
 * external dependencies. `firstLayerName` optionally renames the first layer
 * of the asset in the package. With `editLayersInPlace` the layers are
 * modified in place; otherwise anonymous copies of modified layers are
 * written. Resolves to true if the package was created successfully
 * (usdzPackage.h:24-69; usdzPackage.cpp:87-103).
 */
export function UsdUtilsCreateNewUsdzPackage(
  assetPath: SdfAssetPath | string,
  usdzFilePath: string,
  firstLayerName = '',
  editLayersInPlace = false,
): Promise<boolean> {
  return createNewUsdzPackage(
    toAssetPath(assetPath),
    usdzFilePath,
    firstLayerName,
    /* origRootFilePath */ '',
    /* dependenciesToSkip */ [],
    editLayersInPlace)
}

/**
 * Similar to UsdUtilsCreateNewUsdzPackage, packages all of the dependencies
 * of the given asset under the constraints of the initial usdz
 * implementation in ARKit: the root layer gets the ".usdc" extension, and an
 * asset whose root layer has composition arcs to external files is
 * flattened to a single .usdc layer first (usdzPackage.h:71-117;
 * usdzPackage.cpp:105-209).
 */
export async function UsdUtilsCreateNewARKitUsdzPackage(
  assetPath: SdfAssetPath | string,
  inUsdzFilePath: string,
  firstLayerName = '',
  editLayersInPlace = false,
): Promise<boolean> {
  const asset = toAssetPath(assetPath)
  const resolver = ArGetResolver()

  const usdzFilePath = ArchNormPath(inUsdzFilePath)

  const resolvedPath = (await resolver.resolve(asset.getAssetPath())).toString()
  if (resolvedPath === '') return false

  // Check if the given asset has external dependencies that participate in
  // the composition of the stage.
  const sublayers: string[] = [], references: string[] = [], payloads: string[] = []

  // We are explicitly setting the UDIM path resolution option to false
  // here because the following logic only cares if the root layer contains
  // any external references and does reason about the contents of the
  // results. UDIM path resolution has the potential to be expensive, for
  // example in the case of network filesystem paths.
  const params = new UsdUtilsExtractExternalReferencesParams()
  params.setResolveUdimPaths(false)

  await UsdUtils_ExtractExternalReferences(resolvedPath,
    UsdUtils_LocalizationReferenceType.CompositionOnly,
    sublayers, references, payloads, params)

  // Ensure that the root layer has the ".usdc" extension.
  let targetBaseName = firstLayerName === '' ? TfGetBaseName(asset.getAssetPath()) : firstLayerName
  const fileExt = resolver.getExtension(targetBaseName)
  let renamingRootLayer = false
  if (fileExt !== 'usdc') {
    renamingRootLayer = true
    targetBaseName = targetBaseName.slice(0, targetBaseName.lastIndexOf('.') + 1) + 'usdc'
  }

  // If there are no external dependencies needed for composition, we can
  // invoke the regular packaging function.
  if (sublayers.length === 0 && references.length === 0 && payloads.length === 0) {
    if (renamingRootLayer) {
      return createNewUsdzPackage(
        asset,
        usdzFilePath,
        /* firstLayerName */ targetBaseName,
        /* origRootFilePath */ resolvedPath,
        /* dependenciesToSkip */ [resolvedPath],
        editLayersInPlace)
    }
    return createNewUsdzPackage(
      asset,
      usdzFilePath,
      /* firstLayerName */ targetBaseName,
      /* origRootFilePath */ resolvedPath,
      /* dependenciesToSkip */ [],
      editLayersInPlace)
  }

  TF_WARN(`The given asset '${asset.getAssetPath()}' contains one or more composition arcs ` +
    'referencing external USD files. Flattening it to a single .usdc file ' +
    'before packaging. This will result in loss of features such as ' +
    'variantSets and all asset references to be absolutized.')

  const usdStage = await UsdStage.open(resolvedPath)
  // See PLATFORM-DIVERGENCE(usdutils-host-filesystem).
  const tmpFileName = _makeTmpFileName(targetBaseName, '.usdc')

  if (TfDebug.isEnabled(UsdUtilsDebugCodes.USDUTILS_CREATE_PACKAGE)) {
    TfDebug.msg(UsdUtilsDebugCodes.USDUTILS_CREATE_PACKAGE,
      `Flattening asset @${asset.getAssetPath()}@ located at '${resolvedPath}' to temporary layer at ` +
      `path '${tmpFileName}'.\n`)
  }

  if (!usdStage || !await usdStage.export(tmpFileName, /* addSourceFileComment */ false)) {
    TF_WARN(`Failed to flatten and export the USD stage '${resolvedPath}'.`)
    return false
  }

  const success = await createNewUsdzPackage(
    /* assetPath */ new SdfAssetPath(tmpFileName),
    usdzFilePath,
    /* firstLayerName */ targetBaseName,
    /* origRootFilePath */ resolvedPath,
    /* dependenciesToSkip */ [resolvedPath],
    editLayersInPlace)

  if (success) {
    await _deleteFile(tmpFileName)
  } else {
    TF_WARN(`Failed to create a .usdz package from temporary, flattened layer '${tmpFileName}'.`)
  }

  return success
}
