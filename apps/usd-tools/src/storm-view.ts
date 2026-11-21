// A small Storm viewport for the tool pages: one stage drawn by TypeScript
// USD's UsdImagingGLEngine (usdImaging -> Hydra -> hdSt -> hgiWebGPU) into a
// canvas, the way TypeScript usdview drives it (apps/usdview/src/
// stage-view-engine.ts, after OpenUSD's usdviewq/stageView.py). The page
// gives the camera; the view presents the engine's color AOV itself, through
// the canvas's sRGB view, as usdview does (HdxColorCorrectionTask's sRGB and
// HdxPresentTask).
import type { Stage, Prim } from 'typescript-usd/usd'
import { HgiTokens } from 'typescript-usd/hgi'
import { HgiWebGPU, HgiWebGPUGlslShaderBodyTranslator, type HgiWebGPUTexture } from 'typescript-usd/hgiWebGPU'
import { Vec4f, Vec2f, Vec2i, Range2f, Rect2i, Matrix4d } from 'typescript-usd/gf'
import { Framing as CameraUtilFraming, ConformWindowPolicy } from 'typescript-usd/cameraUtil'
import { SimpleLight, SimpleMaterial } from 'typescript-usd/glf'
import type { RenderBuffer as HdStRenderBuffer } from 'typescript-usd/hdSt'
import { _RegisterShaderResources as Hdx_RegisterShaderResources } from 'typescript-usd/hdx'
import { UsdShaders_RegisterShaderNodesAsync } from 'typescript-usd/usdShaders'
import { UsdHydra_RegisterShaderNodesAsync } from 'typescript-usd/usdHydra'
import { Engine, RenderParams, DrawMode, CullStyle } from 'typescript-usd/usdImagingGL'
import { TimeCode } from 'typescript-usd/usd'
import 'typescript-usd/hdSt'
import 'typescript-usd/hdStorm'

/** Row-major 4x4 matrices in USD's row-vector convention. */
export type M4 = number[]

/** The features and limits HgiWebGPU asks for, where the adapter has them
 *  (apps/usdview/src/gpu-device-settings.ts). */
const features = ['float32-filterable', 'depth-clip-control', 'texture-compression-bc', 'rg11b10ufloat-renderable', 'depth32float-stencil8', 'primitive-index', 'clip-distances'] as GPUFeatureName[]
const limits = ['maxBufferSize', 'maxStorageBufferBindingSize', 'maxStorageBuffersPerShaderStage', 'maxSampledTexturesPerShaderStage', 'maxSamplersPerShaderStage', 'maxUniformBufferBindingSize', 'maxInterStageShaderVariables'] as const

const PRESENT = `
@group(0) @binding(0) var source: texture_2d<f32>;
@vertex fn vs(@builtin(vertex_index) i: u32) -> @builtin(position) vec4<f32> {
  let p = array<vec2<f32>, 3>(vec2(-1, -1), vec2(3, -1), vec2(-1, 3));
  return vec4(p[i], 0, 1);
}
@fragment fn fs(@builtin(position) position: vec4<f32>) -> @location(0) vec4<f32> {
  let size = textureDimensions(source);
  let pixel = vec2<i32>(position.xy);
  return textureLoad(source, vec2(pixel.x, i32(size.y) - 1 - pixel.y), 0);
}`

export interface Light { direction?: readonly [number, number, number], camera?: boolean, color: readonly [number, number, number] }

export class StormView {
  readonly canvas: HTMLCanvasElement
  readonly stage: Stage
  readonly #device: GPUDevice
  readonly #context: GPUCanvasContext
  readonly #format: GPUTextureFormat
  readonly #engine: Engine
  readonly #params = new RenderParams()
  readonly #root: Prim
  readonly #present: GPURenderPipeline
  clearColor: readonly [number, number, number] = [0.8, 0.9, 1]
  lights: Light[] = [{ camera: true, color: [1, 1, 1] }]

  static async create(canvas: HTMLCanvasElement, stage: Stage): Promise<StormView> {
    if (!navigator.gpu) throw new Error('This browser has no WebGPU.')
    const adapter = await navigator.gpu.requestAdapter()
    if (!adapter) throw new Error('No WebGPU adapter.')
    const requiredLimits: Record<string, number> = {}
    for (const name of limits) { const value = (adapter.limits as unknown as Record<string, unknown>)[name]; if (typeof value === 'number' && value > 0) requiredLimits[name] = value }
    const device = await adapter.requestDevice({ requiredFeatures: features.filter(feature => adapter.features.has(feature)), requiredLimits })
    // One-time registration the imaging plugins do as they load.
    Hdx_RegisterShaderResources()
    await UsdShaders_RegisterShaderNodesAsync()
    await UsdHydra_RegisterShaderNodesAsync()
    return new StormView(canvas, stage, device)
  }

