// Ported from OpenUSD 26.11.1:
//  pxr/usdValidation/usdShadeValidators/validators.cpp
// Copyright 2024 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// OpenUSD 26.11.1 pxr/usdValidation/usdShadeValidators/validators.cpp.
import { GetResolver as ArGetResolver } from 'typescript-usd/ar'
import { Vec4f as GfVec4f } from 'typescript-usd/gf'
import { AssetPath as SdfAssetPath } from 'typescript-usd/sdf'
import {
  Registry as SdrRegistry, type ShaderNode as SdrShaderNode, type ShaderProperty as SdrShaderProperty,
} from 'typescript-usd/sdr'
import { TfRegistryManager, Type as TfType } from 'typescript-usd/tf'
import {
  CollectionAPI as UsdCollectionAPI, TimeCode as UsdTimeCode, type Attribute, type EditTarget as UsdEditTarget,
  type Prim, type Rel as UsdRel,
} from 'typescript-usd/usd'
import { Subset as UsdGeomSubset, Imageable as UsdGeomImageable } from 'typescript-usd/usdGeom'
import {
  ConnectableAPI as UsdShadeConnectableAPI, MATERIAL_BIND_FAMILY, Material as UsdShadeMaterial,
  MaterialBindingAPI as UsdShadeMaterialBindingAPI, NodeGraph as UsdShadeNodeGraph, Shader as UsdShadeShader,
  getValueProducingAttributes,
} from 'typescript-usd/usdShade'
import {
  ValidationError as UsdValidationError, ValidationErrorSite as UsdValidationErrorSite,
  ValidationErrorType as UsdValidationErrorType, ValidationFixer as UsdValidationFixer,
  ValidationRegistry as UsdValidationRegistry, type ValidationTimeRange as UsdValidationTimeRange,
} from 'typescript-usd/usdValidation'
import { UsdShadeValidationErrorNameTokens, UsdShadeValidatorNameTokens } from './validatorTokens.ts'

// UsdShadeTokens / UsdGeomTokens / UsdTokens values these validators read.
const _materialBinding = 'material:binding'
const _materialBindingCollection = 'material:binding:collection'
const _unrestricted = 'unrestricted'
const _nonOverlapping = 'nonOverlapping'
const _partition = 'partition'

function _propertyPath(property: Attribute | UsdRel): string {
  return property.getPath()
}

// TfStringPrintf("%.6g").
function _g6(value: number): string {
  return String(Number(value.toPrecision(6)))
}

// UsdShadeMaterialBindingAPI::CanContainPropertyName
// (usdShade/materialBindingAPI.cpp:954-958).
//
// FAITHFULNESS-DEBT(usdshade-validator-binding-helpers): CanContainPropertyName,
// CanApply (materialBindingAPI.cpp:954-958, the generated CanApply), and the
// DirectBinding / CollectionBinding classes with IsCollectionBindingRel
// (materialBindingAPI.cpp:209-310) are not on typescript-usd/usdShade's
// MaterialBindingAPI; they are written here from upstream. End-state: those
// members on MaterialBindingAPI, called from here.
function _canContainPropertyName(name: string): boolean {
  return name.startsWith(_materialBinding)
}

// The material a binding targets: UsdShadeMaterial(stage->GetPrimAtPath)
// (materialBindingAPI.cpp:224-232, 283-291); invalid when there is none.
function _materialAt(rel: UsdRel, materialPath: string): UsdShadeMaterial | undefined {
  if (!rel.getPrim() || materialPath === '') return undefined
  const material = new UsdShadeMaterial(rel.getStage().getPrim(materialPath), rel.getStage())
  return material.isValid() ? material : undefined
}

function _isPrimPath(path: string): boolean {
  return path.startsWith('/') && !path.includes('.')
}

// materialBindingAPI.cpp:209-222 (DirectBinding): one prim-path target.
function _directBindingMaterialPath(rel: UsdRel): string {
  const targetPaths = rel.getForwardedTargets()
  return targetPaths.length === 1 && _isPrimPath(targetPaths[0]!) ? targetPaths[0]! : ''
}

// materialBindingAPI.cpp:263-281 (CollectionBinding): one prim-path target
// (the material) and one property-path target (the collection).
function _collectionBindingPaths(rel: UsdRel): { materialPath: string, collectionPath: string } {
  const targetPaths = rel.getForwardedTargets()
  if (targetPaths.length === 2) {
    const firstIsPrimPath = _isPrimPath(targetPaths[0]!)
    const secondIsPrimPath = _isPrimPath(targetPaths[1]!)
    if (firstIsPrimPath !== secondIsPrimPath) {
      return {
        materialPath: targetPaths[firstIsPrimPath ? 0 : 1]!,
        collectionPath: targetPaths[firstIsPrimPath ? 1 : 0]!,
      }
    }
  }
  return { materialPath: '', collectionPath: '' }
}

