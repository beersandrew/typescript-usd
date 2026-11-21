// Ported from OpenUSD 26.11.1: pxr/usd/usdUtils/fixBrokenPixarSchemas.py
// Copyright 2022 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// The Python-only FixBrokenPixarSchemas of UsdUtils
// (fixBrokenPixarSchemas.py:8-264): fixups for layers authored against older
// versions of Pixar's schemas.
//
// FixupSkelBindingAPI reads the SkelBindingAPI definition from the schema
// registry, which has it once usdSkel's plugin is registered (importing
// typescript-usd/usdSkel); the Python module imports UsdSkel for it
// (fixBrokenPixarSchemas.py:146), which usdUtils' library graph keeps out of
// this library's imports.
//
// Python's spec.GetInfo("apiSchemas") is the field's token list op, or an
// empty one when unauthored; here it is read with SdfListOp.fromValue and
// written back with its stored value. FixupUpAxis opens a stage, which is
// asynchronous here, so it returns a Promise.

import { SdfPath } from 'typescript-usd/sdf/path'
import {
  type Layer as SdfLayer, ListOp as SdfListOp, type PrimSpec as SdfPrimSpec,
  type RelationshipSpec as SdfRelationshipSpec,
  sdfChangeBlock, sdfCopySpec, sdfCreateRelationshipInLayer,
} from 'typescript-usd/sdf'
import { SchemaRegistry as UsdSchemaRegistry, Stage as UsdStage } from 'typescript-usd/usd'
import { UPAXIS_DEFAULT } from 'typescript-usd/usdGeom'

// primSpec.GetInfo("apiSchemas").
function getApiSchemas(primSpec: SdfPrimSpec): SdfListOp<string> {
  return SdfListOp.fromValue<string>(primSpec.hasInfo('apiSchemas') ? primSpec.getInfo('apiSchemas') : undefined)
}

// primSpec.SetInfo("apiSchemas", listOp).
function setApiSchemas(primSpec: SdfPrimSpec, listOp: SdfListOp<string>): void {
  primSpec.setInfo('apiSchemas', listOp.toValue())
}

/**
 * FixBrokenPixarSchemas (fixBrokenPixarSchemas.py:8-264): takes a layer, and
 * clients apply the fixes defined as its methods, e.g.
 * fixupMaterialBindingAPI. Every fixup iterates on each prim in the layer and
 * applies specific fixes.
 */
export class UsdUtilsFixBrokenPixarSchemas {
  private readonly _usdLayer: SdfLayer
  private _skelBindingAPIProps: string[] | undefined
  // Keeps track if the layer was updated by any of the fixer methods.
  private _layerUpdated = false

  // __init__ (fixBrokenPixarSchemas.py:16-20).
  constructor(usdLayer: SdfLayer) {
    this._usdLayer = usdLayer
  }

  // _ApplyAPI (fixBrokenPixarSchemas.py:22-31).
  private _applyAPI(listOp: SdfListOp<string>, apiSchema: string): SdfListOp<string> {
    if (listOp.isExplicit()) {
      const items = listOp.getExplicitItems()
      items.push(apiSchema)
      listOp.setExplicitItems(items)
    } else {
      const items = listOp.getPrependedItems()
      items.push(apiSchema)
      listOp.setPrependedItems(items)
    }
    return listOp
  }

  /** IsLayerUpdated (fixBrokenPixarSchemas.py:33-40): whether any fixer
   *  method applied fixes to the layer. */
  isLayerUpdated(): boolean {
    return this._layerUpdated
  }

  // The prim spec at `path` when it is a prim path, as each Traverse
  // callback begins.
  private _primSpecAt(path: string): SdfPrimSpec | undefined {
    if (!SdfPath.fromString(path).isPrimPath()) return undefined
    return this._usdLayer.getPrimAtPath(path)
  }

