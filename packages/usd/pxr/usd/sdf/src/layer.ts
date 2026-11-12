// Ported from OpenUSD 26.11.1: pxr/usd/sdf/layer.cpp, pxr/usd/sdf/layer.h
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Mirrors pxr/usd/sdf/layer.{h,cpp} — SdfLayer (our `Layer`): open/parse
// dispatch, field reads, the flat-field authoring surface, and change
// notification. The pieces upstream keeps in sibling files live in theirs:
// file-format registries/capabilities in fileFormat.ts, identifier anchoring
// and the reader seam in assetPathResolver.ts, package-aware reads in
// usdzFileFormat.ts.

import { serializeUsda } from './usdaFileFormat.ts'
import { SdfData } from './data.ts'
import { _sdfHandOut } from './checkReturnedValues.ts'
import { coerceValueToType } from './parserHelpers.ts'
import { SdfAbstractData, sdfValuesEqual, type SdfSpecType, type SdfTimeSampleValueKinds } from './abstractData.ts'
import { UsdZipFile } from './zipFile.ts'
import {
  SdfSimpleLayerStateDelegate,
  type SdfLayerStateDelegateBase,
} from './layerStateDelegate.ts'
import { SdfFileFormat, SdfUsdaFileFormat, SdfUsdcFileFormat, SdfUsdzFileFormat, sdfUsdaReadFromStringText, _loadFileFormatPluginForPath, _packageHasEntry, _recordPackageEntries, type SdfFileFormatArguments } from './fileFormat.ts'
import { Sdf_CrateData } from './crateData.ts'
import {
  GetResolver as ArGetResolver, ResolvedPath as ArResolvedPath, ResolverWriteMode as ArResolverWriteMode, Resolver as ArResolver, ResolverContext as ArResolverContext,
  IsPackageRelativePath as ArIsPackageRelativePath, JoinPackageRelativePath as ArJoinPackageRelativePath,
  SplitPackageRelativePathInner as ArSplitPackageRelativePathInner,
} from 'typescript-usd/ar'
import { isAbsolute, joinPackagePath, normalizeRelative, splitPackagePath } from 'typescript-usd/ar/_internal'
import { _cachePackage, openZip } from './usdzFileFormat.ts'
import { createLayerIdentifier, splitLayerIdentifier, SDF_FORMAT_ARGS_MARKER, _layerRegistry } from './layerRegistry.ts'
import {
  _ArHasAssetPrefetcher, _ArPrefetchAsset,
  _getArTraceContext, _resolverContextForResolver, _resolverForContext,
} from 'typescript-usd/ar/_internal'
import { _traceScopeData, type LogicalTraceContext } from 'typescript-usd/trace/_internal'
import { _withSdfTrace, _withSdfTraceSync, type SdfTraceContext } from './traceContext.ts'
import { SdfSpec } from './spec.ts'
import { SdfSchema } from './schema.ts'
import {
  Error as TfError, TfDiagnosticMgr, TfDiagnosticType, TfErrorMark, TfEnvSetting, TfGetEnvSetting,
} from 'typescript-usd/tf'
import {
  sdfChildPolicyForField, Sdf_AttributeChildPolicy, Sdf_PrimChildPolicy, Sdf_PropertyChildPolicy,
} from './childrenPolicies.ts'
import type { SdfAllowed } from './allowed.ts'
import {
  sdfCombineError, SdfNamespaceEditDetailResult, type SdfBatchNamespaceEdit, type SdfNamespaceEdit,
  type SdfNamespaceEditDetail,
} from './namespaceEdit.ts'
import { Sdf_ChildrenUtils } from './childrenUtils.ts'
import { SdfChildrenProxy } from './childrenView.ts'
import { Sdf_IdentityRegistry } from './identity.ts'
import { SdfAttributeSpec } from './attributeSpec.ts'
import { SdfPrimSpec, sdfCreatePrimInLayer } from './primSpec.ts'
import { SdfPropertySpec } from './propertySpec.ts'
import { SdfPseudoRootSpec } from './pseudoRootSpec.ts'
import { SdfRelationshipSpec } from './relationshipSpec.ts'
import { SdfVariantSetSpec } from './variantSetSpec.ts'
import { SdfVariantSpec } from './variantSpec.ts'
import { sdfGetNameOrderProxy, type SdfNameOrderProxy } from './proxyTypes.ts'
import { Sdf_ChangeManager, sdfChangeBlock } from './changeManager.ts'
import { SdfPath } from './path.ts'
import {
  SdfChangeList, sdfChangeListDidAddOrRemoveSpec, sdfChangeListDidChangeField,
} from './changeList.ts'

// OpenUSD v26.08 pxr/usd/sdf/layer.h:1320-1363 and layer.cpp:2917-2951.
export class DetachedLayerRules {
  private _includeAll = false
  private _included: string[] = []
  private _excluded: string[] = []

  includeAll(): this { this._includeAll = true; this._included = []; return this }
  include(patterns: readonly string[]): this {
    this._included = [...new Set([...this._included, ...patterns])].sort()
    return this
  }
  exclude(patterns: readonly string[]): this {
    this._excluded = [...new Set([...this._excluded, ...patterns])].sort()
    return this
  }
  includedAll(): boolean { return this._includeAll }
  getIncluded(): string[] { return [...this._included] }
  getExcluded(): string[] { return [...this._excluded] }

  isIncluded(identifier: string): boolean {
    if ((!this._includeAll && this._included.length === 0) || identifier.startsWith('anon:')) {
      return false
    }
    const layerPath = splitLayerIdentifier(identifier).assetPath
    const included = this._includeAll || this._included.some(pattern => layerPath.includes(pattern))
    return included && !this._excluded.some(pattern => layerPath.includes(pattern))
  }

  clone(): DetachedLayerRules {
    const clone = new DetachedLayerRules()
    if (this._includeAll) clone.includeAll()
    else clone.include(this._included)
    return clone.exclude(this._excluded)
  }
}

// layer.cpp:82-91.
const SDF_LAYER_INCLUDE_DETACHED = new TfEnvSetting<string>('SDF_LAYER_INCLUDE_DETACHED', '',
  'Set the default include patterns for specifying detached layers. ' +
  'This can be set to a comma-delimited list of strings or "*" to ' +
  'include all layers.')
const SDF_LAYER_EXCLUDE_DETACHED = new TfEnvSetting<string>('SDF_LAYER_EXCLUDE_DETACHED', '',
  'Set the default exclude patterns for specifying detached layers. ' +
  'This can be set to a comma-delimited list of strings.')

// TfStringSplit (stringUtils.cpp): an empty string splits to no pieces.
const _splitSetting = (value: string): string[] => value === '' ? [] : value.split(',')

// The initial detached layer rules (layer.cpp:178-196).
function _initialDetachedLayerRules(): DetachedLayerRules {
  const rules = new DetachedLayerRules()
  const includePatterns = _splitSetting(TfGetEnvSetting(SDF_LAYER_INCLUDE_DETACHED))
  if (includePatterns.includes('*')) rules.includeAll()
  else if (includePatterns.length) rules.include(includePatterns)
  const excludePatterns = _splitSetting(TfGetEnvSetting(SDF_LAYER_EXCLUDE_DETACHED))
  if (excludePatterns.length) rules.exclude(excludePatterns)
  return rules
}

// SdfLayer::_GetRequiredFieldDef (layer.cpp:3701-3721): the fallback of a
// field the spec type requires, which SdfLayer::HasField and GetField report
// for a spec that does not hold the field.
function requiredFieldFallback(specType: SdfSpecType, fieldName: string): unknown {
  const schema = SdfSchema.getInstance()
  if (!schema.isRequiredFieldName(fieldName)) return undefined
  if (!schema.getSpecDefinition(specType)?.isRequiredField(fieldName)) return undefined
  return schema.getFallback(fieldName)
}

// SdfSchema::SpecDefinition::IsRequiredField.
function isRequiredField(specType: SdfSpecType, fieldName: string): boolean {
  return SdfSchema.getInstance().getSpecDefinition(specType)?.isRequiredField(fieldName) ?? false
}

// 'reloadContent' is SdfChangeList::DidReloadLayerContent (layer.cpp:1105),
// reported once after a reload's per-spec records; 'replaceContent' is
// DidReplaceLayerContent, reported when content is replaced without a diff.
// 'resolvedPathChange' is DidChangeLayerResolvedPath (layer.cpp:1098-1100).
export type SdfLayerChangeKind =
  | 'field' | 'timeSample' | 'specAdded' | 'specRemoved' | 'specMoved' | 'reloadContent'
  | 'replaceContent' | 'resolvedPathChange'

// The per-layer portion of SdfChangeList. Pcp classifies these concrete Sdf
// mutations according to their composition significance; Sdf itself does not
// need to know which fields affect composition.
export interface SdfLayerChange {
  kind: SdfLayerChangeKind
  path: string
  fieldName?: string
  // Present for field/time-sample mutations. Keeping both values lets Pcp
  // distinguish presence changes from edits whose composition effect is
  // unchanged (clips and computed layer timing are important examples).
  oldValue?: unknown
  newValue?: unknown
  // Present for spec additions/removals; upstream distinguishes prim and
  // property spec changes when deciding which dependency state is invalid.
  specType?: SdfSpecType
  // Present for spec additions/removals: whether the spec contributes no
  // opinions to composition (SdfLayer::_IsInert, pxr/usd/sdf/layer.cpp:4925 —
  // the didAdd/RemoveInertPrim vs didAdd/RemoveNonInertPrim and
  // didAdd/RemovePropertyWithOnlyRequiredFields flags of SdfChangeList).
  // Computed from the spec's own fields at record time: additions after the
  // creating write, removals before deletion.
  inert?: boolean
  // Present for spec moves: the spec's path before it moved (`path` is the
  // new path; Sdf_ChangeManager::DidMoveSpec), and for a moved target spec,
  // the spec type of its owning property.
  oldPath?: string
  ownerSpecType?: SdfSpecType
}

// Sdf_UsdzResolver::OpenAsset (usdzResolver.cpp:196-233) through
// ArResolver::OpenAsset's package handling (resolver.cpp:1024-1063): the
// outer package's entry, descending through nested packages. Each package
// opened is recorded under its package paths.
// A missing entry, or a nested path through an entry that is not a package,
// is undefined: the packaged path does not resolve (Sdf_UsdzResolver::
// Resolve, usdzResolver.cpp:108-123), so FindOrOpen returns null without an
// error (layer.cpp:899-903).
async function extractPackagedBytes(
  zip: UsdZipFile, packagedPath: string, packagePaths: readonly string[],
): Promise<Uint8Array | undefined> {
  _recordPackageEntries(packagePaths, zip)
  const nested = splitPackagePath(packagedPath)
  if (!nested) return zip.has(packagedPath) ? zip.extract(packagedPath) : undefined
  if (!zip.has(nested.packagePath)) return undefined
  const nestedBytes = await zip.extract(nested.packagePath)
  if (!UsdZipFile.isZip(nestedBytes)) return undefined
  return extractPackagedBytes(UsdZipFile.fromBytes(nestedBytes), nested.innerPath,
    packagePaths.map(path => joinPackagePath(path, nested.packagePath)))
}

// Posts an error from a failed layer open (TF_CODING_ERROR /
// TF_RUNTIME_ERROR at the upstream site), or hands it to the caller
// collecting them.
function _postOpenError(error: TfError, errors: TfError[] | undefined): void {
  if (errors) errors.push(error)
  else TfDiagnosticMgr.GetInstance().postError(error)
}

function _errorMessage(error: unknown): string {
  return error instanceof globalThis.Error ? error.message : String(error)
}

// layer.cpp:906-912, 984-988: an exception escaping the open.
function _exceptionWhileOpening(error: unknown): TfError {
  return new TfError(`Exception thrown while opening layer: ${_errorMessage(error)}`, TfDiagnosticType.RuntimeError)
}

// A format read that fails. The readers here throw the diagnostic that
// upstream's readers post before returning false: a TfError as ported, or
// an Error carrying the reader's message, posted as a TF_RUNTIME_ERROR. A
// JavaScript engine error is not a reader diagnostic but an exception
// escaping the read, as upstream's catch reports it.
function _readFailureError(error: unknown): TfError {
  if (error instanceof TfError) return error
  if (error instanceof TypeError || error instanceof RangeError || error instanceof ReferenceError ||
      error instanceof SyntaxError || error instanceof EvalError || error instanceof URIError ||
      !(error instanceof globalThis.Error)) {
    return _exceptionWhileOpening(error)
  }
  return new TfError(error.message, TfDiagnosticType.RuntimeError)
}

// _AnchorRelativePath (layerUtils.cpp:28-36): relativePath anchored to the
// directory of anchorLayerPath (TfStringCatPaths normalizes the result).
function anchorRelativePath(anchorLayerPath: string, relativePath: string): string {
  const slash = anchorLayerPath.lastIndexOf('/')
  return slash < 0 ? relativePath : normalizeRelative(`${anchorLayerPath.slice(0, slash)}/${relativePath}`)
}

// _ExpandPackagePath (layerUtils.cpp:38-60): expand (package, packaged)
// until the packaged path is the non-package root layer of the package.
function expandPackagePath(packageRelativePath: [string, string]): [string, string] {
  const result: [string, string] = [...packageRelativePath]
  while (result[1]) {
    const packagedFormat = SdfFileFormat.findByExtension(result[1])
    if (!packagedFormat?.isPackage()) break
    result[0] = ArJoinPackageRelativePath([result[0], result[1]])
    result[1] = packagedFormat.getPackageRootLayerPath(result[0])
  }
  return result
}

// Whether ArResolver::Resolve gives a non-empty result for a
// package-relative path (layerUtils.cpp:152, 177): whether its innermost
// package holds the packaged path (Sdf_UsdzResolver::Resolve,
// usdzResolver.cpp:108-123). Resolve is asynchronous here, so this answers
// from the packages already opened; anchoring only queries the anchor
// layer's own packages, which are open by the time the layer exists.
function packagedPathResolves(path: string): boolean {
  if (!ArIsPackageRelativePath(path)) return false
  const [packagePath, packagedPath] = ArSplitPackageRelativePathInner(path)
  return _packageHasEntry(packagePath, packagedPath) === true
}

async function sdfResolvePath(
  resolver: ArResolver,
  assetPath: string,
  context: ArResolverContext,
  traceContext: SdfTraceContext,
) {
  return _withSdfTrace(traceContext, 'typescript-usd:sdfResolvePath', scopeContext => {
    if (scopeContext) _traceScopeData(scopeContext, 'assetPath', assetPath)
    return resolver.resolve(assetPath, context)
  })
}

// Authored values are converted to the attribute's value type, as the text
// parser converts literals (parserHelpers.ts).
function coerceAuthoredStorageValue(value: unknown, typeName: unknown): unknown {
  return typeof typeName === 'string' ? coerceValueToType(value, typeName) : value
}

