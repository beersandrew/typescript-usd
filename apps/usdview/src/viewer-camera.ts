// Portions ported from OpenUSD 26.11.1, including:
//  pxr/usdImaging/usdviewq/stageView.py,
//  pxr/usdImaging/usdviewq/adjustFreeCamera.py,
//  pxr/usdImaging/usdviewq/appController.py
// Copyright 2016, 2021 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

import {defaultCameraPresentation,cameraFitsViewport,mergeCameraPresentation,type CameraPresentationSettings} from './camera-presentation'
import type { Stage } from 'typescript-usd/usd'
import * as usd from 'typescript-usd'
import { Camera, Imageable, XformCache, computeProjectionMatrix } from 'typescript-usd/usdGeom'
import { GfCamera, GfRange1f, GfMatrix4d } from 'typescript-usd/gf/camera'
import type { Frustum as GfFrustum } from 'typescript-usd/gf'
import type { FreeCameraSettings, ViewerCameraState } from './contracts'
import { DEFAULT_NEAR,DEFAULT_FAR,getCameraBasis, getEyePosition, getViewMatrix, pullFromCameraTransform, type OrbitCamera } from './camera'

export interface CameraFrame {
  /** View-projection for the viewer's own WebGPU overlays (WebGPU depth range). */
  matrix: Float32Array<ArrayBuffer>; eye: [number,number,number]; forward: [number,number,number]
  /** World to view and GfFrustum::ComputeProjectionMatrix (OpenGL depth range), as Hydra takes them. */
  view: GfMatrix4d; projection: GfMatrix4d
  /** The resolved camera's GfFrustum (stageView.py:1277-1316 resolveCamera), for picking. */
  frustum: GfFrustum
}
/** Consumer counterpart of usdviewq/stageView.py:1277 resolveCamera and
 * adjustFreeCamera.py:69-120 overrides. It never authors camera properties. */
