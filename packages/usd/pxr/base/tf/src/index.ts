// typescript-usd/tf — Tool Foundations (base/tf). Foundational types and utilities.
//
// Mirrors OpenUSD pxr/base/tf. Built demand-driven for the base tier / exec
// port; see the base-tier-buildout memory.

export { TfToken as Token, TfMakeTokens as MakeTokens, TfToTokenVector as ToTokenVector, TfToStringVector as ToStringVector } from "./token.ts";
export { TfType as Type } from "./type.ts";
export type { TfTypeFactoryBase as TypeFactoryBase } from "./type.ts";
export { TfTypeInfoMap as TypeInfoMap } from "./typeInfoMap.ts";
export { lz4Compress, lz4Decompress, lz4CompressBound, TfFastCompression } from "./fastCompression.ts";
export { dictionaryLessThan, dictionaryStrcmp, stringSplit, isValidIdentifier, makeValidIdentifier, stringToLong, stringToULong, TfDictionaryLessThan, TfStringCapitalize, TfStringCatPaths, TfStringContains, TfStringEndsWith, TfStringGetBeforeSuffix, TfStringGetCommonPrefix, TfStringGetSuffix, TfStringJoin, TfStringReplace, TfStringStartsWith, TfStringToLong, TfStringToLower, TfStringToLowerAscii, TfStringToULong, TfStringToUpper, TfStringTokenize, TfStringTokenizeToSet, TfStringTrim, TfStringTrimLeft, TfStringTrimRight, TfQuotedStringTokenize, TfMatchedStringTokenize, TfEscapeString, TfGetXmlEscapedString, TfDoubleToString, TfIntToString, TfStringToDouble, TfStringToInt64, TfStringToUInt64, TfStringify, TfUnstringify, TfSafeString, TfGetBaseName, TfGetPathName, TfStreamDouble, TfStreamFloat, TF_LONG_MAX, TF_LONG_MIN, TF_ULONG_MAX } from "./stringUtils.ts";
export { TfHash as Hash, TfHashCombine as HashCombine, TfHashAsCStr as HashAsCStr, TfHashCString as HashCString, TfHashCharPtr as HashCharPtr, TfHashAppend } from "./hash.ts";
export { Tf_HashState } from "./hash.ts";
export { TfPatternMatcher as PatternMatcher } from "./patternMatcher.ts";
export { TfUtf8CodePoint as Utf8CodePoint, TfUtf8CodePointView as Utf8CodePointView, TfUtf8InvalidCodePoint as Utf8InvalidCodePoint, TfUtf8CodePointFromAscii as Utf8CodePointFromAscii, TfIsUtf8CodePointXidStart as IsUtf8CodePointXidStart, TfIsUtf8CodePointXidContinue as IsUtf8CodePointXidContinue } from "./unicodeUtils.ts";
export { TfStopwatch as Stopwatch } from "./stopwatch.ts";
export { TfEnum as Enum } from "./enum.ts";
export { TfNotice as Notice, TfNoticeBlock as NoticeBlock, TfNoticeKey as NoticeKey } from "./notice.ts";
export { TfDiagnosticBase as DiagnosticBase, TfError as Error, TfWarning as Warning, TfStatus as StatusObject, TfErrorMark as Mark, TfErrorMark, TfErrorTransport, TF_HAS_ERRORS, TfRaiseError as RaiseError, TfRaiseWarning as RaiseWarning, TfDiagnosticType, TfDiagnosticMgr, TfLogCrash, TF_AXIOM, TF_CODING_ERROR, TF_DEV_AXIOM, TF_FATAL_ERROR, TF_RUNTIME_ERROR, TF_STATUS, TF_VERIFY, TF_WARN } from "./diagnostic.ts";
export { TfDiagnosticTrap } from "./diagnosticTrap.ts";
export type { TfCallContext, TfDiagnosticDelegate } from "./diagnostic.ts";
export type { TfSmallVector, TfDenseHashMap, TfHashMap, TfHashMultiMap, TfHashSet, TfHashMultiSet } from "./tf.ts";
export { TfRefBase, TfRefPtr, TfWeakPtr, TfDelegatedCountPtr } from "./tf.ts";
export { TfDebug as Debug } from "./debug.ts";
export { TfNormPath, TfGetExtension } from "./pathUtils.ts";
export { TfEnvSetting, TfGetEnvSetting } from "./envSetting.ts";
export { TfCompressedBits, TfCompressedBitsMode, TfCompressedBitsView, TfCompressedBitsViewIterator, TfCompressedBitsPlatformsView, TfCompressedBitsPlatformsIterator } from "./compressedBits.ts";
export type { TfBitsSource, TfBitsTarget } from "./compressedBits.ts";
export { TfIterator, TfMakeIterator, TfMakeReverseIterator, TfArraySize } from "./iterator.ts";
export { TfScoped, TfScopedVar, TfScopedAutoVar } from "./scoped.ts";
export { TfStacked, TfStackedAccess } from "./stacked.ts";
export type { TfStackedClass } from "./stacked.ts";
export { TfScopeDescription, GetCurrentScopeDescriptionStack, TfGetCurrentScopeDescriptionStack, TfGetThisThreadScopeDescriptionStack } from "./scopeDescription.ts";
export { TfRegistryManager } from "./registryManager.ts";
export { TfSingleton } from "./singleton.ts";
export { TfAtomicOfstreamWrapper } from "./atomicOfstreamWrapper.ts";
export type { TfAtomicOfstreamReason } from "./atomicOfstreamWrapper.ts";
export { TfSafeOutputFile, TfSafeOutputFileUpdateStream } from "./safeOutputFile.ts";
export type { TfSafeOutputFileStream } from "./safeOutputFile.ts";
export { Tf_DiagnosticContainer } from "./diagnosticContainer.ts";
export { TfDiagnosticTransport } from "./diagnosticTransport.ts";
export { TfRegTest } from "./regTest.ts";
export { TfBits } from "./bits.ts";
