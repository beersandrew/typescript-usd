import {describe,expect,it} from 'vitest'
import {viewerDeviceDescriptor,deviceEnvironmentDefaults,gpuSkinningStorageBuffers,browserEnvironmentDefaults} from '../src/gpu-device-settings'
const adapter=(limits:Record<string,unknown>,features:string[]=[])=>({limits,features:new Set(features)}) as unknown as Pick<GPUAdapter,'features'|'limits'>
it('requests the optional features and raised limits HgiWebGPU.Create requests, as the adapter reports them',()=>{
 const source=adapter({maxSampledTexturesPerShaderStage:48,maxStorageBuffersPerShaderStage:31,maxStorageBuffersInFragmentStage:31,maxBufferSize:4294967296,maxComputeWorkgroupSizeX:1024},['float32-filterable','primitive-index','shader-f16'])
 expect(viewerDeviceDescriptor(source)).toEqual({requiredFeatures:['float32-filterable','primitive-index'],requiredLimits:{maxSampledTexturesPerShaderStage:48,maxStorageBuffersPerShaderStage:31,maxStorageBuffersInFragmentStage:31,maxBufferSize:4294967296}})
})
it('never requests an unsupported feature',()=>{
 expect(viewerDeviceDescriptor(adapter({maxSampledTexturesPerShaderStage:16}))).toEqual({requiredFeatures:[],requiredLimits:{maxSampledTexturesPerShaderStage:16}})
})
it('omits unreported or malformed limits rather than requesting an invented capacity',()=>{
 for(const capacity of [undefined,NaN,Infinity,0,-1,18.5])expect(viewerDeviceDescriptor(adapter({maxSampledTexturesPerShaderStage:capacity}))).toEqual({requiredFeatures:[]})
 expect(viewerDeviceDescriptor({} as GPUAdapter)).toEqual({requiredFeatures:[]})
})

// Chrome on macOS: 10 storage buffers per stage, below GPU skinning's 13.
it('skins on the CPU where the device cannot bind GPU skinning\'s storage buffers',()=>{
 expect(deviceEnvironmentDefaults({maxStorageBuffersPerShaderStage:10},{})).toEqual({USDSKELIMAGING_FORCE_CPU_COMPUTE:'1'})
 expect(deviceEnvironmentDefaults({maxStorageBuffersPerShaderStage:gpuSkinningStorageBuffers},{})).toEqual({})
 expect(deviceEnvironmentDefaults({maxStorageBuffersPerShaderStage:44},{})).toEqual({})
})
it('keeps a skinning setting the page set',()=>{
 expect(deviceEnvironmentDefaults({maxStorageBuffersPerShaderStage:10},{USDSKELIMAGING_FORCE_CPU_COMPUTE:'0'})).toEqual({})
})

describe('browserEnvironmentDefaults (PLATFORM-DIVERGENCE(viewer-webkit-alpha-to-coverage))', () => {
 const safari='Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/27.3 Safari/605.1.15'
 const chrome='Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/156.0.0.0 Safari/537.36'
 const firefox='Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:140.0) Gecko/20100101 Firefox/140.0'
 it('turns alpha to coverage off in WebKit only', () => {
  expect(browserEnvironmentDefaults(safari,{})).toEqual({TF_DEBUG:'HDX_DISABLE_ALPHA_TO_COVERAGE'})
  expect(browserEnvironmentDefaults(chrome,{})).toEqual({})
  expect(browserEnvironmentDefaults(firefox,{})).toEqual({})
 })
 it('adds to a page TF_DEBUG and keeps one that names the code', () => {
  expect(browserEnvironmentDefaults(safari,{TF_DEBUG:'HD_RPRIM_ADDED'})).toEqual({TF_DEBUG:'HD_RPRIM_ADDED HDX_DISABLE_ALPHA_TO_COVERAGE'})
  expect(browserEnvironmentDefaults(safari,{TF_DEBUG:'-HDX_DISABLE_ALPHA_TO_COVERAGE'})).toEqual({})
  expect(browserEnvironmentDefaults(safari,{TF_DEBUG:'HDX_DISABLE_ALPHA_TO_COVERAGE'})).toEqual({})
 })
})
