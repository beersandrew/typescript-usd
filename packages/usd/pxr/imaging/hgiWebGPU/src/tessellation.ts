// Ported from OpenUSD 26.11.1: pxr/imaging/hdSt/pipelineDrawBatch.cpp,
//  pxr/imaging/hgiMetal/graphicsPipeline.mm,
//  pxr/imaging/hgiMetal/resourceBindings.mm
// Copyright 2020, 2021 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// HgiWebGPUTessellation: the GPU side of HgiWebGPU's emulation of Metal's
// tessellated patch draws (packages/usd/docs/imaging-i2.md section 2.2.1).
//
// hgiMetal draws Storm's per-patch-factor patches in two steps: the
// post-tessellation control stage runs as a rasterizer-disabled patch draw
// that writes each patch's half-float factors
// (hdSt/pipelineDrawBatch.cpp:1376-1385, 1790-1853; hgiMetal/
// graphicsPipeline.mm:187-193), then the real draw hands those factors to
// the fixed-function tessellator (resourceBindings.mm:136-141,
// graphicsPipeline.mm:195-204), which feeds the post-tessellation vertex
// function one (patch_id, position_in_patch) per vertex. WebGPU has neither
// patch draws nor a tessellator, so HgiWebGPU:
// - runs the post-tessellation control stage as a compute dispatch
//   (HgiWebGPUShaderGenerator's 'control' entry point);
// - runs the Direct3D 11 fixed-function tessellator Apple's matches
//   (tessellator.ts, as the WGSL kernels of tessellatorWGSL.ts) on those
//   factors, writing (patch, u, v) points and triangle indices to pools
//   this object owns, and the draw's indexed indirect arguments;
// - draws the post-tessellation vertex function as an indexed indirect
//   draw of those indices (HgiWebGPUPostTessVertexShaderSection reads the
//   point of each vertex).
// The compute work of a graphics cmds is encoded on a command encoder that
// HgiWebGPUGraphicsCmds submits just before its render pass (WebGPU cannot
// dispatch inside a render pass), which orders it as hgiMetal's memory
// barrier after the control stage does (pipelineDrawBatch.cpp:1383).
//
// The pools grow: when a cmds needs more points or indices than they hold,
// the draws that do not fit draw nothing that frame, a warning says so,
// and the pools are grown for the next frame (the counts are read back).

import { HgiShaderFunctionTessellationDesc, HgiWinding } from 'typescript-usd/hgi'
import { TF_WARN } from './diagnostic.ts'
import {
  HgiWebGPUTessellator,
  HgiWebGPUTessellatorOutputPrimitive,
  HgiWebGPUTessellatorPartitioning,
} from './tessellator.ts'
export { HgiWebGPUTessellatorOutputPrimitiveForMetalWinding } from './tessellator.ts'
import { HgiWebGPUTessellatorWGSL } from './tessellatorWGSL.ts'

/** What the tessellator needs to know about a patch pipeline: the domain
 *  (HgiTessellationState::patchType), the partition mode and the output
 *  winding hgiMetal derives (graphicsPipeline.mm:109-160, 178-235). */
export interface HgiWebGPUTessellationConfig {
  domain: 'quad' | 'tri'
  partitioning: HgiWebGPUTessellatorPartitioning
  outputPrimitive: HgiWebGPUTessellatorOutputPrimitive
}

/** hgiMetal's output winding for a pipeline: the rasterization winding
 *  through HgiMetalConversions::GetWinding (which inverts it,
 *  conversions.mm:253-260), flipped again (graphicsPipeline.mm:223-228). */
export function HgiWebGPUMetalTessellationWinding(rasterWinding: HgiWinding): 'ccw' | 'cw' {
  return rasterWinding === HgiWinding.HgiWindingCounterClockwise ? 'ccw' : 'cw'
}

/** _SetTessellationStateFromShaderFunctions (hgiMetal/graphicsPipeline.mm:
 *  125-143): the post-tessellation vertex function's spacing. */
