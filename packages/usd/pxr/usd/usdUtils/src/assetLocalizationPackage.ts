// Ported from OpenUSD 26.11.1: pxr/usd/usdUtils/assetLocalizationPackage.cpp,
//  pxr/usd/usdUtils/assetLocalizationPackage.h
// Copyright 2023 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/usd/usdUtils/assetLocalizationPackage.{h,cpp}
// (OpenUSD 26.11.1).
//
// UsdUtils_AssetLocalizationPackage builds a localized copy of an asset: a
// writable localization client that remaps each discovered dependency to a
// path inside the package and records the layers and files to copy there.
// Build discovers the dependencies, Write copies them through the
// subclass's _writeToPackage (a directory for UsdUtilsLocalizeAsset, a usdz
// archive for UsdUtilsCreateNewUsdzPackage). Both are asynchronous here,
// since discovery and copying resolve paths, open layers and write files.

import {
  AssetPath as SdfAssetPath, FileFormat as SdfFileFormat, Layer, SdfComputeAssetPathRelativeToLayer,
  UsdFileFormat as SdfUsdFileFormat, sdfIsVariableExpression,
} from 'typescript-usd/sdf'
import { _sdfSplitLayerIdentifier } from 'typescript-usd/sdf/_internal'
import {
  GetRegisteredURISchemes as ArGetRegisteredURISchemes, GetResolver as ArGetResolver,
  IsPackageRelativePath as ArIsPackageRelativePath, JoinPackageRelativePath as ArJoinPackageRelativePath,
  ResolvedPath as ArResolvedPath, SplitPackageRelativePathOuter as ArSplitPackageRelativePathOuter,
} from 'typescript-usd/ar'
import { _deleteFile, _makeTmpFileName, _pathExists } from 'typescript-usd/ar/_internal'
import { Stage as UsdStage } from 'typescript-usd/usd'
import { UdimUtils as UsdShadeUdimUtils } from 'typescript-usd/usdShade'
import {
  Debug as TfDebug, TF_WARN, TfGetBaseName, TfGetPathName, TfNormPath, TfStringCatPaths,
  TfStringGetBeforeSuffix, TfStringGetSuffix, TfStringStartsWith, TfStringTrimLeft,
} from 'typescript-usd/tf'
import { UsdUtils_LocalizationContext } from './assetLocalization.ts'
import { type UsdUtils_DependencyType, UsdUtils_LocalizationClient, UsdUtils_WritableLocalizationClient } from './assetLocalizationDelegate.ts'
import { UsdUtilsDebugCodes } from './debugCodes.ts'
import { UsdUtilsDependencyInfo, type UsdUtilsProcessingFunc } from './userProcessingFunc.ts'

/**
 * Remaps file paths by replacing their directories with unique,
 * artificially generated names (assetLocalizationPackage.h:24-43;
 * assetLocalizationPackage.cpp:30-62).
 */
export class UsdUtils_DirectoryRemapper {
  #nextDirectoryNum = 0
  readonly #oldToNewDirectory = new Map<string, string>()
  readonly #remappedDirectories = new Set<string>()

