
// //////// Codegen Defines //////// 
#define HD_SHADER_API 3
#define MAT4 mat4
#define HD_USE_HARDWARE_CLIPPING
// Alias hgi vec and matrix types to hd.
#define hd_ivec3 hgi_ivec3
#define hd_vec3 hgi_vec3
#define hd_dvec3 hgi_dvec3
#define hd_mat3 hgi_mat3
#define hd_dmat3 hgi_dmat3

ivec3 hd_ivec3_get(hd_ivec3 v) { return ivec3(v.x, v.y, v.z); }
ivec3 hd_ivec3_get(ivec3 v)    { return v; }
vec3  hd_vec3_get(hd_vec3 v)   { return vec3(v.x, v.y, v.z); }
vec3  hd_vec3_get(vec3 v)      { return v; }
dvec3 hd_dvec3_get(hd_dvec3 v) { return dvec3(v.x, v.y, v.z); }
dvec3 hd_dvec3_get(dvec3 v)    { return v; }
mat3  hd_mat3_get(hd_mat3 v)   { return mat3(v.m00, v.m01, v.m02,
                                             v.m10, v.m11, v.m12,
                                             v.m20, v.m21, v.m22); }
mat3  hd_mat3_get(mat3 v)      { return v; }
dmat3 hd_dmat3_get(hd_dmat3 v) { return dmat3(v.m00, v.m01, v.m02,
                                              v.m10, v.m11, v.m12,
                                              v.m20, v.m21, v.m22); }
dmat3 hd_dmat3_get(dmat3 v)    { return v; }
hd_ivec3 hd_ivec3_set(hd_ivec3 v) { return v; }
hd_ivec3 hd_ivec3_set(ivec3 v)    { return hd_ivec3(v.x, v.y, v.z); }
hd_vec3 hd_vec3_set(hd_vec3 v)    { return v; }
hd_vec3 hd_vec3_set(vec3 v)       { return hd_vec3(v.x, v.y, v.z); }
hd_dvec3 hd_dvec3_set(hd_dvec3 v) { return v; }
hd_dvec3 hd_dvec3_set(dvec3 v)    { return hd_dvec3(v.x, v.y, v.z); }
hd_mat3  hd_mat3_set(hd_mat3 v)   { return v; }
hd_mat3  hd_mat3_set(mat3 v)      { return hd_mat3(v[0][0], v[0][1], v[0][2],
                                                   v[1][0], v[1][1], v[1][2],
                                                   v[2][0], v[2][1], v[2][2]); }
hd_dmat3 hd_dmat3_set(hd_dmat3 v) { return v; }
hd_dmat3 hd_dmat3_set(dmat3 v)    { return hd_dmat3(v[0][0], v[0][1], v[0][2],
                                                    v[1][0], v[1][1], v[1][2],
                                                    v[2][0], v[2][1], v[2][2]); }
int hd_int_get(int v)          { return v; }
int hd_int_get(ivec2 v)        { return v.x; }
int hd_int_get(ivec3 v)        { return v.x; }
int hd_int_get(ivec4 v)        { return v.x; }
vec3 hd_sample_udim(vec2 v) {
vec2 vf = floor(v);
return vec3(v.x - vf.x, v.y - vf.y, clamp(vf.x, 0.0, 10.0) + 10.0 * vf.y);
}
vec4 hd_vec4_2_10_10_10_get(int v) {
    ivec4 unpacked = ivec4((v & 0x3ff) << 22, (v & 0xffc00) << 12,
                           (v & 0x3ff00000) << 2, (v & 0xc0000000));
    return vec4(unpacked) / 2147483647.0; }
int hd_vec4_2_10_10_10_set(vec4 v) {
    return ( (int(v.x * 511.0) & 0x3ff) |
            ((int(v.y * 511.0) & 0x3ff) << 10) |
            ((int(v.z * 511.0) & 0x3ff) << 20) |
            ((int(v.w) & 0x1) << 30)); }
vec2 hd_half2_get(uint v) {
    return unpackHalf2x16(v); }
uint hd_half2_set(vec2 v) {
    return packHalf2x16(v); }
vec4 hd_half4_get(uvec2 v) {
    return vec4(unpackHalf2x16(v.x), unpackHalf2x16(v.y)); }
uvec2 hd_half4_set(vec4 v) {
    return uvec2(packHalf2x16(v.xy), packHalf2x16(v.zw)); }
#define HD_HAS_worldToViewMatrix 1
#define HD_HAS_worldToViewInverseMatrix 1
#define HD_HAS_projectionMatrix 1
#define HD_HAS_projectionInverseMatrix 1
#define HD_HAS_imageToWorldMatrix 1
#define HD_HAS_imageToHorizontallyNormalizedFilmback 1
#define HD_HAS_overrideColor 1
#define HD_HAS_wireframeColor 1
#define HD_HAS_maskColor 1
#define HD_HAS_indicatorColor 1
#define HD_HAS_pointColor 1
#define HD_HAS_pointSize 1
#define HD_HAS_pointSelectedSize 1
#define HD_HAS_lightingBlendAmount 1
#define HD_HAS_linearExposure 1
#define HD_HAS_stepSize 1
#define HD_HAS_stepSizeLighting 1
#define HD_HAS_multisampleCount 1
#define HD_HAS_alphaThreshold 1
#define HD_HAS_tessLevel 1
#define HD_HAS_viewport 1
#define HD_HAS_numClipPlanes 1
#define HD_HAS_clipPlanes 1
#define HD_NUM_clipPlanes 4
#define HD_NUM_PRIMITIVE_VERTS 3
#define HD_HAS_transform 1
#define HD_HAS_transformInverse 1
#define HD_HAS_bboxLocalMin 1
#define HD_HAS_bboxLocalMax 1
#define HD_HAS_primID 1
#define HD_HAS_displayColor 1
#define HD_HAS_displayOpacity 1
#define HD_INSTANCER_NUM_LEVELS 0
#define HD_INSTANCE_INDEX_WIDTH 1
#define HD_HAS_points 1

