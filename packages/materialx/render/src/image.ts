// Ported from MaterialX 1.39.5: source/MaterialXRender/Image.h,
//  source/MaterialXRender/Image.cpp
// Copyright Contributors to the MaterialX Project. Apache License 2.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Mirrors source/MaterialXRender/Image.h and Image.cpp
//
// Image class

import { Color4, Exception, Matrix33, Vector3 } from '@mtlx/core'
import { GAUSSIAN_KERNEL_7 } from '@mtlx/genshader'

// Base type of each image channel. Mirrors the upstream nested
// Image::BaseType enumeration; also reachable as Image.BaseType.
export enum ImageBaseType {
  UINT8,
  INT8,
  UINT16,
  INT16,
  HALF,
  FLOAT,
}

// The typed array holding the texels of an image. Upstream allocates a raw
// byte buffer; this port uses the typed array matching the image base type.
// HALF images store 16-bit half-float bit patterns in a Uint16Array.
export type ImageBufferArray = Uint8Array | Int8Array | Uint16Array | Int16Array | Float32Array

// A map from strings to images.
export type ImageMap = Map<string, Image>

// A vector of images.
export type ImageVec = Image[]

// A pair of images.
export type ImagePair = [Image, Image]

// A function to perform image buffer deallocation. Buffers are garbage
// collected in this port, but the deallocator hook is preserved so that
// renderer packages can release associated resources.
export type ImageBufferDeallocator = (buffer: ImageBufferArray) => void

// A pair of unsigned integers.
export type UnsignedIntPair = [number, number]

// A function which writes the given data to the file at the given path.
// File system access is supplied by the caller so that this module remains
// browser-safe.
export type ImageWriteFunction = (filePath: string, data: Uint8Array) => void

// Scratch buffer used to reinterpret bits between float32 and uint32.
const FLOAT_BITS = new DataView(new ArrayBuffer(4))

// Convert a float to its 16-bit half-float bit pattern, rounding to nearest
// even. Used for HALF images; the Half class in types.ts does not expose its
// underlying bit pattern.
export function floatToHalfBits(value: number): number {
  FLOAT_BITS.setFloat32(0, value)
  const f = FLOAT_BITS.getUint32(0)
  const sign = (f >>> 16) & 0x8000
  const abs = f & 0x7fffffff
  if (abs > 0x7f800000) {
    // NaN
    return sign | 0x7e00
  }
  if (abs >= 0x47800000) {
    // Overflow, or infinity: encode as infinity.
    return sign | 0x7c00
  }
  if (abs < 0x38800000) {
    // Subnormal half, or zero.
    const shift = 126 - (abs >>> 23)
    if (shift > 24) {
      return sign
    }
    const m = (abs & 0x7fffff) | 0x800000
    let half = m >>> shift
    const rem = m & ((1 << shift) - 1)
    const halfway = 1 << (shift - 1)
    if (rem > halfway || (rem === halfway && (half & 1))) {
      half++
    }
    return sign | half
  }
  // Normalized half.
  let half = (abs >>> 13) - (112 << 10)
  const rem = abs & 0x1fff
  if (rem > 0x1000 || (rem === 0x1000 && (half & 1))) {
    half++
  }
  return sign | half
}

// Convert a 16-bit half-float bit pattern to a float.
export function halfBitsToFloat(bits: number): number {
  const sign = bits & 0x8000 ? -1 : 1
  const e = (bits >> 10) & 0x1f
  const m = bits & 0x3ff
  if (e === 0) {
    return sign * m * 2 ** -24
  }
  if (e === 31) {
    return m ? NaN : sign * Infinity
  }
  return sign * (1024 + m) * 2 ** (e - 25)
}

// Round half away from zero, matching std::round.
function roundHalfAwayFromZero(value: number): number {
  return value < 0 ? -Math.round(-value) : Math.round(value)
}