let createLayerWithDataImpl: (
  identifier: string,
  data: SdfAbstractData,
  resolverContext?: ArResolverContext,
) => Layer

export { sdfCreatePrimInLayer }

export function _createLayerWithData(
  identifier: string,
  data: SdfAbstractData,
  resolverContext?: ArResolverContext,
): Layer {
  return createLayerWithDataImpl(identifier, data, resolverContext)
}

export class Layer {
  static readonly DetachedLayerRules = DetachedLayerRules
  // SdfFieldKeys->LayerRelocates (wrapLayer.cpp:947).
  static readonly LayerRelocatesKey = 'layerRelocates'
  // TF_MAKE_STATIC_DATA(_detachedLayerRules) (layer.cpp:178-196): created
  // on first use from SDF_LAYER_INCLUDE_DETACHED / SDF_LAYER_EXCLUDE_DETACHED.
  private static _detachedLayerRulesData: DetachedLayerRules | undefined
  private static get _detachedLayerRules(): DetachedLayerRules {
    return Layer._detachedLayerRulesData ??= _initialDetachedLayerRules()
  }
  private static set _detachedLayerRules(rules: DetachedLayerRules) {
    Layer._detachedLayerRulesData = rules
  }
  static {
    createLayerWithDataImpl = (identifier, data, resolverContext) =>
      new Layer(identifier, data, resolverContext)
  }

  private static _anonymousSequence = 0
  private _data: SdfAbstractData
  // Sdf_IdentityRegistry: the identities of this layer's spec handles.
  private readonly _idRegistry = new Sdf_IdentityRegistry(this)

  // Every layer carries a state delegate (mirrors SdfLayer): all authoring
  // writes notify it BEFORE the data changes — the hook DCC undo stacks
  // record through. The default delegate just tracks dirtiness.
  private _stateDelegate: SdfLayerStateDelegateBase = new SdfSimpleLayerStateDelegate()

  private constructor(
    readonly filePath: string,
    data: SdfAbstractData,
    private readonly _resolverContext?: ArResolverContext,
    private _isDetached = data.isDetached(),
    private _resolvedPath: string = filePath,
  ) {
    this._data = data
    this._stateDelegate._setLayer(this)
  }

  // SdfLayer::GetIdentifier / GetRealPath (layer.h:508-526). `filePath` is
  // retained as the compatibility spelling for the identifier.
  get identifier(): string { return this.filePath }
  get realPath(): string { return this.resolvedPath }
  // SdfLayer::GetResolvedPath (layer.cpp:2797-2801).
  get resolvedPath(): string { return this._resolvedPath }

  /** @internal SdfFileFormat::_SetLayerData friend boundary. */
  _setDataFromFileFormat(data: SdfAbstractData): void {
    this._data = data
  }

  // ---- State delegate (mirrors SdfLayer::SetStateDelegate) ----

  setStateDelegate(delegate: SdfLayerStateDelegateBase): void {
    this._stateDelegate._setLayer(null)
    this._stateDelegate = delegate
    delegate._setLayer(this)
  }

  getStateDelegate(): SdfLayerStateDelegateBase {
    return this._stateDelegate
  }

  // True if the layer has been authored to since it was last marked clean.
  isDirty(): boolean {
    return this._stateDelegate.isDirty()
  }

  // Marks the current state as unchanged from its persistent representation
  // (what saving does upstream).
  markCurrentStateAsClean(): void {
    this._stateDelegate.markCurrentStateAsClean()
  }

  static fromBytes(bytes: Uint8Array, filePath: string): Layer {
    return Layer._fromBytes(bytes, filePath, undefined)
  }

  private static _fromBytes(
    bytes: Uint8Array,
    filePath: string,
    traceContext: SdfTraceContext,
    resolverContext?: ArResolverContext,
  ): Layer {
    return _withSdfTraceSync(traceContext, 'typescript-usd:Layer.fromBytes', context => {
      return Layer._read(bytes, filePath, context, resolverContext)
    })
  }

  // SdfLayer::_Read (layer.cpp:1092-1125): select the SdfFileFormat, let its
  // Read implementation install private SdfAbstractData, then publish a clean
  // layer. Custom formats use the same boundary and may author through Layer.
  private static _read(
    bytes: Uint8Array,
    filePath: string,
    traceContext: SdfTraceContext,
    resolverContext?: ArResolverContext,
    selectedFormat?: SdfFileFormat,
    resolvedPath = filePath,
    packageRootEntry?: string,
    metadataOnly = false,
    readArgs?: ReadonlyMap<string, string>,
  ): Layer {
    return _withSdfTraceSync(traceContext, 'typescript-usd:Layer.read', context => {
      const format = selectedFormat ??
        SdfFileFormat.findByExtension(filePath, context) ?? new SdfUsdaFileFormat()
      const initialData = new SdfData()
      initialData.createSpec('/', 'pseudoRoot')
      const crateBacked = bytes.length >= 8 &&
        new TextDecoder().decode(bytes.subarray(0, 8)) === 'PXR-USDC'
      const layer = new Layer(
        filePath,
        initialData,
        resolverContext,
        !crateBacked || Layer._detachedLayerRules.isIncluded(filePath),
        resolvedPath,
      )
      const args = readArgs ?? splitLayerIdentifier(filePath).args
      if (packageRootEntry !== undefined && format instanceof SdfUsdzFileFormat) {
        format._readPackageRoot(packageRootEntry, bytes, layer, args, context, metadataOnly)
      } else {
        format.read?.(bytes, layer, args, context, metadataOnly)
      }
      layer.markCurrentStateAsClean()
      return layer
    })
  }

  // SdfLayer::FindOrOpen (layer.cpp:852-914). A layer that cannot be opened
  // yields undefined, as upstream returns null: an unresolvable or
  // unreadable asset silently, other failures with a posted Tf error (see
  // Layer._findOrOpen).
  static findOrOpen(filePath: string): Promise<Layer | undefined> {
    return Layer._findOrOpenWithResolver(filePath)
  }

  /** @internal findOrOpen, optionally collecting the open's errors in `errors` instead of posting them. */
  static async _findOrOpenWithResolver(
    filePath: string,
    resolver?: ArResolver,
    context?: ArResolverContext,
    errors?: TfError[],
  ): Promise<Layer | undefined> {
    // _ComputeInfoToFindOrOpenLayer rejects an empty identifier without an error.
    if (!filePath) return undefined
    resolver ??= ArGetResolver()
    context ??= resolver.getCurrentContext()
    resolver = _resolverForContext(resolver, context)
    return _withSdfTrace(
      _getArTraceContext(context),
      'typescript-usd:Layer.findOrOpen',
      traceContext => Layer._findOrOpen(filePath, resolver, context, traceContext, undefined, errors),
    )
  }

  // SdfLayer::OpenAsAnonymous, layer.cpp:943-994: read the asset into a new
  // anonymous layer without consulting or replacing the file-backed registry.
  static async openAsAnonymous(filePath: string, metadataOnly = false, tag = ''): Promise<Layer | undefined> {
    if (!filePath) return undefined
    // An anonymous identifier has no extension to find a format by
    // (layer.cpp:957-963).
    if (filePath.startsWith('anon:')) {
      _postOpenError(new TfError(`Cannot determine file format for @${filePath}@`, TfDiagnosticType.CodingError), undefined)
      return undefined
    }
    let resolver = ArGetResolver()
    const context = resolver.getCurrentContext()
    resolver = _resolverForContext(resolver, context)
    return _withSdfTrace(_getArTraceContext(context), 'typescript-usd:Layer.openAsAnonymous',
      traceContext => Layer._findOrOpen(filePath, resolver, context, traceContext, { metadataOnly, tag }))
  }

  // SdfLayer::Find(identifier), layer.cpp:1204-1240. This is an exact registry
  // lookup and never opens an asset.
  // The identifier is normalized by the resolver (_ComputeInfoToFindOrOpenLayer);
  // a layer not found by identifier is looked up by its real path
  // (Sdf_LayerRegistry::_FindByRealPath).
  // PLATFORM-DIVERGENCE(sdf-find-async-resolver): upstream computes that real
  // path with ArResolver::Resolve (layer.cpp:767-771). Resolve returns a
  // promise in this port (ArResolver.resolve, ar/src/resolver.ts), because a
  // browser resolver reads through asynchronous I/O, so the synchronous Find
  // cannot call it: an identifier that names an open layer only through the
  // resolver (a custom resolver's unanchored URI) is not found. FindOrOpen,
  // which awaits Resolve, returns the open layer from the registry instead.
  static find(filePath: string): Layer | undefined {
    const found = _layerRegistry.find(filePath, '', true)
    if (found || filePath.startsWith('anon:')) return found
    const identifier = ArGetResolver().createIdentifier(filePath)
    return (identifier !== filePath ? _layerRegistry.find(identifier, '', true) : undefined) ??
      _layerRegistry.find(identifier, ArGetResolver().createIdentifierForNewAsset(identifier), false)
  }

  // FindOrOpen and OpenAsAnonymous (layer.cpp:852-914, 943-994) with
  // _OpenLayerAndUnlockRegistry (layer.cpp:3540-3640). Each failure yields
  // undefined as upstream yields null:
  //   - an anonymous identifier not in the registry, an empty or unresolvable
  //     path: no error (layer.cpp:880-903).
  //   - no file format for the path: TF_CODING_ERROR "Cannot determine file
  //     format for @id@" (layer.cpp:3563-3568, 959-963).
  //   - an asset Ar cannot open, a package whose entry or first file is
  //     missing or has no format: no error, as the formats' Read returns
  //     false (usdaFileFormat.cpp:300-305, usdFileFormat.cpp:225-228,
  //     usdzFileFormat.cpp:138-148).
  //   - a format read failure: the format's error, posted as upstream's
  //     formats post theirs before returning false (e.g. the crate version
  //     errors, crateFile.cpp:3544-3578). The readers here throw their
  //     diagnostic; a thrown TfError is posted unchanged and any other
  //     thrown error as a TF_RUNTIME_ERROR with its message.
  //   - an exception while fetching the asset: TF_RUNTIME_ERROR "Exception
  //     thrown while opening layer: ..." (layer.cpp:906-912, 984-988).
  // `errors` collects these errors in place of posting them.
  private static async _findOrOpen(
    filePath: string,
    resolver: ArResolver,
    context: ArResolverContext,
    traceContext: LogicalTraceContext | undefined,
    anonymous?: { metadataOnly: boolean; tag: string },
    errors?: TfError[],
  ): Promise<Layer | undefined> {
    if (traceContext) _traceScopeData(traceContext, 'identifier', filePath)
    // An anonymous layer can only be found, never opened (layer.cpp:891-897).
    if (filePath.startsWith('anon:')) return Layer.find(filePath)
    const info = await _withSdfTrace(
      traceContext,
      'typescript-usd:Layer.computeInfoToFindOrOpenLayer',
      async infoContext => {
        const { assetPath, args } = splitLayerIdentifier(filePath)
        const packagePath = splitPackagePath(assetPath)
        // Ar resolves the outer package as an asset. The packaged portion remains
        // a stable package-relative identifier interpreted by the package format.
        const assetToResolve = packagePath?.packagePath ?? assetPath
        const canonicalOuter = resolver.createIdentifier(assetToResolve)
        const canonicalAssetPath = packagePath
          ? joinPackagePath(canonicalOuter, packagePath.innerPath)
          : canonicalOuter
        const identifier = createLayerIdentifier(canonicalAssetPath, args)
        const resolvedPath = await sdfResolvePath(
          resolver, assetToResolve, context, infoContext)
        // layer.cpp:899-903 (OpenAsAnonymous reads the unresolved path and
        // fails in the format's Read): no asset, no error.
        if (!resolvedPath.valid) return undefined
        const resolvedAssetPath = packagePath
          ? joinPackagePath(resolvedPath.toString(), packagePath.innerPath)
          : resolvedPath.toString()
        const resolvedIdentifier = createLayerIdentifier(resolvedAssetPath, args)
        // _Info::GetFileFormat loads the format's plugin; loading is
        // asynchronous, so it happens before the synchronous lookup.
        await _loadFileFormatPluginForPath(resolvedAssetPath)
        // layer.cpp:784-785: the format for the extension and any 'target'
        // argument.
        const fileFormat = SdfFileFormat.findByExtensionForArgs(resolvedAssetPath, args, infoContext)
        // layer.cpp:3563-3568 (and OpenAsAnonymous, layer.cpp:959-963): no
        // format for the layer, as when no plugin declares its extension.
        if (!fileFormat) {
          _postOpenError(new TfError(`Cannot determine file format for @${identifier}@`, TfDiagnosticType.CodingError), errors)
          return undefined
        }
        return {
          assetToResolve,
          canonicalAssetPath,
          canonicalOuter,
          fileFormat,
          identifier,
          packagePath,
          registryIdentifier: identifier,
          registryResolvedIdentifier: resolvedIdentifier,
          resolvedAssetPath,
          resolvedPath,
          trustIdentifier: !resolver.isContextDependentPath(assetToResolve),
        }
      },
    )

    if (!info) return undefined
    // Fetches the bytes the format reads: the asset's, or a package's root
    // layer entry. Undefined where the format's Read returns false without
    // an error.
    const fetchLayerBytes = async (): Promise<{ bytes: Uint8Array, rootEntry?: string } | undefined> => {
      const { assetToResolve, fileFormat, identifier, packagePath, resolvedPath } = info
      let bytes: Uint8Array | undefined
      if (packagePath) {
        const zip = await openZip(assetToResolve, resolver, context).catch(() => undefined)
        if (!zip) return undefined
        bytes = await extractPackagedBytes(zip, packagePath.innerPath,
          [info.canonicalOuter, resolvedPath.toString()])
        if (!bytes) return undefined
      } else {
        const asset = await resolver.openAsset(resolvedPath, context)
        if (!asset) return undefined
        bytes = await asset.getBuffer()
        // What the format's synchronous Read reads through Ar besides the
        // layer's asset (e.g. a MaterialX document's XIncludes, usdMtlx/
        // utils.cpp:241-334), read ahead (ar/src/prefetchedAssets.ts).
        if (_ArHasAssetPrefetcher(resolvedPath.toString())) {
          await _ArPrefetchAsset(resolvedPath, {
            resolve: assetPath => resolver.resolve(assetPath, context),
            openAsset: path => resolver.openAsset(path, context),
          })
        }
      }

      // A package layer is identified by the package and read by the
      // package's file format from its root layer (usdzFileFormat.cpp:
      // 125-158). The root entry is extracted here because a compressed
      // entry inflates asynchronously.
      if (fileFormat instanceof SdfUsdzFileFormat && UsdZipFile.isZip(bytes)) {
        let zip = UsdZipFile.fromBytes(bytes)
        let packagePaths = [info.canonicalAssetPath, info.resolvedAssetPath]
        let cachePaths = [identifier, info.registryResolvedIdentifier]
        for (;;) {
          for (const path of new Set([...packagePaths, ...cachePaths])) _cachePackage(path, zip, resolver, context)
          cachePaths = []
          _recordPackageEntries(packagePaths, zip)
          // The first entry is the root layer (usdzFileFormat.cpp:49-60,
          // 140-152); a package with no entries, or whose first entry has
          // no file format, fails the read without an error.
          const rootEntry = zip.getFileNames()[0]
          if (!rootEntry) return undefined
          const rootFormat = SdfFileFormat.findByExtension(rootEntry)
          if (!rootFormat) return undefined
          const rootBytes = await zip.extract(rootEntry)
          // A first entry that is itself a package is read by its format
          // from the joined package-relative path (usdzFileFormat.cpp:
          // 149-157), recursing to the nested package's root layer.
          if (rootFormat.isPackage() && UsdZipFile.isZip(rootBytes)) {
            packagePaths = packagePaths.map(path => joinPackagePath(path, rootEntry))
            zip = UsdZipFile.fromBytes(rootBytes)
            continue
          }
          return { bytes: rootBytes, rootEntry }
        }
      }
      return { bytes }
    }
    const readLayer = async (openContext: SdfTraceContext): Promise<Layer | undefined> => {
      let fetched: Awaited<ReturnType<typeof fetchLayerBytes>>
      try {
        fetched = await fetchLayerBytes()
      } catch (error) {
        _postOpenError(_exceptionWhileOpening(error), errors)
        return undefined
      }
      if (!fetched) return undefined
      // The format's Read runs synchronously; what it posts while failing
      // belongs to this open.
      const mark = new TfErrorMark()
      try {
        return finish(Layer._read(
          fetched.bytes, info.identifier, openContext, context, info.fileFormat,
          info.registryResolvedIdentifier, fetched.rootEntry, anonymous?.metadataOnly ?? false,
          anonymous ? new Map() : undefined,
        ))
      } catch (error) {
        if (errors) {
          errors.push(...mark.getErrors())
          mark.clear()
        }
        _postOpenError(_readFailureError(error), errors)
        return undefined
      } finally {
        mark.dispose()
      }
    }
    const finish = (parsed: Layer): Layer => {
      if (!anonymous) return parsed
      const identifier = `anon:${++Layer._anonymousSequence}:${anonymous.tag}`
      const result = new Layer(identifier, parsed._data, context, parsed._isDetached, '')
      result._fileFormat = info.fileFormat
      result._fileFormatArgs = new Map()
      result.markCurrentStateAsClean()
      _layerRegistry.register(result, identifier)
      return result
    }
    if (anonymous) return readLayer(traceContext)
    return _layerRegistry.findOrOpen(info.registryIdentifier, info.registryResolvedIdentifier,
      info.trustIdentifier, registryContext => _withSdfTrace(registryContext,
        'typescript-usd:Layer.openLayer', readLayer), traceContext)
  }

