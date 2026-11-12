// typescript-usd/glf — the simple lighting types Storm uses.
// Mirrors pxr/imaging/glf (OpenUSD 26.11.1): GlfSimpleLight,
// GlfSimpleLightingContext, GlfSimpleMaterial and the non-OpenGL part of
// GlfSimpleShadowArray. The OpenGL context, diagnostic and info utilities of
// glf are not ported (there is no OpenGL here).

export { GlfSimpleLight as SimpleLight, GlfSimpleLightType as SimpleLightType, type GlfSimpleLightVector as SimpleLightVector } from './simpleLight.ts'
export { GlfSimpleLightingContext as SimpleLightingContext } from './simpleLightingContext.ts'
export { GlfSimpleMaterial as SimpleMaterial } from './simpleMaterial.ts'
export { GlfSimpleShadowArray as SimpleShadowArray } from './simpleShadowArray.ts'
