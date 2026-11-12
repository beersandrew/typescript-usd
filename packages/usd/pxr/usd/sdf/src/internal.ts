// Deliberately internal cross-package seams for Usd. These are not part of
// typescript-usd/sdf's public barrel.

export { sdfCloneValue as _sdfCloneValue, sdfValuesEqual as _sdfValuesEqual } from './abstractData.ts'
export { coerceValueToType as _sdfCoerceValueToType, sdfCanonicalTextTypeName as _sdfCanonicalTextTypeName, sdfValueTypeNameOfValue as _sdfValueTypeNameOfValue } from './parserHelpers.ts'
export {
  _sdfGetMetadataFieldType,
  _sdfMapTypedValue,
  _sdfCloneDictionaryValueTypes,
  _sdfGetDictionaryValueTypes,
  _sdfIsDictionary,
  _sdfIsGfValue,
  _sdfMakeTypedValue,
  _sdfMetadataValueTypeName,
  _sdfTfTypeForName,
  _sdfGetSplineKnotCustomDataValueTypes,
  _sdfGetTextSplineState,
  _sdfRecordDictionaryValueTypes,
  _sdfRecordSplineKnotCustomDataValueTypes,
  _sdfRecordTextSplineState,
  _sdfRegisterMetadataPlugins,
  _sdfRegisterPluginFields,
  _sdfTransformMetadataValue,
  _sdfVisitTypedValue,
  type SdfMetadataPlugin,
  type SdfMetadataSpecType,
  type SdfTextSplineKnotState,
  type SdfTextSplineState,
} from './schema.ts'
export { _sdfHandOut, _sdfCheckReturnedValues, _sdfCheckTakeMutations } from './checkReturnedValues.ts'
export { _SdfPathExpressionValue } from './pathExpression.ts'
export {
  _createLayerWithData as _sdfCreateLayerWithData,
  _sdfFindOrOpenLayer,
} from './layer.ts'
export {
  _sdfFileFormatForPath,
  _registerFileFormat as _sdfRegisterFileFormat,
  _loadFileFormatPluginForPath as _sdfLoadFileFormatPluginForPath,
  _loadedFileFormatForPath as _sdfLoadedFileFormatForPath,
  _fileFormatType as _sdfFileFormatType,
} from './fileFormat.ts'
export {
  createLayerIdentifier as _sdfCreateLayerIdentifier,
  splitLayerIdentifier as _sdfSplitLayerIdentifier,
} from './layerRegistry.ts'
export {
  dataFromParserScene as _sdfDataFromParserScene,
  type SdfParserScene,
} from './crateDataTypes.ts'
export { parseCrate as _sdfParseCrate, type Scene as SdfCrateScene } from './crateFile.ts'
export { parseUsda as _sdfParseUsda, type Scene as SdfTextScene } from './textFileFormatParser.ts'
export {
  Asset as ArAsset,
  DefaultResolver as ArDefaultResolver,
  GetResolver as ArGetResolver,
  InMemoryAsset as ArInMemoryAsset,
  Resolver as ArResolver,
  ResolverContext as ArResolverContext,
} from 'typescript-usd/ar'
export { ArInMemoryResolver } from 'typescript-usd/ar/_internal'
export {
  joinPackagePath,
  resolveAssetPath,
  splitPackagePath,
} from 'typescript-usd/ar/_internal'
export { readAsset } from './usdzFileFormat.ts'
export { plainValue as _sdfPlainValue } from './usdaFileFormat.ts'