  // SdfLayer has no Open; this is FindOrOpen.
  static open(filePath: string): Promise<Layer | undefined> {
    return Layer.findOrOpen(filePath)
  }

  // Creates a layer from in-memory content (USDA text or USDA/USDC bytes)
  // under the given identifier — no resolver or filesystem involved.
  static createInMemory(identifier: string, content: string | Uint8Array): Layer {
    const bytes = typeof content === 'string' ? new TextEncoder().encode(content) : content
    if (typeof content === 'string') {
      const registered = SdfFileFormat.findByExtension(identifier)
      // SdfLayer::ImportFromString is USDA regardless of the layer identifier.
      // Preserve custom format readers while routing built-in string imports
      // through the canonical Layer-read/file-format-read mechanism.
      const format = registered && !['usd', 'usda', 'usdc'].includes(registered.formatId)
        ? registered : new SdfUsdaFileFormat()
      // SdfUsdaFileFormat::ReadFromString (usdaFileFormat.cpp:565-600).
      const text = format instanceof SdfUsdaFileFormat ? sdfUsdaReadFromStringText(content) : content
      return Layer._read(new TextEncoder().encode(text), identifier, undefined, undefined, format)
    }
    return Layer.fromBytes(bytes, identifier)
  }

  // Creates an empty in-memory layer suitable for authoring.
  // SdfLayer::CreateAnonymous (layer.h:277-285; layer.cpp:392-425): the file
  // format is the given one, or else found by the tag's extension, defaulting
  // to usda, and supplies the layer data.
  static createAnonymous(tag?: string, args?: SdfFileFormatArguments): Layer
  static createAnonymous(tag: string, format: SdfFileFormat | undefined, args?: SdfFileFormatArguments): Layer
  static createAnonymous(
    tag = '', formatOrArgs?: SdfFileFormat | SdfFileFormatArguments, maybeArgs?: SdfFileFormatArguments,
  ): Layer {
    const explicitFormat = formatOrArgs instanceof SdfFileFormat || arguments.length >= 3
    const args: SdfFileFormatArguments = new Map(explicitFormat ? maybeArgs : formatOrArgs as SdfFileFormatArguments | undefined)
    const displayTag = tag.replace(/^anon:(?:\/\/)?/, '')
    let fileFormat: SdfFileFormat | undefined
    if (explicitFormat) {
      fileFormat = formatOrArgs as SdfFileFormat | undefined
      if (!fileFormat) {
        throw new TfError('Invalid file format for anonymous SdfLayer', TfDiagnosticType.CodingError)
      }
    } else {
      const suffix = displayTag.includes('.') ? displayTag.slice(displayTag.lastIndexOf('.') + 1) : ''
      fileFormat = suffix ? SdfFileFormat.findByExtension(`.${suffix}`) : undefined
      fileFormat ??= SdfFileFormat.findById('usda')
      if (!fileFormat) {
        throw new TfError('Cannot determine file format for anonymous SdfLayer', TfDiagnosticType.CodingError)
      }
    }
    // _CreateAnonymousWithFormat (layer.cpp:427-451).
    if (fileFormat.isPackage()) {
      throw new TfError(`Cannot create anonymous layer: creating package ${fileFormat.formatId} ` +
        'layer is not allowed through this API.', TfDiagnosticType.CodingError)
    }
    const identifier = `anon:${++Layer._anonymousSequence}:${displayTag}`
    const layer = new Layer(identifier, fileFormat.initData(args))
    layer._fileFormat = fileFormat
    layer._fileFormatArgs = args
    // Anonymous layers are registered so SdfLayer::Find finds them.
    _layerRegistry.register(layer, layer.identifier)
    return layer
  }

  // SdfLayer::CreateNew (layer.h:244-262; layer.cpp:471-495) with
  // SdfLayer::_CreateNew (layer.cpp:573-704): creates a new empty layer with
  // the given identifier, saved at once so it overwrites any existing file,
  // or posts a coding error and yields undefined. The file format is the
  // given one, or else found by the new asset's extension. Asynchronous
  // because the resolve for a new asset and the save are.
  static async createNew(identifier: string, args?: SdfFileFormatArguments): Promise<Layer | undefined>
  static async createNew(
    fileFormat: SdfFileFormat, identifier: string, args?: SdfFileFormatArguments,
  ): Promise<Layer | undefined>
  static async createNew(
    first: string | SdfFileFormat, second?: string | SdfFileFormatArguments, third?: SdfFileFormatArguments,
  ): Promise<Layer | undefined> {
    let fileFormat = first instanceof SdfFileFormat ? first : undefined
    const identifier = first instanceof SdfFileFormat ? second as string : first
    const args: ReadonlyMap<string, string> =
      (first instanceof SdfFileFormat ? third : second as SdfFileFormatArguments | undefined) ?? new Map()
    const cannotCreate = (id: string, whyNot: string): undefined => {
      TfDiagnosticMgr.GetInstance().postError(new TfError(
        `Cannot create new layer '${id}': ${whyNot}`, TfDiagnosticType.CodingError))
      return undefined
    }

    // Sdf_CanCreateNewLayerWithIdentifier (assetPathResolver.cpp:51-78).
    if (!identifier) return cannotCreate(identifier, 'cannot use empty identifier.')
    if (identifier.startsWith('anon:')) {
      return cannotCreate(identifier, 'cannot use anonymous layer identifier.')
    }
    if (identifier.includes(SDF_FORMAT_ARGS_MARKER)) {
      return cannotCreate(identifier, 'cannot use arguments in the identifier.')
    }

    // layer.cpp:588-617: the identifier and local path for the new asset;
    // errors posted while computing them become the reason.
    const resolver = ArGetResolver()
    let absIdentifier = ''
    let localPath = ''
    let whyNot = ''
    {
      const mark = new TfErrorMark()
      try {
        absIdentifier = resolver.createIdentifierForNewAsset(identifier)
        localPath = (await resolver.resolveForNewAsset(absIdentifier)).toString()
      } catch (error) {
        if (!(error instanceof TfError)) throw error
        TfDiagnosticMgr.GetInstance().postError(error)
      }
      if (!mark.isClean()) {
        whyNot = mark.getErrors().map(error => error.message).join(', ')
        mark.clear()
      }
      mark.dispose()
    }
    if (!localPath) {
      return cannotCreate(absIdentifier, whyNot || 'failed to compute path for new layer')
    }

    // layer.cpp:619-626: the format by the local path's suffix. (Upstream's
    // failed TF_VERIFY.)
    if (!fileFormat) {
      await _loadFileFormatPluginForPath(localPath)
      fileFormat = SdfFileFormat.findByExtensionForArgs(localPath, args)
      if (!fileFormat) {
        TfDiagnosticMgr.GetInstance().postError(new TfError(
          "Failed verification: ' fileFormat '", TfDiagnosticType.CodingError))
        return undefined
      }
    }

    // Sdf_IsPackageOrPackagedLayer (assetPathResolver.cpp:461-467;
    // layer.cpp:628-637).
    const packaged = ArIsPackageRelativePath(identifier)
    if (fileFormat.isPackage() || packaged) {
      return cannotCreate(identifier, `creating ${fileFormat.isPackage() ? 'package' : 'packaged'} ` +
        `${fileFormat.formatId} layer is not allowed through this API.`)
    }

    // _CanonicalizeFileFormatArguments (layer.cpp:497-571): a 'target'
    // argument is dropped for the extension's primary format and otherwise
    // names this format's target; a target is part of the identifier
    // (layer.cpp:643-655).
    // FAITHFULNESS-DEBT(usdutils-sdf-create-new-default-args): layer.cpp:556-568
    // also strips arguments equal to the format's
    // GetDefaultFileFormatArguments(); SdfFileFormat here publishes no
    // default arguments, so none are stripped. The faithful end state is
    // SdfFileFormat.getDefaultFileFormatArguments, applied here and in
    // findOrOpen.
    const finalArgs = new Map(args)
    const target = finalArgs.get('target')
    if (target !== undefined) {
      if (SdfFileFormat.findByExtension(localPath) === fileFormat) finalArgs.delete('target')
      else {
        // SdfFileFormat::GetTarget: the target this format was found by.
        const formatTarget = target.split(',').map(t => t.trim())
          .find(t => t !== '' && SdfFileFormat.findByExtensionAndTarget(localPath, t) === fileFormat)
        if (formatTarget !== undefined) finalArgs.set('target', formatTarget)
      }
    }
    const targetArg = finalArgs.get('target')
    const identityArgs = new Map(targetArg === undefined ? [] : [['target', targetArg]])
    absIdentifier = createLayerIdentifier(absIdentifier, identityArgs)
    const resolvedIdentifier = createLayerIdentifier(localPath, identityArgs)

    // layer.cpp:661-667.
    if (Layer.find(absIdentifier)) {
      TfDiagnosticMgr.GetInstance().postError(new TfError(
        `A layer already exists with identifier '${absIdentifier}'`, TfDiagnosticType.CodingError))
      return undefined
    }

    // _CreateNewWithFormat (layer.cpp:310-323): SdfFileFormat::NewLayer.
    const layer = new Layer(absIdentifier, fileFormat.initData(finalArgs), undefined, true, resolvedIdentifier)
    layer._fileFormat = fileFormat
    layer._fileFormatArgs = finalArgs

    // layer.cpp:684-700: a forced save so the new layer overwrites any
    // existing file; a failed save yields no layer. The layer is registered
    // once it has initialized successfully (_FinishInitialization).
    if (!await layer._writeToPath(splitLayerIdentifier(absIdentifier).assetPath, finalArgs, true)) {
      return undefined
    }
    layer.markCurrentStateAsClean()
    _layerRegistry.register(layer, absIdentifier)
    _layerRegistry.update(layer, absIdentifier, resolvedIdentifier)
    return layer
  }

  private static _createEmpty(identifier: string): Layer {
    const data = new SdfData()
    data.createSpec('/', 'pseudoRoot')
    const layer = new Layer(identifier, data)
    return layer
  }

  // SdfLayer::IsEmpty (layer.cpp): no root prims, root prim order, or
  // sublayers.
  isEmpty(): boolean {
    const empty = (field: string): boolean => {
      const value = this._data._getView('/', field)
      return !Array.isArray(value) || value.length === 0
    }
    return empty('primChildren') && empty('primOrder') && empty('subLayers')
  }

  /** @internal An empty anonymous layer named like this one (for diffs). */
  _createEmptyAnonymous(): Layer {
    return Layer.createAnonymous(this.getDisplayName())
  }

  // SdfLayer::GetDisplayName. Anonymous identifiers carry process-unique
  // identity before the final display tag; UI and authored helper paths use
  // the tag without weakening the identifier itself.
  getDisplayName(): string {
    const anonymous = /^anon:\d+:(.*)$/.exec(this.filePath)
    if (anonymous) return anonymous[1]!
    const { assetPath } = splitLayerIdentifier(this.filePath)
    const slash = assetPath.lastIndexOf('/')
    return slash < 0 ? assetPath : assetPath.slice(slash + 1)
  }