// //////// Codegen Decl //////// 
struct CustomBlockData1033 {
  mat4 worldToViewMatrix;
  mat4 worldToViewInverseMatrix;
  mat4 projectionMatrix;
  mat4 projectionInverseMatrix;
  mat4 imageToWorldMatrix;
  vec4 imageToHorizontallyNormalizedFilmback;
  vec4 overrideColor;
  vec4 wireframeColor;
  vec4 maskColor;
  vec4 indicatorColor;
  vec4 pointColor;
  float pointSize;
  float pointSelectedSize;
  float lightingBlendAmount;
  float linearExposure;
  float stepSize;
  float stepSizeLighting;
  uint multisampleCount;
  float alphaThreshold;
  float tessLevel;
  vec4 viewport;
  uint numClipPlanes;
  vec4 clipPlanes[4];
};
struct hd_drawingCoord {                       
  int modelCoord;
  int constantCoord;
  int elementCoord;
  int primitiveCoord;
  int fvarCoord;
  int shaderCoord;
  int vertexCoord;
  int topologyVisibilityCoord;
  int varyingCoord;
  int instanceIndex[HD_INSTANCE_INDEX_WIDTH];
  int instanceCoords[HD_INSTANCE_INDEX_WIDTH];
};
FORWARD_DECL(hd_drawingCoord GetDrawingCoord());
FORWARD_DECL(int HgiGetBaseVertex());
struct hd_instanceIndex { int indices[HD_INSTANCE_INDEX_WIDTH]; };
struct ConstantData7 {
  mat4 transform;
  mat4 transformInverse;
  vec4 bboxLocalMin;
  vec4 bboxLocalMax;
  int primID;
  vec3 displayColor;
  float displayOpacity;
};
FORWARD_DECL(int GetElementID());
FORWARD_DECL(int GetAggregatedElementID());
FORWARD_DECL(int GetPrimitiveEdgeId());
FORWARD_DECL(float GetSelectedEdgeOpacity());
vec4 InterpolatePatchCoord(vec2 uv, ivec3 patchParam)
{
    // add 0.5 to integer values for more robust interpolation
    return vec4(uv.x, uv.y, 0, patchParam.x+0.5f);
}
vec4 InterpolatePatchCoordTriangle(vec2 uv, ivec3 patchParam)
{
    return InterpolatePatchCoord(uv, patchParam);
}

