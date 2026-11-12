// Ported from MaterialX 1.39.5: source/MaterialXCore/Types.h,
//  source/MaterialXCore/Types.cpp
// Copyright Contributors to the MaterialX Project. Apache License 2.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Mirrors source/MaterialXCore/Types.h and Types.cpp
//
// Indexing uses getItem/setItem (matching the JsMaterialX binding surface)
// since TypeScript cannot overload operator[].

import { Exception } from './exceptions.ts'

export const DEFAULT_TYPE_STRING = 'color3'
export const FILENAME_TYPE_STRING = 'filename'
export const GEOMNAME_TYPE_STRING = 'geomname'
export const STRING_TYPE_STRING = 'string'
export const BSDF_TYPE_STRING = 'BSDF'
export const EDF_TYPE_STRING = 'EDF'
export const VDF_TYPE_STRING = 'VDF'
export const SURFACE_SHADER_TYPE_STRING = 'surfaceshader'
export const DISPLACEMENT_SHADER_TYPE_STRING = 'displacementshader'
export const VOLUME_SHADER_TYPE_STRING = 'volumeshader'
export const LIGHT_SHADER_TYPE_STRING = 'lightshader'
export const MATERIAL_TYPE_STRING = 'material'
export const SURFACE_MATERIAL_NODE_STRING = 'surfacematerial'
export const VOLUME_MATERIAL_NODE_STRING = 'volumematerial'
export const MULTI_OUTPUT_TYPE_STRING = 'multioutput'
export const NONE_TYPE_STRING = 'none'
export const VALUE_STRING_TRUE = 'true'
export const VALUE_STRING_FALSE = 'false'

// The base class for vectors of scalar values. Inherited by Vector2,
// Vector3, Vector4, Color3, and Color4.
export abstract class VectorBase {
  protected _arr: number[]

  constructor(size: number, values: readonly number[]) {
    if (values.length === 0) {
      this._arr = new Array<number>(size).fill(0)
    } else if (values.length === 1) {
      // Mirrors the C++ scalar-fill constructor VectorN(S s).
      this._arr = new Array<number>(size).fill(values[0]!)
    } else if (values.length === size) {
      this._arr = [...values]
    } else {
      throw new Exception(`Expected 0, 1, or ${size} values, received ${values.length}`)
    }
  }

  protected create(arr: number[]): this {
    const v = Object.create(Object.getPrototypeOf(this)) as this
    ;(v as VectorBase)._arr = arr
    return v
  }

  // Return the scalar value at the given index.
  getItem(i: number): number {
    const v = this._arr[i]
    if (v === undefined) throw new Exception(`Index ${i} out of range`)
    return v
  }

  // Set the scalar value at the given index.
  setItem(i: number, value: number): void {
    if (i < 0 || i >= this._arr.length) throw new Exception(`Index ${i} out of range`)
    this._arr[i] = value
  }

  // Return true if the given vector is identical to this one.
  equals(rhs: this): boolean {
    return this._arr.every((v, i) => v === rhs._arr[i])
  }

  // Return true if the given vector differs from this one.
  notEquals(rhs: this): boolean {
    return !this.equals(rhs)
  }

  // Compare two vectors lexicographically.
  lessThan(rhs: this): boolean {
    for (let i = 0; i < this._arr.length; i++) {
      if (this._arr[i]! !== rhs._arr[i]!) return this._arr[i]! < rhs._arr[i]!
    }
    return false
  }

  // Component-wise addition of two vectors.
  add(rhs: this): this {
    return this.create(this._arr.map((v, i) => v + rhs._arr[i]!))
  }

  // Component-wise subtraction of two vectors.
  sub(rhs: this): this {
    return this.create(this._arr.map((v, i) => v - rhs._arr[i]!))
  }

  // Component-wise multiplication of two vectors, or of a vector by a scalar.
  multiply(rhs: this | number): this {
    if (typeof rhs === 'number') return this.create(this._arr.map((v) => v * rhs))
    return this.create(this._arr.map((v, i) => v * rhs._arr[i]!))
  }

  // Component-wise division of two vectors, or of a vector by a scalar.
  divide(rhs: this | number): this {
    if (typeof rhs === 'number') return this.create(this._arr.map((v) => v / rhs))
    return this.create(this._arr.map((v, i) => v / rhs._arr[i]!))
  }