  // The package branch of SdfComputeAssetPathRelativeToLayer
  // (layerUtils.cpp:117-183); undefined falls through to ordinary
  // resolution (layerUtils.cpp:182-193). Anchoring starts from the layer's
  // identifier rather than its real path (layerUtils.cpp:120-122) so the
  // resulting identifiers keep the form the layer was opened with, as
  // everywhere else in Layer here.
  private _computeAssetPathRelativeToPackage(assetPath: string): string | undefined {
    const { assetPath: strippedAssetPath, args: layerArgs } = splitLayerIdentifier(assetPath)
    const format = this.getFileFormat()
    const anchorPackagePath = splitLayerIdentifier(this.filePath).assetPath
    // Sdf_IsPackageOrPackagedLayer (assetPathResolver.cpp:461-467).
    const isPackageOrPackaged = (format?.isPackage() ?? false) || ArIsPackageRelativePath(anchorPackagePath)
    if (!strippedAssetPath || !isPackageOrPackaged || isAbsolute(strippedAssetPath)) return undefined

    // Anchor against the innermost packaged path; a package layer anchors
    // against its root layer, which may be nested in another package.
    let packagePath: [string, string]
    if (format?.isPackage()) {
      packagePath = expandPackagePath([anchorPackagePath, format.getPackageRootLayerPath(anchorPackagePath)])
    } else {
      packagePath = ArSplitPackageRelativePathInner(anchorPackagePath)
    }
    const normAssetPath = normalizeRelative(strippedAssetPath)
    packagePath[1] = anchorRelativePath(packagePath[1], normAssetPath)
    let finalLayerPath = ArJoinPackageRelativePath(packagePath)

    // Anchored relative paths ("./x") are done; search relative paths are
    // first tried anchored to the authoring layer (layerUtils.cpp:146-158).
    const isSearchRelativePath = !strippedAssetPath.startsWith('.')
    if (!isSearchRelativePath || packagedPathResolves(finalLayerPath)) {
      return createLayerIdentifier(finalLayerPath, layerArgs)
    }

    // Then anchored to the owning package's root layer, which may be nested
    // in another package layer (layerUtils.cpp:160-180).
    const packageFormat = SdfFileFormat.findByExtension(packagePath[0])
    if (packageFormat?.isPackage()) {
      packagePath = expandPackagePath([packagePath[0], packageFormat.getPackageRootLayerPath(packagePath[0])])
      packagePath[1] = anchorRelativePath(packagePath[1], normAssetPath)
    } else {
      packagePath[1] = normAssetPath
    }
    finalLayerPath = ArJoinPackageRelativePath(packagePath)
    if (packagedPathResolves(finalLayerPath)) return createLayerIdentifier(finalLayerPath, layerArgs)
    return undefined
  }

  resolveAsset(assetPath: string): string {
    const traceContext = this._resolverContext
      ? _getArTraceContext(this._resolverContext)
      : undefined
    return _withSdfTraceSync(traceContext, 'typescript-usd:Layer.resolveAsset', context => {
      if (context) _traceScopeData(context, 'assetPath', assetPath)
      // SdfLayer::ComputeAbsolutePath leaves anonymous identifiers unchanged.
      if (assetPath.startsWith('anon:')) return assetPath
      // SdfComputeAssetPathRelativeToLayer (layerUtils.cpp:64-194): relative
      // paths anchor inside a package or packaged layer; anything else is
      // the resolver's identifier anchored to the layer's resolved path.
      const packaged = this._computeAssetPathRelativeToPackage(assetPath)
      if (packaged !== undefined) return packaged
      const resolver = _resolverForContext(
        ArGetResolver(), this._resolverContext ?? ArGetResolver().getCurrentContext())
      return resolver.createIdentifier(assetPath, new ArResolvedPath(this.resolvedPath || this.filePath))
    })
  }

  // SdfLayer::GetField (layer.cpp:3861-3880): the authored value, or a
  // required field's fallback for an existing spec.
  getField(specPath: string, fieldName: string): unknown {
    // Read-only, as the values SdfData stores (immutableValue.ts).
    const value = this._data.get(specPath, fieldName)
    if (value !== undefined) return _sdfHandOut(value)
    // Only a required field has a fallback, so other names need no spec type.
    if (!SdfSchema.getInstance().isRequiredFieldName(fieldName)) return undefined
    return _sdfHandOut(requiredFieldFallback(this._data.getSpecType(specPath), fieldName))
  }

  // SdfLayer::GetFieldDictValueByKey (layer.cpp:3928-3936).
  getFieldDictValueByKey(specPath: string, fieldName: string, keyPath: string): unknown {
    return _sdfHandOut(this._data.getDictValueByKey(specPath, fieldName, keyPath))
  }

  // SdfLayer::SetFieldDictValueByKey (layer.cpp:4003-4031) and
  // _PrimSetFieldDictValueByKey (layer.cpp:4767-4794): the key's value is
  // set in the field's dictionary, and the change is the whole field's. A
  // value equal to the key's current value changes nothing.
  setFieldDictValueByKey(specPath: string, fieldName: string, keyPath: string, value: unknown): void {
    const oldValue = this.getFieldDictValueByKey(specPath, fieldName, keyPath)
    if (sdfValuesEqual(value, oldValue)) return
    this._primSetFieldDictValueByKey(specPath, fieldName, keyPath, value)
  }

  // SdfLayer::EraseFieldDictValueByKey (layer.cpp:4096-4121).
  eraseFieldDictValueByKey(specPath: string, fieldName: string, keyPath: string): void {
    if (!this._data.hasDictKey(specPath, fieldName, keyPath)) return
    this._primSetFieldDictValueByKey(specPath, fieldName, keyPath, undefined)
  }

  private _primSetFieldDictValueByKey(
    specPath: string, fieldName: string, keyPath: string, value: unknown,
  ): void {
    // SdfAbstractData::SetDictValueByKey applied to the field's current value.
    const scratch = new SdfData()
    scratch.createSpec(specPath, this._data.getSpecType(specPath) as Exclude<SdfSpecType, 'unknown'>)
    const current = this._data.get(specPath, fieldName)
    if (current !== undefined) scratch.set(specPath, fieldName, current)
    scratch.setDictValueByKey(specPath, fieldName, keyPath, value)
    const newValue = scratch.get(specPath, fieldName)
    if (newValue === undefined) this.eraseField(specPath, fieldName)
    else this.setField(specPath, fieldName, newValue)
  }

  // SdfLayer::{Get,Set,Has,Clear}TimeCodesPerSecond (layer.cpp:1835-1874):
  // an unauthored timeCodesPerSecond falls back to framesPerSecond.
  getTimeCodesPerSecond(): number {
    if (this.hasField('/', 'timeCodesPerSecond')) return Number(this.getField('/', 'timeCodesPerSecond'))
    return this.getFramesPerSecond()
  }
  setTimeCodesPerSecond(value: number): void { this.setField('/', 'timeCodesPerSecond', value) }
  hasTimeCodesPerSecond(): boolean { return this.hasField('/', 'timeCodesPerSecond') }
  clearTimeCodesPerSecond(): void { this.eraseField('/', 'timeCodesPerSecond') }

  // SdfLayer::{Get,Set,Has,Clear}FramesPerSecond (layer.cpp:1876-1900); the
  // schema fallback is 24.
  getFramesPerSecond(): number {
    const value = this.getField('/', 'framesPerSecond')
    return Number(value ?? SdfSchema.getInstance().getFallback('framesPerSecond'))
  }
  setFramesPerSecond(value: number): void { this.setField('/', 'framesPerSecond', value) }
  hasFramesPerSecond(): boolean { return this.hasField('/', 'framesPerSecond') }
  clearFramesPerSecond(): void { this.eraseField('/', 'framesPerSecond') }

  // SdfLayer::{Get,Set,Has,Clear}ExpressionVariables (layer.cpp:2014-2036).
  // The dictionary is a record of the held values, as other dictionary fields.
  getExpressionVariables(): Record<string, unknown> {
    const value = this.getField('/', 'expressionVariables')
    return (value && typeof value === 'object' ? value : {}) as Record<string, unknown>
  }
  setExpressionVariables(dict: Record<string, unknown>): void {
    this.setField('/', 'expressionVariables', dict)
  }
  hasExpressionVariables(): boolean { return this.hasField('/', 'expressionVariables') }
  clearExpressionVariables(): void { this.eraseField('/', 'expressionVariables') }

  // SdfLayer::HasField (layer.cpp:3768-3787).
  hasField(specPath: string, fieldName: string): boolean {
    if (this._data.has(specPath, fieldName)) return true
    return requiredFieldFallback(this._data.getSpecType(specPath), fieldName) !== undefined
  }

  // SdfLayer::ListFields (layer.cpp:3652-3698): the authored fields plus the
  // spec type's required fields, in authored order.
  listFields(specPath: string): string[] {
    const fields = this._data.list(specPath)
    const specType = this._data.getSpecType(specPath)
    if (specType === 'unknown') return fields
    for (const name of SdfSchema.getInstance().getRequiredFields(specType)) {
      if (!fields.includes(name)) fields.push(name)
    }
    return fields
  }

  /** @internal Uncloned field value for read-only composition; see SdfAbstractData._getView. */
  _getFieldView(specPath: string, fieldName: string): unknown {
    return this._data._getView(specPath, fieldName)
  }

  /** @internal Concrete parser type retained for unregistered metadata. */
  _getFieldValueTypeName(specPath: string, fieldName: string): string | undefined {
    return this._data.getValueTypeName(specPath, fieldName)
  }

  // SdfData::GetPreviousTimeSampleForPath uses lower_bound and then steps
  // back, so an exact authored time returns the preceding sample rather than
  // itself (pxr/usd/sdf/data.cpp:416-443).
  getPreviousTimeSampleForPath(specPath: string, time: number): number | undefined {
    return this._data.getPreviousTimeSampleForPath(specPath, time)
  }

  // Field names authored on a spec (SdfLayer::ListFields analog).
  getFieldNames(specPath: string): string[] {
    return this._data.list(specPath)
  }

  // Every spec path in the layer (the SdfLayer::Traverse analog).
  getSpecPaths(): string[] {
    const paths: string[] = []
    this._data.visitSpecs({
      visitSpec: (_data, path) => { paths.push(path); return true },
      done: () => {},
    })
    return paths
  }

  hasSpec(specPath: string): boolean {
    return this._data.hasSpec(specPath)
  }

  getSpecType(specPath: string): SdfSpecType {
    return this._data.getSpecType(specPath)
  }

  // ---- Spec handles (SdfLayer::GetObjectAtPath et al., layer.cpp:2196-2284) ----

  // _CanGetSpecAtPath: the canonical (absolute) path of a spec in this layer.
  private _canonicalSpecPath(path: string | SdfPath): SdfPath | undefined {
    const sdfPath = typeof path === 'string' ? SdfPath.fromString(path) : path
    if (sdfPath.isEmpty()) return undefined
    // Target paths within the path are made absolute too.
    const absPath = !sdfPath.isAbsolutePath() || sdfPath.pathString.includes('[')
      ? sdfPath.makeAbsolutePath(SdfPath.absoluteRootPath) : sdfPath
    if (absPath.isEmpty() || this._data.getSpecType(absPath.pathString) === 'unknown') return undefined
    return absPath
  }

  // The handle class of each spec type (the most-derived SdfSpec class).
  private _handleFor(path: SdfPath): SdfSpec {
    const id = this._idRegistry.identify(path)
    switch (this._data.getSpecType(path.pathString)) {
      case 'pseudoRoot': return SdfPseudoRootSpec._forIdentity(id)
      case 'prim': return SdfPrimSpec._forIdentity(id)
      case 'attribute': return SdfAttributeSpec._forIdentity(id)
      case 'relationship': return SdfRelationshipSpec._forIdentity(id)
      case 'variantSet': return SdfVariantSetSpec._forIdentity(id)
      case 'variant': return SdfVariantSpec._forIdentity(id)
      default: return SdfSpec._forIdentity(id)
    }
  }

  // SdfLayer::GetObjectAtPath: a handle to the spec at path, of its
  // most-derived spec class.
  getObjectAtPath(path: string | SdfPath): SdfSpec | undefined {
    const canonical = this._canonicalSpecPath(path)
    return canonical ? this._handleFor(canonical) : undefined
  }

  // SdfLayer::GetPrimAtPath: prim, variant and pseudo-root specs.
  getPrimAtPath(path: string | SdfPath): SdfPrimSpec | undefined {
    const canonical = this._canonicalSpecPath(path)
    if (!canonical) return undefined
    const id = this._idRegistry.identify(canonical)
    switch (this._data.getSpecType(canonical.pathString)) {
      case 'pseudoRoot': return SdfPseudoRootSpec._forIdentity(id)
      case 'prim': case 'variant': return SdfPrimSpec._forIdentity(id)
      default: return undefined
    }
  }

  getPropertyAtPath(path: string | SdfPath): SdfPropertySpec | undefined {
    const canonical = this._canonicalSpecPath(path)
    if (!canonical) return undefined
    const specType = this._data.getSpecType(canonical.pathString)
    return specType === 'attribute' || specType === 'relationship'
      ? this._handleFor(canonical) as SdfPropertySpec : undefined
  }

  getAttributeAtPath(path: string | SdfPath): SdfAttributeSpec | undefined {
    const canonical = this._canonicalSpecPath(path)
    return canonical && this._data.getSpecType(canonical.pathString) === 'attribute'
      ? SdfAttributeSpec._forIdentity(this._idRegistry.identify(canonical)) : undefined
  }

  getRelationshipAtPath(path: string | SdfPath): SdfRelationshipSpec | undefined {
    const canonical = this._canonicalSpecPath(path)
    return canonical && this._data.getSpecType(canonical.pathString) === 'relationship'
      ? SdfRelationshipSpec._forIdentity(this._idRegistry.identify(canonical)) : undefined
  }

  // SdfLayer::GetPseudoRoot.
  getPseudoRoot(): SdfPrimSpec {
    return SdfPseudoRootSpec._forIdentity(this._idRegistry.identify(SdfPath.absoluteRootPath))
  }

  /** @internal Sdf_IdentityRegistry::MoveIdentity. */
  private _moveIdentity(oldPath: string, newPath: string): void {
    this._idRegistry.moveIdentity(SdfPath.fromString(oldPath), SdfPath.fromString(newPath))
  }

  // ---- Root prims (layer.cpp:2040-2104) ----

  getRootPrims(): SdfChildrenProxy<SdfPrimSpec> { return this.getPseudoRoot().getNameChildren() }

  setRootPrims(rootPrims: readonly SdfPrimSpec[]): void { this.getPseudoRoot().setNameChildren(rootPrims) }

  insertRootPrim(prim: SdfPrimSpec, index = -1): boolean {
    return this.getPseudoRoot().insertNameChild(prim, index)
  }

  removeRootPrim(prim: SdfPrimSpec): void { this.getPseudoRoot().removeNameChild(prim) }

  getRootPrimOrder(): SdfNameOrderProxy { return sdfGetNameOrderProxy(this.getPseudoRoot(), 'primOrder') }

  setRootPrimOrder(names: readonly string[]): void { this.getRootPrimOrder().assign(names) }

  insertInRootPrimOrder(name: string, index = -1): void { this.getRootPrimOrder().insert(index, name) }

  removeFromRootPrimOrder(name: string): void { this.getRootPrimOrder().remove(name) }

  removeFromRootPrimOrderByIndex(index: number): void { this.getRootPrimOrder().erase(index) }

  /** Applies the root prim order to names; returns the reordered names. */
  applyRootPrimOrder(names: readonly string[]): string[] {
    return this.getRootPrimOrder().applyEditsToList(names)
  }

  // SdfLayer::IsAnonymous.
  isAnonymous(): boolean { return this.filePath.startsWith('anon:') }

  // ---- Namespace edits (layer.cpp:2312-2505) ----

  // SdfLayer::CanApply: whether the edits apply as a batch.
  canApply(edits: SdfBatchNamespaceEdit, details?: SdfNamespaceEditDetail[]): SdfNamespaceEditDetailResult {
    let result = SdfNamespaceEditDetailResult.Okay
    const processed = edits.process(
      path => this.getObjectAtPath(path) !== undefined,
      edit => this._canEdit(edit), details, false)
    if (!processed) result = sdfCombineError(result)
    return result
  }

