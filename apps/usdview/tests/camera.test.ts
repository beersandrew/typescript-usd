// Native clean AutoClip=false defaults and overrides, including tiny bounds.
import {expect,it} from 'vitest'
import native from './fixtures/freeCameraClipping/expected.json' with {type:'json'}
import {defaultCamera,fitCameraToBounds,getViewProjection} from '../src/camera'
import {ViewerCameraController} from '../src/viewer-camera'
it('starts with native clean-settings clipping defaults',()=>{
 const c=defaultCamera();expect(native.autoClipDefault).toBe(false);expect(c.near).toBe(native.defaultNear);expect(c.far).toBe(native.defaultFar)
})
for(const n of native.rows)it(`native ${n.name} clipping/framing at aspect${n.aspect}`,()=>{
 const c=defaultCamera();c.azimuth=-n.theta*Math.PI/180;c.elevation=n.phi*Math.PI/180
 fitCameraToBounds(c,n.min as [number,number,number],n.max as [number,number,number])
 const controller=new ViewerCameraController(c,()=>n.aspect);controller.settings({nearOverride:n.nearOverride,farOverride:n.farOverride})
 expect(controller.state().effectiveNear).toBeCloseTo(n.clip[0]!,6);expect(controller.state().effectiveFar).toBeCloseTo(n.clip[1]!,6)
 expect(c.radius).toBeCloseTo(n.dist,6)
 controller.frame().matrix.forEach((v,i)=>expect(v).toBeCloseTo(n.matrix[i]!,5))
 if(n.nearOverride===null&&n.farOverride===null)getViewProjection(c,n.aspect).forEach((v,i)=>expect(v).toBeCloseTo(n.matrix[i]!,5))
})