// @class Image
// Class representing an image in system memory
export class Image {
  // Mirrors the upstream nested Image::BaseType enumeration, so call sites
  // can write Image.BaseType.UINT8 as upstream writes Image::BaseType::UINT8.
  static readonly BaseType = ImageBaseType

  protected _width: number
  protected _height: number
  protected _channelCount: number
  protected _baseType: ImageBaseType

  protected _resourceBuffer: ImageBufferArray | null = null
  protected _resourceBufferDeallocator: ImageBufferDeallocator | null = null
  protected _resourceId = 0

  protected constructor(width: number, height: number, channelCount: number, baseType: ImageBaseType) {
    this._width = width
    this._height = height
    this._channelCount = channelCount
    this._baseType = baseType
  }

  // Create an empty image with the given properties.
  static create(width: number, height: number, channelCount: number, baseType: ImageBaseType = ImageBaseType.UINT8): Image {
    return new Image(width, height, channelCount, baseType)
  }

  //
  // Property Accessors
  //

  // Return the width of the image.
  getWidth(): number {
    return this._width
  }

  // Return the height of the image.
  getHeight(): number {
    return this._height
  }

  // Return the channel count of the image.
  getChannelCount(): number {
    return this._channelCount
  }

  // Return the base type of the image.
  getBaseType(): ImageBaseType {
    return this._baseType
  }

  // Return the stride of our base type in bytes.
  getBaseStride(): number {
    if (this._baseType === ImageBaseType.FLOAT) {
      return 4
    }
    if (this._baseType === ImageBaseType.HALF ||
        this._baseType === ImageBaseType.UINT16 ||
        this._baseType === ImageBaseType.INT16) {
      return 2
    }
    if (this._baseType === ImageBaseType.UINT8 ||
        this._baseType === ImageBaseType.INT8) {
      return 1
    }
    throw new Exception('Unsupported base type in getBaseStride')
  }

  // Return the stride of an image row in bytes.
  getRowStride(): number {
    return this._width * this._channelCount * this.getBaseStride()
  }

  // Return the maximum number of mipmaps for this image.
  getMaxMipCount(): number {
    return Math.trunc(Math.log2(Math.max(this._width, this._height))) + 1
  }

  //
  // Texel Accessors
  //

  // Set the texel color at the given coordinates. If the coordinates
  // or image resource buffer are invalid, then an exception is thrown.
  setTexelColor(x: number, y: number, color: Color4): void {
    if (x >= this._width || y >= this._height) {
      throw new Exception('Invalid coordinates in setTexelColor')
    }
    const buffer = this._resourceBuffer
    if (!buffer) {
      throw new Exception('Invalid resource buffer in setTexelColor')
    }

    const writeChannels = Math.min(this._channelCount, 4)
    const offset = (y * this._width + x) * this._channelCount
    if (this._baseType === ImageBaseType.FLOAT) {
      for (let c = 0; c < writeChannels; c++) {
        buffer[offset + c] = color.getItem(c)
      }
    } else if (this._baseType === ImageBaseType.HALF) {
      for (let c = 0; c < writeChannels; c++) {
        buffer[offset + c] = floatToHalfBits(color.getItem(c))
      }
    } else if (this._baseType === ImageBaseType.UINT16) {
      for (let c = 0; c < writeChannels; c++) {
        buffer[offset + c] = roundHalfAwayFromZero(Math.fround(color.getItem(c)) * 0xffff)
      }
    } else if (this._baseType === ImageBaseType.INT16) {
      for (let c = 0; c < writeChannels; c++) {
        buffer[offset + c] = roundHalfAwayFromZero(Math.fround(color.getItem(c)) * 0x7fff)
      }
    } else if (this._baseType === ImageBaseType.UINT8) {
      for (let c = 0; c < writeChannels; c++) {
        buffer[offset + c] = roundHalfAwayFromZero(Math.fround(color.getItem(c)) * 0xff)
      }
    } else if (this._baseType === ImageBaseType.INT8) {
      for (let c = 0; c < writeChannels; c++) {
        buffer[offset + c] = roundHalfAwayFromZero(Math.fround(color.getItem(c)) * 0x7f)
      }
    } else {
      throw new Exception('Unsupported base type in setTexelColor')
    }
  }

