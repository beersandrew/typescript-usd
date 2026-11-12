// Ported from OpenUSD 26.11.1: pxr/usd/usdRender/spec.cpp,
//  pxr/usd/usdRender/spec.h
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// OpenUSD v26.11.1 pxr/usd/usdRender/spec.{h,cpp}: UsdRenderSpec, a
// self-contained specification of render settings, and the functions that
// compute it from a UsdRenderSettings prim.
import { Error as TfError, TfDiagnosticMgr, TfDiagnosticType } from 'typescript-usd/tf'
import { Range2f as GfRange2f, Vec2f as GfVec2f, Vec2i as GfVec2i } from 'typescript-usd/gf'
import { Attribute, type Prim, Rel } from 'typescript-usd/usd'
import { Camera } from 'typescript-usd/usdGeom'
import { ShadeOutput, getValueProducingAttributes } from 'typescript-usd/usdShade'
import { Product } from './product.ts'
import type { Settings } from './settings.ts'
import { SettingsBase } from './settingsBase.ts'
import { UsdRenderTokens } from './tokens.ts'
import { Var } from './var.ts'

/** VtDictionary: keys in std::map (lexicographic) order. */
export type SpecDictionary = Record<string, unknown>

/** UsdRenderSpec::Product (spec.h). */
export interface SpecProduct {
  /** The path of this product, which uniquely identifies it. */
  renderProductPath: string
  /** The type of product, ex: "raster". */
  type: string
  /** The name of the product, which uniquely identifies it. */
  name: string
  /** Path to the primary UsdGeomCamera camera to use for this product. */
  cameraPath: string
  /** If set to true, disables motion blur. */
  disableMotionBlur: boolean
  /** If set to true, disables depth of field. */
  disableDepthOfField: boolean
  /** The pixel resolution of the product. */
  resolution: GfVec2i
  /** The pixel aspect ratio as adjusted by aspectRatioConformPolicy. */
  pixelAspectRatio: number
  /** The policy that was applied to conform aspect ratio mismatches between
   * the aperture and image. */
  aspectRatioConformPolicy: string
  /** The camera aperture size as adjusted by aspectRatioConformPolicy. */
  apertureSize: GfVec2f
  /** The data window, in NDC terms relative to the aperture.
   * (0,0) corresponds to bottom-left and (1,1) corresponds to top-right. */
  dataWindowNDC: GfRange2f
  /** The render vars used by this product, as indices into the top-level
   * renderVars array. */
  renderVarIndices: number[]
  /** Any extra settings values discovered in requested namespaces. */
  namespacedSettings: SpecDictionary
}

/** UsdRenderSpec::RenderVar (spec.h): the output variable of a product. */
export interface SpecRenderVar {
  /** The path of this render var, which uniquely identifies it. */
  renderVarPath: string
  /** The value data type of the variable, as a USD type name. */
  dataType: string
  sourceName: string
  sourceType: string
  /** Any extra settings values discovered in requested namespaces. */
  namespacedSettings: SpecDictionary
}

/** UsdRenderSpec (spec.h). */
export interface Spec {
  /** The full list of products requested by this render. */
  products: SpecProduct[]
  /** The full list of render vars requested by products in this render. */
  renderVars: SpecRenderVar[]
  /** List of purposes to use to filter scene contents. */
  includedPurposes: string[]
  /** List of material binding purposes. */
  materialBindingPurposes: string[]
  /** Any extra settings values discovered in requested namespaces. */
  namespacedSettings: SpecDictionary
}

// spec.h: the Product struct's member initializers. disableMotionBlur,
// disableDepthOfField and pixelAspectRatio have none in C++; the base
// product always reads them (spec.cpp:195-196), so these values never
// reach a computed spec.
function _newProduct(): SpecProduct {
  return {
    renderProductPath: '',
    type: '',
    name: '',
    cameraPath: '',
    disableMotionBlur: false,
    disableDepthOfField: false,
    resolution: new GfVec2i(0),
    pixelAspectRatio: 0,
    aspectRatioConformPolicy: '',
    apertureSize: new GfVec2f(0),
    dataWindowNDC: new GfRange2f(),
    renderVarIndices: [],
    namespacedSettings: {},
  }
}

function _copyProduct(p: SpecProduct): SpecProduct {
  return {
    ...p,
    resolution: new GfVec2i(p.resolution),
    apertureSize: new GfVec2f(p.apertureSize),
    dataWindowNDC: new GfRange2f(p.dataWindowNDC.getMin(), p.dataWindowNDC.getMax()),
    renderVarIndices: [...p.renderVarIndices],
    namespacedSettings: { ...p.namespacedSettings },
  }
}