  // SdfLayer::Apply: applies the edits as a batch; returns whether it did.
  apply(edits: SdfBatchNamespaceEdit): boolean {
    if (!this.permissionToEdit()) return false
    const processed = edits.process(
      path => this.getObjectAtPath(path) !== undefined,
      edit => this._canEdit(edit), undefined, false)
    if (!processed) return false
    sdfChangeBlock(() => {
      for (const edit of processed) this._doEdit(edit)
    })
    return true
  }

  // _CanEdit (layer.cpp:2319-2394): undefined when allowed, else why not.
  private _canEdit(edit: SdfNamespaceEdit): string | undefined {
    const whyNot = (allowed: SdfAllowed): string | undefined =>
      allowed.isAllowed() ? undefined : allowed.getWhyNot()
    const { currentPath, newPath, index } = edit
    if (currentPath.isPrimPath()) {
      return newPath.isEmpty()
        ? whyNot(Sdf_ChildrenUtils.canRemoveChildForBatchNamespaceEdit(
          Sdf_PrimChildPolicy, this, currentPath.getParentPath(), currentPath.name))
        : whyNot(Sdf_ChildrenUtils.canMoveChildForBatchNamespaceEdit(
          Sdf_PrimChildPolicy, this, newPath.getParentPath(), this.getPrimAtPath(currentPath),
          newPath.name, index))
    }
    if (newPath.isEmpty()) {
      return whyNot(Sdf_ChildrenUtils.canRemoveChildForBatchNamespaceEdit(
        currentPath.isRelationalAttributePath() ? Sdf_AttributeChildPolicy : Sdf_PropertyChildPolicy,
        this, currentPath.getParentPath(), currentPath.name))
    }
    if (newPath.isRelationalAttributePath()) {
      const attr = this.getAttributeAtPath(currentPath)
      if (!attr) return 'Object is not an attribute'
      return whyNot(Sdf_ChildrenUtils.canMoveChildForBatchNamespaceEdit(
        Sdf_AttributeChildPolicy, this, newPath.getParentPath(), attr, newPath.name, index))
    }
    return whyNot(Sdf_ChildrenUtils.canMoveChildForBatchNamespaceEdit(
      Sdf_PropertyChildPolicy, this, newPath.getParentPath(), this.getPropertyAtPath(currentPath),
      newPath.name, index))
  }

  // _DoEdit (layer.cpp:2396-2462).
  private _doEdit(edit: SdfNamespaceEdit): void {
    const { currentPath, newPath, index } = edit
    if (currentPath.isPrimPath()) {
      if (newPath.isEmpty()) {
        Sdf_ChildrenUtils.removeChild(Sdf_PrimChildPolicy, this, currentPath.getParentPath(), currentPath.name)
      } else {
        Sdf_ChildrenUtils.moveChildForBatchNamespaceEdit(Sdf_PrimChildPolicy, this,
          newPath.getParentPath(), this.getPrimAtPath(currentPath)!, newPath.name, index)
      }
    } else if (newPath.isEmpty()) {
      Sdf_ChildrenUtils.removeChild(
        currentPath.isRelationalAttributePath() ? Sdf_AttributeChildPolicy : Sdf_PropertyChildPolicy,
        this, currentPath.getParentPath(), currentPath.name)
    } else if (newPath.isRelationalAttributePath()) {
      Sdf_ChildrenUtils.moveChildForBatchNamespaceEdit(Sdf_AttributeChildPolicy, this,
        newPath.getParentPath(), this.getAttributeAtPath(currentPath)!, newPath.name, index)
    } else {
      Sdf_ChildrenUtils.moveChildForBatchNamespaceEdit(Sdf_PropertyChildPolicy, this,
        newPath.getParentPath(), this.getPropertyAtPath(currentPath)!, newPath.name, index)
    }
  }

  // ---- Inert scene description (layer.cpp:2505-2626) ----

  scheduleRemoveIfInert(spec: SdfSpec): void {
    Sdf_ChangeManager.get().removeSpecIfInert(spec)
  }

  /** @internal SdfLayer::_RemoveIfInert. */
  _removeIfInert(spec: SdfSpec): void {
    if (spec.isDormant()) return
    if (spec instanceof SdfPrimSpec) {
      // Only an inert prim itself is removed; its children are not touched.
      if (spec.isInert()) this.removePrimIfInert(spec)
    } else if (spec instanceof SdfPropertySpec) {
      this.removePropertyIfHasOnlyRequiredFields(spec)
    }
  }

  removePrimIfInert(prim: SdfPrimSpec | undefined): void {
    if (prim && this._removeInertDFS(prim)) this._removeInertToRootmost(prim)
  }

  removePropertyIfHasOnlyRequiredFields(prop: SdfPropertySpec | undefined): void {
    if (!prop || !prop.hasOnlyRequiredFields()) return
    const owner = prop.getOwner()
    if (owner instanceof SdfPrimSpec) {
      owner.removeProperty(prop)
      this._removeInertToRootmost(owner)
    } else {
      // A relational attribute.
      Sdf_ChildrenUtils.removeChild(Sdf_PropertyChildPolicy, this, prop.getPath().getParentPath(),
        prop.getNameToken())
    }
  }

  removeInertSceneDescription(): void {
    sdfChangeBlock(() => { this._removeInertDFS(this.getPseudoRoot()) })
  }

  private _removeInertDFS(prim: SdfPrimSpec): boolean {
    const inert = prim.isInert()
    if (!inert) {
      // Remove inert, non-defining child prims.
      const removedChildren = prim.getNameChildren().values().filter(child =>
        this._removeInertDFS(child) && child.getSpecifier() !== 'def' && child.getSpecifier() !== 'class')
      for (const child of removedChildren) prim.removeNameChild(child)
      // Child prims inside variants.
      for (const variantSet of prim.getVariantSets().values()) {
        for (const variant of variantSet.getVariantList()) {
          const variantPrim = variant.getPrimSpec()
          if (variantPrim) this._removeInertDFS(variantPrim)
        }
      }
    }
    return inert || prim.isInert()
  }

  private _removeInertToRootmost(prim: SdfPrimSpec | undefined): void {
    while (prim && prim.getSpecifier() !== 'def' && prim.getSpecifier() !== 'class' && prim.isInert()) {
      const parent = prim.getRealNameParent()
      if (parent) parent.removeNameChild(prim)
      prim = parent
    }
  }

  streamsData(): boolean {
    return this._data.streamsData()
  }

  isDetached(): boolean {
    return this._isDetached
  }

  // SdfLayer::SetDetachedLayerRules (layer.cpp:2953-2977): install the
  // rules, then force-reload every loaded layer whose classification
  // changed. The rules apply immediately; the returned promise settles once
  // the reloads (asynchronous asset reads) finish.
  static async setDetachedLayerRules(rules: DetachedLayerRules): Promise<void> {
    const oldRules = Layer._detachedLayerRules
    Layer._detachedLayerRules = rules.clone()
    const toReload: Layer[] = []
    for (const layer of Layer.getLoadedLayers()) {
      const wasIncludedBefore = oldRules.isIncluded(layer.identifier)
      const isIncludedNow = rules.isIncluded(layer.identifier)
      const layerIsDetached = layer.isDetached()
      if ((!wasIncludedBefore && isIncludedNow && !layerIsDetached) ||
          (wasIncludedBefore && !isIncludedNow && layerIsDetached)) {
        toReload.push(layer)
      }
    }
    for (const layer of toReload) await layer.reload(/* force = */ true)
  }

  // SdfLayer::GetLoadedLayers (layer.cpp:3482-3487): every registered layer.
  static getLoadedLayers(): Layer[] {
    return _layerRegistry.layers()
  }

  static getDetachedLayerRules(): DetachedLayerRules {
    return Layer._detachedLayerRules.clone()
  }

  static isIncludedByDetachedLayerRules(identifier: string): boolean {
    return Layer._detachedLayerRules.isIncluded(identifier)
  }

  listAllTimeSamples(): number[] {
    return this._data.listAllTimeSamples()
  }

  listTimeSamplesForPath(specPath: string): number[] {
    return this._data.listTimeSamplesForPath(specPath)
  }

  getBracketingTimeSamplesForPath(
    specPath: string, time: number,
  ): [number, number] | undefined {
    return this._data.getBracketingTimeSamplesForPath(specPath, time)
  }

  queryTimeSample(specPath: string, time: number): unknown {
    return _sdfHandOut(this._data.queryTimeSample(specPath, time))
  }

  // Uncloned, time-sorted samples for composition reads; see
  // SdfAbstractData._getTimeSamplesView. Do not mutate or retain.
  _getTimeSamplesView(specPath: string): ReadonlyArray<readonly [number, unknown]> {
    return this._data._getTimeSamplesView(specPath)
  }

  /** @internal See SdfAbstractData._getTimeSampleValueKinds. */
  _getTimeSampleValueKinds(specPath: string): SdfTimeSampleValueKinds {
    return this._data._getTimeSampleValueKinds(specPath)
  }

  // SdfLayer::TransferContent. The destination layer, registry entry, state
  // delegate, subscriptions, and spec identities remain stable; only its
  // privately-owned data is replaced with an independent copy.
  transferContent(source: Layer): void {
    sdfChangeBlock(() => {
      if (source === this) return
      // A streaming layer cannot be diffed without streaming in its data: the
      // new data moves into place and the layer may have changed arbitrarily
      // (SdfLayer::_SetData, layer.cpp).
      if (this._data.streamsData()) {
        const data = this.getFileFormat()?.initData(new Map()) ?? new SdfData()
        data.copyFrom(source._data)
        this._data = data
        this._notifyDidChange({ kind: 'replaceContent', path: '/' })
        return
      }
      const replacement = new SdfData()
      replacement.copyFrom(source._data)
      this._replaceData(replacement)
    })
  }

  // ---- Authoring API ----

  // Defines a prim spec and all necessary ancestor specs. The typeName (when
  // given) is written first so the spec-created record carries the spec's
  // defining identity, matching upstream's atomic SdfPrimSpec creation (the
  // change-list inert flag reflects typeName and specifier together).
  definePrimSpec(path: string, typeName?: string, specifier: 'def' | 'over' | 'class' = 'def'): void {
    sdfChangeBlock(() => {
      const parts = path.split('/').filter(Boolean)
      for (let i = 0; i < parts.length; i++) {
        const parentPath = i === 0 ? '/' : '/' + parts.slice(0, i).join('/')
        const childName = parts[i]!
        const currentPath = '/' + parts.slice(0, i + 1).join('/')
        this._addPrimChild(parentPath, childName)
        if (i < parts.length - 1) {
          // Ensure intermediate ancestor exists
          if (!this._data.has(currentPath, 'specifier')) {
            this._setField(currentPath, 'specifier', 'def')
          }
        }
      }
      if (typeName) this._setField(path, 'typeName', typeName)
      this._setField(path, 'specifier', specifier)
    })
  }

  /**
   * @internal SdfAttributeSpec::New / SdfRelationshipSpec::New
   * (attributeSpec.cpp:40-108, relationshipSpec.cpp:40-90): a new property
   * spec with its required fields.
   */
  _createPropertySpec(
    primPath: string, name: string, specType: 'attribute' | 'relationship',
    fields: { typeName?: string; custom: boolean; variability: string },
  ): void {
    sdfChangeBlock(() => {
      const path = `${primPath}.${name}`
      // Attribute specs are considered initially to have only required
      // fields only if they are not custom; relationship specs always are.
      const hasOnlyRequiredFields = specType === 'relationship' || !fields.custom
      const created = this._notifyCreateSpec(path, specType)
      if (created) {
        this._notifyDidChange({
          kind: 'specAdded', path, specType: created, inert: hasOnlyRequiredFields,
        })
      }
      this._addProperty(primPath, name)
      this._setField(path, 'custom', fields.custom)
      // typescript-usd: an attribute whose type is not known yet stays untyped.
      if (specType === 'attribute' && fields.typeName) this._setField(path, 'typeName', fields.typeName)
      this._setField(path, 'variability', fields.variability)
    })
  }

  // Sets an attribute's default value on a prim.
  setAttrDefault(primPath: string, attrName: string, value: unknown): void {
    sdfChangeBlock(() => {
      this._setField(`${primPath}.${attrName}`, 'default', value)
      this._addProperty(primPath, attrName)
    })
  }

  // Adds or replaces a single time sample on an attribute. Notifies the
  // state delegate via _OnSetTimeSample (not _OnSetField — upstream keeps
  // time samples a distinct mutation kind). The change record carries no
  // values: upstream SdfChangeList::DidChangeAttributeTimeSamples only flags
  // the path, and copying the whole sample map on every write made authoring
  // N samples quadratic.
  setAttrTimeSample(primPath: string, attrName: string, time: number, value: unknown): void {
    sdfChangeBlock(() => {
      const attrPath = `${primPath}.${attrName}`
      value = coerceAuthoredStorageValue(value, this.getField(attrPath, 'typeName'))
      const created = this._notifyCreateSpec(attrPath, 'attribute')
      if (created) {
        // Created bare, then time-sampled: only-required-fields at creation.
        this._notifyDidChange({
          kind: 'specAdded', path: attrPath, specType: created, inert: true,
        })
      }
      this._stateDelegate.setTimeSample(attrPath, time, value)
      this._data.setTimeSample(attrPath, time, value)
      this._notifyDidChange({ kind: 'timeSample', path: attrPath, fieldName: 'timeSamples' })
      this._addProperty(primPath, attrName)
    })
  }

  // SdfLayer::EraseTimeSample (layer.cpp:1490-1511).
  eraseTimeSample(specPath: string | SdfPath, time: number): void {
    const path = typeof specPath === 'string' ? specPath : specPath.pathString
    if (!this.permissionToEdit()) {
      throw new TfError(`Cannot set time sample on <${path}>.  Layer @${this.identifier}@ is not editable.`,
        TfDiagnosticType.CodingError)
    }
    if (!this.hasSpec(path)) {
      throw new TfError(`Cannot SetTimeSample at <${path}> since spec does not exist`,
        TfDiagnosticType.CodingError)
    }
    // No time sample to remove.
    if (this.queryTimeSample(path, time) === undefined) return
    sdfChangeBlock(() => {
      this._stateDelegate.setTimeSample(path, time, undefined)
      this._data.eraseTimeSample(path, time)
      this._notifyDidChange({ kind: 'timeSample', path, fieldName: 'timeSamples' })
    })
  }

  // Sets a property's `custom` flag — the SdfPropertySpec::SetCustom analog.
  // A non-schema property authored directly into a layer is custom; typescript-usd
  // mirrors upstream where this is an explicit field, not an inferred default.
  setAttrCustom(primPath: string, attrName: string, custom: boolean): void {
    sdfChangeBlock(() => {
      this._setField(`${primPath}.${attrName}`, 'custom', custom)
      this._addProperty(primPath, attrName)
    })
  }