export function HgiWebGPUTessellatorPartitioningForSpacing(
  spacing: HgiShaderFunctionTessellationDesc['spacing'],
): HgiWebGPUTessellatorPartitioning {
  switch (spacing) {
    case HgiShaderFunctionTessellationDesc.Spacing.FractionalOdd:
      return HgiWebGPUTessellatorPartitioning.FractionalOdd
    case HgiShaderFunctionTessellationDesc.Spacing.FractionalEven:
      return HgiWebGPUTessellatorPartitioning.FractionalEven
    default:
      return HgiWebGPUTessellatorPartitioning.Integer
  }
}

/** The (u, v) of each vertex of a patch drawn with constant factors: the
 *  triangles a triangle list of the patch's control points gives, each
 *  vertex at the position_in_patch of its control point.
 *
 *  Storm asks for constant factors only for mesh triangles and triquads
 *  (hdSt/renderPassState.cpp:1105-1112, geometricShader.cpp:312-318), and
 *  only on devices without builtin barycentrics or for displacement and
 *  PTVS normals (hdSt/meshShaderKey.cpp:277-288; HgiWebGPU has no builtin
 *  barycentrics). On the reference device (hgiMetal on Apple silicon,
 *  barycentrics: hgiMetal/capabilities.mm:44-49) Storm draws the same
 *  prims as triangle lists of the same index buffer
 *  (geometricShader.cpp:312-318), so native images are those triangles:
 *  a triquad's (q0, q1, q2) and (q2, q3, q0) (hd/meshUtil.h:398-405), the
 *  q0-q2 diagonal. Metal's tessellator at constant factors would split the
 *  quad domain along the other diagonal ((0,0),(1,0),(0,1) and
 *  (1,0),(1,1),(0,1); tests/fixtures/tessellator), which only devices
 *  without barycentrics draw; HgiWebGPU draws what the reference device
 *  draws (packages/usd/docs/imaging-i2.md section 2.2.1).
 *
 *  The positions are those at which Storm's post-tessellation vertex
 *  functions evaluate to each control point (hdSt/shaders/mesh.glslfx:
 *  120-123 triangles: (1, 0) point 0, (0, 1) point 1, (0, 0) point 2;
 *  285-289 triquads, whose points 3 and 5 repeat 2 and 0: (0,0), (1,0),
 *  (1,1), (1,1), (0,1), (0,0) for points 0..5, as GetPatchCoord's table,
 *  228-234). */
export function HgiWebGPUConstantPatchCorners(domain: 'quad' | 'tri'): number[] {
  return domain === 'quad'
    ? [0, 0, 1, 0, 1, 1, 1, 1, 0, 1, 0, 0]
    : [1, 0, 0, 1, 0, 0]
}

const _GPUBufferUsage = { MAP_READ: 0x0001, COPY_SRC: 0x0004, COPY_DST: 0x0008, INDEX: 0x0010, UNIFORM: 0x0040, STORAGE: 0x0080, INDIRECT: 0x0100 }
const _GPUMapMode = { READ: 0x0001 }
const _stateHeaderWords = 8
const _argsWords = 5

/** One draw's tessellation, as the patch draw finds it. */
export interface HgiWebGPUTessellatedDraw {
  /** The buffer holding the draw's DrawIndexedIndirect arguments. */
  argsBuffer: GPUBuffer
  argsOffset: number
  points: GPUBuffer
  indices: GPUBuffer
}

/** The tessellation work of one graphics cmds: its state buffer (pool
 *  cursors and the draws' indirect arguments). */
export class HgiWebGPUTessellationFrame {
  state: GPUBuffer
  draws = 0
  capacity = 256
  constructor(owner: HgiWebGPUTessellation) {
    this.state = owner._createState(this.capacity)
  }
}

export class HgiWebGPUTessellation {
  private readonly _module: GPUShaderModule
  private readonly _layout: GPUBindGroupLayout
  private readonly _count: GPUComputePipeline
  private readonly _scan: GPUComputePipeline
  private readonly _write: GPUComputePipeline
  private _counts: GPUBuffer
  private _countsCapacity = 4096
  private _points: GPUBuffer
  private _pointCapacity = 1 << 18
  private _indices: GPUBuffer
  private _indexCapacity = 1 << 20

