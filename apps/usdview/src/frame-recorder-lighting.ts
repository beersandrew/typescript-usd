// Ported from OpenUSD 26.11.1: pxr/usdImaging/usdAppUtils/frameRecorder.cpp,
//  pxr/usdImaging/usdviewq/stageView.py
// Copyright 2016, 2019 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// The lighting state usdrecord hands UsdImagingGLEngine: OpenUSD 26.11.1
// pxr/usdImaging/usdAppUtils/frameRecorder.cpp:396-454
// (UsdAppUtilsFrameRecorder::Record). Not the viewer's lighting: the viewer
// follows usdview (stage-view-engine.ts usdviewLights/usdviewMaterial,
// usdviewq/stageView.py:1452-1483), whose camera light has no ambient. This
// is used only when a caller asks the runtime for usdrecord's lighting
// (ViewerRuntime.setLightingSource('frameRecorder')), so that the asset
// acceptance can compare like for like with usdrecord's images.
//
// Differences from usdview's state that remain from upstream:
//  - the camera light carries ambient SCENE_AMBIENT (0.01) where usdview's
//    has (0, 0, 0, 0) (frameRecorder.cpp:442 vs stageView.py:1459-1465);
//  - the default material is always AMBIENT_DEFAULT / SPECULAR_DEFAULT /
//    SHININESS_DEFAULT, whatever usdview's display settings say
//    (frameRecorder.cpp:446-452);
//  - there is no dome light: Record lights only the camera light
//    (frameRecorder.cpp:435-444), whatever the render mode.
import { Vec4f as GfVec4f } from 'typescript-usd/gf'
import { SimpleLight as GlfSimpleLight, SimpleMaterial as GlfSimpleMaterial } from 'typescript-usd/glf'
import type { StormCamera } from './stage-view-engine'

/** frameRecorder.cpp:398-401 */
const SCENE_AMBIENT = () => new GfVec4f(0.01, 0.01, 0.01, 1.0)
const SPECULAR_DEFAULT = () => new GfVec4f(0.1, 0.1, 0.1, 1.0)
const AMBIENT_DEFAULT = () => new GfVec4f(0.2, 0.2, 0.2, 1.0)
const SHININESS_DEFAULT = 32.0

export interface FrameRecorderLightingState {
  lights: GlfSimpleLight[]
  material: GlfSimpleMaterial
  sceneAmbient: GfVec4f
}

/** frameRecorder.cpp:434-454: the lights, material and scene ambient Record
 *  passes to SetLightingState. `camera` is the frame's camera: its eye is
 *  GfFrustum::GetPosition and view.GetInverse() GfFrustum::ComputeViewInverse
 *  of the camera's frustum (window conforming changes neither).
 *  `cameraLightEnabled` is the recorder's SetCameraLightEnabled (usdrecord's
 *  default true, frameRecorder.h). */
export function frameRecorderLightingState(camera: StormCamera, cameraLightEnabled = true): FrameRecorderLightingState {
  const lights: GlfSimpleLight[] = []
  if (cameraLightEnabled) {
    const light = new GlfSimpleLight()
    light.setPosition(new GfVec4f(camera.eye[0], camera.eye[1], camera.eye[2], 1.0))
    light.setTransform(camera.view.getInverse())
    light.setAmbient(SCENE_AMBIENT())
    lights.push(light)
  }
  // "Make default material and lighting match usdview's defaults... we
  // expect GlfSimpleMaterial to go away soon, so not worth refactoring for
  // sharing" (frameRecorder.cpp:446-448).
  const material = new GlfSimpleMaterial()
  material.setAmbient(AMBIENT_DEFAULT())
  material.setSpecular(SPECULAR_DEFAULT())
  material.setShininess(SHININESS_DEFAULT)
  return { lights, material, sceneAmbient: SCENE_AMBIENT() }
}