  // Declares a property spec (typeName only) and registers it on the prim.
  declareProperty(primPath: string, propName: string, typeName: string): void {
    sdfChangeBlock(() => {
      this._setField(`${primPath}.${propName}`, 'typeName', typeName)
      this._addProperty(primPath, propName)
    })
  }

  // Sets a relationship's targets on a prim.
  setRelTargets(primPath: string, relName: string, targets: string[]): void {
    sdfChangeBlock(() => {
      const relPath = `${primPath}.${relName}`
      this._setField(relPath, 'targetPaths', targets)
      this._addProperty(primPath, relName)
    })
  }

  // Sets an attribute's connection source paths.
  setAttrConnections(primPath: string, attrName: string, paths: string[]): void {
    sdfChangeBlock(() => {
      this._setField(`${primPath}.${attrName}`, 'connectionPaths', paths)
      this._addProperty(primPath, attrName)
    })
  }

  // ---- Sublayers (SdfLayer::GetSubLayerPaths and friends) ----

  getSubLayerPaths(): string[] {
    const paths = this._data._getView('/', 'subLayers')
    return Array.isArray(paths) ? [...paths as string[]] : []
  }

  // SdfLayer::SetSubLayerPaths (layer.cpp:2107-2111): the sublayer offsets
  // are kept in sync, retaining the offsets of retained paths
  // (Sdf_SubLayerListEditor::_OnEdit, subLayerListEditor.cpp:27-63).
  setSubLayerPaths(newPaths: readonly string[]): void {
    sdfChangeBlock(() => {
      const oldPaths = this.getSubLayerPaths()
      const rawOffsets = this._data._getView('/', 'subLayerOffsets')
      const oldOffsets = Array.isArray(rawOffsets) ? rawOffsets : []
      this._setField('/', 'subLayers', [...newPaths])
      this._setField('/', 'subLayerOffsets', newPaths.map((path) => {
        const index = oldPaths.indexOf(path)
        const old = index >= 0 ? oldOffsets[index] as { offset: number; scale: number } | undefined : undefined
        return old ? { ...old } : { offset: 0, scale: 1 }
      }))
    })
  }

  // SdfLayer::GetSubLayerOffsets (layer.cpp:2142-2147).
  getSubLayerOffsets(): { offset: number; scale: number }[] {
    const raw = this._data._getView('/', 'subLayerOffsets')
    return Array.isArray(raw) ? raw.map(o => ({ ...(o as { offset: number; scale: number }) })) : []
  }

  // SdfLayer::GetSubLayerOffset (layer.cpp:2149-2158).
  getSubLayerOffset(index: number): { offset: number; scale: number } {
    const offsets = this.getSubLayerOffsets()
    if (index < 0 || index >= offsets.length) {
      TfDiagnosticMgr.GetInstance().postError(new TfError('Invalid sublayer index',
        TfDiagnosticType.CodingError,
        { file: 'pxr/usd/sdf/layer.cpp', function: 'SdfLayer::GetSubLayerOffset', line: 2154 }))
      return { offset: 0, scale: 1 }
    }
    return offsets[index]!
  }

  // SdfLayer::SetSubLayerOffset (layer.cpp:2160-2174).
  setSubLayerOffset(offset: { offset: number; scale: number }, index: number): void {
    const offsets = this.getSubLayerOffsets()
    if (index < 0 || index >= offsets.length) {
      TfDiagnosticMgr.GetInstance().postError(new TfError('Invalid sublayer index',
        TfDiagnosticType.CodingError,
        { file: 'pxr/usd/sdf/layer.cpp', function: 'SdfLayer::SetSubLayerOffset', line: 2166 }))
      return
    }
    offsets[index] = { offset: offset.offset, scale: offset.scale }
    this._setField('/', 'subLayerOffsets', offsets)
  }

  // SdfLayer::InsertSubLayerPath (layer.cpp:2119-2129).
  insertSubLayerPath(path: string, index = -1): void {
    const paths = this.getSubLayerPaths()
    paths.splice(index === -1 ? paths.length : index, 0, path)
    this.setSubLayerPaths(paths)
  }

  // SdfLayer::RemoveSubLayerPath (layer.cpp:2131-2135).
  removeSubLayerPath(index: number): void {
    const paths = this.getSubLayerPaths()
    paths.splice(index, 1)
    this.setSubLayerPaths(paths)
  }

  // ---- Relocates (SdfLayer::GetRelocates and friends, layer.cpp:2171-2194) ----

  // The layer relocates: SdfRelocates, (source, target) path string pairs.
  getRelocates(): [string, string][] {
    const relocates = this._data._getView('/', Layer.LayerRelocatesKey)
    return Array.isArray(relocates)
      ? (relocates as [string, string][]).map(([source, target]) => [source, target])
      : []
  }

  setRelocates(relocates: readonly (readonly [string, string])[]): void {
    this.setField('/', Layer.LayerRelocatesKey,
      relocates.map(([source, target]) => [source, target]))
  }

  hasRelocates(): boolean {
    return this.hasField('/', Layer.LayerRelocatesKey)
  }

  clearRelocates(): void {
    this.eraseField('/', Layer.LayerRelocatesKey)
  }

  // SdfLayer::Clear (layer.cpp:3158-3172): the layer's initial contents.
  clear(): void {
    const initialData = new SdfData()
    initialData.createSpec('/', 'pseudoRoot')
    this._replaceData(initialData)
  }

  // SdfLayer::ImportFromString (layer.cpp:1150-1154): the file format reads
  // the string and sets it as the layer's data.
  importFromString(text: string): boolean {
    // SdfUsdaFileFormat::ReadFromString's failures (a rejected legacy cookie,
    // a parse error) throw here.
    const source = Layer.createInMemory('import.usda', text)
    this._replaceData(source._data)
    return true
  }

  // SdfLayer::ExportToString.
  exportToString(): string {
    return this.toUsda()
  }

  // Generic field write — used by composition authoring (subLayers, references, etc.)
  setField(specPath: string, fieldName: string, value: unknown): void {
    sdfChangeBlock(() => {
      this._setField(specPath, fieldName, value)
    })
  }

  /** @internal UsdStage::Flatten's SdfSpec::SetInfo of an attribute's
   * default or timeSamples (usd/stage.cpp:5728-5750). SetInfo casts a value
   * only to its field's fallback type, which these fields lack
   * (sdf/spec.cpp:236-240), and SdfLayer::SetField stores the VtValue as
   * given (sdf/layer.cpp:3948-3973), so a composed value whose type differs
   * from the spec's type name (an `int normals = 7` under a schema's
   * normal3f[]) is written unchanged. setField instead converts plain JS
   * values to the spec's type name, as they carry no value type. */
  _setValueFieldAsGiven(specPath: string, fieldName: 'default' | 'timeSamples', value: unknown): void {
    sdfChangeBlock(() => {
      this._setField(specPath, fieldName, value, undefined, false)
    })
  }

  // Removes a field from a spec (the SdfLayer::EraseField analog) — the
  // inverse of a first-time setField. Notifies the delegate as a set-to-
  // undefined (matching upstream, which notifies erase through SetField
  // with an empty VtValue). No-op when the field is absent.
  eraseField(specPath: string, fieldName: string): void {
    sdfChangeBlock(() => {
      if (!this._data.has(specPath, fieldName)) return
      this._stateDelegate.setField(specPath, fieldName, undefined)
      // The erased value leaves the layer, so the record may hold it uncopied.
      const oldValue = this._data._getView(specPath, fieldName)
      this._data.erase(specPath, fieldName)
      this._notifyDidChange({
        kind: 'field', path: specPath, fieldName, oldValue, newValue: undefined,
      })
    })
  }

  // ---- Spec primitives (SdfLayer::_CreateSpec et al., layer.cpp:4757-5140) ----

  private _permissionToEdit = true
  private _permissionToSave = true

  // SdfLayer::PermissionToEdit / SetPermissionToEdit (layer.cpp:2286-2304).
  permissionToEdit(): boolean { return this._permissionToEdit }
  setPermissionToEdit(allow: boolean): void { this._permissionToEdit = allow }

  // SdfLayer::ConvertDefaultPrimTokenToPath (layer.cpp:1697-1710).
  static convertDefaultPrimTokenToPath(defaultPrim: string): SdfPath {
    if (!SdfPath.isValidPathString(defaultPrim)) return SdfPath.emptyPath
    const path = SdfPath.fromString(defaultPrim)
    return path.isPrimPath()
      ? path.isAbsolutePath() ? path : path.makeAbsolutePath(SdfPath.absoluteRootPath)
      : SdfPath.emptyPath
  }

  // SdfLayer::ConvertDefaultPrimPathToToken (layer.cpp:1712-1735): root prims
  // are written as their name, other prims as absolute paths.
  static convertDefaultPrimPathToToken(defaultPrimPath: SdfPath): string {
    if (!defaultPrimPath.isPrimPath()) return ''
    if (defaultPrimPath.pathElementCount === 1) return defaultPrimPath.name
    if (defaultPrimPath.isAbsolutePath()) return defaultPrimPath.pathString
    return defaultPrimPath.makeAbsolutePath(SdfPath.absoluteRootPath).pathString
  }

  // SdfLayer::SetComment / GetComment (layer.cpp:1684-1694).
  setComment(newVal: string): void { this.setField('/', 'comment', newVal) }
  getComment(): string {
    const value = this.getField('/', 'comment')
    return typeof value === 'string' ? value : ''
  }

  // SdfLayer::SetDefaultPrim / GetDefaultPrim / GetDefaultPrimAsPath /
  // ClearDefaultPrim / HasDefaultPrim (layer.cpp:1737-1768).
  setDefaultPrim(name: string): void { this.setField('/', 'defaultPrim', name) }
  getDefaultPrim(): string {
    const value = this.getField('/', 'defaultPrim')
    return typeof value === 'string' ? value : ''
  }
  getDefaultPrimAsPath(): SdfPath { return Layer.convertDefaultPrimTokenToPath(this.getDefaultPrim()) }
  clearDefaultPrim(): void { this.eraseField('/', 'defaultPrim') }
  hasDefaultPrim(): boolean { return this.hasField('/', 'defaultPrim') }
  // SdfLayer::PermissionToSave: anonymous layers cannot be saved.
  permissionToSave(): boolean { return this._permissionToSave && !this.isAnonymous() }
  setPermissionToSave(allow: boolean): void { this._permissionToSave = allow }

  /** @internal SdfLayer::_CreateSpec (layer.cpp:4837-4870). */
  _createSpec(path: string, specType: SdfSpecType, inert = false): boolean {
    if (specType === 'unknown') return false
    if (!this.permissionToEdit()) {
      throw new TfError(`Cannot create spec at <${path}>. Layer @${this.identifier}@ is not editable.`,
        TfDiagnosticType.CodingError)
    }
    if (this._data.hasSpec(path)) {
      throw new TfError(
        `Cannot create spec <${path}> because it already exists in @${this.identifier}@`,
        TfDiagnosticType.CodingError)
    }
    this._primCreateSpec(path, specType, inert)
    return true
  }

  // SdfLayer::_PrimCreateSpec (layer.cpp:4972-4988).
  private _primCreateSpec(path: string, specType: SdfSpecType, inert: boolean): void {
    sdfChangeBlock(() => {
      this._stateDelegate.createSpec(path, specType)
      this._notifyDidChange({ kind: 'specAdded', path, specType, inert })
      this._data.createSpec(path, specType)
    })
  }

  /**
   * @internal SdfLayer::_DeleteSpec (layer.cpp:4872-4907): removes the spec
   * and every spec beneath it. The parent's children field is not edited;
   * Sdf_ChildrenUtils does that.
   */
  _deleteSpec(path: string): boolean {
    if (!this.permissionToEdit()) {
      throw new TfError(`Cannot delete <${path}>. Layer @${this.identifier}@ is not editable`,
        TfDiagnosticType.CodingError)
    }
    if (!this.hasSpec(path)) return false
    sdfChangeBlock(() => {
      if (this._isInertSubtree(path)) {
        // Notices about inert specs imply nothing about descendants, so each
        // removed spec of an inert subtree is reported.
        this.traverse(path, specPath => {
          this._notifyDidChange({
            kind: 'specRemoved', path: specPath, specType: this._data.getSpecType(specPath),
            inert: true,
          })
        })
        this._primDeleteSpec(path, true)
      } else {
        this._primDeleteSpec(path, false)
      }
    })
    return true
  }

  // SdfLayer::_PrimDeleteSpec (layer.cpp:4955-4970).
  private _primDeleteSpec(path: string, inert: boolean): void {
    sdfChangeBlock(() => {
      this._stateDelegate.deleteSpec(path)
      this._notifyDidChange({
        kind: 'specRemoved', path, specType: this._data.getSpecType(path), inert,
      })
      this.traverse(path, specPath => this._data.eraseSpec(specPath))
    })
  }

  /** @internal SdfLayer::_MoveSpec (layer.cpp:4757-4797). */
  _moveSpec(oldPath: string, newPath: string): boolean {
    if (!this.permissionToEdit()) {
      throw new TfError(`Cannot move <${oldPath}> to <${newPath}>. Layer @${this.identifier}@ ` +
        'is not editable.', TfDiagnosticType.CodingError)
    }
    const oldSdfPath = SdfPath.fromString(oldPath)
    const newSdfPath = SdfPath.fromString(newPath)
    if (oldSdfPath.isEmpty() || newSdfPath.isEmpty()) {
      throw new TfError(`Cannot move <${oldPath}> to <${newPath}>. Source and destination must ` +
        'be non-empty paths', TfDiagnosticType.CodingError)
    }
    if (oldSdfPath.hasPrefix(newSdfPath) || newSdfPath.hasPrefix(oldSdfPath)) {
      throw new TfError(`Cannot move <${oldPath}> to <${newPath}>. Source and destination must ` +
        'not overlap', TfDiagnosticType.CodingError)
    }
    // Cannot move with nothing at the source, or onto an existing spec.
    if (!this._data.hasSpec(oldPath) || this._data.hasSpec(newPath)) return false
    this._primMoveSpec(oldSdfPath, newSdfPath)
    return true
  }

  // SdfLayer::_PrimMoveSpec (layer.cpp:4810-4824): every spec beneath
  // oldPath moves, with target paths inside the spec paths left unchanged.
  private _primMoveSpec(oldPath: SdfPath, newPath: SdfPath): void {
    sdfChangeBlock(() => {
      this._stateDelegate.moveSpec(oldPath.pathString, newPath.pathString)
      this._notifyDidChange({
        kind: 'specMoved', path: newPath.pathString, oldPath: oldPath.pathString,
        specType: this._data.getSpecType(oldPath.pathString),
        ...(oldPath.isTargetPath()
          ? { ownerSpecType: this._data.getSpecType(oldPath.getParentPath().pathString) } : {}),
      })
      this.traverse(oldPath.pathString, specPath => {
        const newSpecPath = SdfPath.fromString(specPath).replacePrefix(oldPath, newPath, false)
        this._data.moveSpec(specPath, newSpecPath.pathString)
        this._moveIdentity(specPath, newSpecPath.pathString)
      })
    })
  }