// materialBindingAPI.cpp:303-310 (IsCollectionBindingRel).
function _isCollectionBindingRel(rel: UsdRel): boolean {
  return rel.name.startsWith(_materialBindingCollection)
}

// The material binding relationships among a prim's properties
// (usdPrim.GetProperties(CanContainPropertyName) filtered by Is<UsdRelationship>).
function _materialBindingProperties(usdPrim: Prim): Attribute[] {
  return usdPrim.getProperties(name => _canContainPropertyName(name))
}

// validators.cpp:37-96.
function _encapsulationMaterialValidator(usdPrim: Prim, _timeRange: UsdValidationTimeRange): UsdValidationError[] {
  if (!usdPrim.isA(UsdShadeMaterial.typeName)) return []

  const errors: UsdValidationError[] = []
  for (const descPrim of usdPrim.getDescendants()) {
    if (descPrim.isA('Imageable')) {
      // Imageable prims must not be descPrim of a Material, and hence
      // violating the UsdShade OM and its contract with the rendering
      // infrastructure.
      errors.push(new UsdValidationError(
        UsdShadeValidationErrorNameTokens.invalidImageableInMaterial, UsdValidationErrorType.Error,
        [new UsdValidationErrorSite(usdPrim.getStage(), usdPrim.path),
          new UsdValidationErrorSite(usdPrim.getStage(), descPrim.path)],
        `Imageable <${descPrim.path}> of type ${descPrim.typeName} is not a valid `
        + `descendant of Material <${usdPrim.path}>.`))
    }

    const connectableChild = new UsdShadeConnectableAPI(descPrim)
    if (connectableChild.isValid()) {
      // connectable descendant of a Material in usdShade must be IsA
      // UsdShadeShader or UsdShadeNodeGraph and can not be a
      // UsdShadeMaterial.
      if (descPrim.isA(UsdShadeMaterial.typeName)
        || !(descPrim.isA(UsdShadeShader.typeName) || descPrim.isA(UsdShadeNodeGraph.typeName))) {
        errors.push(new UsdValidationError(
          UsdShadeValidationErrorNameTokens.invalidConnectableInMaterial, UsdValidationErrorType.Error,
          [new UsdValidationErrorSite(usdPrim.getStage(), usdPrim.path),
            new UsdValidationErrorSite(usdPrim.getStage(), descPrim.path)],
          `Connectable <${descPrim.path}> of type ${descPrim.typeName} is not a `
          + `valid connectable descendant of Material <${usdPrim.path}>.`))
      }
    }
  }
  return errors
}

// validators.cpp:98-178.
function _encapsulationValidator(usdPrim: Prim, _timeRange: UsdValidationTimeRange): UsdValidationError[] {
  // Encapsulation rules for connections are only relevant for UsdShadeShader,
  // UsdShadeMaterial, and UsdShadeNodeGraph prims. (Even though
  // UsdShadeMaterial IsA UsdShadeNodeGraph, we explicitly check for it, to
  // express the intent.
  if (!(usdPrim.isA(UsdShadeShader.typeName) || usdPrim.isA(UsdShadeMaterial.typeName)
    || usdPrim.isA(UsdShadeNodeGraph.typeName))) return []

  const connectable = new UsdShadeConnectableAPI(usdPrim)
  if (!connectable.isValid()) return []

  const parentPrim = usdPrim.getParent()
  if (!parentPrim || parentPrim.isPseudoRoot()) return []

  const parentConnectable = new UsdShadeConnectableAPI(parentPrim)
  const errors: UsdValidationError[] = []
  if (parentConnectable.isValid() && !parentConnectable.isContainer()) {
    // It is a violation of the UsdShade OM which enforces encapsulation of
    // connectable prims under a Container-type connectable prim.
    errors.push(new UsdValidationError(
      UsdShadeValidationErrorNameTokens.connectableInNonContainer, UsdValidationErrorType.Error,
      [new UsdValidationErrorSite(usdPrim.getStage(), usdPrim.path)],
      `Connectable ${usdPrim.typeName} <${usdPrim.path}> cannot reside `
      + `under a non-Container Connectable ${parentPrim.typeName}`))
  } else if (!parentConnectable.isValid()) {
    const verifyValidAncestor = (currentAncestor: Prim | undefined): void => {
      if (!currentAncestor || currentAncestor.isPseudoRoot()) return
      const ancestorConnectable = new UsdShadeConnectableAPI(currentAncestor)
      if (ancestorConnectable.isValid()) {
        // it's only OK to have a non-connectable parent if all the rest of
        // your ancestors are also non-connectable. The error message we give
        // is targeted at the most common infraction, using Scope or other
        // grouping prims inside a Container like a Material
        const parentName = parentPrim.path.slice(parentPrim.path.lastIndexOf('/') + 1)
        errors.push(new UsdValidationError(
          UsdShadeValidationErrorNameTokens.invalidConnectableHierarchy, UsdValidationErrorType.Error,
          [new UsdValidationErrorSite(usdPrim.getStage(), usdPrim.path)],
          `Connectable ${usdPrim.typeName} <${usdPrim.path}> can only have `
          + `Connectable Container ancestors up to ${currentAncestor.typeName} `
          + `ancestor <${currentAncestor.path}>, but its parent ${parentName} is a `
          + `${parentPrim.typeName}.`))
        return
      }
      verifyValidAncestor(currentAncestor.getParent())
    }
    verifyValidAncestor(parentPrim.getParent())
  }
  return errors
}

