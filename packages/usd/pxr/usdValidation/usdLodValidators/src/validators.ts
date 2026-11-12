// Ported from OpenUSD 26.11.1:
//  pxr/usdValidation/usdLodValidators/validators.cpp
// Copyright 2026 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// OpenUSD 26.11.1 pxr/usdValidation/usdLodValidators/validators.cpp.
import type { Attribute, Prim } from 'typescript-usd/usd'
import {
  DistanceHeuristic as UsdLodDistanceHeuristic, Heuristic as UsdLodHeuristic,
  OverrideAPI as UsdLodOverrideAPI, RootAPI as UsdLodRootAPI,
  ScreenSizeHeuristic as UsdLodScreenSizeHeuristic, Tokens as UsdLodTokens,
} from 'typescript-usd/usdLod'
import { TfRegistryManager } from 'typescript-usd/tf'
import {
  ValidationError, ValidationErrorSite, ValidationErrorType, ValidationRegistry, type ValidationTimeRange,
} from 'typescript-usd/usdValidation'
import { UsdLodValidationErrorNameTokens, UsdLodValidatorNameTokens } from './validatorTokens.ts'

function _error(name: string, prim: Prim, message: string,
  type: ValidationErrorType = ValidationErrorType.Error): ValidationError {
  return new ValidationError(name, type, [new ValidationErrorSite(prim.getStage(), prim.path)], message)
}

// UsdAttribute::Get(VtArray<T>*): the array, or an empty array when the
// attribute has no value (the out-parameter is left empty).
function _array<T>(attr: Attribute | undefined): T[] {
  const value = attr?.isValid() ? attr.getValue() : undefined
  return value === undefined || value === null ? [] : Array.from(value as Iterable<T>)
}

// UsdAttribute::Get(TfToken*): the token, or empty when there is no value.
function _token(attr: Attribute | undefined): string {
  const value = attr?.isValid() ? attr.getValue() : undefined
  return typeof value === 'string' ? value : ''
}

// printf's %g (six significant digits, trailing zeros removed, exponent form
// below 1e-4 or from 1e6), which the messages of validators.cpp:89-121 and
// 167-199 use for float values promoted to double.
function _formatG(value: number): string {
  if (value === 0 || !Number.isFinite(value)) {
    return Number.isNaN(value) ? 'nan' : value === 0 ? (Object.is(value, -0) ? '-0' : '0')
      : value > 0 ? 'inf' : '-inf'
  }
  const [mantissa, exponentText] = value.toExponential(5).split('e') as [string, string]
  const exponent = Number(exponentText)
  const trim = (text: string): string => text.includes('.') ? text.replace(/\.?0+$/, '') : text
  if (exponent < -4 || exponent >= 6) {
    return `${trim(mantissa)}e${exponent < 0 ? '-' : '+'}${String(Math.abs(exponent)).padStart(2, '0')}`
  }
  return trim(value.toFixed(5 - exponent))
}

// validators.cpp:28-52 (_HeuristicLodDomainValidator): the lod:domain
// attribute on any UsdLodHeuristic prim is non-empty.
function _heuristicLodDomainValidator(prim: Prim, _timeRange: ValidationTimeRange): ValidationError[] {
  const heuristic = new UsdLodHeuristic(prim)
  if (!heuristic.isValid()) return []

  const domain = _token(heuristic.getLodDomainAttr())
  if (domain !== '') return []

  return [_error(UsdLodValidationErrorNameTokens.lodDomainEmpty, prim,
    `LODHeuristic <${prim.path}> has an empty lod:domain.`)]
}