  // SdfLayer::Traverse (layer.cpp:4921-4948): visits the spec's children
  // (through its children fields) before the spec itself.
  traverse(path: string, func: (specPath: string) => void): void {
    const sdfPath = SdfPath.fromString(path)
    for (const field of this.listFields(path)) {
      const policy = sdfChildPolicyForField(field)
      if (!policy) continue
      const children = this._data._getView(path, field)
      if (!Array.isArray(children)) continue
      for (const child of children) {
        this.traverse(policy.getChildPath(sdfPath, child as string).pathString, func)
      }
    }
    func(path)
  }

  /** @internal SdfLayer::_PrimPushChild (layer.cpp:4623-4675). */
  _primPushChild(parentPath: string, fieldName: string, value: string): void {
    if (!this._data.has(parentPath, fieldName)) {
      this._primSetField(parentPath, fieldName, [value])
      return
    }
    this._stateDelegate.pushChild(parentPath, fieldName, value)
    // Child fields record no field change: spec additions and removals are
    // reported instead.
    const children = this._data._getView(parentPath, fieldName)
    this._data.set(parentPath, fieldName, [...(Array.isArray(children) ? children : []), value])
  }

  /** @internal SdfLayer::_PrimPopChild (layer.cpp:4677-4718). */
  _primPopChild(parentPath: string, fieldName: string): void {
    const children = this._data._getView(parentPath, fieldName)
    if (!Array.isArray(children)) {
      throw new TfError(`SdfLayer::_PrimPopChild failed: field ${fieldName} is non-vector`,
        TfDiagnosticType.CodingError)
    }
    if (children.length === 0) {
      throw new TfError(`SdfLayer::_PrimPopChild failed: ${fieldName} is empty`,
        TfDiagnosticType.CodingError)
    }
    this._stateDelegate.popChild(parentPath, fieldName, String(children[children.length - 1]))
    this._data.set(parentPath, fieldName, children.slice(0, -1))
  }

  // SdfLayer::_PrimSetField (layer.cpp:4590-4615).
  private _primSetField(path: string, fieldName: string, value: unknown): void {
    sdfChangeBlock(() => {
      this._stateDelegate.setField(path, fieldName, value)
      // The stored value is replaced below, so the record may hold it uncopied.
      let oldValue = this._data._getView(path, fieldName)
      if (oldValue === undefined) oldValue = requiredFieldFallback(this._data.getSpecType(path), fieldName)
      this._notifyDidChange({ kind: 'field', path, fieldName, oldValue, newValue: value })
      if (value === undefined) this._data.erase(path, fieldName)
      else this._data.set(path, fieldName, value)
    })
  }

  /**
   * @internal SdfLayer::_IsInert (layer.cpp:4990-5073): whether the spec
   * contributes no opinions — no fields, or only required fields, never
   * custom, and for prims never a defining specifier or a type name.
   */
  _isInert(path: string, ignoreChildren: boolean, requiredFieldOnlyPropertiesAreInert: boolean): boolean {
    const fields = this.listFields(path)
    if (fields.length === 0) return true
    if (this.getField(path, 'custom') === true) return false
    const specType = this._data.getSpecType(path)
    if (specType === 'prim') {
      const specifier = this.getField(path, 'specifier') ?? 'over'
      if (specifier === 'def' || specifier === 'class') return false
      const typeName = this.getField(path, 'typeName')
      if (typeof typeName === 'string' && typeName !== '') return false
    }
    // Properties might exist to instantiate an on-demand property.
    if (!requiredFieldOnlyPropertiesAreInert &&
        (specType === 'attribute' || specType === 'relationship')) {
      return false
    }
    if (specType === 'prim' || specType === 'variant' || specType === 'variantSet' ||
        specType === 'attribute' || specType === 'relationship') {
      const specDefinition = SdfSchema.getInstance().getSpecDefinition(specType)
      if (!specDefinition) return false
      for (const field of fields) {
        // _IsInertSubtree processes these children separately.
        if (ignoreChildren &&
            ((specType === 'prim' && (field === 'primChildren' || field === 'properties' ||
              field === 'variantSetChildren')) ||
             (specType === 'variantSet' && field === 'variantChildren'))) {
          continue
        }
        if (specDefinition.isRequiredField(field)) continue
        return false
      }
      return true
    }
    return false
  }

  /** @internal SdfLayer::_IsInertSubtree (layer.cpp:5075-5131). */
  _isInertSubtree(path: string): boolean {
    if (!this._isInert(path, true, true)) return false
    const sdfPath = SdfPath.fromString(path)
    // A variant set path is a variant selection path with an empty selection.
    if (sdfPath.isPrimVariantSelectionPath() && sdfPath.getVariantSelection()[1] === '') {
      const [vsetName] = sdfPath.getVariantSelection()
      const parentPath = sdfPath.getParentPath()
      const variants = this._data._getView(path, 'variantChildren')
      for (const variant of Array.isArray(variants) ? variants as string[] : []) {
        if (!this._isInertSubtree(parentPath.appendVariantSelection(vsetName, variant).pathString)) {
          return false
        }
      }
    } else if (sdfPath.isPrimOrPrimVariantSelectionPath()) {
      // Upstream appends variant set names as prim children too, so a
      // variant set's names reach no spec and count as inert.
      for (const childrenField of ['primChildren', 'variantSetChildren']) {
        const names = this._data._getView(path, childrenField)
        for (const name of Array.isArray(names) ? names as string[] : []) {
          if (!this._isInertSubtree(sdfPath.appendChild(name).pathString)) return false
        }
      }
      const properties = this._data._getView(path, 'properties')
      for (const name of Array.isArray(properties) ? properties as string[] : []) {
        if (!this._isInert(sdfPath.appendProperty(name).pathString, false, true)) return false
      }
    }
    return true
  }

  // ---- Change notification ----
  //
  // Every content mutation is recorded with Sdf_ChangeManager, which sends
  // SdfNotice::LayersDidChange when the outermost SdfChangeBlock closes.
  // The raw records are also delivered to these internal listeners as they
  // happen.

  private _didChangeListeners = new Set<(change: SdfLayerChange) => void>()

  /** @internal Registers a content-change listener; returns unsubscribe. */
  _registerDidChangeListener(listener: (change: SdfLayerChange) => void): () => void {
    this._didChangeListeners.add(listener)
    return () => this._didChangeListeners.delete(listener)
  }

  private _notifyDidChange(change: SdfLayerChange): void {
    for (const listener of this._didChangeListeners) listener(change)
    Sdf_ChangeManager.get()._addChange(this, change)
  }

  private _lastDirtyState = false

  /** @internal SdfLayer::_UpdateLastDirtinessState: whether dirtiness changed. */
  _updateLastDirtinessState(): boolean {
    const dirty = this.isDirty()
    if (dirty === this._lastDirtyState) return false
    this._lastDirtyState = dirty
    return true
  }

  // Fires _OnCreateSpec when the write targets a spec that does not exist
  // yet (the SdfLayer::CreateSpec analog — our flattened layer creates
  // specs implicitly on first write).
  private _notifyCreateSpec(
    specPath: string, requestedType?: Exclude<SdfSpecType, 'unknown'>,
  ): SdfSpecType | undefined {
    if (this._data.hasSpec(specPath)) return undefined
    const specType = requestedType ?? this._specTypeForPath(specPath)
    this._stateDelegate.createSpec(specPath, specType)
    this._data.createSpec(specPath, specType)
    return specType
  }