  // Unary negation of a vector.
  negate(): this {
    return this.create(this._arr.map((v) => -v))
  }

  // Return the magnitude of the vector.
  getMagnitude(): number {
    return Math.sqrt(this._arr.reduce((acc, v) => acc + v * v, 0))
  }

  // Return a normalized vector.
  getNormalized(): this {
    return this.divide(this.getMagnitude())
  }

  // Return the dot product of two vectors.
  dot(rhs: this): number {
    return this._arr.reduce((acc, v, i) => acc + v * rhs._arr[i]!, 0)
  }

  // Return a copy of this vector.
  copy(): this {
    return this.create([...this._arr])
  }

  // Return the underlying data array.
  data(): number[] {
    return this._arr
  }

  // Return the number of scalar elements for the vector.
  numElements(): number {
    return this._arr.length
  }
}

// A vector of two floating-point values.
export class Vector2 extends VectorBase {
  constructor(...values: number[]) {
    super(2, values)
  }

  // Return the cross product of two vectors.
  cross(rhs: Vector2): number {
    return this._arr[0]! * rhs.getItem(1) - this._arr[1]! * rhs.getItem(0)
  }
}

// A vector of three floating-point values.
export class Vector3 extends VectorBase {
  constructor(...values: number[]) {
    super(3, values)
  }

  // Return the cross product of two vectors.
  cross(rhs: Vector3): Vector3 {
    return new Vector3(
      this._arr[1]! * rhs.getItem(2) - this._arr[2]! * rhs.getItem(1),
      this._arr[2]! * rhs.getItem(0) - this._arr[0]! * rhs.getItem(2),
      this._arr[0]! * rhs.getItem(1) - this._arr[1]! * rhs.getItem(0),
    )
  }
}

// A vector of four floating-point values.
export class Vector4 extends VectorBase {
  constructor(...values: number[]) {
    super(4, values)
  }
}

// A three-component color value.
export class Color3 extends VectorBase {
  constructor(...values: number[]) {
    super(3, values)
  }

  // Transform the given color from linear RGB to the sRGB encoding.
  linearToSrgb(): Color3 {
    return this.create(
      this._arr.map((v) => (v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055)),
    )
  }

  // Transform the given color from the sRGB encoding to linear RGB.
  srgbToLinear(): Color3 {
    return this.create(
      this._arr.map((v) => (v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4))),
    )
  }
}

// A four-component color value.
export class Color4 extends VectorBase {
  constructor(...values: number[]) {
    super(4, values)
  }
}

// The class for square matrices of scalar values. Inherited by Matrix33 and
// Matrix44. Elements are stored in row-major order and accessed as
// getItem(row, column).
export abstract class MatrixBase {
  protected _arr: number[]
  protected readonly _n: number

  constructor(n: number, values: readonly number[]) {
    this._n = n
    if (values.length === 0) {
      this._arr = new Array<number>(n * n).fill(0)
    } else if (values.length === 1) {
      // Mirrors the C++ scalar-fill constructor MatrixN(S s).
      this._arr = new Array<number>(n * n).fill(values[0]!)
    } else if (values.length === n * n) {
      this._arr = [...values]
    } else {
      throw new Exception(`Expected 0, 1, or ${n * n} values, received ${values.length}`)
    }
  }

  protected create(arr: number[]): this {
    const m = Object.create(Object.getPrototypeOf(this)) as this
    ;(m as MatrixBase)._arr = arr
    ;(m as unknown as { _n: number })._n = this._n
    return m
  }

  // Return the scalar value at the given row and column.
  getItem(row: number, col: number): number {
    const v = this._arr[row * this._n + col]
    if (v === undefined || row < 0 || row >= this._n || col < 0 || col >= this._n) {
      throw new Exception(`Index (${row}, ${col}) out of range`)
    }
    return v
  }

  // Set the scalar value at the given row and column.
  setItem(row: number, col: number, value: number): void {
    if (row < 0 || row >= this._n || col < 0 || col >= this._n) {
      throw new Exception(`Index (${row}, ${col}) out of range`)
    }
    this._arr[row * this._n + col] = value
  }

  // Return true if the given matrix is identical to this one.
  equals(rhs: this): boolean {
    return this._arr.every((v, i) => v === rhs._arr[i])
  }