  // Return the texel color at the given coordinates. If the coordinates
  // or image resource buffer are invalid, then an exception is thrown.
  getTexelColor(x: number, y: number): Color4 {
    if (x >= this._width || y >= this._height) {
      throw new Exception('Invalid coordinates in getTexelColor')
    }
    const buffer = this._resourceBuffer
    if (!buffer) {
      throw new Exception('Invalid resource buffer in getTexelColor')
    }

    const offset = (y * this._width + x) * this._channelCount
    const readChannel = (c: number): number => {
      const data = buffer[offset + c]!
      switch (this._baseType) {
        case ImageBaseType.FLOAT:
          return data
        case ImageBaseType.HALF:
          return halfBitsToFloat(data)
        case ImageBaseType.UINT16:
          return Math.fround(data / 0xffff)
        case ImageBaseType.INT16:
          return Math.fround(data / 0x7fff)
        case ImageBaseType.UINT8:
          return Math.fround(data / 0xff)
        case ImageBaseType.INT8:
          return Math.fround(data / 0x7f)
        default:
          throw new Exception('Unsupported base type in getTexelColor')
      }
    }

    if (this._channelCount === 4) {
      return new Color4(readChannel(0), readChannel(1), readChannel(2), readChannel(3))
    } else if (this._channelCount === 3) {
      return new Color4(readChannel(0), readChannel(1), readChannel(2), 1.0)
    } else if (this._channelCount === 2) {
      return new Color4(readChannel(0), readChannel(1), 0.0, 1.0)
    } else if (this._channelCount === 1) {
      const scalar = readChannel(0)
      return new Color4(scalar, scalar, scalar, 1.0)
    } else {
      throw new Exception('Unsupported channel count in getTexelColor')
    }
  }

  //
  // Image Analysis
  //

  // Compute the average color of the image.
  getAverageColor(): Color4 {
    let averageColor = new Color4(0.0, 0.0, 0.0, 0.0)
    for (let y = 0; y < this.getHeight(); y++) {
      for (let x = 0; x < this.getWidth(); x++) {
        averageColor = averageColor.add(this.getTexelColor(x, y))
      }
    }
    const sampleCount = this.getWidth() * this.getHeight()
    return averageColor.divide(sampleCount)
  }

  // Return true if all texels of this image are identical in color.
  // @param uniformColor If non-null, receives the uniform color of the
  //        image, if any. Mirrors the upstream Color4 out-pointer.
  isUniformColor(uniformColor: Color4 | null = null): boolean {
    const refColor = this.getTexelColor(0, 0)
    for (let y = 0; y < this.getHeight(); y++) {
      for (let x = 0; x < this.getWidth(); x++) {
        if (!x && !y) {
          continue
        }
        if (this.getTexelColor(x, y).notEquals(refColor)) {
          return false
        }
      }
    }
    if (uniformColor) {
      for (let c = 0; c < 4; c++) {
        uniformColor.setItem(c, refColor.getItem(c))
      }
    }
    return true
  }

  //
  // Image Processing
  //

  // Set all texels of this image to a uniform color.
  setUniformColor(color: Color4): void {
    for (let y = 0; y < this.getHeight(); y++) {
      for (let x = 0; x < this.getWidth(); x++) {
        this.setTexelColor(x, y, color)
      }
    }
  }

  // Apply the given matrix transform to all texels of this image.
  applyMatrixTransform(mat: Matrix33): void {
    for (let y = 0; y < this.getHeight(); y++) {
      for (let x = 0; x < this.getWidth(); x++) {
        const color = this.getTexelColor(x, y)
        // Upstream Matrix33::multiply(Vector3); the core port names the
        // vector overload multiplyVector.
        const vec = mat.multiplyVector(new Vector3(color.getItem(0), color.getItem(1), color.getItem(2)))
        this.setTexelColor(x, y, new Color4(vec.getItem(0), vec.getItem(1), vec.getItem(2), color.getItem(3)))
      }
    }
  }