// //////// Codegen Accessors //////// 
mat4 HdGet_worldToViewMatrix(int localIndex) { return mat4(renderPassState.worldToViewMatrix);}
mat4 HdGet_worldToViewMatrix() { return HdGet_worldToViewMatrix(0); }
mat4 HdGet_worldToViewInverseMatrix(int localIndex) { return mat4(renderPassState.worldToViewInverseMatrix);}
mat4 HdGet_worldToViewInverseMatrix() { return HdGet_worldToViewInverseMatrix(0); }
mat4 HdGet_projectionMatrix(int localIndex) { return mat4(renderPassState.projectionMatrix);}
mat4 HdGet_projectionMatrix() { return HdGet_projectionMatrix(0); }
mat4 HdGet_projectionInverseMatrix(int localIndex) { return mat4(renderPassState.projectionInverseMatrix);}
mat4 HdGet_projectionInverseMatrix() { return HdGet_projectionInverseMatrix(0); }
mat4 HdGet_imageToWorldMatrix(int localIndex) { return mat4(renderPassState.imageToWorldMatrix);}
mat4 HdGet_imageToWorldMatrix() { return HdGet_imageToWorldMatrix(0); }
vec4 HdGet_imageToHorizontallyNormalizedFilmback(int localIndex) { return vec4(renderPassState.imageToHorizontallyNormalizedFilmback);}
vec4 HdGet_imageToHorizontallyNormalizedFilmback() { return HdGet_imageToHorizontallyNormalizedFilmback(0); }
float HdGetScalar_imageToHorizontallyNormalizedFilmback(int localIndex) { return HdGet_imageToHorizontallyNormalizedFilmback(localIndex).x; }
float HdGetScalar_imageToHorizontallyNormalizedFilmback() { return HdGet_imageToHorizontallyNormalizedFilmback(0).x; }
vec4 HdGet_overrideColor(int localIndex) { return vec4(renderPassState.overrideColor);}
vec4 HdGet_overrideColor() { return HdGet_overrideColor(0); }
float HdGetScalar_overrideColor(int localIndex) { return HdGet_overrideColor(localIndex).x; }
float HdGetScalar_overrideColor() { return HdGet_overrideColor(0).x; }
vec4 HdGet_wireframeColor(int localIndex) { return vec4(renderPassState.wireframeColor);}
vec4 HdGet_wireframeColor() { return HdGet_wireframeColor(0); }
float HdGetScalar_wireframeColor(int localIndex) { return HdGet_wireframeColor(localIndex).x; }
float HdGetScalar_wireframeColor() { return HdGet_wireframeColor(0).x; }
vec4 HdGet_maskColor(int localIndex) { return vec4(renderPassState.maskColor);}
vec4 HdGet_maskColor() { return HdGet_maskColor(0); }
float HdGetScalar_maskColor(int localIndex) { return HdGet_maskColor(localIndex).x; }
float HdGetScalar_maskColor() { return HdGet_maskColor(0).x; }
vec4 HdGet_indicatorColor(int localIndex) { return vec4(renderPassState.indicatorColor);}
vec4 HdGet_indicatorColor() { return HdGet_indicatorColor(0); }
float HdGetScalar_indicatorColor(int localIndex) { return HdGet_indicatorColor(localIndex).x; }
float HdGetScalar_indicatorColor() { return HdGet_indicatorColor(0).x; }
vec4 HdGet_pointColor(int localIndex) { return vec4(renderPassState.pointColor);}
vec4 HdGet_pointColor() { return HdGet_pointColor(0); }
float HdGetScalar_pointColor(int localIndex) { return HdGet_pointColor(localIndex).x; }
float HdGetScalar_pointColor() { return HdGet_pointColor(0).x; }
float HdGet_pointSize(int localIndex) { return float(renderPassState.pointSize);}
float HdGet_pointSize() { return HdGet_pointSize(0); }
float HdGetScalar_pointSize(int localIndex) { return HdGet_pointSize(localIndex); }
float HdGetScalar_pointSize() { return HdGet_pointSize(0); }
float HdGet_pointSelectedSize(int localIndex) { return float(renderPassState.pointSelectedSize);}
float HdGet_pointSelectedSize() { return HdGet_pointSelectedSize(0); }
float HdGetScalar_pointSelectedSize(int localIndex) { return HdGet_pointSelectedSize(localIndex); }
float HdGetScalar_pointSelectedSize() { return HdGet_pointSelectedSize(0); }
float HdGet_lightingBlendAmount(int localIndex) { return float(renderPassState.lightingBlendAmount);}
float HdGet_lightingBlendAmount() { return HdGet_lightingBlendAmount(0); }
float HdGetScalar_lightingBlendAmount(int localIndex) { return HdGet_lightingBlendAmount(localIndex); }
float HdGetScalar_lightingBlendAmount() { return HdGet_lightingBlendAmount(0); }
float HdGet_linearExposure(int localIndex) { return float(renderPassState.linearExposure);}
float HdGet_linearExposure() { return HdGet_linearExposure(0); }
float HdGetScalar_linearExposure(int localIndex) { return HdGet_linearExposure(localIndex); }
float HdGetScalar_linearExposure() { return HdGet_linearExposure(0); }
float HdGet_stepSize(int localIndex) { return float(renderPassState.stepSize);}
float HdGet_stepSize() { return HdGet_stepSize(0); }
float HdGetScalar_stepSize(int localIndex) { return HdGet_stepSize(localIndex); }
float HdGetScalar_stepSize() { return HdGet_stepSize(0); }
float HdGet_stepSizeLighting(int localIndex) { return float(renderPassState.stepSizeLighting);}
float HdGet_stepSizeLighting() { return HdGet_stepSizeLighting(0); }
float HdGetScalar_stepSizeLighting(int localIndex) { return HdGet_stepSizeLighting(localIndex); }
float HdGetScalar_stepSizeLighting() { return HdGet_stepSizeLighting(0); }
uint HdGet_multisampleCount(int localIndex) { return uint(renderPassState.multisampleCount);}
uint HdGet_multisampleCount() { return HdGet_multisampleCount(0); }
uint HdGetScalar_multisampleCount(int localIndex) { return HdGet_multisampleCount(localIndex); }
uint HdGetScalar_multisampleCount() { return HdGet_multisampleCount(0); }
float HdGet_alphaThreshold(int localIndex) { return float(renderPassState.alphaThreshold);}
float HdGet_alphaThreshold() { return HdGet_alphaThreshold(0); }
float HdGetScalar_alphaThreshold(int localIndex) { return HdGet_alphaThreshold(localIndex); }
float HdGetScalar_alphaThreshold() { return HdGet_alphaThreshold(0); }
float HdGet_tessLevel(int localIndex) { return float(renderPassState.tessLevel);}
float HdGet_tessLevel() { return HdGet_tessLevel(0); }
float HdGetScalar_tessLevel(int localIndex) { return HdGet_tessLevel(localIndex); }
float HdGetScalar_tessLevel() { return HdGet_tessLevel(0); }
vec4 HdGet_viewport(int localIndex) { return vec4(renderPassState.viewport);}
vec4 HdGet_viewport() { return HdGet_viewport(0); }
float HdGetScalar_viewport(int localIndex) { return HdGet_viewport(localIndex).x; }
float HdGetScalar_viewport() { return HdGet_viewport(0).x; }
uint HdGet_numClipPlanes(int localIndex) { return uint(renderPassState.numClipPlanes);}
uint HdGet_numClipPlanes() { return HdGet_numClipPlanes(0); }
uint HdGetScalar_numClipPlanes(int localIndex) { return HdGet_numClipPlanes(localIndex); }
uint HdGetScalar_numClipPlanes() { return HdGet_numClipPlanes(0); }
vec4 HdGet_clipPlanes(int arrayIndex, int localIndex) { return vec4(renderPassState.clipPlanes[arrayIndex]);}
vec4 HdGet_clipPlanes(int arrayIndex) { return HdGet_clipPlanes(arrayIndex, 0); }
float HdGetScalar_clipPlanes(int localIndex) { return HdGet_clipPlanes(localIndex).x; }
float HdGetScalar_clipPlanes() { return HdGet_clipPlanes(0).x; }
mat4 HdGet_transform(int localIndex) {
  int index = GetDrawingCoord().constantCoord;
  return mat4(constantPrimvars[index].transform);
}
mat4 HdGet_transform() { return HdGet_transform(0); }
mat4 HdGet_transformInverse(int localIndex) {
  int index = GetDrawingCoord().constantCoord;
  return mat4(constantPrimvars[index].transformInverse);
}
mat4 HdGet_transformInverse() { return HdGet_transformInverse(0); }
vec4 HdGet_bboxLocalMin(int localIndex) {
  int index = GetDrawingCoord().constantCoord;
  return vec4(constantPrimvars[index].bboxLocalMin);
}
vec4 HdGet_bboxLocalMin() { return HdGet_bboxLocalMin(0); }
float HdGetScalar_bboxLocalMin(int localIndex) { return HdGet_bboxLocalMin(localIndex).x; }
float HdGetScalar_bboxLocalMin() { return HdGet_bboxLocalMin(0).x; }
vec4 HdGet_bboxLocalMax(int localIndex) {
  int index = GetDrawingCoord().constantCoord;
  return vec4(constantPrimvars[index].bboxLocalMax);
}
vec4 HdGet_bboxLocalMax() { return HdGet_bboxLocalMax(0); }
float HdGetScalar_bboxLocalMax(int localIndex) { return HdGet_bboxLocalMax(localIndex).x; }
float HdGetScalar_bboxLocalMax() { return HdGet_bboxLocalMax(0).x; }
int HdGet_primID(int localIndex) {
  int index = GetDrawingCoord().constantCoord;
  return int(constantPrimvars[index].primID);
}
int HdGet_primID() { return HdGet_primID(0); }
int HdGetScalar_primID(int localIndex) { return HdGet_primID(localIndex); }
int HdGetScalar_primID() { return HdGet_primID(0); }
vec3 HdGet_displayColor(int localIndex) {
  int index = GetDrawingCoord().constantCoord;
  return vec3(constantPrimvars[index].displayColor);
}
vec3 HdGet_displayColor() { return HdGet_displayColor(0); }
float HdGetScalar_displayColor(int localIndex) { return HdGet_displayColor(localIndex).x; }
float HdGetScalar_displayColor() { return HdGet_displayColor(0).x; }
float HdGet_displayOpacity(int localIndex) {
  int index = GetDrawingCoord().constantCoord;
  return float(constantPrimvars[index].displayOpacity);
}
float HdGet_displayOpacity() { return HdGet_displayOpacity(0); }
float HdGetScalar_displayOpacity(int localIndex) { return HdGet_displayOpacity(localIndex); }
float HdGetScalar_displayOpacity() { return HdGet_displayOpacity(0); }