  // Return true if the given matrix differs from this one.
  notEquals(rhs: this): boolean {
    return !this.equals(rhs)
  }

  // Return true if the given matrix is equivalent to this one within a given
  // floating-point tolerance.
  isEquivalent(rhs: this, tolerance: number): boolean {
    return this._arr.every((v, i) => Math.abs(v - rhs._arr[i]!) <= tolerance)
  }

  // Component-wise addition of two matrices.
  add(rhs: this): this {
    return this.create(this._arr.map((v, i) => v + rhs._arr[i]!))
  }

  // Component-wise subtraction of two matrices.
  sub(rhs: this): this {
    return this.create(this._arr.map((v, i) => v - rhs._arr[i]!))
  }

  // Unary negation of a matrix.
  negate(): this {
    return this.create(this._arr.map((v) => -v))
  }

  // Compute the matrix product, or multiply component-wise by a scalar.
  multiply(rhs: this | number): this {
    if (typeof rhs === 'number') return this.create(this._arr.map((v) => v * rhs))
    const n = this._n
    const res = new Array<number>(n * n).fill(0)
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        for (let k = 0; k < n; k++) {
          res[i * n + j]! += this._arr[i * n + k]! * rhs._arr[k * n + j]!
        }
      }
    }
    return this.create(res)
  }

  // Divide the first matrix by the second (computed as the product of the
  // first matrix and the inverse of the second), or component-wise by a scalar.
  divide(rhs: this | number): this {
    if (typeof rhs === 'number') return this.create(this._arr.map((v) => v / rhs))
    return this.multiply(rhs.getInverse())
  }

  // Return the inverse of the matrix.
  getInverse(): this {
    return this.getAdjugate().divide(this.getDeterminant())
  }

  abstract getTranspose(): this
  abstract getDeterminant(): number
  abstract getAdjugate(): this

  // Return a copy of this matrix.
  copy(): this {
    return this.create([...this._arr])
  }

  // Return the underlying data array, in row-major order.
  data(): number[] {
    return this._arr
  }

  // Return the number of rows in this matrix.
  numRows(): number {
    return this._n
  }

  // Return the number of columns in this matrix.
  numColumns(): number {
    return this._n
  }
}

// A 3x3 matrix of floating-point values.
//
// Vector transformation methods follow the row-vector convention, with
// matrix-vector multiplication computed as v' = vM.
export class Matrix33 extends MatrixBase {
  constructor(...values: number[]) {
    super(3, values)
  }

  override getTranspose(): this {
    const a = this._arr
    return this.create([a[0]!, a[3]!, a[6]!, a[1]!, a[4]!, a[7]!, a[2]!, a[5]!, a[8]!])
  }

  override getDeterminant(): number {
    const a = (i: number, j: number) => this._arr[i * 3 + j]!
    return (
      a(0, 0) * (a(1, 1) * a(2, 2) - a(2, 1) * a(1, 2)) +
      a(0, 1) * (a(1, 2) * a(2, 0) - a(2, 2) * a(1, 0)) +
      a(0, 2) * (a(1, 0) * a(2, 1) - a(2, 0) * a(1, 1))
    )
  }

  override getAdjugate(): this {
    const a = (i: number, j: number) => this._arr[i * 3 + j]!
    return this.create([
      a(1, 1) * a(2, 2) - a(2, 1) * a(1, 2),
      a(2, 1) * a(0, 2) - a(0, 1) * a(2, 2),
      a(0, 1) * a(1, 2) - a(1, 1) * a(0, 2),
      a(1, 2) * a(2, 0) - a(2, 2) * a(1, 0),
      a(2, 2) * a(0, 0) - a(0, 2) * a(2, 0),
      a(0, 2) * a(1, 0) - a(1, 2) * a(0, 0),
      a(1, 0) * a(2, 1) - a(2, 0) * a(1, 1),
      a(2, 0) * a(0, 1) - a(0, 0) * a(2, 1),
      a(0, 0) * a(1, 1) - a(1, 0) * a(0, 1),
    ])
  }

