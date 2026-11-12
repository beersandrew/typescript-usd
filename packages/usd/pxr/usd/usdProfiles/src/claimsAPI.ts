// Ported from OpenUSD 26.11.1: pxr/usd/usdProfiles/claimsAPI.cpp,
//  pxr/usd/usdProfiles/claimsAPI.h
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// OpenUSD v26.11.1 pxr/usd/usdProfiles/claimsAPI.{h,cpp}.
//
// All data lives in the prim's customData dictionary under profilesInfo
// (claimsAPI.cpp:130-139):
//   profilesInfo:capabilityUsages      capability -> "hard" | "soft" | "enhancement" (token)
//   profilesInfo:profileCompatibility  profile -> token[] of excepted capabilities

import { APISchemaBase, SchemaRegistry, type Prim, type Stage } from 'typescript-usd/usd'
import { _sdfFileFormatType, _sdfGetDictionaryValueTypes } from 'typescript-usd/sdf/_internal'
import { Array as VtArray, ValueTypes as VtValueTypes } from 'typescript-usd/vt'
import { QueryStatus, UsdProfileRegistry, type CapabilityResult, type QueryStatus as QueryStatusType } from './profileRegistry.ts'
import { UsdProfilesTokens } from './tokens.ts'

const customData = 'customData'
const profilesInfoKey = 'profilesInfo'
const capabilityUsagesKey = 'profilesInfo:capabilityUsages'
const profileCompatibilityKey = 'profilesInfo:profileCompatibility'

const isDictionary = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value) &&
  Object.getPrototypeOf(value) === Object.prototype

const isTokenArray = (value: unknown): value is VtArray<string> =>
  value instanceof VtArray && value.getElementType() === VtValueTypes.token

export class UsdProfilesClaimsAPI extends APISchemaBase {
  static override readonly typeName: string = 'ClaimsAPI'

  constructor(prim?: Prim, stage?: Stage) {
    super(prim, (stage ?? prim?.getStage()) as Stage)
  }

  override isValid(): boolean {
    return super.isValid() && this.prim.hasAPI(UsdProfilesTokens.ClaimsAPI)
  }

  getPrim(): Prim { return this.prim }

  // UsdPrim's operator bool: the prim is valid, whatever its schemas.
  #hasPrim(): boolean { return this.prim !== undefined && this.prim.isValid() }

  /** The ClaimsAPI of the prim at `path`; invalid when there is none
   *  (claimsAPI.cpp:31-40). */
  static Get(stage: Stage, path: string): UsdProfilesClaimsAPI {
    return new UsdProfilesClaimsAPI(stage.getPrim(path), stage)
  }

  /** ClaimsAPI has no properties (schema.usda; claimsAPI.cpp:90-104). */
  static override getSchemaAttributeNames(_includeInherited = true): string[] { return [] }
  static GetSchemaAttributeNames(includeInherited = true): string[] {
    return this.getSchemaAttributeNames(includeInherited)
  }

  static canApply(prim: Prim): boolean {
    return prim.canApplyAPI(UsdProfilesTokens.ClaimsAPI)
  }

  static Apply(prim: Prim): UsdProfilesClaimsAPI {
    return prim.applyAPI(UsdProfilesTokens.ClaimsAPI)
      ? new UsdProfilesClaimsAPI(prim) : new UsdProfilesClaimsAPI(undefined, prim.getStage())
  }