// //////// Codegen PTVS Source //////// 
int GetBasePrimitiveOffset() { return drawingCoord0[0].w; }
int GetPrimitiveID() {
  return (patch_id - GetBasePrimitiveOffset());
}
int GetPrimitiveIndex() {
  return GetDrawingCoord().primitiveCoord + patch_id;
}
int GetBaseVertexOffset() {
  return GetDrawingCoord().vertexCoord;
}
hd_instanceIndex GetInstanceIndex() {  hd_instanceIndex r; r.indices[0] = 0; return r; }
hd_drawingCoord GetDrawingCoord() { hd_drawingCoord dc;
  dc.modelCoord              = drawingCoord0[0].x;
  dc.constantCoord           = drawingCoord0[0].y;
  dc.elementCoord            = drawingCoord0[0].z;
  dc.primitiveCoord          = drawingCoord0[0].w;
  dc.fvarCoord               = drawingCoord1[0].x;
  dc.shaderCoord             = drawingCoord1[0].z;
  dc.vertexCoord             = drawingCoord1[0].w;
  dc.topologyVisibilityCoord = drawingCoord2[0].x;
  dc.varyingCoord            = drawingCoord2[0].y;
  hd_instanceIndex r = GetInstanceIndex();
  dc.instanceIndex[0] = r.indices[0];
  return dc;
}
int HdGet_primitiveParam(int localIndex) {
  int index = GetPrimitiveIndex();
  return int(primitiveParam[index]);
}
int HdGet_primitiveParam() { return HdGet_primitiveParam(0); }
int HdGetScalar_primitiveParam(int localIndex) { return HdGet_primitiveParam(localIndex); }
int HdGetScalar_primitiveParam() { return HdGet_primitiveParam(0); }
#if defined(HD_HAS_coarseFaceIndex)
FORWARD_DECL(int HdGetScalar_coarseFaceIndex());
#endif
ivec3 GetPatchParam() {
#if defined(HD_HAS_coarseFaceIndex)
   return ivec3(HdGetScalar_coarseFaceIndex(), 0, 0);
#else
   return ivec3(GetPrimitiveID(), 0, 0);
#endif
}
int GetEdgeFlag() {
  return (HdGet_primitiveParam() & 3);
}
int GetFVarIndex(int localIndex) {
  int fvarCoord = GetDrawingCoord().fvarCoord;
  int ptexIndex = GetPatchParam().x & 0xfffffff;
  return fvarCoord + ptexIndex * 3 + localIndex;
}
int GetElementID() {
  return (hd_int_get(HdGet_primitiveParam()) >> 2);
}
int GetAggregatedElementID() {
  return GetElementID()
  + GetDrawingCoord().elementCoord;
}
int HdGet_edgeIndices(int localIndex) {
  int index = GetPrimitiveIndex();
  return int(edgeIndices[index]);
}
int HdGet_edgeIndices() { return HdGet_edgeIndices(0); }
int HdGetScalar_edgeIndices(int localIndex) { return HdGet_edgeIndices(localIndex); }
int HdGetScalar_edgeIndices() { return HdGet_edgeIndices(0); }
int GetAuthoredEdgeId(int primitiveEdgeId) {
  return primitiveEdgeId;
}
vec3 HdGet_points(int localIndex) { return hd_vec3_get(points[localIndex]);}
vec3 HdGet_points() { return HdGet_points(0); }
float HdGetScalar_points(int localIndex) { return HdGet_points(localIndex).x; }
float HdGetScalar_points() { return HdGet_points(0).x; }
void ProcessSamplingTransforms(MAT4 instanceModelViewInverse) {
}
template <typename T>
T InterpolatePrimvar(T inPv0, T inPv1, T inPv2, T inPv3, vec4 basis, vec2 uv = vec2()) {
  return inPv0 * basis[0] + inPv1 * basis[1] + inPv2 * basis[2] + inPv3 * basis[3];
}
void ProcessPrimvarsOut(vec4 basis, int i0, int i1, int i2, int i3, vec2 uv = vec2()) {
  hd_tessCoord = gl_TessCoord.xy;
  hd_drawingCoord dc = GetDrawingCoord();
  vs_interstageDrawingCoord0[0] = dc.modelCoord;
  vs_interstageDrawingCoord0[1] = dc.constantCoord;
  vs_interstageDrawingCoord0[2] = dc.elementCoord;
  vs_interstageDrawingCoord0[3] = dc.primitiveCoord;
  vs_interstageDrawingCoord1[0] = dc.fvarCoord;
  vs_interstageDrawingCoord1[1] = dc.shaderCoord;
  vs_interstageDrawingCoord1[2] = dc.vertexCoord;
  vs_interstageDrawingCoord1[3] = dc.topologyVisibilityCoord;
  vs_interstageDrawingCoord2[0] = dc.varyingCoord;
  vs_interstageDrawingCoord2[1] = dc.instanceIndex[0];
  outPrimvars.points = InterpolatePrimvar(HdGet_points(i0), HdGet_points(i1), HdGet_points(i2), HdGet_points(i3), basis, uv);
}
// line 13 "renderPass.glslfx"