function _runtimeError(message: string): void {
  TfDiagnosticMgr.GetInstance().postError(new TfError(message, TfDiagnosticType.RuntimeError))
}

// spec.cpp:17-27: return the outermost namespace of an attribute name.
function _getAttrNamespace(name: string): string {
  const pos = name.indexOf(':')
  if (pos !== -1) {
    return name.slice(0, pos)
  } else {
    return ''
  }
}

// VtDictionary keeps std::map key order.
function _sortedDictionary(dict: SpecDictionary): SpecDictionary {
  const sorted: SpecDictionary = {}
  for (const key of Object.keys(dict).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))) {
    sorted[key] = dict[key]
  }
  return sorted
}

// spec.cpp:29-84.
function _readNamespacedSettings(
  prim: Prim,
  requestedNamespaces: readonly string[],
  namespacedSettings: SpecDictionary,
): void {
  const stage = prim.getStage()
  const attrs: Attribute[] = []
  const rels: Rel[] = []
  // UsdPrim::GetAuthoredAttributes / GetAuthoredRelationships.
  for (const propName of prim.getAuthoredPropertyNames()) {
    const prop = stage.getPropertyAtPath(`${prim.path}.${propName}`)
    if (prop instanceof Attribute) attrs.push(prop)
    else if (prop instanceof Rel) rels.push(prop)
  }

  for (const attr of attrs) {
    const name = attr.name

    // Use UsdShadeOutput to strip "outputs:"
    const isShadeOutput = name.startsWith('outputs:')
    const shadeOutput = isShadeOutput
      ? new ShadeOutput(prim, name.slice('outputs:'.length)) : undefined
    const basename = shadeOutput ? shadeOutput.name : name
    const attrNamespace = _getAttrNamespace(basename)

    // Only collect namespaced settings
    if (attrNamespace === '') {
      continue
    }

    // If specific namespaces were requested, require a match
    if (requestedNamespaces.length > 0 &&
      !requestedNamespaces.includes(attrNamespace)) {
      continue
    }

    // Connections are stronger than values authored on the attribute, so
    // check for connections first.
    if (shadeOutput) {
      const targets = getValueProducingAttributes(stage, shadeOutput.fullPath)
      if (targets.length > 0) {
        const outputConnectedPaths: string[] = []
        for (const targetPath of targets) {
          outputConnectedPaths.push(targetPath.primPath)
        }
        namespacedSettings[name] = outputConnectedPaths
        continue
      }
    }

    // Base case: use the attribute value
    const val = attr.get()
    if (val !== undefined) {
      namespacedSettings[name] = val
    }
  }

  for (const rel of rels) {
    const name = rel.name
    namespacedSettings[name] = rel.getTargets()
  }
}

// spec.cpp:86-94: get the value, or only an authored one.
function _get(attr: Attribute, getDefaultValue: boolean): unknown {
  if (getDefaultValue || attr.hasAuthoredValue()) {
    return attr.get()
  }
  return undefined
}

// spec.cpp:96-136.
function _readSettingsBase(rsBase: SettingsBase, pd: SpecProduct, getDefault = true): void {
  const targets = rsBase.getCameraRel().getForwardedTargets()
  if (targets.length > 0) {
    pd.cameraPath = targets[0]!
  }
  const resolution = _get(rsBase.getResolutionAttr(), getDefault)
  if (resolution !== undefined) pd.resolution = new GfVec2i(resolution as GfVec2i)
  const pixelAspectRatio = _get(rsBase.getPixelAspectRatioAttr(), getDefault)
  if (typeof pixelAspectRatio === 'number') pd.pixelAspectRatio = pixelAspectRatio
  const policy = _get(rsBase.getAspectRatioConformPolicyAttr(), getDefault)
  if (typeof policy === 'string') pd.aspectRatioConformPolicy = policy

  {
    // Convert dataWindowNDC from vec4 to range2.
    const dataWindowNDCVec = _get(rsBase.getDataWindowNDCAttr(), getDefault) as
      { get(i: number): number } | undefined
    if (dataWindowNDCVec !== undefined) {
      pd.dataWindowNDC = new GfRange2f(
        new GfVec2f(dataWindowNDCVec.get(0), dataWindowNDCVec.get(1)),
        new GfVec2f(dataWindowNDCVec.get(2), dataWindowNDCVec.get(3)))
    }
  }

  const disableMotionBlur = _get(rsBase.getDisableMotionBlurAttr(), getDefault)
  if (typeof disableMotionBlur === 'boolean') pd.disableMotionBlur = disableMotionBlur

  {
    // For backwards-compatibility:
    // instantaneousShutter disables motion blur
    // (spec.cpp:127-128 reads the disableMotionBlur attribute here.)
    let instantaneousShutter = false
    const value = _get(rsBase.getDisableMotionBlurAttr(), getDefault)
    if (typeof value === 'boolean') instantaneousShutter = value
    if (instantaneousShutter) {
      pd.disableMotionBlur = true
    }
  }

  const disableDepthOfField = _get(rsBase.getDisableDepthOfFieldAttr(), getDefault)
  if (typeof disableDepthOfField === 'boolean') pd.disableDepthOfField = disableDepthOfField
}