  /** Remap the given file path by replacing the directory with a unique,
   *  artificially generated name. The generated directory name will be
   *  reused if the original directory is seen again on a subsequent call to
   *  remap. */
  remap(filePath: string): string {
    if (ArIsPackageRelativePath(filePath)) {
      const packagePath = ArSplitPackageRelativePathOuter(filePath)
      return ArJoinPackageRelativePath([this.remap(packagePath[0]), packagePath[1]])
    }

    const pathName = TfGetPathName(filePath)
    if (pathName === '') return filePath

    const baseName = TfGetBaseName(filePath)

    let newDirectory = this.#oldToNewDirectory.get(pathName)
    const inserted = newDirectory === undefined
    if (inserted) {
      newDirectory = String(this.#nextDirectoryNum++)
      this.#oldToNewDirectory.set(pathName, newDirectory)
    }

    const remappedPath = TfStringCatPaths(newDirectory!, baseName)

    if (inserted) this.#remappedDirectories.add(remappedPath)

    return remappedPath
  }

  /** Returns true if the supplied path is a remapped path. */
  pathIsRemapped(path: string): boolean {
    return this.#remappedDirectories.has(path)
  }
}

// _PathIsURIResolvable (assetLocalizationPackage.cpp:259-269).
function pathIsURIResolvable(path: string): boolean {
  const uriEnd = path.indexOf(':')
  if (uriEnd < 0) return false
  const scheme = path.slice(0, uriEnd)
  return ArGetRegisteredURISchemes().includes(scheme)
}

// std::filesystem::relative(path, base) for normalized absolute POSIX paths:
// the lexically relative path, or '.' for the same path. Upstream
// canonicalizes both paths first (resolving symbolic links); see
// PLATFORM-DIVERGENCE(usdutils-host-filesystem).
function filesystemRelative(path: string, base: string): string {
  const pathElems = TfNormPath(path).split('/').filter(e => e !== '')
  const baseElems = TfNormPath(base).split('/').filter(e => e !== '')
  let common = 0
  while (common < pathElems.length && common < baseElems.length && pathElems[common] === baseElems[common]) {
    ++common
  }
  const rel = [...baseElems.slice(common).map(() => '..'), ...pathElems.slice(common)]
  return rel.length === 0 ? '.' : rel.join('/')
}

/**
 * A writable localization client that collects an asset's dependencies into
 * a package (assetLocalizationPackage.h:45-164).
 */
export abstract class UsdUtils_AssetLocalizationPackage extends UsdUtils_WritableLocalizationClient {
  #rootLayer: Layer | undefined
  #userProcessingFunc: UsdUtilsProcessingFunc | undefined
  // The resolved path of the root usd layer
  #rootFilePath = ''
  // The original root file path...used for ARkit packages
  #origRootFilePath = ''
  #packagePath = ''
  // User supplied first layer override name
  #firstLayerName = ''
  // List of dependencies to skip during packaging.
  #dependenciesToSkip: string[] = []
  // Maps Layer's anchored path to package path. This lookup is handy for
  // determining package paths of assets with relative paths. std::map
  // iterates its keys in order.
  readonly #layersToCopy = new Map<string, string>()
  // List of non layer dependencies to copy into the package. Each element
  // is a pair consisting of the source path and package path
  readonly #filesToCopy: [string, string][] = []
  readonly #directoryRemapper = new UsdUtils_DirectoryRemapper()

  /** Sets the original file path for this asset. The path specified should
   *  be resolved by AR (assetLocalizationPackage.h:51-56). */
  setOriginalRootFilePath(origRootFilePath: string): void {
    this.#origRootFilePath = origRootFilePath
  }

  /** Sets a list of dependencies to skip during packaging. The paths
   *  contained in this array should be resolved by AR
   *  (assetLocalizationPackage.h:58-64). */
  setDependenciesToSkip(dependenciesToSkip: readonly string[]): void {
    this.#dependenciesToSkip = [...dependenciesToSkip]
  }

  /** Sets the optional user processing function that will be invoked before
   *  any directory remapping will take place
   *  (assetLocalizationPackage.h:66-72). */
  setUserProcessingFunc(processingFunc: UsdUtilsProcessingFunc | undefined): void {
    this.#userProcessingFunc = processingFunc
  }