  // Apply the given gamma transform to all texels of this image.
  applyGammaTransform(gamma: number): void {
    for (let y = 0; y < this.getHeight(); y++) {
      for (let x = 0; x < this.getWidth(); x++) {
        const color = this.getTexelColor(x, y)
        this.setTexelColor(x, y, new Color4(
          Math.pow(Math.max(color.getItem(0), 0.0), gamma),
          Math.pow(Math.max(color.getItem(1), 0.0), gamma),
          Math.pow(Math.max(color.getItem(2), 0.0), gamma),
          color.getItem(3),
        ))
      }
    }
  }

  // Create a copy of this image with the given channel count and base type.
  copy(channelCount: number, baseType: ImageBaseType): Image {
    const newImage = Image.create(this.getWidth(), this.getHeight(), channelCount, baseType)
    newImage.createResourceBuffer()

    for (let y = 0; y < this.getHeight(); y++) {
      for (let x = 0; x < this.getWidth(); x++) {
        newImage.setTexelColor(x, y, this.getTexelColor(x, y))
      }
    }

    return newImage
  }

  // Apply a 3x3 box blur to this image, returning a new blurred image.
  applyBoxBlur(): Image {
    const blurImage = Image.create(this.getWidth(), this.getHeight(), this.getChannelCount(), this.getBaseType())
    blurImage.createResourceBuffer()

    for (let y = 0; y < this.getHeight(); y++) {
      for (let x = 0; x < this.getWidth(); x++) {
        let blurColor = new Color4(0.0, 0.0, 0.0, 0.0)
        for (let dy = -1; dy <= 1; dy++) {
          const sy = Math.min(Math.max(y + dy, 0), this.getHeight() - 1)
          for (let dx = -1; dx <= 1; dx++) {
            const sx = Math.min(Math.max(x + dx, 0), this.getWidth() - 1)
            blurColor = blurColor.add(this.getTexelColor(sx, sy))
          }
        }
        blurColor = blurColor.divide(9.0)
        blurImage.setTexelColor(x, y, blurColor)
      }
    }

    return blurImage
  }

  // Apply a 7x7 Gaussian blur to this image, returning a new blurred image.
  applyGaussianBlur(): Image {
    const blurImage1 = Image.create(this.getWidth(), this.getHeight(), this.getChannelCount(), this.getBaseType())
    const blurImage2 = Image.create(this.getWidth(), this.getHeight(), this.getChannelCount(), this.getBaseType())
    blurImage1.createResourceBuffer()
    blurImage2.createResourceBuffer()

    for (let y = 0; y < this.getHeight(); y++) {
      for (let x = 0; x < this.getWidth(); x++) {
        let blurColor = new Color4(0.0, 0.0, 0.0, 0.0)
        let weightIndex = 0
        for (let dy = -3; dy <= 3; dy++, weightIndex++) {
          const sy = Math.min(Math.max(y + dy, 0), this.getHeight() - 1)
          blurColor = blurColor.add(this.getTexelColor(x, sy).multiply(GAUSSIAN_KERNEL_7[weightIndex]!))
        }
        blurImage1.setTexelColor(x, y, blurColor)
      }
    }

    for (let y = 0; y < this.getHeight(); y++) {
      for (let x = 0; x < this.getWidth(); x++) {
        let blurColor = new Color4(0.0, 0.0, 0.0, 0.0)
        let weightIndex = 0
        for (let dx = -3; dx <= 3; dx++, weightIndex++) {
          const sx = Math.min(Math.max(x + dx, 0), this.getWidth() - 1)
          blurColor = blurColor.add(blurImage1.getTexelColor(sx, y).multiply(GAUSSIAN_KERNEL_7[weightIndex]!))
        }
        blurImage2.setTexelColor(x, y, blurColor)
      }
    }

    return blurImage2
  }