// validators.cpp:54-127 (_DistanceHeuristicThresholdsValidator): thresholds
// must be strictly increasing; blendThresholds (if present) must satisfy
// thresholds[i] <= blendThresholds[i] <= thresholds[i+1].
function _distanceHeuristicThresholdsValidator(prim: Prim,
  _timeRange: ValidationTimeRange): ValidationError[] {
  const heuristic = new UsdLodDistanceHeuristic(prim)
  if (!heuristic.isValid()) return []

  const thresholds = _array<number>(heuristic.getThresholdsAttr())
  const blendThresholds = _array<number>(heuristic.getBlendThresholdsAttr())

  const errors: ValidationError[] = []

  const thresholdLimit = thresholds.length - 1
  for (let i = 0; i < thresholdLimit; ++i) {
    if (thresholds[i + 1]! <= thresholds[i]!) {
      errors.push(_error(UsdLodValidationErrorNameTokens.thresholdsNotStrictlyIncreasing, prim,
        `LODDistanceHeuristic <${prim.path}>: thresholds[${i + 1}] is not strictly increasing.`))
    }
  }

  if (blendThresholds.length > 0) {
    const blendLimit = Math.min(thresholds.length, blendThresholds.length)
    for (let i = 0; i < blendLimit; ++i) {
      if (blendThresholds[i]! < thresholds[i]!) {
        errors.push(_error(UsdLodValidationErrorNameTokens.blendThresholdBelowThreshold, prim,
          `LODDistanceHeuristic <${prim.path}>: blendThresholds[${i}] `
          + `(${_formatG(blendThresholds[i]!)}) < thresholds[${i}] (${_formatG(thresholds[i]!)}).`))
      }
    }
    for (let i = 0; i < blendLimit - 1; ++i) {
      if (blendThresholds[i]! > thresholds[i + 1]!) {
        errors.push(_error(UsdLodValidationErrorNameTokens.blendThresholdAboveNextThreshold, prim,
          `LODDistanceHeuristic <${prim.path}>: blendThresholds[${i}] `
          + `(${_formatG(blendThresholds[i]!)}) > thresholds[${i + 1}] (${_formatG(thresholds[i + 1]!)}).`))
      }
    }
  }

  return errors
}

// validators.cpp:129-237 (_ScreenSizeHeuristicThresholdsValidator):
// thresholds must be strictly decreasing; blendThresholds (if present) must
// satisfy thresholds[i+1] <= blendThresholds[i] <= thresholds[i];
// projectionMethod must be a recognized token; extent (if present) must
// have size 0 or 2.
function _screenSizeHeuristicThresholdsValidator(prim: Prim,
  _timeRange: ValidationTimeRange): ValidationError[] {
  const heuristic = new UsdLodScreenSizeHeuristic(prim)
  if (!heuristic.isValid()) return []

  const thresholds = _array<number>(heuristic.getThresholdsAttr())
  const blendThresholds = _array<number>(heuristic.getBlendThresholdsAttr())

  const errors: ValidationError[] = []

  const thresholdLimit = thresholds.length - 1
  for (let i = 0; i < thresholdLimit; ++i) {
    if (thresholds[i + 1]! >= thresholds[i]!) {
      errors.push(_error(UsdLodValidationErrorNameTokens.thresholdsNotStrictlyDecreasing, prim,
        `LODScreenSizeHeuristic <${prim.path}>: thresholds[${i + 1}] is not strictly decreasing.`))
    }
  }

  if (blendThresholds.length > 0) {
    const blendLimit = Math.min(thresholds.length, blendThresholds.length)
    for (let i = 0; i < blendLimit; ++i) {
      if (blendThresholds[i]! > thresholds[i]!) {
        errors.push(_error(UsdLodValidationErrorNameTokens.blendThresholdAboveThreshold, prim,
          `LODScreenSizeHeuristic <${prim.path}>: blendThresholds[${i}] `
          + `(${_formatG(blendThresholds[i]!)}) > thresholds[${i}] (${_formatG(thresholds[i]!)}).`))
      }
    }
    for (let i = 0; i < blendLimit - 1; ++i) {
      if (blendThresholds[i]! < thresholds[i + 1]!) {
        errors.push(_error(UsdLodValidationErrorNameTokens.blendThresholdBelowNextThreshold, prim,
          `LODScreenSizeHeuristic <${prim.path}>: blendThresholds[${i}] `
          + `(${_formatG(blendThresholds[i]!)}) < thresholds[${i + 1}] (${_formatG(thresholds[i + 1]!)}).`))
      }
    }
  }

  const projectionMethod = _token(heuristic.getProjectionMethodAttr())
  if (projectionMethod !== '' && projectionMethod !== UsdLodTokens.projectedSphere
    && projectionMethod !== UsdLodTokens.projectedExtent) {
    errors.push(_error(UsdLodValidationErrorNameTokens.invalidProjectionMethod, prim,
      `LODScreenSizeHeuristic <${prim.path}>: projectionMethod '${projectionMethod}' is `
      + 'not a recognized value (expected \'projectedSphere\' or \'projectedExtent\').'))
  }

  const extent = _array<unknown>(heuristic.getExtentAttr())
  if (extent.length !== 0 && extent.length !== 2) {
    errors.push(_error(UsdLodValidationErrorNameTokens.invalidExtentSize, prim,
      `LODScreenSizeHeuristic <${prim.path}>: extent has ${extent.length} element(s) `
      + 'but must be empty or have exactly 2 elements.'))
  }

  return errors
}

