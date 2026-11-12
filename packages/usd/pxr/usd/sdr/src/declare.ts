// Ported from OpenUSD 26.11.1: pxr/usd/sdr/declare.cpp, pxr/usd/sdr/declare.h
// Copyright 2018, 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of pxr/usd/sdr/declare.{h,cpp}: SdrVersion value semantics.
export class SdrVersion {
  readonly major: number
  readonly minor: number
  readonly isDefault: boolean

  constructor(major: number | string = 0, minor = 0, isDefault = false) {
    const parsed: [number, number] = typeof major === 'string' ? parseVersion(major) : [major, minor]
    const [parsedMajor, parsedMinor] = parsed
    const valid = parsedMajor >= 0 && parsedMinor >= 0 && (parsedMajor !== 0 || parsedMinor !== 0)
    this.major = valid ? parsedMajor : 0
    this.minor = valid ? parsedMinor : 0
    this.isDefault = isDefault
  }

  getAsDefault(): SdrVersion { return new SdrVersion(this.major, this.minor, true) }
  isValid(): boolean { return this.major !== 0 || this.minor !== 0 }
  equals(other: SdrVersion): boolean { return this.compare(other) === 0 }
  compare(other: SdrVersion): number {
    return this.major === other.major ? this.minor - other.minor : this.major - other.major
  }
  getString(): string { return this.isValid() ? `${this.major}${this.minor ? `.${this.minor}` : ''}` : '<invalid version>' }
  getStringSuffix(): string { return this.isDefault ? '' : this.isValid() ? `_${this.getString()}` : '' }
  toString(): string { return this.getString() }
}

function parseVersion(value: string): [number, number] {
  const match = /^(\d+)(?:\.(\d+))?$/.exec(value)
  return match ? [Number(match[1]), Number(match[2] ?? 0)] : [0, 0]
}

// Version semantics follow declare.cpp:59-103.
export type SdrVersionFilter = 'defaultOnly' | 'allVersions'