// validators.cpp:180-213.
function _materialBindingApiAppliedValidator(usdPrim: Prim, _timeRange: UsdValidationTimeRange): UsdValidationError[] {
  const errors: UsdValidationError[] = []
  const hasMaterialBindingRelationship = (prim: Prim): boolean =>
    prim.getProperties().some(property => property.isRelationship && property.name.startsWith(_materialBinding))

  if (!usdPrim.hasAPI('MaterialBindingAPI') && hasMaterialBindingRelationship(usdPrim)) {
    errors.push(new UsdValidationError(
      UsdShadeValidationErrorNameTokens.missingMaterialBindingAPI, UsdValidationErrorType.Error,
      [new UsdValidationErrorSite(usdPrim.getStage(), usdPrim.path)],
      'Found material bindings but no MaterialBindingAPI '
      + `applied on the prim <${usdPrim.path}>.`))
  }
  return errors
}

// validators.cpp:215-251.
function _materialBindingRelationships(usdPrim: Prim, _timeRange: UsdValidationTimeRange): UsdValidationError[] {
  if (!usdPrim?.isValid()) return []
  const errors: UsdValidationError[] = []
  for (const matBindingProperty of _materialBindingProperties(usdPrim)) {
    if (matBindingProperty.isRelationship) continue
    errors.push(new UsdValidationError(
      UsdShadeValidationErrorNameTokens.materialBindingPropNotARel, UsdValidationErrorType.Error,
      [new UsdValidationErrorSite(usdPrim.getStage(), _propertyPath(matBindingProperty))],
      `Prim <${usdPrim.path}> has material binding property '${matBindingProperty.name}' that is not `
      + 'a relationship.'))
  }
  return errors
}

// validators.cpp:253-322.
function _materialBindingCheckCollection(prim: Prim, rel: UsdRel, outErrors: UsdValidationError[]): void {
  const targets = rel.getTargets()
  const site = [new UsdValidationErrorSite(prim.getStage(), rel.getPath())]

  if (targets.length === 1) {
    if (_isCollectionBindingRel(rel)) {
      outErrors.push(new UsdValidationError(
        UsdShadeValidationErrorNameTokens.invalidMaterialCollection, UsdValidationErrorType.Error, site,
        `Collection-based material binding on <${prim.path}> `
        + `has 1 target <${targets[0]}>, needs 2: a collection path `
        + 'and a UsdShadeMaterial path.'))
    } else {
      const materialPath = _directBindingMaterialPath(rel)
      if (!_materialAt(rel, materialPath)) {
        outErrors.push(new UsdValidationError(
          UsdShadeValidationErrorNameTokens.invalidResourcePath, UsdValidationErrorType.Error, site,
          `Direct material binding <${rel.getPath()}> targets an invalid material <${materialPath}>.`))
      }
    }
  } else if (targets.length === 2) {
    const { materialPath, collectionPath } = _collectionBindingPaths(rel)
    if (!_materialAt(rel, materialPath)) {
      outErrors.push(new UsdValidationError(
        UsdShadeValidationErrorNameTokens.invalidResourcePath, UsdValidationErrorType.Error, site,
        `Collection-based material binding <${rel.getPath()}> targets an invalid material <${materialPath}>.`))
    }
    // materialBindingAPI.cpp:293-301 (GetCollection).
    const collection = rel.getPrim() && collectionPath !== ''
      ? UsdCollectionAPI.getCollection(rel.getStage(), collectionPath) : undefined
    if (!collection?.isValid()) {
      outErrors.push(new UsdValidationError(
        UsdShadeValidationErrorNameTokens.invalidResourcePath, UsdValidationErrorType.Error, site,
        `Collection-based material binding <${rel.getPath()}> targets an invalid collection <${collectionPath}>.`))
    }
  } else {
    outErrors.push(new UsdValidationError(
      UsdShadeValidationErrorNameTokens.invalidMaterialCollection, UsdValidationErrorType.Error, site,
      `Invalid number of targets on material binding <${rel.getPath()}>`))
  }
}