  // Return the product of this matrix and a 3D vector.
  multiplyVector(v: Vector3): Vector3 {
    const a = (i: number, j: number) => this._arr[i * 3 + j]!
    return new Vector3(
      v.getItem(0) * a(0, 0) + v.getItem(1) * a(1, 0) + v.getItem(2) * a(2, 0),
      v.getItem(0) * a(0, 1) + v.getItem(1) * a(1, 1) + v.getItem(2) * a(2, 1),
      v.getItem(0) * a(0, 2) + v.getItem(1) * a(1, 2) + v.getItem(2) * a(2, 2),
    )
  }

  // Transform the given 2D point.
  transformPoint(v: Vector2): Vector2 {
    const res = this.multiplyVector(new Vector3(v.getItem(0), v.getItem(1), 1))
    return new Vector2(res.getItem(0), res.getItem(1))
  }

  // Transform the given 2D direction vector.
  transformVector(v: Vector2): Vector2 {
    const res = this.multiplyVector(new Vector3(v.getItem(0), v.getItem(1), 0))
    return new Vector2(res.getItem(0), res.getItem(1))
  }

  // Transform the given 3D normal vector.
  transformNormal(v: Vector3): Vector3 {
    return this.getInverse().getTranspose().multiplyVector(v)
  }

  // Create a translation matrix.
  static createTranslation(v: Vector2): Matrix33 {
    return new Matrix33(1, 0, 0, 0, 1, 0, v.getItem(0), v.getItem(1), 1)
  }

  // Create a scale matrix.
  static createScale(v: Vector2): Matrix33 {
    return new Matrix33(v.getItem(0), 0, 0, 0, v.getItem(1), 0, 0, 0, 1)
  }

  // Create a rotation matrix from an angle in radians.
  static createRotation(angle: number): Matrix33 {
    const sin = Math.sin(angle)
    const cos = Math.cos(angle)
    return new Matrix33(cos, sin, 0, -sin, cos, 0, 0, 0, 1)
  }

  static readonly IDENTITY = new Matrix33(1, 0, 0, 0, 1, 0, 0, 0, 1)
}

// A 4x4 matrix of floating-point values.
//
// Vector transformation methods follow the row-vector convention, with
// matrix-vector multiplication computed as v' = vM.
export class Matrix44 extends MatrixBase {
  constructor(...values: number[]) {
    super(4, values)
  }

  override getTranspose(): this {
    const a = (i: number, j: number) => this._arr[i * 4 + j]!
    const res: number[] = []
    for (let i = 0; i < 4; i++) {
      for (let j = 0; j < 4; j++) res.push(a(j, i))
    }
    return this.create(res)
  }

  override getDeterminant(): number {
    const a = (i: number, j: number) => this._arr[i * 4 + j]!
    return (
      a(0, 0) * (a(1, 1) * a(2, 2) * a(3, 3) + a(3, 1) * a(1, 2) * a(2, 3) + a(2, 1) * a(3, 2) * a(1, 3) -
                 a(1, 1) * a(3, 2) * a(2, 3) - a(2, 1) * a(1, 2) * a(3, 3) - a(3, 1) * a(2, 2) * a(1, 3)) +
      a(0, 1) * (a(1, 2) * a(3, 3) * a(2, 0) + a(2, 2) * a(1, 3) * a(3, 0) + a(3, 2) * a(2, 3) * a(1, 0) -
                 a(1, 2) * a(2, 3) * a(3, 0) - a(3, 2) * a(1, 3) * a(2, 0) - a(2, 2) * a(3, 3) * a(1, 0)) +
      a(0, 2) * (a(1, 3) * a(2, 0) * a(3, 1) + a(3, 3) * a(1, 0) * a(2, 1) + a(2, 3) * a(3, 0) * a(1, 1) -
                 a(1, 3) * a(3, 0) * a(2, 1) - a(2, 3) * a(1, 0) * a(3, 1) - a(3, 3) * a(2, 0) * a(1, 1)) +
      a(0, 3) * (a(1, 0) * a(3, 1) * a(2, 2) + a(2, 0) * a(1, 1) * a(3, 2) + a(3, 0) * a(2, 1) * a(1, 2) -
                 a(1, 0) * a(2, 1) * a(3, 2) - a(3, 0) * a(1, 1) * a(2, 2) - a(2, 0) * a(3, 1) * a(1, 2))
    )
  }