  constructor(private readonly _device: GPUDevice) {
    this._module = _device.createShaderModule({ label: 'HgiWebGPU tessellator', code: HgiWebGPUTessellatorWGSL })
    const storage = (type: GPUBufferBindingType): GPUBufferBindingLayout => ({ type })
    this._layout = _device.createBindGroupLayout({
      label: 'HgiWebGPU tessellator',
      entries: [
        { binding: 0, visibility: 0x4, buffer: { type: 'uniform', hasDynamicOffset: true } },
        { binding: 1, visibility: 0x4, buffer: storage('read-only-storage') },
        { binding: 2, visibility: 0x4, buffer: storage('storage') },
        { binding: 3, visibility: 0x4, buffer: storage('storage') },
        { binding: 4, visibility: 0x4, buffer: storage('storage') },
        { binding: 5, visibility: 0x4, buffer: storage('storage') },
      ],
    })
    const layout = _device.createPipelineLayout({ label: 'HgiWebGPU tessellator', bindGroupLayouts: [this._layout] })
    const make = (entryPoint: string) => _device.createComputePipeline({
      label: `HgiWebGPU tessellator ${entryPoint}`, layout, compute: { module: this._module, entryPoint },
    })
    this._count = make('countEntry')
    this._scan = make('scanEntry')
    this._write = make('writeEntry')
    this._counts = this._createCounts()
    this._points = this._createPool('points', this._pointCapacity * 12, 0)
    this._indices = this._createPool('indices', this._indexCapacity * 4, _GPUBufferUsage.INDEX)
  }

  private _createCounts(): GPUBuffer {
    return this._device.createBuffer({
      label: 'HgiWebGPU tessellator counts', size: this._countsCapacity * 8,
      usage: _GPUBufferUsage.STORAGE | _GPUBufferUsage.COPY_SRC,
    })
  }

  private _createPool(label: string, size: number, usage: number): GPUBuffer {
    return this._device.createBuffer({
      label: `HgiWebGPU tessellated ${label}`, size,
      // COPY_SRC: tests/browser/storm-image/tessellator reads them back.
      usage: _GPUBufferUsage.STORAGE | _GPUBufferUsage.COPY_SRC | usage,
    })
  }

  /** @internal */
  _createState(draws: number): GPUBuffer {
    return this._device.createBuffer({
      label: 'HgiWebGPU tessellation state',
      size: (_stateHeaderWords + _argsWords * draws) * 4,
      usage: _GPUBufferUsage.STORAGE | _GPUBufferUsage.INDIRECT | _GPUBufferUsage.COPY_SRC | _GPUBufferUsage.COPY_DST,
    })
  }

  /** Starts the tessellation work of a graphics cmds: a fresh state
   *  buffer (WebGPU zero-fills it: the pool cursors start at zero). */
  beginFrame(): HgiWebGPUTessellationFrame {
    return new HgiWebGPUTessellationFrame(this)
  }