  private _specTypeForPath(specPath: string): SdfSpecType {
    const lastSlash = specPath.lastIndexOf('/')
    return specPath === '/' ? 'pseudoRoot'
      : /\{[^}=]+=\}$/.test(specPath) ? 'variantSet'
      : /\{[^}=]+=[^}]+\}$/.test(specPath) ? 'variant'
      : specPath.indexOf('.', lastSlash) >= 0 ? 'attribute'
      : 'prim'
  }

  // SdfLayer::CreateDiff (layer.cpp:4199-4282): the change list that would
  // transform this layer's content into `layer`'s, without modifying either
  // (the read-only use of _ProcessIncomingData, layer.cpp:4284-4520). With
  // processPropertyFields false, property specs present in both are reported
  // as removed and re-added instead of diffing their fields.
  createDiff(layer: Layer, processPropertyFields = true): SdfChangeList {
    const list = new SdfChangeList()
    const oldData = this._data
    const newData = layer._data
    const pathsOf = (data: SdfAbstractData): string[] => {
      const paths: string[] = []
      data.visitSpecs({
        visitSpec: (_source, path) => { paths.push(path); return true },
        done: () => {},
      })
      return paths
    }
    const isProperty = (path: SdfPath): boolean => path.isPropertyPath()
    // Namespace order: a path sorts before its descendants.
    const byNamespace = (a: string, b: string): number => a < b ? -1 : a > b ? 1 : 0
    const reporter = { getField: (path: string, field: string) => this.getField(path, field) }

    // Remove specs that no longer exist or whose spec type changed,
    // bottom-up, erasing non-required fields first.
    const toDelete = pathsOf(oldData).filter(path =>
      !newData.hasSpec(path) || newData.getSpecType(path) !== oldData.getSpecType(path))
    toDelete.sort(byNamespace)
    for (let i = toDelete.length - 1; i >= 0; i--) {
      const pathString = toDelete[i]!
      const path = SdfPath.fromString(pathString)
      if (!processPropertyFields && isProperty(path)) {
        sdfChangeListDidAddOrRemoveSpec(list, path, false, false)
        continue
      }
      const specType = oldData.getSpecType(pathString)
      for (const field of oldData.list(pathString)) {
        if (isRequiredField(specType, field)) continue
        sdfChangeListDidChangeField(
          list, reporter, path, field, oldData.get(pathString, field), undefined)
      }
      sdfChangeListDidAddOrRemoveSpec(list, path, this._isInert(pathString, true, true), false)
    }

    // Create new specs top-down.
    const toCreate = pathsOf(newData).filter(path => !oldData.hasSpec(path))
    toCreate.sort(byNamespace)
    for (const pathString of toCreate) {
      const path = SdfPath.fromString(pathString)
      let inert = false
      if (path.isPrimPath()) {
        const specifier = newData.get(pathString, 'specifier') ?? 'over'
        const typeName = newData.get(pathString, 'typeName')
        inert = specifier === 'over' && (typeName === undefined || typeName === '')
      } else if (isProperty(path)) {
        if (processPropertyFields) inert = newData.get(pathString, 'custom') !== true
      }
      sdfChangeListDidAddOrRemoveSpec(list, path, inert, true)
    }

    // Update spec fields.
    for (const pathString of pathsOf(newData)) {
      const path = SdfPath.fromString(pathString)
      if (!processPropertyFields && isProperty(path)) {
        if (oldData.hasSpec(pathString)) {
          sdfChangeListDidAddOrRemoveSpec(list, path, false, false)
          sdfChangeListDidAddOrRemoveSpec(list, path, false, true)
        }
        continue
      }
      // _SpecUpdater (layer.cpp:4539-4583): the fields of both sides include
      // their spec types' required fields (SdfLayer::ListFields), read with
      // their fallbacks (SdfLayer::GetField).
      const oldFields = oldData.hasSpec(pathString) ? this.listFields(pathString) : []
      const newFields = layer.listFields(pathString)
      for (const field of oldFields) {
        if (newFields.includes(field)) continue
        sdfChangeListDidChangeField(
          list, reporter, path, field, this.getField(pathString, field), undefined)
      }
      for (const field of newFields) {
        let oldValue = oldFields.includes(field) ? this.getField(pathString, field) : undefined
        // A newly created prim's specifier would read back as its 'over'
        // fallback.
        if (oldValue === undefined && path.isPrimPath() && field === 'specifier') {
          oldValue = 'over'
        }
        const newValue = layer.getField(pathString, field)
        if (sdfValuesEqual(oldValue, newValue)) continue
        sdfChangeListDidChangeField(list, reporter, path, field, oldValue, newValue)
      }
    }
    return list
  }

  private _replaceData(replacement: SdfAbstractData): void {
    sdfChangeBlock(() => {
      const pathsOf = (data: SdfAbstractData): string[] => {
        const paths: string[] = []
        data.visitSpecs({
          visitSpec: (_source, path) => { paths.push(path); return true },
          done: () => {},
        })
        return paths
      }
      const oldData = this._data
      const oldPaths = new Set(pathsOf(oldData))
      const newPaths = pathsOf(replacement)
      const removed: SdfLayerChange[] = []
      const added: Array<{ path: string; specType: SdfSpecType }> = []
      const fields: SdfLayerChange[] = []
      // Old values are read without copying: the old data is discarded once
      // replaced. New values are reported as copies, so a change record never
      // aliases the layer's storage (upstream's records hold VtValue copies,
      // changeList.h InfoChange).
      const oldValue = (path: string, fieldName: string) => oldData._getView(path, fieldName)

      const newPathSet = new Set(newPaths)
      const unset: Array<[string, string]> = []
      for (const path of oldPaths) {
        const oldType = oldData.getSpecType(path)
        if (!newPathSet.has(path) || replacement.getSpecType(path) !== oldType) {
          removed.push({ kind: 'specRemoved', path, specType: oldType, inert: this._isInert(path, true, true) })
          this._stateDelegate.deleteSpec(path)
        }
      }
      for (const path of newPaths) {
        const newType = replacement.getSpecType(path)
        const existed = oldPaths.has(path)
        const retyped = existed && oldData.getSpecType(path) !== newType
        const created = retyped || !existed
        if (created) {
          added.push({ path, specType: newType })
          this._stateDelegate.createSpec(path, newType)
        }
        const oldFieldNames = created ? [] : oldData.list(path)
        const newFieldNames = replacement.list(path)
        // Remove empty fields.
        if (oldFieldNames.length !== 0) {
          const newFieldSet = new Set(newFieldNames)
          for (const fieldName of oldFieldNames) {
            if (newFieldSet.has(fieldName)) continue
            fields.push({ kind: 'field', path, fieldName, oldValue: oldValue(path, fieldName), newValue: undefined })
            this._stateDelegate.setField(path, fieldName, undefined)
          }
        }
        // Set field values. A field the layer does not hold reads as its
        // fallback (SdfLayer::GetField), so a created spec's fields that
        // match the required fields' fallbacks are unchanged.
        const oldFieldSet = oldFieldNames.length !== 0 ? new Set(oldFieldNames) : undefined
        for (const fieldName of newFieldNames) {
          const held = oldFieldSet?.has(fieldName) ?? false
          const previous = held ? oldValue(path, fieldName) : requiredFieldFallback(newType, fieldName)
          if (sdfValuesEqual(previous, replacement._getView(path, fieldName))) {
            // _SetData never sets such a field (layer.cpp:4566-4583), so a
            // required field matching its fallback stays unauthored.
            if (!held && previous !== undefined) unset.push([path, fieldName])
            continue
          }
          const newValue = replacement.get(path, fieldName)
          fields.push({ kind: 'field', path, fieldName, oldValue: previous, newValue })
          this._stateDelegate.setField(path, fieldName, newValue)
        }
      }
      for (const path of oldPaths) {
        if (!newPathSet.has(path)) {
          // A removed spec's required fields go with the spec
          // (SdfLayer::_ProcessIncomingData, layer.cpp:4333-4346).
          const specType = oldData.getSpecType(path)
          for (const fieldName of oldData.list(path)) {
            if (isRequiredField(specType, fieldName)) continue
            fields.push({ kind: 'field', path, fieldName, oldValue: oldValue(path, fieldName), newValue: undefined })
            this._stateDelegate.setField(path, fieldName, undefined)
          }
        }
      }

      for (const [path, fieldName] of unset) replacement.erase(path, fieldName)
      this._data = replacement
      for (const change of removed) this._notifyDidChange(change)
      for (const { path, specType } of added) {
        // Prims are inert if they are an 'over' with no typename; properties
        // if they are not custom (layer.cpp:4387-4414).
        const inert = specType === 'prim'
          ? (replacement._getView(path, 'specifier') ?? 'over') === 'over' &&
            !replacement._getView(path, 'typeName')
          : specType === 'attribute' || specType === 'relationship'
            ? replacement._getView(path, 'custom') !== true
            : this._isInert(path, true, true)
        this._notifyDidChange({ kind: 'specAdded', path, specType, inert })
      }
      for (const change of fields) this._notifyDidChange(change)
    })
  }

  private _setField(
    specPath: string,
    fieldName: string,
    value: unknown,
    requestedType?: Exclude<SdfSpecType, 'unknown'>,
    coerceToTypeName = true,
  ): void {
    if (coerceToTypeName && fieldName === 'default') {
      value = coerceAuthoredStorageValue(value, this._data._getView(specPath, 'typeName'))
    } else if (coerceToTypeName && fieldName === 'timeSamples' && Array.isArray(value)) {
      const typeName = this._data._getView(specPath, 'typeName')
      value = value.map(sample => Array.isArray(sample) && sample.length === 2
        ? [sample[0], coerceAuthoredStorageValue(sample[1], typeName)] : sample)
    }
    const inferredType = requestedType ?? (fieldName === 'targetPaths' ? 'relationship' : undefined)
    const created = this._notifyCreateSpec(specPath, inferredType)
    this._stateDelegate.setField(specPath, fieldName, value)
    // The stored value is replaced below, so the record may hold it uncopied.
    let oldValue = this._data._getView(specPath, fieldName)
    // SdfLayer::GetField reads a required field's fallback when unauthored.
    if (oldValue === undefined) {
      oldValue = requiredFieldFallback(this._data.getSpecType(specPath), fieldName)
    }
    this._data.set(specPath, fieldName, value)
    // The creation is reported before the creating write, as upstream's
    // CreateSpec notifies before the spec's fields are set.
    if (created) {
      // Property specs are created bare and fielded afterwards upstream
      // (SdfAttributeSpec::New authors only required fields, then the value
      // write is its own change) — so a property spec implicitly created by
      // a value write reports didAddPropertyWithOnlyRequiredFields. Prim
      // specs are created atomically WITH their defining identity
      // (SdfPrimSpec::New takes specifier and typeName), so their record
      // reflects the creating write.
      const inert = created === 'attribute' || created === 'relationship'
        ? fieldName === 'typeName' || isRequiredField(created, fieldName)
        : this._isInert(specPath, true, true)
      this._notifyDidChange({
        kind: 'specAdded', path: specPath, specType: created, inert,
      })
    }
    // A created spec joins its parent's children, as Sdf_ChildrenUtils
    // creates specs upstream.
    if (created) this._linkCreatedSpec(specPath, created)
    // SdfLayer::SetField sends no change for an unchanged value.
    if (sdfValuesEqual(oldValue, value)) return
    this._notifyDidChange({
      kind: 'field', path: specPath, fieldName, oldValue, newValue: value,
    })
  }

  // Adds a spec created implicitly by a field write to its parent's
  // children list (primChildren or properties), creating and linking
  // missing ancestors. Specs beneath variants are left as authored.
  private _linkCreatedSpec(specPath: string, specType: SdfSpecType): void {
    if (specPath.includes('{')) return
    if (specType === 'prim') {
      const slash = specPath.lastIndexOf('/')
      this._addPrimChild(slash === 0 ? '/' : specPath.slice(0, slash), specPath.slice(slash + 1))
    } else if (specType === 'attribute' || specType === 'relationship') {
      const dot = specPath.lastIndexOf('.')
      this._addProperty(specPath.slice(0, dot), specPath.slice(dot + 1))
    }
  }

  private _addPrimChild(parentPath: string, childName: string): void {
    const created = this._notifyCreateSpec(parentPath)
    if (created) {
      this._notifyDidChange({
        kind: 'specAdded', path: parentPath, specType: created,
        inert: this._isInert(parentPath, true, true),
      })
    }
    if (created) this._linkCreatedSpec(parentPath, created)
    // Replaced below by a new array, so the record may hold it uncopied.
    const existing = (this._data._getView(parentPath, 'primChildren') as string[] | undefined) ?? []
    if (!existing.includes(childName)) {
      this._stateDelegate.pushChild(parentPath, 'primChildren', childName)
      const updated = [...existing, childName]
      this._data.set(parentPath, 'primChildren', updated)
      this._notifyDidChange({
        kind: 'field', path: parentPath, fieldName: 'primChildren',
        oldValue: existing, newValue: updated,
      })
    }
  }

  private _addProperty(primPath: string, attrName: string): void {
    const created = this._notifyCreateSpec(primPath)
    if (created) {
      this._notifyDidChange({
        kind: 'specAdded', path: primPath, specType: created,
        inert: this._isInert(primPath, true, true),
      })
    }
    if (created) this._linkCreatedSpec(primPath, created)
    // Replaced below by a new array, so the record may hold it uncopied.
    const existing = (this._data._getView(primPath, 'properties') as string[] | undefined) ?? []
    if (!existing.includes(attrName)) {
      this._stateDelegate.pushChild(primPath, 'properties', attrName)
      const updated = [...existing, attrName]
      this._data.set(primPath, 'properties', updated)
      this._notifyDidChange({
        kind: 'field', path: primPath, fieldName: 'properties',
        oldValue: existing, newValue: updated,
      })
    }
  }

  // Serializes this layer to USDA text format.
  toUsda(): string {
    return serializeUsda(this)
  }

  // Serializes this layer to USDC binary format (via the registered crate plugin).
  toUsdc(): Uint8Array {
    return new SdfUsdcFileFormat().writeToBytes(this)
  }

  // SdfLayer::Export/Save route persistent writes through ArWritableAsset so
  // commands and custom resolvers share the same ownership boundary.
  async export(
    filePath: string,
    formatArgs?: ReadonlyMap<string, string> | Readonly<Record<string, string>>,
  ): Promise<boolean> {
    // layer.cpp:5237-5239: an empty file name is not exported.
    if (filePath === '') return false
    return this._writeToPath(filePath, formatArgs, false)
  }

  // Export writes a new file; Save writes the layer's own file in place,
  // which for crate data keeps the backing file's version
  // (crateData.cpp:1265-1340, crateFile.cpp:993-999).
  private async _writeToPath(
    filePath: string,
    formatArgs: ReadonlyMap<string, string> | Readonly<Record<string, string>> | undefined,
    inPlace: boolean,
  ): Promise<boolean> {
    const pathExtension = splitLayerIdentifier(filePath).assetPath.split('.').pop()?.toLowerCase()
    // SdfLayer::Export (layer.cpp:5241-5257): an output whose extension has
    // no file format is written in the layer's current format.
    const extension = SdfFileFormat.findByExtension(splitLayerIdentifier(filePath).assetPath)
      ? pathExtension : this.getFileFormat()?.formatId ?? pathExtension
    // SdfUsdzFileFormat::WriteToFile (usdzFileFormat.cpp:160-169): a coding
    // error, raised here as the Python binding does.
    if (extension === 'usdz') {
      throw new TfError('Writing usdz layers is not allowed via this API.', TfDiagnosticType.CodingError)
    }
    const mapArgs = formatArgs as ReadonlyMap<string, string> | undefined
    const format = typeof mapArgs?.get === 'function'
      ? mapArgs.get('format')
      : (formatArgs as Readonly<Record<string, string>> | undefined)?.['format']
    const bytes = extension === 'usda' || (extension === 'usd' && format === 'usda')
      ? new TextEncoder().encode(this.toUsda())
      : extension === 'usd' || extension === 'usdc'
        ? new SdfUsdcFileFormat().writeToBytes(this, inPlace && this._data instanceof Sdf_CrateData
          ? this._data._getFileVersion() : undefined)
        : undefined
    if (!bytes) return false
    const crateVersion = bytes.byteLength >= 11 && extension !== 'usda' && !(extension === 'usd' && format === 'usda')
      ? [bytes[8]!, bytes[9]!, bytes[10]!] as const : undefined

    const resolver = ArGetResolver()
    const identifier = resolver.createIdentifierForNewAsset(filePath)
    const resolved = await resolver.resolveForNewAsset(identifier)
    const asset = await resolver.openAssetForWrite(resolved, ArResolverWriteMode.Replace)
    if (!asset) return false
    try {
      let offset = 0
      while (offset < bytes.byteLength) {
        const written = await asset.write(bytes.subarray(offset), offset)
        if (written <= 0) return false
        offset += written
      }
      if (inPlace && crateVersion && this._data instanceof Sdf_CrateData) this._data._setFileVersion(crateVersion)
      return true
    } finally {
      await asset.close()
    }
  }

  async save(): Promise<boolean> {
    if (this.filePath.startsWith('anon:') || splitPackagePath(this.filePath)) return false
    const saved = await this._writeToPath(splitLayerIdentifier(this.filePath).assetPath, undefined, true)
    if (saved) this.markCurrentStateAsClean()
    return saved
  }

  // SdfLayer::Reload(force) (layer.cpp:960-1110).
  async reload(force = false): Promise<boolean> {
    if (this.filePath.startsWith('anon:')) return this._reloadAnonymous()
    if (splitPackagePath(this.filePath)) return false
    const resolver = _resolverForContext(
      ArGetResolver(), this._resolverContext ?? ArGetResolver().getCurrentContext())
    const context = this._resolverContext ?? resolver.getCurrentContext()
    // The physical location of the file may have changed since the last
    // load, so re-resolve the identifier (layer.cpp:1046-1059).
    const { assetPath, args } = splitLayerIdentifier(this.filePath)
    const oldResolvedPath = this.resolvedPath
    const resolved = await sdfResolvePath(resolver, assetPath, context, undefined)
    // SdfLayer::UpdateAssetInfo re-registers the layer under its new
    // resolved path (layer.cpp:2762-2789).
    const resolvedIdentifier = resolved.valid
      ? createLayerIdentifier(resolved.toString(), args) : ''
    if (resolvedIdentifier !== oldResolvedPath) {
      this._resolvedPath = resolvedIdentifier
      _layerRegistry.update(this, this.filePath, resolvedIdentifier)
    }
    if (!resolved.valid) return false
    const asset = await resolver.openAsset(resolved, context)
    if (!asset) return false
    const bytes = await asset.getBuffer()
    const format = SdfFileFormat.findByExtension(resolved.toString())
    if (!format?.read) return false
    const data = new SdfData()
    data.createSpec('/', 'pseudoRoot')
    const crateBacked = bytes.length >= 8 &&
      new TextDecoder().decode(bytes.subarray(0, 8)) === 'PXR-USDC'
    const replacement = new Layer(
      this.filePath,
      data,
      context,
      !crateBacked || Layer._detachedLayerRules.isIncluded(this.filePath),
      resolvedIdentifier,
    )
    format.read(bytes, replacement, args)
    // See if we can skip reloading (layer.cpp:1081-1088). typescript-usd
    // adaptation: an asset whose content is unchanged stands in for an
    // unchanged modification timestamp.
    const resolvedPathChanged = resolvedIdentifier !== oldResolvedPath
    if (!force && !this.isDirty() && !resolvedPathChanged &&
        replacement._data.equals(this._data)) return false
    sdfChangeBlock(() => {
      this._replaceData(replacement._data)
      this._isDetached = replacement._isDetached
      if (resolvedPathChanged) this._notifyDidChange({ kind: 'resolvedPathChange', path: '/' })
      this.markCurrentStateAsClean()
      this._notifyDidChange({ kind: 'reloadContent', path: '/' })
    })
    return true
  }

  // SdfLayer::_Reload for anonymous layers (layer.cpp:1007-1028): text
  // layers reset to their initial contents (SdfUsdaFileFormat::
  // _ShouldSkipAnonymousReload); other formats skip the reload.
  private _reloadAnonymous(): boolean {
    if (!(this.getFileFormat() instanceof SdfUsdaFileFormat)) return false
    const initialData = new SdfData()
    initialData.createSpec('/', 'pseudoRoot')
    if (this.getSpecPaths().length === 1 && this._data.list('/').length === 0) return false
    sdfChangeBlock(() => {
      this._replaceData(initialData)
      this.markCurrentStateAsClean()
      this._notifyDidChange({ kind: 'reloadContent', path: '/' })
    })
    return true
  }

  // SdfLayer::GetFileFormat (pxr/usd/sdf/layer.cpp:931-937).
  getFileFormat(): SdfFileFormat | undefined {
    return this._fileFormat ?? SdfFileFormat.findByExtension(this.filePath)
  }

  // SdfLayer::GetFileFormatArguments (layer.h:111): the arguments the
  // layer was created or opened with.
  getFileFormatArguments(): SdfFileFormatArguments {
    return new Map(this._fileFormatArgs ?? splitLayerIdentifier(this.filePath).args)
  }

  // The format and arguments an anonymous layer was created with
  // (SdfLayer::_fileFormat, _fileFormatArgs; layer.h:2033-2034).
  private _fileFormat: SdfFileFormat | undefined
  private _fileFormatArgs: ReadonlyMap<string, string> | undefined

  getExternalAssetDependencies(): string[] {
    return SdfFileFormat.findByExtension(this.filePath)
      ?.getExternalAssetDependencies(this) ?? []
  }
}

/**
 * @internal Host/test adapter; public SdfLayer opening uses ArGetResolver.
 * With `errors`, the open's errors are collected there instead of posted.
 */
export function _sdfFindOrOpenLayer(
  filePath: string,
  resolver?: ArResolver,
  context?: ArResolverContext,
  errors?: TfError[],
): Promise<Layer | undefined> {
  const selected = resolver ?? ArGetResolver()
  const selectedContext = context ?? (resolver
    ? _resolverContextForResolver(resolver)
    : selected.getCurrentContext())
  return Layer._findOrOpenWithResolver(filePath, selected, selectedContext, errors)
}