  // Downsample this image by an integer factor using a box filter,
  // returning the new reduced image.
  applyBoxDownsample(factor: number): Image {
    factor = Math.max(factor, 2)

    const sampleImage = Image.create(
      Math.max(Math.trunc(this.getWidth() / factor), 1),
      Math.max(Math.trunc(this.getHeight() / factor), 1),
      this.getChannelCount(),
      this.getBaseType(),
    )
    sampleImage.createResourceBuffer()

    for (let y = 0; y < sampleImage.getHeight(); y++) {
      for (let x = 0; x < sampleImage.getWidth(); x++) {
        let sampleColor = new Color4(0.0, 0.0, 0.0, 0.0)
        for (let dy = 0; dy < factor; dy++) {
          const sy = Math.min(Math.max(y * factor + dy, 0), this.getHeight() - 1)
          for (let dx = 0; dx < factor; dx++) {
            const sx = Math.min(Math.max(x * factor + dx, 0), this.getWidth() - 1)
            sampleColor = sampleColor.add(this.getTexelColor(sx, sy))
          }
        }
        sampleColor = sampleColor.divide(factor * factor)
        sampleImage.setTexelColor(x, y, sampleColor)
      }
    }

    return sampleImage
  }

  // Split this image by the given luminance threshold, returning the
  // resulting underflow and overflow images.
  splitByLuminance(luminance: number): ImagePair {
    const underflowImage = Image.create(this.getWidth(), this.getHeight(), this.getChannelCount(), this.getBaseType())
    const overflowImage = Image.create(this.getWidth(), this.getHeight(), this.getChannelCount(), this.getBaseType())
    underflowImage.createResourceBuffer()
    overflowImage.createResourceBuffer()

    for (let y = 0; y < this.getHeight(); y++) {
      for (let x = 0; x < this.getWidth(); x++) {
        const envColor = this.getTexelColor(x, y)
        const underflowColor = new Color4(
          Math.min(envColor.getItem(0), luminance),
          Math.min(envColor.getItem(1), luminance),
          Math.min(envColor.getItem(2), luminance), 1.0)
        const overflowColor = new Color4(
          Math.max(envColor.getItem(0) - underflowColor.getItem(0), 0.0),
          Math.max(envColor.getItem(1) - underflowColor.getItem(1), 0.0),
          Math.max(envColor.getItem(2) - underflowColor.getItem(2), 0.0), 1.0)
        underflowImage.setTexelColor(x, y, underflowColor)
        overflowImage.setTexelColor(x, y, overflowColor)
      }
    }

    return [underflowImage, overflowImage]
  }

  // Save a channel of this image to disk as a text table, in a format
  // that can be used for curve and surface fitting.
  // DIVERGENCE from upstream: file system access is supplied by the caller
  // through the writeFile function so that this module remains browser-safe,
  // and numbers use default JavaScript formatting rather than C++ ostream
  // formatting.
  writeTable(filePath: string, channel: number, writeFile: ImageWriteFunction): void {
    let table = 'X Y Z\n'
    for (let y = 0; y < this.getHeight(); y++) {
      for (let x = 0; x < this.getWidth(); x++) {
        const dx = (x + 0.5) / this.getWidth()
        const dy = (y + 0.5) / this.getHeight()
        const dz = this.getTexelColor(x, y).getItem(channel)
        table += `${dx} ${dy} ${dz}\n`
      }
    }
    writeFile(filePath, new TextEncoder().encode(table))
  }

  //
  // Resource Buffers
  //

  // Set the resource buffer for this image.
  setResourceBuffer(buffer: ImageBufferArray | null): void {
    this._resourceBuffer = buffer
  }

  // Return the resource buffer for this image.
  getResourceBuffer(): ImageBufferArray | null {
    return this._resourceBuffer
  }