// ---------------------------------------------------------------------------
// global defines
// ---------------------------------------------------------------------------
// codeGen can override this range (currently not).
// quadro 4000's max is 189.
#ifndef HD_GL_POINT_SIZE_MAX
#define HD_GL_POINT_SIZE_MAX  100.0
#endif
#ifndef HD_GL_POINT_SIZE_MIN
#define HD_GL_POINT_SIZE_MIN  .45
#endif

// ---------------------------------------------------------------------------
// render pass states
// ---------------------------------------------------------------------------

MAT4  GetWorldToViewMatrix() {
#if defined(HD_HAS_worldToViewMatrix)
    return MAT4(HdGet_worldToViewMatrix());
#else
    return MAT4(1);
#endif
}
MAT4  GetWorldToViewInverseMatrix() {
#if defined(HD_HAS_worldToViewInverseMatrix)
    return MAT4(HdGet_worldToViewInverseMatrix());
#else
    return MAT4(1);
#endif
}
MAT4  GetProjectionMatrix() {
#if defined(HD_HAS_projectionMatrix)
    return MAT4(HdGet_projectionMatrix());
#else
    return MAT4(1);
#endif
}
MAT4  GetProjectionInverseMatrix() {
#if defined(HD_HAS_projectionInverseMatrix)
    return MAT4(HdGet_projectionInverseMatrix());
#else
    return MAT4(1);
#endif
}
vec3 GetPositionInWorldSpace(vec3 windowRelativeCoord)
{
#if defined(HD_HAS_imageToWorldMatrix)
    vec4 pImage = vec4(windowRelativeCoord, 1.0);
    vec4 pWorld = vec4(HdGet_imageToWorldMatrix() * pImage);
    return (pWorld / pWorld.w).xyz;
#else
    return windowRelativeCoord;
#endif
}
float GetLightingBlendAmount() {
#if defined(HD_HAS_lightingBlendAmount)
    return HdGet_lightingBlendAmount();
#else
    return 1;
#endif
}
float GetLinearExposure() {
#if defined(HD_HAS_linearExposure)
    return HdGet_linearExposure();
#else
    return 1;
#endif
}
vec4  GetViewport() {
#if defined(HD_HAS_viewport)
    return HdGet_viewport();
#else
    return vec4(0,0,1,1);
#endif
}
float GetTessLevel() {
#if defined(HD_HAS_tessLevel)
    return HdGet_tessLevel();
#else
    return 1;
#endif
}
float GetPointSize() {
#if defined(HD_HAS_pointSize)
    return HdGet_pointSize();
#else
    return 3.0;
#endif
}
float GetPointSelectedSize() {
#if defined(HD_HAS_pointSelectedSize)
    return HdGet_pointSelectedSize();
#else
    return 5.0;
#endif
}
vec4  GetWireframeColor() {
// Individual prims can specify an alternative wireframe color
// to one specified in the render pass.  This is used in cases were
// there is not enough contrast with the normal one.
#if defined(HD_HAS_overrideWireframeColor)
    return HdGet_overrideWireframeColor();
#elif defined(HD_HAS_wireframeColor)
    return HdGet_wireframeColor();
#else
    return vec4(0,0,0,0);
#endif
}
vec4  GetMaskColor() {
#if defined(HD_HAS_maskColor)
    return HdGet_maskColor();
#else
    return vec4(0.5,0,0,1);
#endif
}
vec4  GetIndicatorColor() {
#if defined(HD_HAS_indicatorColor)
    return HdGet_indicatorColor();
#else
    return vec4(0,0.5,0,1);
#endif
}