// validators.cpp:324-348.
function _materialBindingCollectionValidator(usdPrim: Prim, _timeRange: UsdValidationTimeRange): UsdValidationError[] {
  if (!usdPrim?.isValid() || !usdPrim.hasAPI('MaterialBindingAPI')) return []
  const outErrors: UsdValidationError[] = []
  for (const matBindingProperty of _materialBindingProperties(usdPrim)) {
    if (!matBindingProperty.isRelationship) continue
    _materialBindingCheckCollection(usdPrim, usdPrim.rel(matBindingProperty.name), outErrors)
  }
  return outErrors
}

// UsdShadeNodeDefAPI::GetShaderNodeForSourceType / GetShaderNodeForShadingSystem
// (usdShade/nodeDefAPI.cpp:429-465).
//
// FAITHFULNESS-DEBT(usdshade-validator-shader-node-for-source-type): typescript-usd/usdShade's Shader has no GetShaderNodeForSourceType; it is
// written here from nodeDefAPI.cpp:429-465. End-state: Shader /
// NodeDefAPI.getShaderNodeForSourceType, called from here.
function _shaderNodeForSourceType(shader: UsdShadeShader, sourceType: string): SdrShaderNode | undefined {
  const registry = SdrRegistry.getInstance()
  const implSource = shader.getImplementationSource()
  const metadata = shader.getSdrMetadata()
  if (implSource === 'id') {
    const shaderId = shader.getShaderId()
    return shaderId !== undefined ? registry.getShaderNodeByIdentifierAndSystem(shaderId, sourceType) : undefined
  } else if (implSource === 'sourceAsset') {
    const sourceAsset = shader.getSourceAsset(sourceType)
    if (sourceAsset === undefined) return undefined
    return registry.getShaderNodeFromAsset(new SdfAssetPath(sourceAsset), metadata,
      shader.getSourceAssetSubIdentifier(sourceType) ?? '', sourceType)
  } else if (implSource === 'sourceCode') {
    const sourceCode = shader.getSourceCode(sourceType)
    return sourceCode !== undefined ? registry.getShaderNodeFromSourceCode(sourceCode, sourceType, metadata) : undefined
  }
  return undefined
}

function _sameValue(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false
  const equals = (a as { equals?: (other: unknown) => boolean }).equals
  if (typeof equals === 'function') return equals.call(a, b)
  return JSON.stringify(a) === JSON.stringify(b)
}

// SdrShaderNode::CheckPropertyCompliance (sdr/shaderNode.cpp:313-351): the
// inputs, by name, whose type or default differs between the nodes, with the
// identifiers of the nodes that differ from the first.
//
// FAITHFULNESS-DEBT(usdshade-validator-sdr-property-compliance): typescript-usd/sdr's SdrShaderNode has no CheckPropertyCompliance, and its
// properties no GetDefaultValueAsSdfType, so the third comparison
// (shaderNode.cpp:334-335) is not made. End-state:
// SdrShaderNode.checkPropertyCompliance in typescript-usd/sdr, called from here.
function _checkPropertyCompliance(shaderNodes: readonly SdrShaderNode[]): Map<string, string[]> {
  const propertyMap = new Map<string, SdrShaderProperty>()
  const result = new Map<string, string[]>()
  for (const shaderNode of shaderNodes) {
    for (const propName of shaderNode.getShaderInputNames()) {
      const sdrProp = shaderNode.getShaderInput(propName)
      if (!sdrProp) continue
      const existing = propertyMap.get(propName)
      if (!existing) {
        propertyMap.set(propName, sdrProp)
      } else if (existing.getTypeAsSdfType() !== sdrProp.getTypeAsSdfType()
        || !_sameValue(existing.getDefaultValue(), sdrProp.getDefaultValue())) {
        const identifiers = result.get(propName)
        if (identifiers) identifiers.push(shaderNode.getIdentifier())
        else result.set(propName, [shaderNode.getIdentifier()])
      }
    }
  }
  return result
}