// validators.cpp:239-295 (_LodOverrideApiModeValidator): lod:override:mode is
// a recognized token, and lod:override:index is readable when mode is
// indexedLOD.
function _lodOverrideApiModeValidator(prim: Prim, _timeRange: ValidationTimeRange): ValidationError[] {
  if (!prim.hasAPI(UsdLodOverrideAPI.typeName)) return []

  const overrideAPI = new UsdLodOverrideAPI(prim)

  const mode = overrideAPI.getLodOverrideModeAttr()?.getValue()
  if (typeof mode !== 'string') return []

  const allowedModes: string[] = [
    UsdLodTokens.inherited,
    UsdLodTokens.noOverride,
    UsdLodTokens.indexedLOD,
    UsdLodTokens.noLOD,
    UsdLodTokens.allLOD,
  ]
  const modeIsValid = allowedModes.includes(mode)

  const errors: ValidationError[] = []

  if (!modeIsValid) {
    errors.push(_error(UsdLodValidationErrorNameTokens.invalidOverrideMode, prim,
      `LODOverrideAPI prim <${prim.path}>: lod:override:mode '${mode}' is not a recognized value.`))
  } else if (mode === UsdLodTokens.indexedLOD) {
    // UsdAttribute::Get(float*) fails unless the value is a float.
    if (typeof overrideAPI.getLodOverrideIndexAttr()?.getValue() !== 'number') {
      errors.push(_error(UsdLodValidationErrorNameTokens.unreadableOverrideIndex, prim,
        `LODOverrideAPI prim <${prim.path}>: lod:override:mode is 'indexedLOD' but `
        + 'lod:override:index cannot be read.', ValidationErrorType.Warn))
    }
  }

  return errors
}

// validators.cpp:297-329 (_LodRootApiHeuristicsValidator): every target of
// lod:heuristics resolves to a prim that IsA UsdLodHeuristic.
function _lodRootApiHeuristicsValidator(prim: Prim, _timeRange: ValidationTimeRange): ValidationError[] {
  if (!prim.hasAPI(UsdLodRootAPI.typeName)) return []

  const rootAPI = new UsdLodRootAPI(prim)
  const targets = rootAPI.getLodHeuristicsRel()?.getTargets() ?? []

  const errors: ValidationError[] = []

  for (const targetPath of targets) {
    const targetPrim = prim.getStage().getPrim(targetPath)
    if (!targetPrim?.isValid() || !targetPrim.isA(UsdLodHeuristic.typeName)) {
      errors.push(_error(UsdLodValidationErrorNameTokens.invalidHeuristicTarget, prim,
        `LODRootAPI prim <${prim.path}>: lod:heuristics target <${targetPath}> `
        + 'does not resolve to a UsdLodHeuristic prim.'))
    }
  }

  return errors
}

// validators.cpp:331-354.
TfRegistryManager.add(ValidationRegistry, () => {
  const registry = ValidationRegistry.getInstance()
  registry.registerPluginPrimValidator(UsdLodValidatorNameTokens.heuristicLodDomain,
    _heuristicLodDomainValidator)
  registry.registerPluginPrimValidator(UsdLodValidatorNameTokens.distanceHeuristicThresholds,
    _distanceHeuristicThresholdsValidator)
  registry.registerPluginPrimValidator(UsdLodValidatorNameTokens.screenSizeHeuristicThresholds,
    _screenSizeHeuristicThresholdsValidator)
  registry.registerPluginPrimValidator(UsdLodValidatorNameTokens.lodOverrideApiMode,
    _lodOverrideApiModeValidator)
  registry.registerPluginPrimValidator(UsdLodValidatorNameTokens.lodRootApiHeuristics,
    _lodRootApiHeuristicsValidator)
})