bool ShouldDiscardByAlpha(vec4 color)
{
#if defined(HD_HAS_alphaThreshold)
    float alphaThreshold = HdGet_alphaThreshold();
#else
    float alphaThreshold = 0;
#endif
    return (color.a < alphaThreshold);
}

vec2 ApplyAxisAlignedAffineTransform(vec4 t, vec2 pt)
{
    return t.xy * pt + t.zw;
}


// line 166 "renderPass.glslfx"

#ifdef HD_USE_HARDWARE_CLIPPING
void ApplyClipPlanes(vec4 Peye)
{
#if defined(HD_HAS_numClipPlanes)
#if defined(HD_HAS_clipPlanes)
    for (int i=0; i<HD_NUM_clipPlanes; ++i) {
        // For Hgi backends like Metal, we declare a shader stage output of
        // gl_ClipDistance[HD_NUM_clipPlanes], since we need to know the array
        // size at compile time. To avoid having any uninitialized values in
        // that array, we initialize them all to zero first.
        gl_ClipDistance[i] = 0;
        if (i < HdGet_numClipPlanes()) {
            gl_ClipDistance[i] = dot(HdGet_clipPlanes(i), Peye);
        }
    }
#endif
#endif
}
#endif


// line 42 "fallbackMaterialNetwork.glslfx"

vec4 displacementShader(int index, vec4 Peye, vec3 Neye, vec4 patchCoord)
{
    return Peye;
}

// line 14 "instancing.glslfx"

// quaternion to matrix. xyz = imaginary, w = real
MAT4 GetRotationMatrix(vec4 q)
{
    MAT4 r;
    r[0].xyzw = vec4(1 - 2 * (q.y * q.y + q.z * q.z),
                         2 * (q.x * q.y + q.z * q.w),
                         2 * (q.x * q.z - q.y * q.w),
                     0);
    r[1].xyzw = vec4(    2 * (q.x * q.y - q.z * q.w),
                     1 - 2 * (q.x * q.x + q.z * q.z),
                         2 * (q.y * q.z + q.x * q.w),
                     0);
    r[2].xyzw = vec4(    2 * (q.x * q.z + q.y * q.w),
                         2 * (q.y * q.z - q.x * q.w),
                     1 - 2 * (q.x * q.x + q.y * q.y),
                     0);
    r[3] = vec4(0, 0, 0, 1);
    return r;
}

// ---------------------------------------------------------------------------

MAT4 GetInstanceTransform(int level)
{
    MAT4 m = MAT4(1);
#ifdef HD_HAS_INSTANCE_hydra_instanceTransforms
    m = HdGetInstance_hydra_instanceTransforms(level, MAT4(1)) * m;
#elif defined(HD_HAS_INSTANCE_instanceTransform)
    m = HdGetInstance_instanceTransform(level, MAT4(1)) * m;
#endif

    // instance transform elements are applied:
    //   scale then rotate then translate
    //   i.e. (T * R * S) * position

#ifdef HD_HAS_INSTANCE_hydra_instanceScales
    vec3 s = HdGetInstance_hydra_instanceScales(level, /*default=*/vec3(1));
    m = MAT4(s.x,   0,   0, 0,
               0, s.y,   0, 0,
               0,   0, s.z, 0,
               0,   0,   0, 1) * m;
#elif defined(HD_HAS_INSTANCE_instanceScale)
    vec3 s = HdGetInstance_scale(level, /*default=*/vec3(1));
    m = MAT4(s.x,   0,   0, 0,
               0, s.y,   0, 0,
               0,   0, s.z, 0,
               0,   0,   0, 1) * m;
#endif

#ifdef HD_HAS_INSTANCE_hydra_instanceRotations // GfQuat(ix, iy, iz, real)
    vec4 q = HdGetInstance_hydra_instanceRotations(level, /*default=*/vec4(0));
    m = GetRotationMatrix(q) * m;
#elif defined(HD_HAS_INSTANCE_rotate)
    vec4 q = HdGetInstance_rotate(level, /*default=*/vec4(0));
    m = GetRotationMatrix(q) * m;
#endif

#ifdef HD_HAS_INSTANCE_hydra_instanceTranslations
    vec3 t = HdGetInstance_hydra_instanceTranslations(level, /*default=*/vec3(0));
    m = MAT4(  1,   0,   0,  0,
               0,   1,   0,  0,
               0,   0,   1,  0,
             t.x, t.y, t.z,  1) * m;
#elif defined(HD_HAS_INSTANCE_translate)
    vec3 t = HdGetInstance_translate(level, /*default=*/vec3(0));
    m = MAT4(  1,   0,   0,  0,
               0,   1,   0,  0,
               0,   0,   1,  0,
             t.x, t.y, t.z,  1) * m;
#endif
    return m;
}