// validators.cpp:350-527.
function _shaderPropertyTypeConformance(usdPrim: Prim, _timeRange: UsdValidationTimeRange): UsdValidationError[] {
  if (!(usdPrim?.isValid() && usdPrim.isInFamily(TfType.findByName('UsdShadeShader'), 'all'))) return []
  const shader = new UsdShadeShader(usdPrim, usdPrim.getStage())
  if (!shader.isValid()) return []

  const expectedImplSource = ['id', 'sourceAsset', 'sourceCode']
  // UsdShadeNodeDefAPI::GetImplementationSource returns the authored token
  // only when it is one of these (nodeDefAPI.cpp:176-191), so this check
  // cannot fail here either.
  const implSource = shader.getImplementationSource()
  if (!expectedImplSource.includes(implSource)) {
    return [new UsdValidationError(
      UsdShadeValidationErrorNameTokens.invalidImplSource, UsdValidationErrorType.Error,
      [new UsdValidationErrorSite(usdPrim.getStage(), _propertyPath(shader.getImplementationSourceAttr()))],
      `Shader <${usdPrim.path}> has invalid implementation source '${implSource}'.`)]
  }

  const sourceTypes = shader.getSourceTypes()
  if (sourceTypes.length === 0 && implSource !== 'id') {
    return [new UsdValidationError(
      UsdShadeValidationErrorNameTokens.missingSourceType, UsdValidationErrorType.Error,
      [new UsdValidationErrorSite(usdPrim.getStage(), usdPrim.path)],
      `Shader <${usdPrim.path}> has no sourceType.`)]
  }

  const errors: UsdValidationError[] = []
  const propNameToPropertyMap = new Map<string, SdrShaderProperty>()
  if (sourceTypes.length === 0 && implSource === 'id') {
    const shaderId = shader.getShaderId()
    if (shaderId !== undefined) {
      // Single shaderNode, just emplace all properties, no need to find
      // anything.
      const sdrShaderNode = SdrRegistry.getInstance().getShaderNodeByIdentifier(shaderId)
      if (sdrShaderNode) {
        for (const propName of sdrShaderNode.getShaderInputNames()) {
          const sdrProp = sdrShaderNode.getShaderInput(propName)
          if (sdrProp) propNameToPropertyMap.set(propName, sdrProp)
        }
      } else {
        return [new UsdValidationError(
          UsdShadeValidationErrorNameTokens.missingShaderIdInRegistry, UsdValidationErrorType.Error,
          [new UsdValidationErrorSite(usdPrim.getStage(), _propertyPath(shader.getIdAttr()))],
          `shaderId '${shaderId}' specified on shader prim <${usdPrim.path}> not found in sdrRegistry.`)]
      }
    }
  } else {
    // Use the SdrShaderNode::CheckPropertyCompliance to find if these do not
    // match, then report a ValidationError as a warning, since asset authors
    // have no control on fixing the shaders.
    const shaderNodesFromSourceTypes: SdrShaderNode[] = []
    // We need to gather all unique inputs from all sdrShaderNodes queried
    // using multiple sourceTypes.
    for (const sourceType of sourceTypes) {
      const sdrShaderNode = _shaderNodeForSourceType(shader, sourceType)
      if (sdrShaderNode) {
        shaderNodesFromSourceTypes.push(sdrShaderNode)
        for (const propName of sdrShaderNode.getShaderInputNames()) {
          // Check if property has already been added to the map.
          if (propNameToPropertyMap.has(propName)) continue
          const sdrProp = sdrShaderNode.getShaderInput(propName)
          if (sdrProp) propNameToPropertyMap.set(propName, sdrProp)
        }
      } else {
        const sourceTypeSites = usdPrim.getPropertiesInNamespace(['info', sourceType])
          .map(sourceTypeProp => new UsdValidationErrorSite(usdPrim.getStage(), _propertyPath(sourceTypeProp)))
        errors.push(new UsdValidationError(
          UsdShadeValidationErrorNameTokens.missingSourceTypeInRegistry, UsdValidationErrorType.Error,
          sourceTypeSites,
          `sourceType '${sourceType}' specified on shader prim <${usdPrim.path}> not found in sdrRegistry.`))
      }
    }
    const sdrWarnSite = [new UsdValidationErrorSite(usdPrim.getStage(), usdPrim.path)]
    for (const [propName, shaderNames] of _checkPropertyCompliance(shaderNodesFromSourceTypes)) {
      errors.push(new UsdValidationError(
        UsdShadeValidationErrorNameTokens.incompatShaderPropertyWarning, UsdValidationErrorType.Warn,
        sdrWarnSite,
        `Shader nodes '${shaderNames.join(' ')}' have incompatible property '${propName}'.`))
    }
  }

  // Get ground truth data about inputName to types from sdrNode
  const sdrPropnameToSdfType = new Map<string, string>()
  for (const [propName, prop] of propNameToPropertyMap) sdrPropnameToSdfType.set(propName, prop.getTypeAsSdfType())

  // Compare ground truth data with the inputs on UsdShadeShader prim
  for (const input of shader.getInputs(false)) {
    const baseName = input.getBaseName()
    const expectedSdrInputType = sdrPropnameToSdfType.get(baseName)
    if (expectedSdrInputType === undefined) continue
    const usdInputType = input.getTypeName()
    if (usdInputType !== expectedSdrInputType) {
      const inputPath = _propertyPath(input.getAttr())
      errors.push(new UsdValidationError(
        UsdShadeValidationErrorNameTokens.mismatchPropertyType, UsdValidationErrorType.Error,
        [new UsdValidationErrorSite(usdPrim.getStage(), inputPath)],
        `Incorrect type for ${inputPath}. Expected '${expectedSdrInputType}'; got '${usdInputType}'.`))
    }
  }
  return errors
}

