// Ported from OpenUSD 26.11.1: pxr/usd/sdf/crateInfo.cpp,
//  pxr/usd/sdf/crateInfo.h
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// SdfCrateInfo (crateInfo.h:20-78): introspects the underlying qualities of
// .usdc 'crate' files, for diagnostic purposes. Opening reads the asset, which
// is asynchronous here, so open returns a Promise.

import { Error as TfError, TfDiagnosticMgr, TfDiagnosticType, TF_CODING_ERROR } from 'typescript-usd/tf'
import { GetResolver as ArGetResolver, ResolvedPath as ArResolvedPath } from 'typescript-usd/ar'
import { crateSoftwareVersionToken, parseCrateLazy, type CrateStructure } from './crateFile.ts'

/** SdfCrateInfo::Section (crateInfo.h:28-35): a named file section, its
 *  location and size in the file. */
export class SdfCrateInfoSection {
  constructor(readonly name = '', readonly start = -1, readonly size = -1) {}
}

/** SdfCrateInfo::SummaryStats (crateInfo.h:37-44). */
export interface SdfCrateInfoSummaryStats {
  numSpecs: number
  numUniquePaths: number
  numUniqueTokens: number
  numUniqueStrings: number
  numUniqueFields: number
  numUniqueFieldSets: number
}

export class SdfCrateInfo {
  private constructor(
    private readonly _structure?: CrateStructure,
    private readonly _fileVersion?: readonly [number, number, number],
  ) {}

  /** SdfCrateInfo() (crateInfo.h:20-78): an info that refers to no file. */
  static create(): SdfCrateInfo {
    return new SdfCrateInfo()
  }

  /** SdfCrateInfo::Open (crateInfo.cpp:22-32): attempts to open and read
   *  `fileName`; an invalid info when it cannot be read as a crate file, with
   *  the reason posted. */
  static async open(fileName: string): Promise<SdfCrateInfo> {
    // CrateFile::Open reads the asset at the path as given (crateFile.cpp).
    const asset = await ArGetResolver().openAsset(new ArResolvedPath(fileName))
    if (!asset) return new SdfCrateInfo()
    try {
      const contents = parseCrateLazy(await asset.getBuffer(), fileName)
      return new SdfCrateInfo(contents.structure, contents.version)
    } catch (e) {
      TfDiagnosticMgr.GetInstance().postError(e instanceof TfError ? e
        : new TfError(e instanceof Error ? e.message : String(e), TfDiagnosticType.RuntimeError))
      return new SdfCrateInfo()
    }
  }

  /** Whether this object refers to a valid file (operator bool,
   *  crateInfo.h:72). */
  isValid(): boolean { return this._structure !== undefined }

  /** SdfCrateInfo::GetSummaryStats (crateInfo.cpp:34-50). */
  getSummaryStats(): SdfCrateInfoSummaryStats {
    const stats: SdfCrateInfoSummaryStats = {
      numSpecs: 0, numUniquePaths: 0, numUniqueTokens: 0, numUniqueStrings: 0, numUniqueFields: 0,
      numUniqueFieldSets: 0,
    }
    if (!this._structure) {
      TF_CODING_ERROR('Invalid SdfCrateInfo object')
      return stats
    }
    stats.numSpecs = this._structure.numSpecs
    stats.numUniquePaths = this._structure.numPaths
    stats.numUniqueTokens = this._structure.numTokens
    stats.numUniqueStrings = this._structure.numStrings
    stats.numUniqueFields = this._structure.numFields
    stats.numUniqueFieldSets = this._structure.numFieldSets
    return stats
  }

  /** SdfCrateInfo::GetSections (crateInfo.cpp:52-66). */
  getSections(): SdfCrateInfoSection[] {
    if (!this._structure) {
      TF_CODING_ERROR('Invalid SdfCrateInfo object')
      return []
    }
    return this._structure.sections.map(s => new SdfCrateInfoSection(s.name, s.start, s.size))
  }

  /** SdfCrateInfo::GetFileVersion (crateInfo.cpp:68-76): the file version,
   *  as 'major.minor.patch'. */
  getFileVersion(): string {
    if (!this._structure || !this._fileVersion) {
      TF_CODING_ERROR('Invalid SdfCrateInfo object')
      return ''
    }
    return this._fileVersion.join('.')
  }

  /** SdfCrateInfo::GetSoftwareVersion (crateInfo.cpp:78-82). */
  getSoftwareVersion(): string {
    return crateSoftwareVersionToken()
  }
}