  override getAdjugate(): this {
    const a = (i: number, j: number) => this._arr[i * 4 + j]!
    return this.create([
      a(1, 1) * a(2, 2) * a(3, 3) + a(3, 1) * a(1, 2) * a(2, 3) + a(2, 1) * a(3, 2) * a(1, 3) -
      a(1, 1) * a(3, 2) * a(2, 3) - a(2, 1) * a(1, 2) * a(3, 3) - a(3, 1) * a(2, 2) * a(1, 3),

      a(0, 1) * a(3, 2) * a(2, 3) + a(2, 1) * a(0, 2) * a(3, 3) + a(3, 1) * a(2, 2) * a(0, 3) -
      a(3, 1) * a(0, 2) * a(2, 3) - a(2, 1) * a(3, 2) * a(0, 3) - a(0, 1) * a(2, 2) * a(3, 3),

      a(0, 1) * a(1, 2) * a(3, 3) + a(3, 1) * a(0, 2) * a(1, 3) + a(1, 1) * a(3, 2) * a(0, 3) -
      a(0, 1) * a(3, 2) * a(1, 3) - a(1, 1) * a(0, 2) * a(3, 3) - a(3, 1) * a(1, 2) * a(0, 3),

      a(0, 1) * a(2, 2) * a(1, 3) + a(1, 1) * a(0, 2) * a(2, 3) + a(2, 1) * a(1, 2) * a(0, 3) -
      a(0, 1) * a(1, 2) * a(2, 3) - a(2, 1) * a(0, 2) * a(1, 3) - a(1, 1) * a(2, 2) * a(0, 3),

      a(1, 2) * a(3, 3) * a(2, 0) + a(2, 2) * a(1, 3) * a(3, 0) + a(3, 2) * a(2, 3) * a(1, 0) -
      a(1, 2) * a(2, 3) * a(3, 0) - a(3, 2) * a(1, 3) * a(2, 0) - a(2, 2) * a(3, 3) * a(1, 0),

      a(0, 2) * a(2, 3) * a(3, 0) + a(3, 2) * a(0, 3) * a(2, 0) + a(2, 2) * a(3, 3) * a(0, 0) -
      a(0, 2) * a(3, 3) * a(2, 0) - a(2, 2) * a(0, 3) * a(3, 0) - a(3, 2) * a(2, 3) * a(0, 0),

      a(0, 2) * a(3, 3) * a(1, 0) + a(1, 2) * a(0, 3) * a(3, 0) + a(3, 2) * a(1, 3) * a(0, 0) -
      a(0, 2) * a(1, 3) * a(3, 0) - a(3, 2) * a(0, 3) * a(1, 0) - a(1, 2) * a(3, 3) * a(0, 0),

      a(0, 2) * a(1, 3) * a(2, 0) + a(2, 2) * a(0, 3) * a(1, 0) + a(1, 2) * a(2, 3) * a(0, 0) -
      a(0, 2) * a(2, 3) * a(1, 0) - a(1, 2) * a(0, 3) * a(2, 0) - a(2, 2) * a(1, 3) * a(0, 0),

      a(1, 3) * a(2, 0) * a(3, 1) + a(3, 3) * a(1, 0) * a(2, 1) + a(2, 3) * a(3, 0) * a(1, 1) -
      a(1, 3) * a(3, 0) * a(2, 1) - a(2, 3) * a(1, 0) * a(3, 1) - a(3, 3) * a(2, 0) * a(1, 1),

      a(0, 3) * a(3, 0) * a(2, 1) + a(2, 3) * a(0, 0) * a(3, 1) + a(3, 3) * a(2, 0) * a(0, 1) -
      a(0, 3) * a(2, 0) * a(3, 1) - a(3, 3) * a(0, 0) * a(2, 1) - a(2, 3) * a(3, 0) * a(0, 1),

      a(0, 3) * a(1, 0) * a(3, 1) + a(3, 3) * a(0, 0) * a(1, 1) + a(1, 3) * a(3, 0) * a(0, 1) -
      a(0, 3) * a(3, 0) * a(1, 1) - a(1, 3) * a(0, 0) * a(3, 1) - a(3, 3) * a(1, 0) * a(0, 1),

      a(0, 3) * a(2, 0) * a(1, 1) + a(1, 3) * a(0, 0) * a(2, 1) + a(2, 3) * a(1, 0) * a(0, 1) -
      a(0, 3) * a(1, 0) * a(2, 1) - a(2, 3) * a(0, 0) * a(1, 1) - a(1, 3) * a(2, 0) * a(0, 1),

      a(1, 0) * a(3, 1) * a(2, 2) + a(2, 0) * a(1, 1) * a(3, 2) + a(3, 0) * a(2, 1) * a(1, 2) -
      a(1, 0) * a(2, 1) * a(3, 2) - a(3, 0) * a(1, 1) * a(2, 2) - a(2, 0) * a(3, 1) * a(1, 2),

      a(0, 0) * a(2, 1) * a(3, 2) + a(3, 0) * a(0, 1) * a(2, 2) + a(2, 0) * a(3, 1) * a(0, 2) -
      a(0, 0) * a(3, 1) * a(2, 2) - a(2, 0) * a(0, 1) * a(3, 2) - a(3, 0) * a(2, 1) * a(0, 2),

      a(0, 0) * a(3, 1) * a(1, 2) + a(1, 0) * a(0, 1) * a(3, 2) + a(3, 0) * a(1, 1) * a(0, 2) -
      a(0, 0) * a(1, 1) * a(3, 2) - a(3, 0) * a(0, 1) * a(1, 2) - a(1, 0) * a(3, 1) * a(0, 2),

      a(0, 0) * a(1, 1) * a(2, 2) + a(2, 0) * a(0, 1) * a(1, 2) + a(1, 0) * a(2, 1) * a(0, 2) -
      a(0, 0) * a(2, 1) * a(1, 2) - a(1, 0) * a(0, 1) * a(2, 2) - a(2, 0) * a(1, 1) * a(0, 2),
    ])
  }