// validators.cpp:529-576.
function _subsetMaterialBindFamilyName(usdPrim: Prim, _timeRange: UsdValidationTimeRange): UsdValidationError[] {
  if (!(usdPrim?.isValid() && usdPrim.isInFamily(TfType.findByName('UsdGeomSubset'), 'all'))) return []
  const subset = new UsdGeomSubset(usdPrim, usdPrim.getStage())
  if (!subset.isValid()) return []

  const numMatBindingRels = _materialBindingProperties(usdPrim)
    .filter(property => property.isRelationship).length
  if (numMatBindingRels < 1) return []

  if (subset.getFamilyNameAttr().hasAuthoredValue()) return []

  return [new UsdValidationError(
    UsdShadeValidationErrorNameTokens.missingFamilyNameOnGeomSubset, UsdValidationErrorType.Error,
    [new UsdValidationErrorSite(usdPrim.getStage(), usdPrim.path)],
    `GeomSubset prim <${usdPrim.path}> with material bindings applied but `
    + `no authored family name should set familyName to '${MATERIAL_BIND_FAMILY}'.`)]
}

// validators.cpp:578-629.
function _subsetsMaterialBindFamily(usdPrim: Prim, _timeRange: UsdValidationTimeRange): UsdValidationError[] {
  if (!(usdPrim?.isValid() && usdPrim.isInFamily(TfType.findByName('UsdGeomImageable'), 'all'))) return []
  const imageable = new UsdGeomImageable(usdPrim, usdPrim.getStage())
  if (!imageable.isValid()) return []

  const stage = usdPrim.getStage()
  const materialBindSubsets = UsdGeomSubset.getGeomSubsets(stage, usdPrim.path, '', MATERIAL_BIND_FAMILY)
  if (materialBindSubsets.length === 0) return []

  const errors: UsdValidationError[] = []
  // Check to make sure that the "materialBind" family is of a restricted
  // type, since it is invalid for an element of geometry to be bound to
  // multiple materials.
  const materialBindFamilyType = UsdGeomSubset.getFamilyType(stage, usdPrim.path, MATERIAL_BIND_FAMILY)
  if (materialBindFamilyType === _unrestricted) {
    errors.push(new UsdValidationError(
      UsdShadeValidationErrorNameTokens.invalidFamilyType, UsdValidationErrorType.Error,
      [new UsdValidationErrorSite(stage, usdPrim.path)],
      `Imageable prim <${usdPrim.path}> has '${MATERIAL_BIND_FAMILY}' subset family with invalid `
      + `family type '${materialBindFamilyType}'. Family type should be '${_nonOverlapping}' or `
      + `'${_partition}' instead.`))
  }
  return errors
}

// UsdShadeInput::IsInput (usdShade/input.cpp): the attribute is in the
// "inputs:" namespace.
function _isInput(attr: Attribute): boolean {
  return attr.name.startsWith('inputs:')
}

// validators.cpp:704-726 (_GetInputValue): the value of the one input
// attribute producing the input's value, at the earliest time.
function _getInputValue(inputShader: UsdShadeShader, token: string): unknown {
  const input = inputShader.getInput(token)
  if (!input.getAttr().isValid()) return undefined
  const valueProducingAttributes = getValueProducingAttributes(
    inputShader.prim.getStage(), _propertyPath(input.getAttr()))
  // Query value producing attributes for input values. This has to be a
  // length of 1, otherwise no attribute is producing a value. We require an
  // input parameter producing the value.
  if (valueProducingAttributes.length !== 1 || !_isInput(valueProducingAttributes[0]!)) return undefined
  return valueProducingAttributes[0]!.getValueAtTime(UsdTimeCode.EarliestTime())
}

// Get(&GfVec4f) (validators.cpp:789-797): a value only when it holds a
// GfVec4f.
function _vec4fComponents(value: unknown): number[] | undefined {
  return value instanceof GfVec4f ? [...value.data] : undefined
}