  /** Encodes the tessellation of one patch draw: count, scan, write.
   *  `pass` is a compute pass of the frame's pre-pass encoder; when the
   *  frame's state buffer is full it is grown, which needs the encoder
   *  outside the pass, so the caller passes a function that ends and
   *  restarts its pass around the copy. */
  encode(frame: HgiWebGPUTessellationFrame, d: {
    pass: () => GPUComputePassEncoder
    suspend: (work: (encoder: GPUCommandEncoder) => void) => void
    allocateParams: (bytes: Uint8Array) => { buffer: GPUBuffer, offset: number, size: number }
    factors: GPUBuffer
    factorsByteOffset: number
    patchStart: number
    patchCount: number
    instanceCount: number
    config: HgiWebGPUTessellationConfig
  }): HgiWebGPUTessellatedDraw | null {
    if (d.patchCount === 0) return null
    if (frame.draws === frame.capacity) {
      const grown = this._createState(frame.capacity * 2)
      const old = frame.state
      const bytes = (_stateHeaderWords + _argsWords * frame.capacity) * 4
      d.suspend(encoder => encoder.copyBufferToBuffer(old, 0, grown, 0, bytes))
      frame.state = grown
      frame.capacity *= 2
    }
    if (d.patchCount > this._countsCapacity) {
      while (this._countsCapacity < d.patchCount) this._countsCapacity *= 2
      this._counts = this._createCounts()
    }
    const halvesPerPatch = d.config.domain === 'quad' ? 6 : 4
    const argsWord = _stateHeaderWords + _argsWords * frame.draws++
    const params = new Uint32Array([
      d.patchCount,
      d.factorsByteOffset / 2 + d.patchStart * halvesPerPatch,
      halvesPerPatch,
      d.config.domain === 'quad' ? 0 : 1,
      d.config.partitioning,
      d.config.outputPrimitive === HgiWebGPUTessellatorOutputPrimitive.TriangleCW ? 1 : 0,
      d.instanceCount,
      argsWord,
      this._pointCapacity,
      this._indexCapacity,
      0, 0,
    ])
    const slot = d.allocateParams(new Uint8Array(params.buffer))
    const bindGroup = this._device.createBindGroup({
      label: 'HgiWebGPU tessellator',
      layout: this._layout,
      entries: [
        { binding: 0, resource: { buffer: slot.buffer, offset: 0, size: slot.size } },
        { binding: 1, resource: { buffer: d.factors } },
        { binding: 2, resource: { buffer: this._counts } },
        { binding: 3, resource: { buffer: this._points } },
        { binding: 4, resource: { buffer: this._indices } },
        { binding: 5, resource: { buffer: frame.state } },
      ],
    })
    const pass = d.pass()
    const groups = Math.ceil(d.patchCount / 64)
    pass.setBindGroup(0, bindGroup, [slot.offset])
    pass.setPipeline(this._count)
    pass.dispatchWorkgroups(groups)
    pass.setPipeline(this._scan)
    pass.dispatchWorkgroups(1)
    pass.setPipeline(this._write)
    pass.dispatchWorkgroups(groups)
    return { argsBuffer: frame.state, argsOffset: argsWord * 4, points: this._points, indices: this._indices }
  }

  /** After the frame's work is encoded (`encoder` is the pre-pass encoder,
   *  no pass open): copies out how many points and indices it needed. The
   *  returned function, called once the encoder is submitted, reads them
   *  back, warns about the draws that did not fit and grows the pools for
   *  the next frame. */
  endFrame(frame: HgiWebGPUTessellationFrame, encoder: GPUCommandEncoder): (() => Promise<void>) | null {
    if (frame.draws === 0) return null
    const readback = this._device.createBuffer({
      label: 'HgiWebGPU tessellation readback', size: 32, usage: _GPUBufferUsage.MAP_READ | _GPUBufferUsage.COPY_DST,
    })
    encoder.copyBufferToBuffer(frame.state, 0, readback, 0, 32)
    return () => readback.mapAsync(_GPUMapMode.READ).then(() => {
      const words = new Uint32Array(readback.getMappedRange().slice(0))
      readback.destroy()
      const [, , pointsNeeded, indicesNeeded, dropped] = words as unknown as number[]
      if (!dropped) return
      TF_WARN(`HgiWebGPU: tessellation needed ${pointsNeeded} points and ${indicesNeeded} indices, ` +
        `more than the pools hold (${this._pointCapacity}, ${this._indexCapacity}); ${dropped} patch ` +
        'draw(s) were not drawn this frame. The pools grow for the next frame.')
      // The old pools are left to the garbage collector: commands already
      // encoded may still reference them.
      if (pointsNeeded! > this._pointCapacity) {
        while (this._pointCapacity < pointsNeeded!) this._pointCapacity *= 2
        this._points = this._createPool('points', this._pointCapacity * 12, 0)
      }
      if (indicesNeeded! > this._indexCapacity) {
        while (this._indexCapacity < indicesNeeded!) this._indexCapacity *= 2
        this._indices = this._createPool('indices', this._indexCapacity * 4, _GPUBufferUsage.INDEX)
      }
    }, () => readback.destroy())
  }

  /** The bytes of the state header a frame starts with (cursors zero). */
  static readonly stateHeaderBytes = _stateHeaderWords * 4
}