  // Return the product of this matrix and a 4D vector.
  multiplyVector(v: Vector4): Vector4 {
    const a = (i: number, j: number) => this._arr[i * 4 + j]!
    const res: number[] = []
    for (let j = 0; j < 4; j++) {
      res.push(
        v.getItem(0) * a(0, j) + v.getItem(1) * a(1, j) + v.getItem(2) * a(2, j) + v.getItem(3) * a(3, j),
      )
    }
    return new Vector4(...res)
  }

  // Transform the given 3D point.
  transformPoint(v: Vector3): Vector3 {
    const res = this.multiplyVector(new Vector4(v.getItem(0), v.getItem(1), v.getItem(2), 1))
    return new Vector3(res.getItem(0), res.getItem(1), res.getItem(2))
  }

  // Transform the given 3D direction vector.
  transformVector(v: Vector3): Vector3 {
    const res = this.multiplyVector(new Vector4(v.getItem(0), v.getItem(1), v.getItem(2), 0))
    return new Vector3(res.getItem(0), res.getItem(1), res.getItem(2))
  }

  // Transform the given 3D normal vector.
  transformNormal(v: Vector3): Vector3 {
    return this.getInverse().getTranspose().transformVector(v)
  }

  // Create a translation matrix.
  static createTranslation(v: Vector3): Matrix44 {
    return new Matrix44(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, v.getItem(0), v.getItem(1), v.getItem(2), 1)
  }

  // Create a scale matrix.
  static createScale(v: Vector3): Matrix44 {
    return new Matrix44(v.getItem(0), 0, 0, 0, 0, v.getItem(1), 0, 0, 0, 0, v.getItem(2), 0, 0, 0, 0, 1)
  }

  // Create a rotation matrix about the X-axis from an angle in radians.
  static createRotationX(angle: number): Matrix44 {
    const sin = Math.sin(angle)
    const cos = Math.cos(angle)
    return new Matrix44(1, 0, 0, 0, 0, cos, sin, 0, 0, -sin, cos, 0, 0, 0, 0, 1)
  }

  // Create a rotation matrix about the Y-axis from an angle in radians.
  static createRotationY(angle: number): Matrix44 {
    const sin = Math.sin(angle)
    const cos = Math.cos(angle)
    return new Matrix44(cos, 0, -sin, 0, 0, 1, 0, 0, sin, 0, cos, 0, 0, 0, 0, 1)
  }

  // Create a rotation matrix about the Z-axis from an angle in radians.
  static createRotationZ(angle: number): Matrix44 {
    const sin = Math.sin(angle)
    const cos = Math.cos(angle)
    return new Matrix44(cos, sin, 0, 0, -sin, cos, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1)
  }

  static readonly IDENTITY = new Matrix44(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1)
}