// validators.cpp:631-884.
function _normalMapTextureValidator(usdPrim: Prim, _timeRange: UsdValidationTimeRange): UsdValidationError[] {
  if (!usdPrim.isA(UsdShadeShader.typeName)) return []
  const stage = usdPrim.getStage()
  const shader = new UsdShadeShader(usdPrim, stage)

  // We may have failed to fetch an identifier for asset/source-based nodes.
  // OR, we could potentially be driven by a UsdPrimvarReader, in which case
  // we'd have nothing to validate
  if (shader.getShaderId() !== 'UsdPreviewSurface') return []

  const normalInput = shader.getInput('normal')
  if (!normalInput.getAttr().isValid()) return []

  const valueProducingAttributes = getValueProducingAttributes(stage, _propertyPath(normalInput.getAttr()))
  if (valueProducingAttributes.length === 0 || valueProducingAttributes[0]!.primPath === usdPrim.path) return []

  const sourcePrim = valueProducingAttributes[0]!.getPrim()!
  const sourceShader = new UsdShadeShader(sourcePrim, stage)
  if (!sourceShader.isValid()) {
    // In theory, could be connected to an interface attribute of a parent
    // connectable... not useful, but not an error
    if (new UsdShadeConnectableAPI(sourcePrim).isValid()) return []
    return [new UsdValidationError(
      UsdShadeValidationErrorNameTokens.nonShaderConnection, UsdValidationErrorType.Error,
      [new UsdValidationErrorSite(stage, usdPrim.path)],
      `UsdPreviewSurface.normal on prim <${usdPrim.path}> is connected to a non-Shader prim.`)]
  }

  // We may have failed to fetch an identifier for asset/source-based nodes.
  // OR, we could potentially be driven by a UsdPrimvarReader, in which case
  // we'd have nothing to validate
  if (sourceShader.getShaderId() !== 'UsdUVTexture') return []

  const sites = (): UsdValidationErrorSite[] => [
    new UsdValidationErrorSite(stage, usdPrim.path), new UsdValidationErrorSite(stage, sourcePrim.path)]

  const fileValue = _getInputValue(sourceShader, 'file')
  const textureAssetPath = fileValue instanceof SdfAssetPath ? fileValue : new SdfAssetPath()
  const errors: UsdValidationError[] = []

  if (!(fileValue instanceof SdfAssetPath) || textureAssetPath.getResolvedPath() === '') {
    errors.push(new UsdValidationError(
      UsdShadeValidationErrorNameTokens.invalidFile, UsdValidationErrorType.Error, sites(),
      `UsdUVTexture prim <${sourcePrim.path}> (connected through validating prim <${usdPrim.path}>) `
      + `has invalid or unresolvable inputs:file of @${textureAssetPath.getAssetPath()}@`))
  }

  // validators.cpp:753-761.
  const textureIs8Bit = (resolvedPath: string): boolean => {
    const extension = ArGetResolver().getExtension(resolvedPath).toLowerCase()
    return ['bmp', 'tga', 'png', 'jpg', 'jpeg', 'tif'].includes(extension)
  }

  // Nothing more is required for image depths > 8 bits, which we assume FOR
  // NOW, are floating point
  if (!textureIs8Bit(textureAssetPath.getResolvedPath())) return errors

  const colorSpace = _getInputValue(sourceShader, 'sourceColorSpace')
  if (colorSpace !== 'raw') {
    errors.push(new UsdValidationError(
      UsdShadeValidationErrorNameTokens.invalidSourceColorSpace, UsdValidationErrorType.Error, sites(),
      `UsdUVTexture prim <${sourcePrim.path}> (connected through validating prim <${usdPrim.path}>) `
      + `that reads Normal Map @${textureAssetPath.getAssetPath()}@ should set inputs:sourceColorSpace `
      + 'to \'raw\'.'))
  }

  const biasVector = _vec4fComponents(_getInputValue(sourceShader, 'bias'))
  const scaleVector = _vec4fComponents(_getInputValue(sourceShader, 'scale'))

  if (!(biasVector && scaleVector)) {
    errors.push(new UsdValidationError(
      UsdShadeValidationErrorNameTokens.nonCompliantBiasAndScale, UsdValidationErrorType.Error, sites(),
      `UsdUVTexture prim <${sourcePrim.path}> (connected through validating prim <${usdPrim.path}>) `
      + `reads 8 bit Normal Map @${textureAssetPath.getAssetPath()}@, which requires that inputs:scale `
      + 'be set to (2, 2, 2, 1) and inputs:bias be set to (-1, -1, -1, 0) for proper interpretation '
      + 'as per the UsdPreviewSurface and UsdUVTexture docs.'))
    return errors
  }

  // We still warn for inputs:scale not conforming to UsdPreviewSurface
  // guidelines, as some authoring tools may rely on this to scale an effect
  // of normal perturbations. don't really care about fourth components...
  const nonCompliantScaleValues = scaleVector[0] !== 2 || scaleVector[1] !== 2 || scaleVector[2] !== 2
  if (nonCompliantScaleValues) {
    errors.push(new UsdValidationError(
      UsdShadeValidationErrorNameTokens.nonCompliantScale, UsdValidationErrorType.Warn, sites(),
      `UsdUVTexture prim <${sourcePrim.path}> (connected through validating prim <${usdPrim.path}>) `
      + 'reads an 8 bit Normal Map, but has non-standard inputs:scale value of '
      + `(${scaleVector.map(_g6).join(', ')}). inputs:scale must be set to (2, 2, 2, 1) so as fulfill `
      + 'the requirements of the normals to be in tangent space of [(-1,-1,-1), (1,1,1)] as documented '
      + 'in the UsdPreviewSurface and UsdUVTexture docs.'))
  }

  // Note that for a 8bit normal map, inputs:bias must be appropriately set
  // to [-1, -1, -1, 0] to fulfill the requirements of the normals to be in
  // tangent space of [(-1,-1,-1), (1,1,1)] as documented in the
  // UsdPreviewSurface docs. Note this is true only when scale values are
  // respecting the requirements laid in the UsdPreviewSurface / UsdUVTexture
  // docs. We continue to warn!
  if (!nonCompliantScaleValues && (biasVector[0] !== -1 || biasVector[1] !== -1 || biasVector[2] !== -1)) {
    errors.push(new UsdValidationError(
      UsdShadeValidationErrorNameTokens.nonCompliantBias, UsdValidationErrorType.Warn, sites(),
      `UsdUVTexture prim <${sourcePrim.path}> (connected through validating prim <${usdPrim.path}>) `
      + 'reads an 8 bit Normal Map, but has non-standard inputs:bias value of '
      + `(${biasVector.map(_g6).join(', ')}). inputs:bias must be set to [-1,-1,-1,0] so as to fulfill `
      + 'the requirements of the normals to be in tangent space of [(-1,-1,-1), (1,1,1)] as documented '
      + 'in the UsdPreviewSurface and UsdUVTexture docs.'))
  }
  return errors
}