MAT4 GetInstanceTransformInverse(int level)
{
    MAT4 m = MAT4(1);

#ifdef HD_HAS_INSTANCE_hydra_instanceTransforms
    m = inverse(HdGetInstance_hydra_instanceTransforms(level, MAT4(1))) * m;
#elif defined(HD_HAS_INSTANCE_instanceTransform)
    m = inverse(HdGetInstance_instanceTransform(level, MAT4(1))) * m;
#endif

#ifdef HD_HAS_INSTANCE_hydra_instanceTranslations
    vec3 it = -HdGetInstance_hydra_instanceTranslations(level, /*default=*/vec3(0)); // negate
    m = MAT4(   1,    0,    0, 0,
                0,    1,    0, 0,
                0,    0,    1, 0,
             it.x, it.y, it.z, 1) * m;
#elif defined(HD_HAS_INSTANCE_translate)
    vec3 it = -HdGetInstance_translate(level, /*default=*/vec3(0)); // negate
    m = MAT4(   1,    0,    0, 0,
                0,    1,    0, 0,
                0,    0,    1, 0,
             it.x, it.y, it.z, 1) * m;
#endif

#ifdef HD_HAS_INSTANCE_hydra_instanceRotations
    vec4 q = HdGetInstance_hydra_instanceRotations(level, /*default=*/vec4(0));
    q.xyz = -q.xyz; // inverse rotataion axis
    m = GetRotationMatrix(q) * m;
#elif defined(HD_HAS_INSTANCE_rotate)
    vec4 q = HdGetInstance_rotate(level, /*default=*/vec4(0));
    q.xyz = -q.xyz; // inverse rotataion axis
    m = GetRotationMatrix(q) * m;
#endif

#ifdef HD_HAS_INSTANCE_hydra_instanceScales
    vec3 is = 1.0/HdGetInstance_hydra_instanceScales(level, /*default=*/vec3(1)); // inverse scale
    m = MAT4(is.x,    0,    0,  0,
                0, is.y,    0,  0,
                0,    0, is.z,  0,
                0,    0,    0,  1) * m;
#elif defined(HD_HAS_INSTANCE_scale)
    vec3 is = 1.0/HdGetInstance_scale(level, /*default=*/vec3(1)); // inverse scale
    m = MAT4(is.x,    0,    0,  0,
                0, is.y,    0,  0,
                0,    0, is.z,  0,
                0,    0,    0,  1) * m;
#endif
    return m;
}

// ---------------------------------------------------------------------------

MAT4 GetInstanceTransform()
{
    MAT4 m = MAT4(1);
#ifdef HD_INSTANCER_NUM_LEVELS
    HGI_COMPILER_ATTR_UNROLL
    for (int i = 0; i < HD_INSTANCER_NUM_LEVELS; ++i) {
        m = GetInstanceTransform(i) * m;
#ifdef HD_HAS_instancerTransform
        m = HdGet_instancerTransform(i) * m;
#endif
    }
#endif
    return m;
}

MAT4 GetInstanceTransformInverse()
{
    MAT4 m = MAT4(1);
#ifdef HD_INSTANCER_NUM_LEVELS
    HGI_COMPILER_ATTR_UNROLL
    for (int i = 0; i < HD_INSTANCER_NUM_LEVELS; ++i) {
        m = m * GetInstanceTransformInverse(i);
#ifdef HD_HAS_instancerTransformInverse
        m = m * HdGet_instancerTransformInverse(i);
#endif
    }
#endif
    return m;
}

// ---------------------------------------------------------------------------

MAT4 ApplyInstanceTransform(MAT4 m)
{
    return GetInstanceTransform() * m;
}

MAT4 ApplyInstanceTransformInverse(MAT4 m)
{
    return m * GetInstanceTransformInverse();
}

bool IsFlipped()
{
#if defined(HD_HAS_isFlipped)
    bool flip = (HdGet_isFlipped() != 0);
#elif defined(HD_HAS_transform)
    // The sign of the determinant indicates whether m flips handedness
    bool flip = (determinant(HdGet_transform()) < 0.0);
#else
    bool flip = false;
#endif

#ifdef HD_HAS_INSTANCE_hydra_instanceScales
    HGI_COMPILER_ATTR_UNROLL
    for (int i = 0; i < HD_INSTANCER_NUM_LEVELS; ++i) {
        vec3 scale = HdGetInstance_hydra_instanceScales(i, /*default=*/vec3(1));
        flip = flip != ((sign(scale.x) * sign(scale.y) * sign(scale.z)) < 0);
    }
#elif defined(HD_HAS_INSTANCE_scale)
    HGI_COMPILER_ATTR_UNROLL
    for (int i = 0; i < HD_INSTANCER_NUM_LEVELS; ++i) {
        vec3 scale = HdGetInstance_scale(i, /*default=*/vec3(1));
        flip = flip != ((sign(scale.x) * sign(scale.y) * sign(scale.z)) < 0);
    }
#endif

#ifdef HD_HAS_INSTANCE_hydra_instanceTransforms
    HGI_COMPILER_ATTR_UNROLL
    for (int i = 0; i < HD_INSTANCER_NUM_LEVELS; ++i) {
        MAT4 m = HdGetInstance_hydra_instanceTransforms(i, MAT4(1));
        flip = flip != (determinant(m) < 0.0);
    }
#elif defined(HD_HAS_INSTANCE_instanceTransform)
    HGI_COMPILER_ATTR_UNROLL
    for (int i = 0; i < HD_INSTANCER_NUM_LEVELS; ++i) {
        MAT4 m = HdGetInstance_instanceTransform(i, MAT4(1));
        flip = flip != (determinant(m) < 0.0);
    }
#endif

    return flip;
}