  /** FixupCoordSysAPI (fixBrokenPixarSchemas.py:42-106): makes sure the
   *  CoordSysAPI multiple-apply schema is applied and the instanced binding
   *  relationship is used, instead of the old non-applied
   *  "coordSys:name" binding. */
  fixupCoordSysAPI(): void {
    const primSpecProvidesCoordSysAPI = (path: string): void => {
      const primSpec = this._primSpecAt(path)
      if (!primSpec) return
      let apiSchemas = getApiSchemas(primSpec)
      // Collect all relationships which use the old UsdShadeCoordSysAPI
      // encoding.
      const relationshipToUpdate: SdfRelationshipSpec[] = []
      const missingApiSchema: string[] = []
      for (const rel of primSpec.getRelationships()) {
        const relName = rel.getName()
        const colons = relName.split(':').length - 1
        // Is the relationship an old style coordSys binding?
        if (relName.startsWith('coordSys:') && (!relName.endsWith(':binding') || colons === 1)) {
          relationshipToUpdate.push(rel)
        }
        // Since there was no prior codepath that could have left us in a
        // state where a "coordSys:<name>:binding" was added but no
        // UsdShadeCoordSysAPI is applied with the "<name>", the following
        // finds and fixes a missing application of UsdShadeCoordSysAPI when
        // the new encoding relationship is present on the spec.
        if (relName.startsWith('coordSys:') && relName.endsWith(':binding') && colons > 1) {
          const instanceName = relName.split('coordSys:').at(-1)!.split(':binding')[0]!
          const coordSysAPIName = `CoordSysAPI:${instanceName}`
          if (!apiSchemas.hasItem(coordSysAPIName)) missingApiSchema.push(coordSysAPIName)
        }
      }

      if (relationshipToUpdate.length === 0 && missingApiSchema.length === 0) return

      // Will definitely be doing some updating!
      this._layerUpdated = true

      // Though it shouldn't matter for our fixup usage, better to follow
      // best practice and make ALL changes in a change block.
      sdfChangeBlock(() => {
        for (const rel of relationshipToUpdate) {
          const instanceName = rel.getName().split('coordSys:').at(-1)!
          // Apply API.
          const coordSysAPIName = `CoordSysAPI:${instanceName}`
          apiSchemas = this._applyAPI(apiSchemas, coordSysAPIName)
          // New rel.
          const newRelPath = rel.getPath().replaceName(`${rel.getName()}:binding`)
          // CopySpec.
          sdfCopySpec(this._usdLayer, rel.getPath(), this._usdLayer, newRelPath)
          // Remove old rel.
          primSpec.removeProperty(rel)
        }
        // Apply any missing UsdShadeCoordSysAPI api schema.
        for (const missingAPI of missingApiSchema) apiSchemas = this._applyAPI(apiSchemas, missingAPI)

        setApiSchemas(primSpec, apiSchemas)
      })
    }

    this._usdLayer.traverse('/', primSpecProvidesCoordSysAPI)
  }

  /** FixupMaterialBindingAPI (fixBrokenPixarSchemas.py:109-130): makes sure
   *  MaterialBindingAPI is applied on a prim that defines a material:binding
   *  property spec. Marks the layer updated if fixes are applied. */
  fixupMaterialBindingAPI(): void {
    const primSpecProvidesMaterialBinding = (path: string): void => {
      const primSpec = this._primSpecAt(path)
      if (!primSpec) return
      const hasMaterialBindingRel =
        primSpec.getProperties().values().some(prop => prop.getName().startsWith('material:binding'))
      const apiSchemas = getApiSchemas(primSpec)
      const hasMaterialBindingAPI = apiSchemas.getAppliedItems().includes('MaterialBindingAPI')
      if (hasMaterialBindingRel && !hasMaterialBindingAPI) {
        this._layerUpdated = true
        const newApiSchemas = this._applyAPI(apiSchemas, 'MaterialBindingAPI')
        setApiSchemas(primSpec, newApiSchemas)
      }
    }

    this._usdLayer.traverse('/', primSpecProvidesMaterialBinding)
  }

  /** FixupSkelBindingAPI (fixBrokenPixarSchemas.py:133-164): makes sure
   *  SkelBindingAPI is applied on a prim that defines the UsdSkel properties
   *  SkelBindingAPI imparts. Marks the layer as updated if fixes are
   *  applied. */
  fixupSkelBindingAPI(): void {
    const primSpecProvidesSkelBindingProperties = (path: string): void => {
      if (!SdfPath.fromString(path).isPrimPath()) return

      // Get the SkelBindingAPI properties if not already populated.
      if (!this._skelBindingAPIProps || this._skelBindingAPIProps.length === 0) {
        const usdSchemaRegistry = UsdSchemaRegistry.getInstance()
        const primDef = usdSchemaRegistry.buildComposedPrimDefinition('', ['SkelBindingAPI'])
        this._skelBindingAPIProps = primDef.getPropertyNames()
      }

      const primSpec = this._usdLayer.getPrimAtPath(path)
      if (!primSpec) return
      const primSpecProps = primSpec.getProperties().values().map(prop => prop.getName())
      const apiSchemas = getApiSchemas(primSpec)
      const hasSkelBindingAPI = apiSchemas.getAppliedItems().includes('SkelBindingAPI')
      for (const skelProperty of this._skelBindingAPIProps) {
        if (primSpecProps.includes(skelProperty) && !hasSkelBindingAPI) {
          this._layerUpdated = true
          const newApiSchemas = this._applyAPI(apiSchemas, 'SkelBindingAPI')
          setApiSchemas(primSpec, newApiSchemas)
          return
        }
      }
    }

    this._usdLayer.traverse('/', primSpecProvidesSkelBindingProperties)
  }