// spec.cpp:138-176.
// TODO: Consolidate with CameraUtilConformedWindow().  Resolve policy name
// mismatches; also CameraUtil cannot compensate pixelAspectRatio.
function _applyAspectRatioPolicy(product: SpecProduct): void {
  const f = Math.fround
  // Gather dimensions
  const res = product.resolution
  const size = product.apertureSize
  // Validate dimensions
  if (res.get(0) <= 0.0 || res.get(1) <= 0.0 || size.get(0) <= 0.0 || size.get(1) <= 0.0) {
    return
  }
  // Compute aspect ratios
  const resAspectRatio = f(f(res.get(0)) / f(res.get(1)))
  const imageAspectRatio = f(f(product.pixelAspectRatio) * resAspectRatio)
  if (imageAspectRatio <= 0.0) {
    return
  }
  const apertureAspectRatio = f(size.get(0) / size.get(1))
  // Apply policy
  const policy = product.aspectRatioConformPolicy
  let adjust: 'Width' | 'Height' | 'None' = 'None'
  if (policy === UsdRenderTokens.adjustPixelAspectRatio) {
    product.pixelAspectRatio = f(apertureAspectRatio / resAspectRatio)
  } else if (policy === UsdRenderTokens.adjustApertureHeight) {
    adjust = 'Height'
  } else if (policy === UsdRenderTokens.adjustApertureWidth) {
    adjust = 'Width'
  } else if (policy === UsdRenderTokens.expandAperture) {
    adjust = (apertureAspectRatio > imageAspectRatio) ? 'Height' : 'Width'
  } else if (policy === UsdRenderTokens.cropAperture) {
    adjust = (apertureAspectRatio > imageAspectRatio) ? 'Width' : 'Height'
  }
  // Adjust aperture so that size[0] / size[1] == imageAspectRatio.
  if (adjust === 'Width') {
    product.apertureSize = new GfVec2f(size.get(1) * imageAspectRatio, size.get(1))
  } else if (adjust === 'Height') {
    product.apertureSize = new GfVec2f(size.get(0), size.get(0) / imageAspectRatio)
  }
}

/**
 * Computes the specification of the render settings. For each product,
 * product-specific overrides to base render settings are applied. If
 * `namespaces` is non-empty, only attributes in those namespaces are
 * collected into namespacedSettings (spec.cpp:180-294).
 */