// line 138 "meshNormal.glslfx"

vec3 GetTriGeometryNormal(vec3 Neye, vec4 Peye0, vec4 Peye1, vec4 Peye2,
                          bool isFlipped)
{
    // ignore vertex normal and compute flat facing normal
    vec3 n = normalize(cross(Peye1.xyz - Peye0.xyz, Peye2.xyz - Peye0.xyz));
    return isFlipped ? -n : n;
}

vec3 GetQuadGeometryNormal(vec3 Neye,
                           vec4 Peye0, vec4 Peye1, vec4 Peye2, vec4 Peye3,
                           bool isFlipped)
{
    //  0---3
    //  |.  |
    //  | . |
    //  |  .|
    //  1---2
    // ignore vertex normal and compute flat facing normal
    // average diagonal cross products to deal with co-linear edges
    vec3 A0 = Peye2.xyz - Peye3.xyz;
    vec3 B0 = Peye0.xyz - Peye3.xyz;
    vec3 A1 = Peye0.xyz - Peye1.xyz;
    vec3 B1 = Peye2.xyz - Peye1.xyz;
    vec3 n = normalize(cross(B0, A0) + cross(B1, A1));
    return isFlipped ? -n : n;
}


// line 125 "meshNormal.glslfx"

vec3 GetNormal(vec3 Neye, int index)
{
    return Neye;
}

vec3 GetNormal(vec3 Neye, int index, vec2 localST)
{
    return GetNormal(Neye, index);
}


// line 16 "pointId.glslfx"

int GetPointId()
{
    return -1;
}

float GetPointRasterSize(int pointId)
{
    return GetPointSize();
}

void ProcessPointId(int pointId)
{
    // do nothing
}


// line 50 "pointDisk.glslfx"

float ApplyPointSizeBias(float pointSize)
{
    // do nothing
    return pointSize;
}


// line 25 "terminals.glslfx"

vec4 DisplacementTerminal(int index, vec4 Peye, vec3 Neye, vec4 patchCoord)
{
    return Peye;
}


// line 71 "mesh.glslfx"

vec4 GetPatchCoord(int index)
{
    vec2 uv[3];
    uv[0] = vec2(0, 0); // (0, 0, 1);
    uv[1] = vec2(1, 0); // (1, 0, 0);
    uv[2] = vec2(0, 1); // (0, 1, 0);

    ivec3 patchParam = GetPatchParam();
    return InterpolatePatchCoordTriangle(uv[index], patchParam);
}

vec2 GetPatchCoordLocalST()
{
    return gl_TessCoord.yz;
}

// Fwd declare methods defined in pointId.glslfx, that are used below.
FORWARD_DECL(int GetPointId());
FORWARD_DECL(float GetPointRasterSize(int));
FORWARD_DECL(void ProcessPointId(int));

void main(void)
{
    MAT4 transform = ApplyInstanceTransform(HdGet_transform());

    int pointId = GetPointId();
    gl_PointSize = ApplyPointSizeBias(GetPointRasterSize(pointId));
    ProcessPointId(pointId);

    vec4 point0 = GetWorldToViewMatrix() * transform * vec4(points[0],1.0);
    vec4 point1 = GetWorldToViewMatrix() * transform * vec4(points[1],1.0);
    vec4 point2 = GetWorldToViewMatrix() * transform * vec4(points[2],1.0);

    // Get the indata Neye if provided.
    bool isFlipped = IsFlipped();
    vec3 Neye0 = GetNormal(vec3(0),0);
    vec3 Neye1 = GetNormal(vec3(0),1);
    vec3 Neye2 = GetNormal(vec3(0),2);

    Neye0 = GetTriGeometryNormal(Neye0, point0, point1, point2, isFlipped);
    Neye1 = GetTriGeometryNormal(Neye1, point0, point1, point2, isFlipped);
    Neye2 = GetTriGeometryNormal(Neye2, point0, point1, point2, isFlipped);

    point0 = DisplacementTerminal(0, point0, Neye0, GetPatchCoord(0));
    point1 = DisplacementTerminal(1, point1, Neye1, GetPatchCoord(1));
    point2 = DisplacementTerminal(2, point2, Neye2, GetPatchCoord(2));

    vec2 coord = gl_TessCoord.xy;
    vec4 basis = vec4(coord.x, coord.y, 1.0f-coord.x-coord.y, 0.0f);

    outData.Peye = InterpolatePrimvar(point0, point1, point2, point0, basis);
    outData.Neye = InterpolatePrimvar(Neye0, Neye1, Neye2, Neye0, basis);

    gl_Position = vec4(GetProjectionMatrix() * outData.Peye);
    ApplyClipPlanes(outData.Peye);

    ProcessPrimvarsOut(basis, 0, 1, 2, 0);
}