  /** FixupUpAxis (fixBrokenPixarSchemas.py:167-178): makes sure the layer
   *  specifies upAxis metadata, set to UsdGeom's fallback when it does not.
   *  Marks the layer as updated if fixes are applied. */
  async fixupUpAxis(): Promise<void> {
    const usdStage = await UsdStage.open(this._usdLayer)
    if (!usdStage) return
    if (!usdStage.getPrim('/')!.hasAuthoredMetadata('upAxis')) {
      this._layerUpdated = true
      // UsdGeom.GetFallbackUpAxis() (usdGeom/metrics.ts UPAXIS_DEFAULT).
      usdStage.setMetadata('upAxis', UPAXIS_DEFAULT)
    }
  }

  /** FixupRenderSettingsTerminalsAPI (fixBrokenPixarSchemas.py:181-220):
   *  makes sure that RenderSettings terminals targeting display filters,
   *  integrators and sample filters are relationships instead of output
   *  connections. Marks the layer as updated if fixes are applied. */
  fixupRenderSettingsTerminalsAPI(): void {
    const replaceAttrs = ['outputs:ri:displayFilters', 'outputs:ri:sampleFilters', 'outputs:ri:integrator']

    const renderSettingsTerminalAPIUsesRelationships = (path: string): void => {
      const primSpec = this._primSpecAt(path)
      if (!primSpec) return
      if (primSpec.getTypeName() !== 'RenderSettings') return

      const registry = UsdSchemaRegistry.getInstance()
      const primDef = registry.findConcretePrimDefinition(primSpec.getTypeName())
      if (!primDef?.getAppliedAPISchemas().includes('PxrRenderTerminalsAPI')) return

      for (const attr of primSpec.getAttributes().values()) {
        const attrName = attr.getName()
        if (!replaceAttrs.includes(attrName)) continue
        const conns = attr.getConnectionPathList().getAppliedItems()
        if (conns.length === 0) continue
        this._layerUpdated = true
        const relName = attrName.replace('outputs:', '')
        const relPath = primSpec.getPath().appendProperty(relName)
        const rel = sdfCreateRelationshipInLayer(this._usdLayer, relPath, 'uniform', attr.isCustom())!
        rel.getTargetPathList().clearEditsAndMakeExplicit()
        const primPaths = conns.map(p => SdfPath.fromString(p).getPrimPath().toString())
        rel.getTargetPathList().getExplicitItems().assign(primPaths)
        primSpec.removeProperty(attr)
      }
    }

    this._usdLayer.traverse('/', renderSettingsTerminalAPIUsesRelationships)
  }

  /** FixupCameraProjectionAPI (fixBrokenPixarSchemas.py:223-264): makes sure
   *  that PxrCameraProjectionAPI supplies a relationship for ri:projection,
   *  to be used with a projection plugin target, instead of an output
   *  connection. Marks the layer as updated if fixes are applied. */
  fixupCameraProjectionAPI(): void {
    const replaceAttr = 'outputs:ri:projection'

    const cameraProjectionAPIUsesRelationship = (path: string): void => {
      const primSpec = this._primSpecAt(path)
      if (!primSpec) return
      // Since PxrCameraProjectionAPI is only applied to Camera prims, early
      // out if not a Camera prim.
      if (primSpec.getTypeName() !== 'Camera') return

      const registry = UsdSchemaRegistry.getInstance()
      const primDef = registry.findConcretePrimDefinition(primSpec.getTypeName())
      if (!primDef?.getAppliedAPISchemas().includes('PxrCameraProjectionAPI')) return

      const attr = primSpec.getAttributes().values().find(a => a.getName() === replaceAttr)
      if (!attr) return

      const conns = attr.getConnectionPathList().getAppliedItems()
      if (conns.length === 0) return

      this._layerUpdated = true
      const relName = replaceAttr.replace('outputs:', '')
      const relPath = primSpec.getPath().appendProperty(relName)
      const rel = sdfCreateRelationshipInLayer(this._usdLayer, relPath, 'uniform', attr.isCustom())!
      rel.getTargetPathList().clearEditsAndMakeExplicit()
      const primPaths = conns.map(p => SdfPath.fromString(p).getPrimPath().toString())
      rel.getTargetPathList().getExplicitItems().assign(primPaths)
      primSpec.removeProperty(attr)
    }

    this._usdLayer.traverse('/', cameraProjectionAPIUsesRelationship)
  }
}