export function computeSpec(settings: Settings, namespaces: readonly string[]): Spec {
  const renderSpec: Spec = {
    products: [],
    renderVars: [],
    includedPurposes: [],
    materialBindingPurposes: [],
    namespacedSettings: {},
  }
  const rsPrim = settings.path ? settings.prim : undefined
  const stage = rsPrim?.getStage()
  if (!rsPrim || !stage) {
    TfDiagnosticMgr.GetInstance().postError(
      new TfError('Invalid stage\n', TfDiagnosticType.CodingError))
    return renderSpec
  }

  // Read shared base settings as a "base product". Note that this excludes
  // namespaced attributes that are gathered under namespacedSettings.
  const baseProduct = _newProduct()
  _readSettingsBase(new SettingsBase(rsPrim, stage), baseProduct)

  // Products
  const targets = settings.getProductsRel().getForwardedTargets()
  for (const target of targets) {
    const rpPrim = new Product(stage.getPrim(target), stage)
    if (rpPrim.isValid()) {
      // Initialize the render spec product with the base render product
      const rpSpec = _copyProduct(baseProduct)
      rpSpec.renderProductPath = target

      // Read product-specific overrides to base render settings.
      _readSettingsBase(new SettingsBase(rpPrim.prim, stage), rpSpec,
        false /* only get Authored values*/)

      // Read camera aperture and apply aspectRatioConformPolicy. Use the
      // camera path from the rpSpec if authored, otherwise the camera path
      // on the render settings prim.
      const camPath = rpSpec.cameraPath === ''
        ? baseProduct.cameraPath
        : rpSpec.cameraPath
      const camPrim = camPath ? stage.getPrim(camPath) : undefined
      if (camPrim && camPrim.isA(Camera.typeName)) {
        const cam = new Camera(camPrim, stage)
        const h = cam.getHorizontalApertureAttr().get()
        const v = cam.getVerticalApertureAttr().get()
        rpSpec.apertureSize = new GfVec2f(
          typeof h === 'number' ? h : rpSpec.apertureSize.get(0),
          typeof v === 'number' ? v : rpSpec.apertureSize.get(1))
        _applyAspectRatioPolicy(rpSpec)
      } else {
        _runtimeError('UsdRenderSettings: Could not find camera ' +
          `<${camPath}> for the render product <${target}>.\n`)
        continue
      }

      // Read product-only settings.
      const type = rpPrim.getProductTypeAttr().get()
      if (typeof type === 'string') rpSpec.type = type
      const name = rpPrim.getProductNameAttr().get()
      if (typeof name === 'string') rpSpec.name = name

      // Read render vars.
      const renderVarPaths = rpPrim.getOrderedVarsRel().getForwardedTargets()
      for (const renderVarPath of renderVarPaths) {
        let foundExisting = false
        for (let i = 0; i < renderSpec.renderVars.length; ++i) {
          if (renderSpec.renderVars[i]!.renderVarPath === renderVarPath) {
            rpSpec.renderVarIndices.push(i)
            foundExisting = true
            break
          }
        }
        if (!foundExisting) {
          const prim = stage.getPrim(renderVarPath)
          if (prim && prim.isA(Var.typeName)) {
            const rvPrim = new Var(prim, stage)
            const rvSpec: SpecRenderVar = {
              renderVarPath: '', dataType: '', sourceName: '', sourceType: '',
              namespacedSettings: {},
            }

            // Store schema-defined attributes in explicit fields.
            rvSpec.renderVarPath = renderVarPath
            const dataType = rvPrim.getDataTypeAttr().get()
            if (typeof dataType === 'string') rvSpec.dataType = dataType
            const sourceName = rvPrim.getSourceNameAttr().get()
            if (typeof sourceName === 'string') rvSpec.sourceName = sourceName
            const sourceType = rvPrim.getSourceTypeAttr().get()
            if (typeof sourceType === 'string') rvSpec.sourceType = sourceType
            // Store any other custom render var attributes in
            // namespacedSettings.
            _readNamespacedSettings(prim, namespaces, rvSpec.namespacedSettings)
            rvSpec.namespacedSettings = _sortedDictionary(rvSpec.namespacedSettings)

            // Record new render var.
            rpSpec.renderVarIndices.push(renderSpec.renderVars.length)
            renderSpec.renderVars.push(rvSpec)
          } else {
            _runtimeError(`Render product <${target}> includes ` +
              `render var at path <${renderVarPath}>, but ` +
              'no suitable UsdRenderVar prim ' +
              'was found.  Skipping.')
          }
        }
      }
      // Store any other custom render product attributes in
      // namespacedSettings.
      _readNamespacedSettings(rpPrim.prim, namespaces, rpSpec.namespacedSettings)
      rpSpec.namespacedSettings = _sortedDictionary(rpSpec.namespacedSettings)

      renderSpec.products.push(rpSpec)
    }
  }

  // Scene configuration
  renderSpec.materialBindingPurposes = _tokenArray(settings.getMaterialBindingPurposesAttr().get())
  renderSpec.includedPurposes = _tokenArray(settings.getIncludedPurposesAttr().get())

  // Store any other custom render settings attributes in namespacedSettings.
  _readNamespacedSettings(rsPrim, namespaces, renderSpec.namespacedSettings)
  renderSpec.namespacedSettings = _sortedDictionary(renderSpec.namespacedSettings)

  return renderSpec
}

/**
 * Returns a dictionary populated with attributes filtered by the
 * namespaces (spec.cpp:296-304).
 */
export function computeNamespacedSettings(prim: Prim, namespaces: readonly string[]): SpecDictionary {
  const dict: SpecDictionary = {}
  _readNamespacedSettings(prim, namespaces, dict)
  return _sortedDictionary(dict)
}

// VtArray<TfToken> as a token list.
function _tokenArray(value: unknown): string[] {
  if (value === undefined || value === null) return []
  const items = typeof (value as { toArray?: unknown }).toArray === 'function'
    ? (value as { toArray(): unknown[] }).toArray()
    : Array.isArray(value) ? value : []
  return items.map(String)
}
