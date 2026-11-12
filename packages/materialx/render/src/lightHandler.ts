// Ported from MaterialX 1.39.5: source/MaterialXRender/LightHandler.h,
//  source/MaterialXRender/LightHandler.cpp
// Copyright Contributors to the MaterialX Project. Apache License 2.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Mirrors source/MaterialXRender/LightHandler.h and LightHandler.cpp
//
// Handler for hardware lights

import { Document, LIGHT_SHADER_TYPE_STRING, Matrix44, Node } from '@mtlx/core'
import { HwShaderGenerator } from '@mtlx/genhw'
import { GenContext } from '@mtlx/genshader'
import type { Image } from './image.ts'

export const DEFAULT_ENV_SAMPLE_COUNT = 16

// A shared pointer to an image (the upstream ImagePtr alias), kept as an
// exported alias of Image so existing imports of ImagePtr from this module
// keep working.
export type ImagePtr = Image

// A map from light names to light indices.
export type LightIdMap = Map<string, number>

// @class LightHandler
// Utility light handler for creating and providing
// light data for shader binding.
export class LightHandler {
  protected _lightTransform: Matrix44 = Matrix44.IDENTITY
  protected _directLighting = true
  protected _indirectLighting = true
  protected _usePrefilteredMap = false

  protected _envRadianceMap: ImagePtr | null = null
  protected _envPrefilteredMap: ImagePtr | null = null
  protected _envIrradianceMap: ImagePtr | null = null
  protected _envLightIntensity = 1.0
  protected _envSampleCount: number = DEFAULT_ENV_SAMPLE_COUNT

  protected _refractionTwoSided = false

  protected _albedoTable: ImagePtr | null = null

  protected _lightSources: Node[] = []
  protected _lightIdMap: LightIdMap = new Map()

  // Create a new light handler
  static create(): LightHandler {
    return new LightHandler()
  }

  //
  // Global State
  //

  // Set the light transform.
  setLightTransform(mat: Matrix44): void {
    this._lightTransform = mat
  }

  // Return the light transform.
  getLightTransform(): Matrix44 {
    return this._lightTransform
  }

  // Set whether direct lighting is enabled.
  setDirectLighting(enable: boolean): void {
    this._directLighting = enable
  }

  // Return whether direct lighting is enabled.
  getDirectLighting(): boolean {
    return this._directLighting
  }

  // Set whether indirect lighting is enabled.
  setIndirectLighting(enable: boolean): void {
    this._indirectLighting = enable
  }

  // Return whether indirect lighting is enabled.
  getIndirectLighting(): boolean {
    return this._indirectLighting
  }

  //
  // Environment Lighting
  //

  // Set the environment radiance map
  setEnvRadianceMap(map: ImagePtr): void {
    this._envRadianceMap = map
  }

  // Return the environment radiance map
  getEnvRadianceMap(): ImagePtr | null {
    return this._envRadianceMap
  }

  // Set the environment radiance map for the prefiltered environment lighting model.
  setEnvPrefilteredMap(map: ImagePtr): void {
    this._envPrefilteredMap = map
  }

  // Return the environment radiance map for the prefiltered environment lighting model.
  getEnvPrefilteredMap(): ImagePtr | null {
    return this._envPrefilteredMap
  }

  // Set whether to use the prefiltered environment lighting model.
  setUsePrefilteredMap(val: boolean): void {
    this._usePrefilteredMap = val
  }

  // Return whether to use the prefiltered environment lighting model.
  getUsePrefilteredMap(): boolean {
    return this._usePrefilteredMap
  }

  // Set the environment irradiance map
  setEnvIrradianceMap(map: ImagePtr): void {
    this._envIrradianceMap = map
  }

  // Return the environment irradiance map
  getEnvIrradianceMap(): ImagePtr | null {
    return this._envIrradianceMap
  }

  // Set the environment lighting sample count.
  setEnvSampleCount(count: number): void {
    this._envSampleCount = count
  }

  // Return the environment lighting sample count.
  getEnvSampleCount(): number {
    return this._envSampleCount
  }

  // Set the environment light intensity.
  setEnvLightIntensity(intensity: number): void {
    this._envLightIntensity = intensity
  }

  // Return the environment light intensity.
  getEnvLightIntensity(): number {
    return this._envLightIntensity
  }

  // Set the two-sided refraction property.
  setRefractionTwoSided(enable: boolean): void {
    this._refractionTwoSided = enable
  }

  // Return the two-sided refraction property.
  getRefractionTwoSided(): boolean {
    return this._refractionTwoSided
  }

  //
  // Albedo Table
  //

  // Set the directional albedo table
  setAlbedoTable(table: ImagePtr): void {
    this._albedoTable = table
  }

  // Return the directional albedo table
  getAlbedoTable(): ImagePtr | null {
    return this._albedoTable
  }

  //
  // Light Sources
  //

  // Add a light source.
  addLightSource(node: Node): void {
    this._lightSources.push(node)
  }

  // Set the vector of light sources.
  setLightSources(lights: Node[]): void {
    this._lightSources = lights
  }

  // Return the vector of light sources.
  getLightSources(): Node[] {
    return this._lightSources
  }

  // Return the first light source, if any, of the given category.
  getFirstLightOfCategory(category: string): Node | null {
    for (const light of this._lightSources) {
      if (light.getCategory() === category) {
        return light
      }
    }
    return null
  }

  //
  // Light IDs
  //

  // Get a list of identifiers associated with a given light nodedef
  getLightIdMap(): LightIdMap {
    return this._lightIdMap
  }

  // From a set of nodes, create a mapping of corresponding
  // nodedef identifiers to numbers
  computeLightIdMap(nodes: Node[]): LightIdMap {
    const idMap: LightIdMap = new Map()
    let id = 1
    for (const node of nodes) {
      const nodedef = node.getNodeDef()
      if (nodedef) {
        const name = nodedef.getName()
        if (!idMap.has(name)) {
          idMap.set(name, id++)
        }
      }
    }
    return idMap
  }

  // Find lights to use based on an input document
  // @param doc Document to scan for lights
  // @param lights List of lights found in document
  findLights(doc: Document, lights: Node[]): void {
    lights.length = 0
    for (const node of doc.getNodes()) {
      if (node.getType() === LIGHT_SHADER_TYPE_STRING) {
        lights.push(node)
      }
    }
  }

  // Register light node definitions and light count with a given generation context
  // @param doc Document containing light nodes and definitions
  // @param lights Lights to register
  // @param context Context to update
  registerLights(doc: Document, lights: Node[], context: GenContext): void {
    // Clear context light user data which is set when bindLightShader()
    // is called. This is necessary in case the light types have already been
    // registered.
    HwShaderGenerator.unbindLightShaders(context)

    if (lights.length) {
      // Create a list of unique nodedefs and ids for them
      this._lightIdMap = this.computeLightIdMap(lights)
      for (const [name, id] of this._lightIdMap) {
        const nodeDef = doc.getNodeDef(name)
        if (nodeDef) {
          HwShaderGenerator.bindLightShader(nodeDef, id, context)
        }
      }
    }

    // Make sure max light count is large enough
    const lightCount = lights.length
    if (lightCount > context.getOptions().hwMaxActiveLightSources) {
      context.getOptions().hwMaxActiveLightSources = lightCount
    }
  }
}
