// Ported from OpenUSD 26.11.1: pxr/imaging/glf/simpleMaterial.cpp,
//  pxr/imaging/glf/simpleMaterial.h
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/imaging/glf/simpleMaterial.{h,cpp} (OpenUSD 26.11.1).
// operator==/!= are Equals.

import { Vec4f as GfVec4f } from 'typescript-usd/gf'

/** simpleMaterial.h:19-62 */
export class GlfSimpleMaterial {
  private _ambient = new GfVec4f(0.2, 0.2, 0.2, 1)
  private _diffuse = new GfVec4f(0.8, 0.8, 0.8, 1)
  private _specular = new GfVec4f(0.5, 0.5, 0.5, 1)
  private _emission = new GfVec4f(0, 0, 0, 1)
  private _shininess = 32.0

  getAmbient(): GfVec4f { return this._ambient }
  setAmbient(ambient: GfVec4f): void { this._ambient = ambient }

  getDiffuse(): GfVec4f { return this._diffuse }
  setDiffuse(diffuse: GfVec4f): void { this._diffuse = diffuse }

  getSpecular(): GfVec4f { return this._specular }
  setSpecular(specular: GfVec4f): void { this._specular = specular }

  getEmission(): GfVec4f { return this._emission }
  setEmission(emission: GfVec4f): void { this._emission = emission }

  /** A double (simpleMaterial.h:44-47). */
  getShininess(): number { return this._shininess }
  setShininess(shininess: number): void { this._shininess = shininess }

  /** simpleMaterial.cpp:90-98 */
  Equals(other: GlfSimpleMaterial): boolean {
    return this._ambient.equals(other._ambient)
      && this._diffuse.equals(other._diffuse)
      && this._specular.equals(other._specular)
      && this._emission.equals(other._emission)
      && this._shininess === other._shininess
  }

  /** A copy (the C++ class is a value type). */
  Clone(): GlfSimpleMaterial {
    const m = new GlfSimpleMaterial()
    m._ambient = this._ambient
    m._diffuse = this._diffuse
    m._specular = this._specular
    m._emission = this._emission
    m._shininess = this._shininess
    return m
  }
}