  // Allocate a resource buffer for this image that matches its properties.
  createResourceBuffer(): void {
    this.releaseResourceBuffer()
    const size = this._width * this._height * this._channelCount
    switch (this._baseType) {
      case ImageBaseType.UINT8:
        this._resourceBuffer = new Uint8Array(size)
        break
      case ImageBaseType.INT8:
        this._resourceBuffer = new Int8Array(size)
        break
      case ImageBaseType.UINT16:
      case ImageBaseType.HALF:
        this._resourceBuffer = new Uint16Array(size)
        break
      case ImageBaseType.INT16:
        this._resourceBuffer = new Int16Array(size)
        break
      case ImageBaseType.FLOAT:
        this._resourceBuffer = new Float32Array(size)
        break
    }
    this._resourceBufferDeallocator = null
  }

  // Release the resource buffer for this image.
  releaseResourceBuffer(): void {
    if (this._resourceBuffer) {
      if (this._resourceBufferDeallocator) {
        this._resourceBufferDeallocator(this._resourceBuffer)
      }
      this._resourceBuffer = null
    }
  }

  // Set the resource buffer deallocator for this image.
  setResourceBufferDeallocator(deallocator: ImageBufferDeallocator | null): void {
    this._resourceBufferDeallocator = deallocator
  }

  // Return the resource buffer deallocator for this image.
  getResourceBufferDeallocator(): ImageBufferDeallocator | null {
    return this._resourceBufferDeallocator
  }

  //
  // Resource IDs
  //

  // Set the resource ID for this image.
  setResourceId(id: number): void {
    this._resourceId = id
  }

  // Return the resource ID for this image.
  getResourceId(): number {
    return this._resourceId
  }
}

// Create a uniform-color image with the given properties.
export function createUniformImage(width: number, height: number, channelCount: number, baseType: ImageBaseType, color: Color4): Image {
  const image = Image.create(width, height, channelCount, baseType)
  image.createResourceBuffer()
  image.setUniformColor(color)
  return image
}

// Create a horizontal image strip from a vector of images with identical resolutions and formats.
export function createImageStrip(imageVec: ImageVec): Image | null {
  const refImage = imageVec.length ? imageVec[0]! : null
  if (!refImage) {
    return null
  }

  const srcWidth = refImage.getWidth()
  const srcHeight = refImage.getHeight()
  const destWidth = srcWidth * imageVec.length

  const imageStrip = Image.create(destWidth, srcHeight, refImage.getChannelCount(), refImage.getBaseType())
  imageStrip.createResourceBuffer()

  // Strides are measured in typed array elements rather than bytes.
  const srcRowStride = srcWidth * refImage.getChannelCount()
  const destRowStride = destWidth * refImage.getChannelCount()

  for (let i = 0; i < imageVec.length; i++) {
    const srcImage = imageVec[i]!
    if (!srcImage ||
        srcImage.getWidth() !== srcWidth ||
        srcImage.getHeight() !== srcHeight ||
        srcImage.getChannelCount() !== refImage.getChannelCount() ||
        srcImage.getBaseType() !== refImage.getBaseType()) {
      throw new Exception('Source images must have identical resolutions and formats in createImageStrip')
    }

    const xOffset = i * srcRowStride

    const src = srcImage.getResourceBuffer()!
    const dest = imageStrip.getResourceBuffer()!

    for (let y = 0; y < srcHeight; y++) {
      dest.set(src.subarray(y * srcRowStride, (y + 1) * srcRowStride), y * destRowStride + xOffset)
    }
  }

  return imageStrip
}

// Compute the maximum width and height of all images in the given vector.
export function getMaxDimensions(imageVec: ImageVec): UnsignedIntPair {
  const maxSize: UnsignedIntPair = [0, 0]
  for (const image of imageVec) {
    maxSize[0] = Math.max(maxSize[0], image.getWidth())
    maxSize[1] = Math.max(maxSize[1], image.getHeight())
  }
  return maxSize
}