  // assetLocalizationPackage.cpp:82-112
  async build(assetPath: SdfAssetPath, firstLayerName: string): Promise<boolean> {
    const assetPathStr = assetPath.getAssetPath()

    this.#rootFilePath = (await ArGetResolver().resolve(assetPathStr)).toString()
    if (this.#rootFilePath === '') {
      TF_WARN(`Failed to resolve asset path: ${assetPathStr}`)
      return false
    }

    this.#rootLayer = await Layer.findOrOpen(assetPathStr)
    if (!this.#rootLayer) {
      TF_WARN(`Failed to find or open root asset layer: ${assetPathStr}`)
      return false
    }

    // Change the first layer's name if requested.
    this.#firstLayerName = firstLayerName === ''
      ? TfGetBaseName(this.#rootLayer.realPath)
      : firstLayerName

    const context = new UsdUtils_LocalizationContext(this)
    context.setMetadataFilteringEnabled(true)
    context.setDependenciesToSkip(this.#dependenciesToSkip)

    return context.process(this.#rootLayer)
  }

  // assetLocalizationPackage.cpp:114-158
  async write(packagePath: string): Promise<boolean> {
    this.#packagePath = packagePath
    // Set of all the packaged files.
    const packagedFiles = new Set<string>()
    let success = true

    packagedFiles.add(this.#firstLayerName)
    await this.#addLayerToPackage(this.#rootLayer!, this.#firstLayerName)

    for (const [layerPath, packageLayerPath] of [...this.#layersToCopy].sort(([a], [b]) => byteOrder(a, b))) {
      if (packagedFiles.has(packageLayerPath)) {
        TF_WARN(`A file already exists at path "${packageLayerPath}" in the package. ` +
          `Skipping export of dependency @${layerPath}@.`)
        continue
      }
      packagedFiles.add(packageLayerPath)

      const layerToAdd = await Layer.findOrOpen(layerPath)
      if (!layerToAdd) {
        TF_WARN(`Unable to open layer at path "${layerPath}" while writing package. ` +
          `Skipping export of dependency @${packageLayerPath}@.`)
        continue
      }

      success = await this.#addLayerToPackage(layerToAdd, packageLayerPath) && success
    }

    for (const [srcPath, destPath] of this.#filesToCopy) {
      if (packagedFiles.has(destPath)) {
        TF_WARN(`A file already exists at path "${destPath}" in the package. ` +
          `Skipping export of dependency @${srcPath}@.`)
        continue
      }
      packagedFiles.add(destPath)

      success = await this.#addAssetToPackage(srcPath, destPath) && success
    }

    return success
  }

  /** Remap the path to an artificially-constructed one so that the source
   *  directory structure isn't embedded in the final package
   *  (assetLocalizationPackage.h:77-83). */
  remapPath(path: string): string {
    return this.#directoryRemapper.remap(path)
  }

  // assetLocalizationPackage.cpp:64-80
  override pathShouldResolve(path: string): boolean {
    // Remapped paths are not expected to resolve due to the fact that they
    // are synthesized for use within the package that is currently being
    // built.
    if (this.#directoryRemapper.pathIsRemapped(path)) return false

    // Raw Udim paths are not expected to resolve because they are only a
    // template for a number of potential concrete paths.
    if (UsdShadeUdimUtils.isUdimIdentifier(path)) return false

    return UsdUtils_LocalizationClient.prototype.pathShouldResolve.call(this, path)
  }

  // assetLocalizationPackage.cpp:585-596
  protected _remapAssetPath(_layer: Layer, refPath: string, isRelativePath: boolean): string {
    if (isRelativePath) return refPath
    return this.remapPath(refPath)
  }

  protected abstract _writeToPackage(source: string, dest: string): Promise<boolean>

  // assetLocalizationPackage.cpp:160-180
  protected override async _processDependency(
    layer: Layer, depInfo: UsdUtilsDependencyInfo, _dependencyType: UsdUtils_DependencyType,
  ): Promise<UsdUtilsDependencyInfo> {
    if (this.#userProcessingFunc) {
      const processedInfo = await this.#userProcessingFunc(layer, depInfo)

      // if the user processing func returned empty string then this
      // asset should be removed from the source layer
      if (processedInfo.getAssetPath() === '') return new UsdUtilsDependencyInfo()

      return this.#addDependenciesToPackage(layer, processedInfo)
    }

    return this.#addDependenciesToPackage(layer, depInfo)
  }

  // assetLocalizationPackage.cpp:182-238
  async #addDependenciesToPackage(layer: Layer, depInfo: UsdUtilsDependencyInfo): Promise<UsdUtilsDependencyInfo> {
    // If there are no dependencies then there is no need for remapping
    if (depInfo.getAssetPath() === '') return depInfo

    // We do not want to add individual dependencies of packages or layers
    // contained within them. The entire package itself will be included in
    // the final output.
    if (layer.getFileFormat()?.isPackage() || ArIsPackageRelativePath(layer.realPath)) return depInfo

    const { remappedPath, isRelativePath: isRelativeOutput } =
      await this.#processAssetPath(layer, depInfo.getAssetPath())

    let packagePath = remappedPath
    if (isRelativeOutput) {
      // If it's a relative path, construct the full path relative to the
      // final (destination) location of the reference-containing file. This
      // is only applicable if the path is a filesystem path
      const containingLayerInfo = this.#layersToCopy.get(layer.identifier)
      if (containingLayerInfo !== undefined) {
        packagePath = TfNormPath(TfStringCatPaths(TfGetPathName(containingLayerInfo), depInfo.getAssetPath()))
      }
    }

    // Add all dependencies to package
    const destDirectory = TfGetPathName(packagePath)

    if (depInfo.getDependencies().length === 0) {
      // The user processing function may have introduced a variable
      // expression. If that is the case we do not want to attempt to add
      // this file into the package.
      if (!sdfIsVariableExpression(depInfo.getAssetPath())) {
        this.#addDependencyToPackage(layer, depInfo.getAssetPath(), destDirectory)
      }
    } else {
      for (const dependency of depInfo.getDependencies()) {
        this.#addDependencyToPackage(layer, dependency, destDirectory)
      }
    }

    return new UsdUtilsDependencyInfo(remappedPath, depInfo.getDependencies())
  }

  // assetLocalizationPackage.cpp:240-257
  #addDependencyToPackage(layer: Layer, dependency: string, destDirectory: string): void {
    const dependencyAnchored = SdfComputeAssetPathRelativeToLayer(layer, dependency)
    const dependencyPackage = TfNormPath(TfStringCatPaths(destDirectory, TfGetBaseName(dependency)))

    if (UsdStage.isSupportedFile(dependencyAnchored)) {
      this.#layersToCopy.set(dependencyAnchored, dependencyPackage)
    } else {
      this.#filesToCopy.push([dependencyAnchored, dependencyPackage])
    }
  }

  // assetLocalizationPackage.cpp:271-399: the path the dependency has in the
  // package, and whether it is the relative path as authored.
  async #processAssetPath(layer: Layer, refPath: string): Promise<{ remappedPath: string, isRelativePath: boolean }> {
    const resolver = ArGetResolver()

    const isContextDependentPath = resolver.isContextDependentPath(refPath)

    // We want to maintain relative paths where possible to keep localized
    // assets as close as possible to their original layout. However, we
    // skip this for context-dependent paths because those must be resolved
    // to determine what asset is being referred to.
    //
    // Due to the open ended nature of URI based paths, there may not be a
    // straightforward way to map them to a filesystem directory structure so
    // we will always send them down the remap path.
    if (!isContextDependentPath && !pathIsURIResolvable(refPath)) {
      // We determine if refPath is relative by creating identifiers with
      // and without the anchoring layer and seeing if they're the same.
      // If they aren't, then refPath depends on the anchor, so we assume
      // it's relative.
      const anchored = resolver.createIdentifier(refPath, new ArResolvedPath(layer.resolvedPath))
      const unanchored = resolver.createIdentifier(refPath)
      const isRelativePath = anchored !== unanchored

      if (isRelativePath) {
        // Asset localization is rooted at the location of the root layer. If
        // this relative path points somewhere outside that location (e.g., a
        // relative path like "../foo.jpg"). there will be nowhere to put this
        // asset in the localized asset structure. In that case, we need to
        // remap this path. Otherwise, we can keep the relative asset path
        // as-is. Note: if we are unable to resolve the anchored path we will
        // not consider it outside the asset location. For example, we would
        // like to preserve relative clip template paths for matching.
        const resolvedRefPath = (await resolver.resolve(anchored)).toString()
        const refPathIsOutsideAssetLocation = resolvedRefPath !== '' && !TfStringStartsWith(
          TfNormPath(TfGetPathName(resolvedRefPath)), TfNormPath(TfGetPathName(this.#rootFilePath)))

        // Return relative paths unmodified.
        if (!refPathIsOutsideAssetLocation) return { remappedPath: refPath, isRelativePath: true }
      }
    }

    let result = refPath
    if (isContextDependentPath) {
      // Absolutize the search path, to avoid collisions resulting from the
      // same search path resolving to different paths in different resolver
      // contexts.
      const refAssetPath = SdfComputeAssetPathRelativeToLayer(layer, refPath)

      const splitIdentifier = _sdfSplitLayerIdentifier(refAssetPath)

      const refFilePath = (await resolver.resolve(splitIdentifier.assetPath)).toString()

      // Failed to resolve, hence retain the reference as is.
      result = refFilePath !== '' ? refFilePath : refAssetPath
    }

    // Normalize paths compared below to account for path format differences.
    const layerPath = TfNormPath(layer.realPath)
    result = TfNormPath(result)
    const rootFilePath = TfNormPath(this.#rootFilePath)
    const origRootFilePath = TfNormPath(this.#origRootFilePath)

    const resultPointsToRoot = result === rootFilePath || result === origRootFilePath
    // If this is a self-reference, then remap to a relative path that points
    // to the file itself.
    if (result === layerPath) {
      // If this is a self-reference in the root layer and we're renaming the
      // root layer, simply set the reference path to point to the renamed
      // root layer.
      return {
        remappedPath: resultPointsToRoot && this.#firstLayerName !== '' ? this.#firstLayerName : TfGetBaseName(result),
        isRelativePath: false,
      }
    }

    // References to the original (unflattened) root file need to be
    // remapped to point to the new root file.
    if (resultPointsToRoot && layerPath === rootFilePath) {
      return {
        remappedPath: this.#firstLayerName !== '' ? this.#firstLayerName : TfGetBaseName(result),
        isRelativePath: false,
      }
    }

    // Result is now an absolute or a repository path. Simply strip off the
    // leading slashes to make it relative.
    // Strip off any drive letters.
    if (result.length >= 2 && result[1] === ':') result = result.slice(2)

    // Strip off any initial slashes.
    result = TfStringTrimLeft(result, '/')

    // Remap the path to an artifically-constructed one so that the source
    // directory structure isn't embedded in the final .usdz file. Otherwise,
    // sensitive information (e.g. usernames, movie titles...) in directory
    // names may be inadvertently leaked in the .usdz file.
    return { remappedPath: this.#directoryRemapper.remap(result), isRelativePath: false }
  }

  // Ensure that External Asset Dependencies are included with the layer.
  // Note that these paths come as fully resolved paths. We attempt to make
  // these paths relative to the layer in order to preserve the structure of
  // the format and give us the best chance of loading it from within the
  // package. Failure to place these files in the resulting package will
  // result in warnings, but not trigger a package creation failure
  // (assetLocalizationPackage.cpp:401-460).
  async #addExternalAssetDependenciesToPackage(sourceLayer: Layer, destPath: string): Promise<boolean> {
    const externalAssetDeps = [...new Set(sourceLayer.getExternalAssetDependencies())].sort(byteOrder)
    const layerResolvedPath = TfNormPath(sourceLayer.resolvedPath)
    const layerDir = TfGetPathName(layerResolvedPath)
    const packageDestDir = TfGetPathName(destPath)

    if (!_pathExists(layerDir)) {
      TF_WARN(`Skipping External Asset Dependencies for layer ${sourceLayer.resolvedPath}.` +
        'Non-filesystem based path.')
      return true
    }

    // Only valid filesystem paths can be canonicalized
    for (const externalDep of externalAssetDeps) {
      if (!_pathExists(externalDep)) {
        TF_WARN(`Skipping external asset dependency ${externalDep} for layer ` +
          `${sourceLayer.resolvedPath}. Path does not exist.`)
        continue
      }

      // Check if the dep is under the layer's directory
      const relPath = filesystemRelative(TfNormPath(externalDep), layerDir)

      if (relPath !== '' && relPath.split('/')[0] !== '..') {
        const depPackagePath = TfStringCatPaths(packageDestDir, relPath)

        // In the event we actually fail to write the file, we want to
        // signal package creation filed.
        if (!await this._writeToPackage(externalDep, depPackagePath)) return false
      } else {
        TF_WARN(`Failed to add external asset dependency ${externalDep} to layer ` +
          `${sourceLayer.resolvedPath}. Could not determine package relative path.`)
      }
    }

    return true
  }

  // assetLocalizationPackage.cpp:462-548
  async #addLayerToPackage(sourceLayer: Layer, destPath: string): Promise<boolean> {
    const layer = this.getLayerUsedForWriting(sourceLayer)
    if (TfDebug.isEnabled(UsdUtilsDebugCodes.USDUTILS_CREATE_PACKAGE)) {
      TfDebug.msg(UsdUtilsDebugCodes.USDUTILS_CREATE_PACKAGE,
        `.. adding layer @${layer.identifier}@ to package at path '${destPath}'.\n`)
    }

    if (!await this.#addExternalAssetDependenciesToPackage(sourceLayer, destPath)) return false

    // This returns true of src and dest have the same file extension.
    const extensionsMatch = (src: string, dest: string): boolean => {
      const resolver = ArGetResolver()
      return resolver.getExtension(src) === resolver.getExtension(dest)
    }

    // If the layer is a package or if it's inside a package, copy the entire
    // package. We could extract the package and copy only the dependencies,
    // but this could get very complicated.
    if (layer.getFileFormat()?.isPackage() || ArIsPackageRelativePath(layer.identifier)) {
      const packagePath = ArSplitPackageRelativePathOuter(layer.realPath)[0]
      const destPackagePath = ArSplitPackageRelativePathOuter(destPath)[0]
      if (packagePath !== '') {
        if (!await this._writeToPackage(packagePath, destPackagePath)) return false
      }
    } else if (!layer.isDirty() && extensionsMatch(layer.realPath, destPath)) {
      // If the layer hasn't been modified from its persistent representation
      // and if its extension isn't changing in the package, then simply copy
      // it over from its real-path (i.e. location on disk). This preserves
      // any existing comments in the file (which will be lost if we were to
      // export all layers before adding them to to the package).
      if (!await this._writeToPackage(layer.realPath, destPath)) return false
    } else {
      // If the layer has been modified or needs to be modified, then we need
      // to export it to a temporary file before adding it to the package.
      const args = new Map<string, string>()

      const fileFormat = SdfFileFormat.findByExtension(destPath)
      if (fileFormat instanceof SdfUsdFileFormat) {
        args.set('format', SdfUsdFileFormat.getUnderlyingFormatForLayer(layer))
      }

      const baseName = TfGetBaseName(destPath)
      // See PLATFORM-DIVERGENCE(usdutils-host-filesystem).
      const tmpLayerExportPath = _makeTmpFileName(
        TfStringGetBeforeSuffix(baseName), '.' + TfStringGetSuffix(baseName))
      await layer.export(tmpLayerExportPath, args)

      if (!await this._writeToPackage(tmpLayerExportPath, destPath)) {
        // XXX: Should we abort package creation and return early here?
        TF_WARN(`Failed to add temporary layer at '${tmpLayerExportPath}' to the package ` +
          `at path '${this.#packagePath}'.`)
        return false
      }
      // XXX: This is here to work around an issue with exporting anonymous
      // layers that are backed by crate files. Temporary layers used for
      // layer modifications need to be cleared to prevent a mapped file
      // descriptor from being held after export to temporary file.
      this.clearLayerUsedForWriting(sourceLayer)
      await _deleteFile(tmpLayerExportPath)
    }

    return true
  }

  // assetLocalizationPackage.cpp:550-583
  async #addAssetToPackage(srcPath: string, destPath: string): Promise<boolean> {
    if (TfDebug.isEnabled(UsdUtilsDebugCodes.USDUTILS_CREATE_PACKAGE)) {
      TfDebug.msg(UsdUtilsDebugCodes.USDUTILS_CREATE_PACKAGE,
        `.. adding file '${srcPath}' to package at path '${destPath}'.\n`)
    }

    // If the file is a package or inside a package, copy the entire package.
    // We could extract the package and copy only the dependencies, but this
    // could get very complicated.
    if (ArIsPackageRelativePath(destPath)) {
      const packagePath = ArSplitPackageRelativePathOuter(srcPath)[0]
      const destPackagePath = ArSplitPackageRelativePathOuter(destPath)[0]
      if (packagePath !== '') {
        if (!await this._writeToPackage(packagePath, destPackagePath)) return false
      }
    } else if (!await this._writeToPackage(srcPath, destPath)) {
      // XXX: Should we abort package creation and return early here?
      TF_WARN(`Failed to add file '${srcPath}' to the package at path '${this.#packagePath}'.`)
      return false
    }

    return true
  }
}

// std::string operator< ordering.
function byteOrder(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0
}