export class ViewerCameraController {
  stage: Stage | undefined
  time = 0
  presentation=defaultCameraPresentation()
  presentationSettings(patch:Partial<CameraPresentationSettings>):ViewerCameraState {this.presentation=mergeCameraPresentation(this.presentation,patch);return this.state()}
  cameraAspect():number|null {const path=this.activeCameraPath;if(!path)return this.free.aspectRatio;const {value}=this.authored(path);return value.horizontalAperture/value.verticalAperture}
  activeCameraPath: string | null = null
  readonly free: FreeCameraSettings = { fovDegrees: 60, aspectRatio: null, nearOverride: null, farOverride: null }
  constructor(readonly orbit: OrbitCamera, private aspect: () => number) {}
  copyViewState(){return {orbit:structuredClone(this.orbit),free:{...this.free},activeCameraPath:this.activeCameraPath}}
  restoreViewState(state:ReturnType<ViewerCameraController['copyViewState']>){
    for(const key of Object.keys(this.orbit))delete (this.orbit as unknown as Record<string,unknown>)[key]
    Object.assign(this.orbit,structuredClone(state.orbit));Object.assign(this.free,state.free);this.activeCameraPath=state.activeCameraPath
  }
  /** stageView.py:934-992: active camera excluded; frustum edges only. */
  guides():Float32Array<ArrayBuffer>{
    const vertices:number[]=[],indices=[0,1,1,3,3,2,2,0,4,5,5,7,7,6,6,4,3,7,0,4,1,5,2,6]
    for(const path of this.stage?.traverse()??[]){
      if(path===this.activeCameraPath||!this.stage!.getPrim(path)?.isA(Camera.typeName))continue
      // appController.py:3038-3047 collects guide-visible cameras at default time.
      if(Imageable.computeEffectiveVisibility(this.stage!,path,'guide')==='invisible')continue
      const points=this.authored(path).gf.getFrustum().computeCorners()
      for(const i of indices)vertices.push(...points[i]!.data)
    }
    return new Float32Array(vertices)
  }
  state(): ViewerCameraState {
    const authored = this.activeCameraPath && this.stage?.getPrim(this.activeCameraPath)
    const clip = authored ? Camera.getCamera(authored,this.time).clippingRange : this.clipping()
    // appController.py:3034-3036 lists Utils._GetAllPrimsOfType(stage, UsdGeom.Camera):
    // utils.cpp:26-35 keeps stage->Traverse() order and prim.IsA(schemaType), so
    // derived camera schemas are included. Menu labels are prim names (appController.py:3094).
    return { cameras: this.stage ? [...usd.Stage.fromCore(this.stage).traverse()].filter(prim=>prim.isA(Camera.typeName)).map(({path})=>({path,label:path.slice(path.lastIndexOf('/')+1)})) : [],
      presentation:mergeCameraPresentation(this.presentation,{}),activeCameraPath:this.activeCameraPath,free:{...this.free},effectiveNear:clip[0],effectiveFar:clip[1] }
  }
  /** Frame/reset operations may change automatic clipping. Reject an invalid
   * override combination before replacing the last valid camera state. */
  transaction(change: () => void): void {
    const previous = { ...this.orbit, target: [...this.orbit.target] as [number,number,number] }
    const free = { ...this.free }, active = this.activeCameraPath
    try { change(); this.frame() }
    catch (error) {
      delete this.orbit.roll; delete this.orbit.orthographicHeight; delete this.orbit.apertureOffset
      Object.assign(this.orbit,previous);Object.assign(this.free,free);this.activeCameraPath=active
      throw error
    }
  }
  clipping(): [number,number] { return [this.free.nearOverride ?? this.orbit.near,this.free.farOverride ?? this.orbit.far] }
  settings(patch: Partial<FreeCameraSettings>): ViewerCameraState {
    const next = {...this.free,...patch}
    if (!Number.isFinite(next.fovDegrees) || next.fovDegrees <= 0 || next.fovDegrees >= 180) throw new Error('Field of view must be between 0 and 180 degrees.')
    if (next.aspectRatio !== null && (!Number.isFinite(next.aspectRatio) || next.aspectRatio <= 0)) throw new Error('Aspect ratio must be positive.')
    const near=next.nearOverride ?? this.orbit.near, far=next.farOverride ?? this.orbit.far
    if (!Number.isFinite(near) || !Number.isFinite(far) || near <= 0 || far <= near) throw new Error('Clipping requires 0 < near < far.')
    Object.assign(this.free,next)
    // viewSettingsDataModel.py:426-431: locking the free aspect enables Full mask.
    if(patch.aspectRatio !== undefined && patch.aspectRatio !== null&&this.presentation.cameraMaskMode==='none')this.presentation.cameraMaskMode='full'
    this.orbit.fovY = next.fovDegrees*Math.PI/180
    if (patch.fovDegrees !== undefined) { delete this.orbit.orthographicHeight; delete this.orbit.apertureOffset }
    return this.state()
  }
  select(path: string|null): ViewerCameraState {
    if (path !== null) {
      if (!this.stage || usd.Stage.fromCore(this.stage).prim(path)?.typeName !== 'Camera') throw new Error(`Not a camera: ${path}`)
      this.authored(path) // Validate before replacing the current view.
      this.activeCameraPath = path
    } else this.toFree()
    return this.state()
  }
  reset(): void {
    this.activeCameraPath=null
    delete this.orbit.roll; delete this.orbit.orthographicHeight; delete this.orbit.apertureOffset
    this.orbit.azimuth=0;this.orbit.elevation=0
  }
  /** stageView.py:1753-1780 copies the resolved camera to a free camera,
   * retaining authored roll, orthographic aperture and lens shift. */
  toFree(): void {
    if (!this.activeCameraPath) return
    const authored=this.authored(this.activeCameraPath),world=authored.world
    // stageView.py:1753-1780 copies the last resolved camera. An unlocked free
    // camera adopts its conformed apertures; an aspect lock restores the
    // original camera aperture ratio. FromGfCamera starts with default clips.
    const locked=this.free.aspectRatio!==null
    const value=locked||this.presentation.cameraMaskMode==='full'?authored.value:conform(authored.value,this.aspect(),cameraFitsViewport(this.presentation))
    const m = Array.from(world.GetArray()), radius = value.focusDistance > 0 ? value.focusDistance : Math.max(this.orbit.radius,1)
    pullFromCameraTransform(this.orbit,m,radius)
    this.orbit.near=DEFAULT_NEAR;this.orbit.far=DEFAULT_FAR
    this.free.nearOverride=null;this.free.farOverride=null
    this.free.aspectRatio=locked?value.horizontalAperture/value.verticalAperture:null
    this.orbit.apertureOffset=[value.horizontalApertureOffset/value.verticalAperture,value.verticalApertureOffset/value.verticalAperture]
    if (value.projection==='orthographic') this.orbit.orthographicHeight=value.verticalAperture*.1
    else delete this.orbit.orthographicHeight
    this.orbit.fovY=value.projection==='perspective' ? 2*Math.atan(value.verticalAperture/(2*value.focalLength)) : Math.PI/3
    this.free.fovDegrees=this.orbit.fovY*180/Math.PI
    this.activeCameraPath=null
  }
  frame(): CameraFrame {
    const path=this.activeCameraPath
    if (path) {
      const {value,world}=this.authored(path), m=world.GetArray()
      const conformed=conform(value,this.aspect(),cameraFitsViewport(this.presentation)),view=world.getInverse(),frustum=gfFrustum(world,conformed)
      return {matrix: pack(view,computeProjectionMatrix(conformed)),eye:[m[12]!,m[13]!,m[14]!],forward:[-m[8]!,-m[9]!,-m[10]!],view,projection:frustum.computeProjectionMatrix(),frustum}
    }
    const [near,far]=this.clipping()
    if (!Number.isFinite(near)||!Number.isFinite(far)||near<=0||far<=near) throw new Error('Clipping requires 0 < near < far. Reset the clipping overrides for this scene.')
    const vertical=this.orbit.orthographicHeight !== undefined ? this.orbit.orthographicHeight*10 : 2*50*Math.tan(this.orbit.fovY/2)
    const value={projection:this.orbit.orthographicHeight !== undefined ? 'orthographic' as const : 'perspective' as const,
      horizontalAperture:vertical*(this.free.aspectRatio ?? this.aspect()),verticalAperture:vertical,
      horizontalApertureOffset:(this.orbit.apertureOffset?.[0] ?? 0)*vertical,verticalApertureOffset:(this.orbit.apertureOffset?.[1] ?? 0)*vertical,
      focalLength:50,clippingRange:this.clipping(),fStop:0,focusDistance:this.orbit.radius}
    const conformed=conform(value,this.aspect(),this.free.aspectRatio!==null&&cameraFitsViewport(this.presentation)),view=new GfMatrix4d(...getViewMatrix(this.orbit)),frustum=gfFrustum(view.getInverse(),conformed)
    return {matrix:pack(view,computeProjectionMatrix(conformed)),eye:getEyePosition(this.orbit),forward:getCameraBasis(this.orbit).forward,view,projection:frustum.computeProjectionMatrix(),frustum}
  }
  private authored(path:string) {
    const value=Camera.getCamera(this.stage!.getPrim(path)!,this.time)
    if (![value.horizontalAperture,value.verticalAperture,value.focalLength,...value.clippingRange].every(Number.isFinite) || value.horizontalAperture<=0 || value.verticalAperture<=0 || value.focalLength<=0 || value.clippingRange[0]<=0 || value.clippingRange[1]<=value.clippingRange[0]) throw new Error(`Camera ${path} has invalid aperture, focal length or clipping range.`)
    const transform=new GfMatrix4d(...new XformCache(this.stage!,this.time).getLocalToWorldTransform(path))
    // GfFrustum extracts a rigid viewing transform from the USD world transform.
    // Use that same mechanism (rather than inverting authored scale/shear).
    const gf=new GfCamera(transform,value.projection==='orthographic'?GfCamera.Orthographic:GfCamera.Perspective,value.horizontalAperture,value.verticalAperture,value.horizontalApertureOffset,value.verticalApertureOffset,value.focalLength,new GfRange1f(...value.clippingRange))
    const world=gf.getFrustum().computeViewMatrix().getInverse()
    return {value,world,gf}
  }
}
// CameraUtil::ConformWindow Fit (conformWindow.cpp). Expand one aperture;
// retain lens shifts. Unlocked free cameras use MatchVertically instead.
function conform<T extends {horizontalAperture:number;verticalAperture:number}>(camera:T,aspect:number,fit:boolean):T {
  const result={...camera}
  if (fit && camera.horizontalAperture/camera.verticalAperture > aspect) result.verticalAperture=camera.horizontalAperture/aspect
  else result.horizontalAperture=camera.verticalAperture*aspect
  return result
}
/** GfCamera::GetFrustum() of a conformed camera at a camera-to-world transform. */
function gfFrustum(transform:GfMatrix4d,c:{projection:'perspective'|'orthographic',horizontalAperture:number,verticalAperture:number,horizontalApertureOffset:number,verticalApertureOffset:number,focalLength:number,clippingRange:readonly [number,number]}):GfFrustum{
  return new GfCamera(transform,c.projection==='orthographic'?GfCamera.Orthographic:GfCamera.Perspective,c.horizontalAperture,c.verticalAperture,c.horizontalApertureOffset,c.verticalApertureOffset,c.focalLength,new GfRange1f(c.clippingRange[0],c.clippingRange[1])).getFrustum()
}
function pack(view:GfMatrix4d,projection:readonly number[]):Float32Array<ArrayBuffer> {
  const matrix=view.getMultiply(new GfMatrix4d(...projection)).getTranspose().GetArray()
  return new Float32Array(matrix)
}