  // _GetProfilesInfoByKey (claimsAPI.cpp:154-168) reads the composed value
  // at the key path; the caller checks its held type.
  #get(keyPath: string): unknown {
    return this.prim.getMetadataByDictKey(customData, keyPath)
  }

  #set(keyPath: string, value: unknown, valueType?: string): void {
    this.prim.getStage()._setPrimMetadataByDictKey(this.prim.path, customData, keyPath, value, valueType)
  }

  /** The composed profilesInfo dictionary, empty when unauthored. */
  getProfilesInfo(): Record<string, unknown> {
    const info = this.#get(profilesInfoKey)
    return isDictionary(info) ? info : {}
  }

  /** Replaces profilesInfo on the current edit target. */
  setProfilesInfo(info: Record<string, unknown>): void {
    this.prim.setMetadataByDictKey(customData, profilesInfoKey, info)
  }

  /** Capability -> degradation class, empty when unauthored. */
  getCapabilityUsages(): Record<string, unknown> {
    const usages = this.#get(capabilityUsagesKey)
    return isDictionary(usages) ? usages : {}
  }

  setCapabilityUsages(usages: Record<string, unknown>): void {
    this.prim.setMetadataByDictKey(customData, capabilityUsagesKey, usages)
  }

  /** Authors `capability`'s degradation class as a token (claimsAPI.cpp:215-223). */
  setCapabilityUsage(capability: string, degradationClass: string): void {
    this.#set(`${capabilityUsagesKey}:${capability}`, degradationClass, 'token')
  }

  /**
   * The degradation class recorded for `capability`, or '' (claimsAPI.cpp:
   * 225-233). Upstream reads only a TfToken-held value: an entry the layer
   * declares with another type, such as `string`, reads as ''.
   */
  getCapabilityUsage(capability: string): string {
    const usages = this.#get(capabilityUsagesKey)
    if (!isDictionary(usages)) return ''
    const value = usages[capability]
    const declared = _sdfGetDictionaryValueTypes(usages)?.get(capability)
    return typeof value === 'string' && (declared === undefined || declared === 'token') ? value : ''
  }

  /** Every profile with a compatibility entry, with or without exceptions. */
  getCompatibleProfiles(): string[] {
    const compat = this.#get(profileCompatibilityKey)
    return isDictionary(compat) ? Object.keys(compat) : []
  }

  /** Declares the prim fully compatible with `profile`: an empty token[]. */
  setProfileCompatible(profile: string): void {
    this.#set(`${profileCompatibilityKey}:${profile}`, new VtArray<string>([], VtValueTypes.token))
  }

  /** Declares compatibility with `profile` except for `exceptions`. */
  setProfileCompatibleWithExceptions(profile: string, exceptions: Iterable<string>): void {
    this.#set(`${profileCompatibilityKey}:${profile}`, new VtArray<string>([...exceptions], VtValueTypes.token))
  }

  /** The exception set for `profile`; empty when undeclared or not a token[]
   *  (claimsAPI.cpp:274-281). */
  getProfileExceptions(profile: string): string[] {
    const value = this.#get(`${profileCompatibilityKey}:${profile}`)
    return isTokenArray(value) ? value.toArray() : []
  }

  /** Removes `profile`'s compatibility entry (claimsAPI.cpp:283-289). */
  clearProfileCompatibility(profile: string): void {
    this.prim.clearMetadataByDictKey(customData, `${profileCompatibilityKey}:${profile}`)
  }

  /**
   * The authored capability usages, plus every capability implied by an
   * applied API schema on this prim or a descendant, or by the file format of
   * a used, non-anonymous layer, at "hard" (claimsAPI.cpp:351-375).
   */
  computeCapabilityUsages(): Record<string, unknown> {
    if (!this.#hasPrim()) return {}
    const merged = { ...this.getCapabilityUsages() }
    for (const cap of gatherImpliedCapabilities(this.prim)) {
      if (!(cap in merged)) merged[cap] = UsdProfilesTokens.hard
    }
    return merged
  }

  /** ComputeCapabilityUsages, written back to capabilityUsages. */
  populateCapabilityUsages(): Record<string, unknown> {
    if (!this.#hasPrim()) return {}
    const merged = this.computeCapabilityUsages()
    this.setCapabilityUsages(merged)
    return merged
  }

  /**
   * How well this prim satisfies `profile`: CoversCapabilities from
   * `profile` over the recorded usages, excepting the profile's stored
   * exceptions. NoPath when the profile is undeclared or no usages are
   * recorded (claimsAPI.cpp:390-419).
   */
  isCompatibleWith(profile: string, results?: CapabilityResult[]): QueryStatusType {
    const compat = this.#get(profileCompatibilityKey)
    if (!isDictionary(compat) || !(profile in compat)) return QueryStatus.NoPath
    const required = Object.keys(this.getCapabilityUsages())
    if (required.length === 0) return QueryStatus.NoPath
    return UsdProfileRegistry.coversCapabilities(profile, required, this.getProfileExceptions(profile), results)
  }
}

// _GatherImpliedCapabilities (claimsAPI.cpp:298-349).
function gatherImpliedCapabilities(rootPrim: Prim): Set<string> {
  const implied = new Set<string>()
  for (const prim of [rootPrim, ...rootPrim.getDescendants()]) {
    for (const schemaToken of prim.getAppliedSchemas()) {
      // The instance suffix of a multiple-apply schema is dropped.
      const [typeName] = SchemaRegistry.getTypeNameAndInstance(schemaToken)
      const schemaType = SchemaRegistry.getTypeFromName(typeName)
      if (schemaType.isUnknown()) continue
      for (const cap of UsdProfileRegistry.getSchemaImpliedCapabilities(schemaType)) implied.add(cap)
    }
  }
  const seenFormatTypes = new Set<unknown>()
  // Value-clip layers are skipped.
  for (const layer of rootPrim.getStage().getUsedLayers(false)) {
    if (layer.isAnonymous()) continue
    const format = layer.getFileFormat()
    if (!format) continue
    const formatType = _sdfFileFormatType(format)
    if (formatType.isUnknown() || seenFormatTypes.has(formatType)) continue
    seenFormatTypes.add(formatType)
    for (const cap of UsdProfileRegistry.getFileFormatImpliedCapabilities(formatType)) implied.add(cap)
  }
  return implied
}