// validators.cpp:886-935.
function _materialBindingApiAppliedValidatorFixers(): UsdValidationFixer[] {
  // The one error site, when it is a valid prim (validators.cpp:893-904,
  // 911-922).
  const sitePrim = (error: UsdValidationError, editTarget: UsdEditTarget): Prim | undefined => {
    if (!editTarget.isValid() || !editTarget.getLayer()) return undefined
    // Must have one and only one error site to fix
    if (error.getSites().length !== 1) return undefined
    const site = error.getSites()[0]!
    if (!site.isValid() || !site.isPrim()) return undefined
    return site.getPrim()
  }
  const fixerCanApplyFn = (error: UsdValidationError, editTarget: UsdEditTarget): boolean => {
    const prim = sitePrim(error, editTarget)
    // UsdShadeMaterialBindingAPI::CanApply (see usdshade-validator-binding-helpers).
    return prim ? prim.canApplyAPI('MaterialBindingAPI') : false
  }
  const fixerImplFn = (error: UsdValidationError, editTarget: UsdEditTarget): boolean => {
    const prim = sitePrim(error, editTarget)
    if (!prim) return false
    UsdShadeMaterialBindingAPI.apply(prim)
    return true
  }
  return [new UsdValidationFixer('ApplyMaterialBindingAPI', 'Applies the MaterialBindingAPI to the prim.',
    fixerImplFn, fixerCanApplyFn, [], UsdShadeValidationErrorNameTokens.missingMaterialBindingAPI)]
}

// validators.cpp:937-977.
TfRegistryManager.add(UsdValidationRegistry, () => {
  const registry = UsdValidationRegistry.getInstance()
  registry.registerPluginPrimValidator(UsdShadeValidatorNameTokens.materialBindingApiAppliedValidator,
    _materialBindingApiAppliedValidator, _materialBindingApiAppliedValidatorFixers())
  registry.registerPluginPrimValidator(UsdShadeValidatorNameTokens.materialBindingRelationships,
    _materialBindingRelationships)
  registry.registerPluginPrimValidator(UsdShadeValidatorNameTokens.materialBindingCollectionValidator,
    _materialBindingCollectionValidator)
  registry.registerPluginPrimValidator(UsdShadeValidatorNameTokens.normalMapTextureValidator,
    _normalMapTextureValidator)
  registry.registerPluginPrimValidator(UsdShadeValidatorNameTokens.shaderSdrCompliance,
    _shaderPropertyTypeConformance)
  registry.registerPluginPrimValidator(UsdShadeValidatorNameTokens.subsetMaterialBindFamilyName,
    _subsetMaterialBindFamilyName)
  registry.registerPluginPrimValidator(UsdShadeValidatorNameTokens.subsetsMaterialBindFamily,
    _subsetsMaterialBindFamily)
  registry.registerPluginPrimValidator(UsdShadeValidatorNameTokens.encapsulationMaterialValidator,
    _encapsulationMaterialValidator)
  registry.registerPluginPrimValidator(UsdShadeValidatorNameTokens.encapsulationValidator,
    _encapsulationValidator)
})
