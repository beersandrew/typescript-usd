// Ported from OpenUSD 26.11.1: pxr/usd/sdf/allowed.cpp, pxr/usd/sdf/allowed.h
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// SdfAllowed (pxr/usd/sdf/allowed.h): whether an operation is allowed, with
// the reason when it is not.

export class SdfAllowed {
  private readonly _whyNot: string | undefined

  constructor(conditionOrWhyNot: boolean | string = true, whyNot = '') {
    this._whyNot = typeof conditionOrWhyNot === 'string' ? conditionOrWhyNot
      : conditionOrWhyNot ? undefined : whyNot
  }

  static allowed(): SdfAllowed { return new SdfAllowed(true) }

  isAllowed(): boolean { return this._whyNot === undefined }

  getWhyNot(): string { return this._whyNot ?? '' }
}