  private constructor(canvas: HTMLCanvasElement, stage: Stage, device: GPUDevice) {
    this.canvas = canvas
    this.stage = stage
    this.#device = device
    const context = canvas.getContext('webgpu')
    if (!context) throw new Error('No WebGPU canvas.')
    this.#context = context
    const base = navigator.gpu.getPreferredCanvasFormat()
    this.#format = `${base}-srgb` as GPUTextureFormat
    context.configure({ device, format: base, viewFormats: [this.#format], alphaMode: 'opaque' })
    const hgi = new HgiWebGPU(device)
    hgi.setShaderBodyTranslator(HgiWebGPUGlslShaderBodyTranslator)
    this.#engine = new Engine({ driver: { name: HgiTokens.renderDriver, driver: hgi } })
    this.#engine.setRendererAov('color')
    this.#engine.setEnablePresentation(false)
    this.#root = stage.getPrim('/')!
    const p = this.#params
    p.frame = TimeCode.Default()
    p.drawMode = DrawMode.DRAW_SHADED_FLAT
    p.cullStyle = CullStyle.CULL_STYLE_NOTHING
    p.gammaCorrectColors = false
    p.enableSampleAlphaToCoverage = false
    p.enableSceneMaterials = true
    p.enableSceneLights = false
    const module = device.createShaderModule({ label: 'usd-tools present', code: PRESENT })
    this.#present = device.createRenderPipeline({ label: 'usd-tools present', layout: 'auto',
      vertex: { module, entryPoint: 'vs' }, fragment: { module, entryPoint: 'fs', targets: [{ format: this.#format }] },
      primitive: { topology: 'triangle-list' } })
  }

  /** Draws the stage with the camera `view` (world to eye) and `projection`
   *  (OpenGL clip space, as Hydra takes it). */
  render(view: M4, projection: M4, eye: readonly [number, number, number]): void {
    const width = Math.max(1, this.canvas.width), height = Math.max(1, this.canvas.height)
    const engine = this.#engine
    engine.setRenderBufferSize(new Vec2i(width, height))
    engine.setFraming(new CameraUtilFraming(new Range2f(new Vec2f(0, 0), new Vec2f(width, height)), new Rect2i(new Vec2i(0, 0), width, height)))
    engine.setOverrideWindowPolicy(ConformWindowPolicy.CameraUtilMatchVertically)
    const viewMatrix = new Matrix4d(...view), projectionMatrix = new Matrix4d(...projection)
    engine.setCameraState(viewMatrix, projectionMatrix)
    const lights = this.lights.map(light => {
      const l = new SimpleLight()
      l.setAmbient(new Vec4f(0, 0, 0, 0))
      l.setDiffuse(new Vec4f(...light.color, 1))
      l.setSpecular(new Vec4f(0.15, 0.15, 0.15, 1))
      if (light.camera) {
        l.setPosition(new Vec4f(eye[0], eye[1], eye[2], 1))
        l.setTransform(viewMatrix.getInverse())
      } else {
        const d = light.direction!
        l.setPosition(new Vec4f(d[0], d[1], d[2], 0))
      }
      return l
    })
    const material = new SimpleMaterial()
    material.setAmbient(new Vec4f(0.12, 0.12, 0.12, 1))
    material.setSpecular(new Vec4f(0.05, 0.05, 0.05, 1))
    material.setShininess(16)
    engine.setLightingState(lights, material, new Vec4f(0.15, 0.15, 0.17, 1))
    this.#params.clearColor = new Vec4f(...this.clearColor, 1)
    engine.Render(this.#root, this.#params)
    const buffer = engine.getAovRenderBuffer('color') as HdStRenderBuffer | null
    const color = (buffer?.getResource(false)?.Get() as HgiWebGPUTexture | undefined)?.getTextureId()
    if (!color) return
    const bindGroup = this.#device.createBindGroup({ layout: this.#present.getBindGroupLayout(0), entries: [{ binding: 0, resource: color.createView() }] })
    const encoder = this.#device.createCommandEncoder({ label: 'usd-tools present' })
    const pass = encoder.beginRenderPass({ colorAttachments: [{ view: this.#context.getCurrentTexture().createView({ format: this.#format }), loadOp: 'clear', storeOp: 'store' }] })
    pass.setPipeline(this.#present)
    pass.setBindGroup(0, bindGroup)
    pass.draw(3)
    pass.end()
    this.#device.queue.submit([encoder.finish()])
  }

  destroy(): void {
    this.#engine.destroy()
    this.#context.unconfigure()
    this.#device.destroy()
  }
}

// ------------------------------------------------------------ camera math

type V3 = readonly [number, number, number]
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
const norm = (a: V3): V3 => { const l = Math.hypot(...a) || 1; return [a[0] / l, a[1] / l, a[2] / l] }
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]

/** World to eye for an eye at `eye` looking at `target` (Y up). */
export function lookAt(eye: V3, target: V3): M4 {
  const back = norm(sub(eye, target))
  const right = norm(cross([0, 1, 0], back))
  const up = cross(back, right)
  return [right[0], up[0], back[0], 0, right[1], up[1], back[1], 0, right[2], up[2], back[2], 0,
    -dot(right, eye), -dot(up, eye), -dot(back, eye), 1]
}

/** GfFrustum::ComputeProjectionMatrix for a perspective frustum, in
 *  row-vector form. */
export function perspective(fovY: number, aspect: number, near: number, far: number): M4 {
  const t = 1 / Math.tan(fovY * Math.PI / 360)
  return [t / aspect, 0, 0, 0, 0, t, 0, 0, 0, 0, -(far + near) / (far - near), -1, 0, 0, -2 * far * near / (far - near), 0]
}

/** `point` through view and projection to canvas pixels (top-left origin). */
export function project(point: V3, view: M4, projection: M4, width: number, height: number): [number, number] {
  const row = (p: readonly number[], m: M4) => [0, 1, 2, 3].map(c => p[0]! * m[c]! + p[1]! * m[4 + c]! + p[2]! * m[8 + c]! + p[3]! * m[12 + c]!)
  const clip = row(row([...point, 1], view), projection)
  const w = clip[3]!
  return [(clip[0]! / w * 0.5 + 0.5) * width, (1 - (clip[1]! / w * 0.5 + 0.5)) * height]
}
