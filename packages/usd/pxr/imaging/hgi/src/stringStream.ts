// Ported from OpenUSD 26.11.1: pxr/imaging/hgi/shaderGenerator.h,
//  pxr/imaging/hgi/shaderSection.h
// Copyright 2020 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// A std::stringstream stand-in for the shader generators and shader sections,
// which write through `std::ostream &ss` upstream (shaderSection.h:48-68,
// shaderGenerator.h:49). `ss << a << b` is `ss.write(a, b)`.

export class HgiStringStream {
  private _parts: string[] = []

  /** operator<< for each argument in order. */
  write(...values: Array<string | number>): this {
    for (const v of values) this._parts.push(String(v))
    return this
  }

  /** std::stringstream::str() */
  str(): string {
    return this._parts.join('')
  }
}
