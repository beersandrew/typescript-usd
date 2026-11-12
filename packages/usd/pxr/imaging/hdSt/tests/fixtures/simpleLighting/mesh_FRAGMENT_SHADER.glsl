
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
#define HD_HAS_position 1
#define HD_HAS_ambient 1
#define HD_HAS_diffuse 1
#define HD_HAS_specular 1
#define HD_HAS_spotDirection 1
#define HD_HAS_spotCutoff 1
#define HD_HAS_spotFalloff 1
#define HD_HAS_attenuation 1
#define HD_HAS_worldToLightTransform 1
#define HD_HAS_shadowIndexStart 1
#define HD_HAS_shadowIndexEnd 1
#define HD_HAS_hasShadow 1
#define HD_HAS_isIndirectLight 1
#define HD_HAS_useLighting 1
#define HD_HAS_lightCount 1
#define HD_HAS_useColorMaterialDiffuse 1
#define HD_HAS_ambient 1
#define HD_HAS_diffuse 1
#define HD_HAS_specular 1
#define HD_HAS_emission 1
#define HD_HAS_sceneColor 1
#define HD_HAS_shininess 1
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
#define HD_HAS_packedFlatNormals 1
#define HD_HAS_points 1

// //////// Codegen Decl //////// 
struct CustomBlockData1289 {
  vec4 position;
  vec4 ambient;
  vec4 diffuse;
  vec4 specular;
  vec3 spotDirection;
  float spotCutoff;
  float spotFalloff;
  vec3 attenuation;
  mat4 worldToLightTransform;
  int shadowIndexStart;
  int shadowIndexEnd;
  int hasShadow;
  int isIndirectLight;
};
struct CustomBlockData1545 {
  int useLighting;
  uint lightCount;
  int useColorMaterialDiffuse;
};
struct CustomBlockData1801 {
  vec4 ambient;
  vec4 diffuse;
  vec4 specular;
  vec4 emission;
  vec4 sceneColor;
  float shininess;
};
struct CustomBlockData2057 {
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
vec4 HdGet_lightSource_position(int localIndex) {
  int index = localIndex;
  return vec4(lightSource[index].position);
}
vec4 HdGet_lightSource_position() { return HdGet_lightSource_position(0); }
float HdGetScalar_lightSource_position(int localIndex) { return HdGet_lightSource_position(localIndex).x; }
float HdGetScalar_lightSource_position() { return HdGet_lightSource_position(0).x; }
vec4 HdGet_lightSource_ambient(int localIndex) {
  int index = localIndex;
  return vec4(lightSource[index].ambient);
}
vec4 HdGet_lightSource_ambient() { return HdGet_lightSource_ambient(0); }
float HdGetScalar_lightSource_ambient(int localIndex) { return HdGet_lightSource_ambient(localIndex).x; }
float HdGetScalar_lightSource_ambient() { return HdGet_lightSource_ambient(0).x; }
vec4 HdGet_lightSource_diffuse(int localIndex) {
  int index = localIndex;
  return vec4(lightSource[index].diffuse);
}
vec4 HdGet_lightSource_diffuse() { return HdGet_lightSource_diffuse(0); }
float HdGetScalar_lightSource_diffuse(int localIndex) { return HdGet_lightSource_diffuse(localIndex).x; }
float HdGetScalar_lightSource_diffuse() { return HdGet_lightSource_diffuse(0).x; }
vec4 HdGet_lightSource_specular(int localIndex) {
  int index = localIndex;
  return vec4(lightSource[index].specular);
}
vec4 HdGet_lightSource_specular() { return HdGet_lightSource_specular(0); }
float HdGetScalar_lightSource_specular(int localIndex) { return HdGet_lightSource_specular(localIndex).x; }
float HdGetScalar_lightSource_specular() { return HdGet_lightSource_specular(0).x; }
vec3 HdGet_lightSource_spotDirection(int localIndex) {
  int index = localIndex;
  return vec3(lightSource[index].spotDirection);
}
vec3 HdGet_lightSource_spotDirection() { return HdGet_lightSource_spotDirection(0); }
float HdGetScalar_lightSource_spotDirection(int localIndex) { return HdGet_lightSource_spotDirection(localIndex).x; }
float HdGetScalar_lightSource_spotDirection() { return HdGet_lightSource_spotDirection(0).x; }
float HdGet_lightSource_spotCutoff(int localIndex) {
  int index = localIndex;
  return float(lightSource[index].spotCutoff);
}
float HdGet_lightSource_spotCutoff() { return HdGet_lightSource_spotCutoff(0); }
float HdGetScalar_lightSource_spotCutoff(int localIndex) { return HdGet_lightSource_spotCutoff(localIndex); }
float HdGetScalar_lightSource_spotCutoff() { return HdGet_lightSource_spotCutoff(0); }
float HdGet_lightSource_spotFalloff(int localIndex) {
  int index = localIndex;
  return float(lightSource[index].spotFalloff);
}
float HdGet_lightSource_spotFalloff() { return HdGet_lightSource_spotFalloff(0); }
float HdGetScalar_lightSource_spotFalloff(int localIndex) { return HdGet_lightSource_spotFalloff(localIndex); }
float HdGetScalar_lightSource_spotFalloff() { return HdGet_lightSource_spotFalloff(0); }
vec3 HdGet_lightSource_attenuation(int localIndex) {
  int index = localIndex;
  return vec3(lightSource[index].attenuation);
}
vec3 HdGet_lightSource_attenuation() { return HdGet_lightSource_attenuation(0); }
float HdGetScalar_lightSource_attenuation(int localIndex) { return HdGet_lightSource_attenuation(localIndex).x; }
float HdGetScalar_lightSource_attenuation() { return HdGet_lightSource_attenuation(0).x; }
mat4 HdGet_lightSource_worldToLightTransform(int localIndex) {
  int index = localIndex;
  return mat4(lightSource[index].worldToLightTransform);
}
mat4 HdGet_lightSource_worldToLightTransform() { return HdGet_lightSource_worldToLightTransform(0); }
int HdGet_lightSource_shadowIndexStart(int localIndex) {
  int index = localIndex;
  return int(lightSource[index].shadowIndexStart);
}
int HdGet_lightSource_shadowIndexStart() { return HdGet_lightSource_shadowIndexStart(0); }
int HdGetScalar_lightSource_shadowIndexStart(int localIndex) { return HdGet_lightSource_shadowIndexStart(localIndex); }
int HdGetScalar_lightSource_shadowIndexStart() { return HdGet_lightSource_shadowIndexStart(0); }
int HdGet_lightSource_shadowIndexEnd(int localIndex) {
  int index = localIndex;
  return int(lightSource[index].shadowIndexEnd);
}
int HdGet_lightSource_shadowIndexEnd() { return HdGet_lightSource_shadowIndexEnd(0); }
int HdGetScalar_lightSource_shadowIndexEnd(int localIndex) { return HdGet_lightSource_shadowIndexEnd(localIndex); }
int HdGetScalar_lightSource_shadowIndexEnd() { return HdGet_lightSource_shadowIndexEnd(0); }
bool HdGet_lightSource_hasShadow(int localIndex) {
  int index = localIndex;
  return bool(lightSource[index].hasShadow);
}
bool HdGet_lightSource_hasShadow() { return HdGet_lightSource_hasShadow(0); }
bool HdGetScalar_lightSource_hasShadow(int localIndex) { return HdGet_lightSource_hasShadow(localIndex); }
bool HdGetScalar_lightSource_hasShadow() { return HdGet_lightSource_hasShadow(0); }
bool HdGet_lightSource_isIndirectLight(int localIndex) {
  int index = localIndex;
  return bool(lightSource[index].isIndirectLight);
}
bool HdGet_lightSource_isIndirectLight() { return HdGet_lightSource_isIndirectLight(0); }
bool HdGetScalar_lightSource_isIndirectLight(int localIndex) { return HdGet_lightSource_isIndirectLight(localIndex); }
bool HdGetScalar_lightSource_isIndirectLight() { return HdGet_lightSource_isIndirectLight(0); }
bool HdGet_useLighting(int localIndex) { return bool(lightingContext.useLighting);}
bool HdGet_useLighting() { return HdGet_useLighting(0); }
bool HdGetScalar_useLighting(int localIndex) { return HdGet_useLighting(localIndex); }
bool HdGetScalar_useLighting() { return HdGet_useLighting(0); }
uint HdGet_lightCount(int localIndex) { return uint(lightingContext.lightCount);}
uint HdGet_lightCount() { return HdGet_lightCount(0); }
uint HdGetScalar_lightCount(int localIndex) { return HdGet_lightCount(localIndex); }
uint HdGetScalar_lightCount() { return HdGet_lightCount(0); }
bool HdGet_useColorMaterialDiffuse(int localIndex) { return bool(lightingContext.useColorMaterialDiffuse);}
bool HdGet_useColorMaterialDiffuse() { return HdGet_useColorMaterialDiffuse(0); }
bool HdGetScalar_useColorMaterialDiffuse(int localIndex) { return HdGet_useColorMaterialDiffuse(localIndex); }
bool HdGetScalar_useColorMaterialDiffuse() { return HdGet_useColorMaterialDiffuse(0); }
vec4 HdGet_material_ambient(int localIndex) { return vec4(material.ambient);}
vec4 HdGet_material_ambient() { return HdGet_material_ambient(0); }
float HdGetScalar_material_ambient(int localIndex) { return HdGet_material_ambient(localIndex).x; }
float HdGetScalar_material_ambient() { return HdGet_material_ambient(0).x; }
vec4 HdGet_material_diffuse(int localIndex) { return vec4(material.diffuse);}
vec4 HdGet_material_diffuse() { return HdGet_material_diffuse(0); }
float HdGetScalar_material_diffuse(int localIndex) { return HdGet_material_diffuse(localIndex).x; }
float HdGetScalar_material_diffuse() { return HdGet_material_diffuse(0).x; }
vec4 HdGet_material_specular(int localIndex) { return vec4(material.specular);}
vec4 HdGet_material_specular() { return HdGet_material_specular(0); }
float HdGetScalar_material_specular(int localIndex) { return HdGet_material_specular(localIndex).x; }
float HdGetScalar_material_specular() { return HdGet_material_specular(0).x; }
vec4 HdGet_material_emission(int localIndex) { return vec4(material.emission);}
vec4 HdGet_material_emission() { return HdGet_material_emission(0); }
float HdGetScalar_material_emission(int localIndex) { return HdGet_material_emission(localIndex).x; }
float HdGetScalar_material_emission() { return HdGet_material_emission(0).x; }
vec4 HdGet_material_sceneColor(int localIndex) { return vec4(material.sceneColor);}
vec4 HdGet_material_sceneColor() { return HdGet_material_sceneColor(0); }
float HdGetScalar_material_sceneColor(int localIndex) { return HdGet_material_sceneColor(localIndex).x; }
float HdGetScalar_material_sceneColor() { return HdGet_material_sceneColor(0).x; }
float HdGet_material_shininess(int localIndex) { return float(material.shininess);}
float HdGet_material_shininess() { return HdGet_material_shininess(0); }
float HdGetScalar_material_shininess(int localIndex) { return HdGet_material_shininess(localIndex); }
float HdGetScalar_material_shininess() { return HdGet_material_shininess(0); }
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

// //////// Codegen FS Source //////// 
#define HD_MATERIAL_TAG_MASKED 1
vec3 GetBarycentricCoord() {
  return hd_BaryCoordNoPersp;
}
int GetPrimitiveID() {
  return gl_PrimitiveID;
}
int GetPrimitiveIndex() {
  return GetDrawingCoord().primitiveCoord + GetPrimitiveID();
}
hd_drawingCoord GetDrawingCoord() { 
  hd_drawingCoord dc; 
  dc.modelCoord = vs_interstageDrawingCoord0[0];
  dc.constantCoord = vs_interstageDrawingCoord0[1];
  dc.elementCoord = vs_interstageDrawingCoord0[2];
  dc.primitiveCoord = vs_interstageDrawingCoord0[3];
  dc.fvarCoord = vs_interstageDrawingCoord1[0];
  dc.shaderCoord = vs_interstageDrawingCoord1[1];
  dc.vertexCoord = vs_interstageDrawingCoord1[2];
  dc.topologyVisibilityCoord = vs_interstageDrawingCoord1[3];
  dc.varyingCoord = vs_interstageDrawingCoord2[0];
  dc.instanceIndex[0] = vs_interstageDrawingCoord2[1];
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
vec4 HdGet_packedFlatNormals(int localIndex) {
  int index = GetAggregatedElementID();
  return hd_vec4_2_10_10_10_get(packedFlatNormals[index]);
}
vec4 HdGet_packedFlatNormals() { return HdGet_packedFlatNormals(0); }
float HdGetScalar_packedFlatNormals(int localIndex) { return HdGet_packedFlatNormals(localIndex).x; }
float HdGetScalar_packedFlatNormals() { return HdGet_packedFlatNormals(0).x; }
vec3 HdGet_points(int localIndex) { return vec3(inPrimvars.points);}
vec3 HdGet_points() { return HdGet_points(0); }
float HdGetScalar_points(int localIndex) { return HdGet_points(localIndex).x; }
float HdGetScalar_points() { return HdGet_points(0).x; }
FORWARD_DECL(vec4 GetPatchCoord(int index));
void ProcessSamplingTransforms(MAT4 instanceModelViewInverse) {
}
#define NUM_LIGHTS 16
#define USE_SHADOWS 0
#define NUM_SHADOWS 0
// line 71 "pcfShader.glslfx"
// ---------------------------------------------------------------------------
//  PCF shadow filtering with compute filter length on the fly.
//  no vertex shader needed.
// ---------------------------------------------------------------------------

#if NUM_SHADOWS > 0

#define SHADOW_FILTER
#define JITTER_NUM_SAMPLES 16
#define PCF_NUM_SAMPLES JITTER_NUM_SAMPLES

FORWARD_DECL(float shadowSample(int index, vec4 coord));
FORWARD_DECL(float shadowCompare(int index, vec4 coord));

vec2 jitter[JITTER_NUM_SAMPLES] = {
    vec2(-0.94201624, -0.39906216),
    vec2( 0.94558609, -0.76890725),
    vec2(-0.09418410, -0.92938870),
    vec2( 0.34495938,  0.29387760),
    vec2(-0.91588581,  0.45771432),
    vec2(-0.81544232, -0.87912464),
    vec2(-0.38277543,  0.27676845),
    vec2( 0.97484398,  0.75648379),
    vec2( 0.44323325, -0.97511554),
    vec2( 0.53742981, -0.47373420),
    vec2(-0.26496911, -0.41893023),
    vec2( 0.79197514,  0.19090188),
    vec2(-0.24188840,  0.99706507),
    vec2(-0.81409955,  0.91437590),
    vec2( 0.19984126,  0.78641367),
    vec2( 0.14383161, -0.14100790)
};

// defined in simpleLighting.glslfx
FORWARD_DECL(vec2 computeShadowFilterWidth(int index, vec4 Peye));

float
shadowFilter(int index, vec4 Pshadow, vec4 Peye)
{
    vec2 filterWidth = computeShadowFilterWidth(index, Peye);

    float sum = 0.0;
    for (int i=0; i<PCF_NUM_SAMPLES; ++i) {
        // Note that the perspective division has not been applied to
        // either Pshadow or filterWidth.
        vec2 offset = jitter[i] * filterWidth;
        sum += shadowCompare(index, Pshadow + vec4(offset, 0, 0));
    }
    return sum / float(PCF_NUM_SAMPLES);
}


#endif // NUM_SHADOWS > 0

// line 86 "simpleLighting.glslfx"

// ---------------------------------------------------------------------------
// struct definitions
// ---------------------------------------------------------------------------
#ifndef NUM_LIGHTS
#define NUM_LIGHTS 0
#endif
#ifndef NUM_SHADOWS
#define NUM_SHADOWS 0
#endif

#ifndef HD_HAS_integrateLights
#define HD_HAS_integrateLights
#endif

struct LightSource {
    vec4 position;
    vec4 ambient;
    vec4 diffuse;
    vec4 specular;
    vec4 spotDirection;
    vec4 spotCutoffAndFalloff;
    vec4 attenuation;
    MAT4 worldToLightTransform;
    int shadowIndexStart;
    int shadowIndexEnd;
    bool hasShadow;
    bool isIndirectLight;
};

struct ShadowMatrix {
    MAT4 eyeToShadowMatrix;
    MAT4 shadowToEyeMatrix;
    float blur;
    float bias;
    float padding0;
    float padding1;
};

struct LightingContribution {
    vec3 ambient;
    vec3 diffuse;
    vec3 specular;
};

struct LightingInterfaceProperties {
    float shininess;
    float roughness;
    float metallic;
    vec3 matSpecular;
};

// ---------------------------------------------------------------------------
// data accessors
// ---------------------------------------------------------------------------
#if NUM_LIGHTS == 0

#else // NUM_LIGHTS == 0

bool GetUseLighting() {
    return HdGet_useLighting();
}

uint GetLightCount() {
    return HdGet_lightCount();
}

bool GetUseColorMaterialDiffuse() {
    return HdGet_useColorMaterialDiffuse();
}

FORWARD_DECL(MAT4 GetWorldToViewMatrix());
FORWARD_DECL(MAT4 GetWorldToViewInverseMatrix());

LightSource GetLightSource(int lightIndex) {
    LightSource light;
    light.position = vec4(GetWorldToViewMatrix() *
        HdGet_lightSource_position(lightIndex));
    light.ambient = HdGet_lightSource_ambient(lightIndex);
    light.diffuse = HdGet_lightSource_diffuse(lightIndex);
    light.specular = HdGet_lightSource_specular(lightIndex);
    light.spotDirection = vec4(GetWorldToViewMatrix() *
        vec4(HdGet_lightSource_spotDirection(lightIndex), 0));
    light.spotCutoffAndFalloff = vec4(HdGet_lightSource_spotCutoff(lightIndex),
        HdGet_lightSource_spotFalloff(lightIndex), 0, 0);
    light.attenuation = vec4(HdGet_lightSource_attenuation(lightIndex), 0);
    light.worldToLightTransform =
        HdGet_lightSource_worldToLightTransform(lightIndex);
    light.shadowIndexStart = HdGet_lightSource_shadowIndexStart(lightIndex);
    light.shadowIndexEnd = HdGet_lightSource_shadowIndexEnd(lightIndex);
    light.hasShadow = HdGet_lightSource_hasShadow(lightIndex);
    light.isIndirectLight = HdGet_lightSource_isIndirectLight(lightIndex);
    return light;
}
#endif // NUM_LIGHTS == 0

#if NUM_SHADOWS == 0

#else // NUM_SHADOWS == 0

ShadowMatrix GetShadow(int shadowIndex) {
    ShadowMatrix shadowMat;
    shadowMat.eyeToShadowMatrix = HdGet_shadow_worldToShadowMatrix(shadowIndex)
        * GetWorldToViewInverseMatrix();
    shadowMat.shadowToEyeMatrix = GetWorldToViewMatrix() *
        HdGet_shadow_shadowToWorldMatrix(shadowIndex);
    shadowMat.blur = HdGet_shadow_blur(shadowIndex);
    shadowMat.bias = HdGet_shadow_bias(shadowIndex);
    return shadowMat;
}

float
shadowTangentLength(vec4 dir, vec4 Peye)
{
    const vec3 shadowTangent = dir.xyz * Peye.w - dir.w * Peye.xyz;
    return length(shadowTangent);
}

vec2
computeShadowFilterWidth(int index, vec4 Peye)
{
    ShadowMatrix shadowMat = GetShadow(index);
    return
        vec2(shadowMat.blur) /
        vec2(shadowTangentLength(vec4(shadowMat.shadowToEyeMatrix[0]), Peye),
             shadowTangentLength(vec4(shadowMat.shadowToEyeMatrix[1]), Peye));
}

#endif  // NUM_SHADOWS == 0

// ---------------------------------------------------------------------------
// lighting functions
// ---------------------------------------------------------------------------

#if NUM_LIGHTS == 0

LightingContribution
integrateLightsConstant(vec4 Peye, vec3 Neye, LightingInterfaceProperties props)
{
    LightingContribution result;
    result.ambient = vec3(0.0);
    //pefectly diffuse white hemisphere contribution
    result.diffuse = vec3(1.0);
    result.specular = vec3(0.0);

    return result;
}

LightingContribution
integrateLightsDefault(vec4 Peye, vec3 Neye, LightingInterfaceProperties props)
{
    // If no lights, lighting contribution is zero.
    LightingContribution result;
    result.ambient = vec3(0.0);
    result.diffuse = vec3(0.0);
    result.specular = vec3(0.0);

    return result;
}

#else // NUM_LIGHTS == 0

#if NUM_SHADOWS > 0
float
shadowCompare(int shadowIndex, vec4 coord)
{
    coord /= coord.w;
    coord.z = min(1.0, coord.z + GetShadow(shadowIndex).bias);

    // Cascade selection (in shadowing()) ensures Pshadow.xy is in [0,1],
    // but shadowFilter() can throw that off so we need to clamp.
    // XXX: sample the next cascade over?
    coord.xy = clamp(coord.xy, vec2(0), vec2(1));

    return HdGet_shadowCompareTextures(shadowIndex, coord.xyz).x;
}

#ifndef SHADOW_FILTER
float
shadowFilter(int shadowIndex, vec4 coord, vec4 Peye)
{
    return shadowCompare(shadowIndex, coord);
}
#endif // SHADOW_FILTER
#endif // NUM_SHADOWS > 0

float
shadowing(int lightIndex, vec4 Peye)
{
#if NUM_SHADOWS > 0
    for (int shadowIndex = GetLightSource(lightIndex).shadowIndexStart;
         shadowIndex <= GetLightSource(lightIndex).shadowIndexEnd;
         ++shadowIndex) {

        vec4 coord = vec4(GetShadow(shadowIndex).eyeToShadowMatrix * Peye);

        // If the point-to-be-lit isn't covered by this cascade, skip to
        // the next one...
        if (any(lessThan(coord.xyz, vec3(0))) ||
            any(greaterThan(coord.xyz, coord.www))) {
            continue;
        }

        return shadowFilter(shadowIndex, coord, Peye);
    }
#endif // NUM_SHADOWS > 0
    // ... either no shadows, or no coverage.
    return 1.0;
}

float
lightDistanceAttenuation(vec4 Peye, int index)
{
    float distAtten = 1.0;
    LightSource light = GetLightSource(index);
    if (light.position.w != 0.0) {
        const float d = distance(light.position, Peye);
        const float atten = light.attenuation[0] +
                            light.attenuation[1] * d +
                            light.attenuation[2] * d*d;
        if (atten == 0) {
            distAtten = 0.0;
        } else {
            distAtten = 1.0 / atten;
        }
    }
    return distAtten;
}

float
lightSpotAttenuation(vec3 l, int index)
{
    float spotAtten = 1.0;
    LightSource light = GetLightSource(index);
    if (light.spotCutoffAndFalloff.x < 180.0) {
        float cosLight = dot(-l, light.spotDirection.xyz);
        spotAtten = (cosLight < cos(radians(light.spotCutoffAndFalloff.x)))
                ? 0.0 : pow(cosLight, light.spotCutoffAndFalloff.y);
    }
    return spotAtten;
}

float
schlickFresnel(float EdotH)
{
    return pow(max(0.0, 1.0 - EdotH), 5.0);
}

LightingContribution
evaluateIndirectLight(vec3 Neye, vec3 Reye, float NdotE, float EdotH,
    LightingInterfaceProperties props, int i)
{
    LightingContribution result;
    result.diffuse = vec3(0);
    result.specular = vec3(0);
    result.ambient = vec3(0);

#ifdef HD_HAS_domeLightIrradiance
    const vec3 matSpecular = props.matSpecular;
    // Assumes IoR = 1.5
    const vec3 F0 = mix(0.04 * matSpecular, matSpecular, props.metallic);
    const vec3 F90 = mix(props.matSpecular, vec3(1), props.metallic);
    const float fresnel = schlickFresnel(EdotH);
    const vec3 F = mix(F0, F90, fresnel);

    MAT4 transformationMatrix =
        GetLightSource(i).worldToLightTransform * GetWorldToViewInverseMatrix();

    // Diffuse Component
    vec3 dir = vec3(normalize((transformationMatrix * vec4(Neye,0.0)).xyz));
    vec3 diffuse = HdGet_domeLightIrradiance(dir).rgb;

    // Specular Component
    const float MAX_REFLECTION_LOD =
        textureQueryLevels(HdGetSampler_domeLightPrefilter());
    const float roughness = props.roughness;
    const float lod = roughness * MAX_REFLECTION_LOD;
    vec3 Rdir = vec3(normalize((transformationMatrix * vec4(Reye,0.0)).xyz));
    vec3 prefilter = HdTextureLod_domeLightPrefilter(Rdir, lod).rgb;
    vec2 brdf = HdGet_domeLightBRDF(vec2(NdotE, roughness)).rg;
    vec3 specular = prefilter * (F * brdf.x + brdf.y);

    result.diffuse = diffuse;
    result.specular = specular;
#else
    result.diffuse =  vec3(1, 1, 1);
#endif

    return result;
}

// for the compatibility, turn on shadowing by default.
#ifndef USE_SHADOWS
#define USE_SHADOWS 1
#endif

LightingContribution
integrateLightsDefault(vec4 Peye, vec3 Neye, LightingInterfaceProperties props)
{
    LightingContribution result;
    result.ambient = vec3(0);
    result.diffuse = vec3(0);
    result.specular = vec3(0);

    vec3 n = normalize(Neye);
    vec3 e = normalize(-Peye.xyz);

    float shininess = props.shininess;

    for (int i = 0; i < GetLightCount(); ++i) {
        LightSource light = GetLightSource(i);

        vec4 Plight = (light.isIndirectLight)
                        ? vec4(0,0,0,1)
                        : light.position;
        vec3 l = (Plight.w == 0.0)
                        ? normalize(Plight.xyz)
                        : normalize(Plight - Peye).xyz;
        vec3 h = normalize(l + vec3(0,0,1));    // directional viewer

        if (light.isIndirectLight) {
            float NdotE = max(0.0, dot(n, e));
            float EdotH = max(0.0, dot(e, h));
            vec3 Reye = reflect(-e, n);

            LightingContribution indirectLight = evaluateIndirectLight(
                Neye, Reye, NdotE, EdotH, props, i);

            result.ambient += light.ambient.rgb;
            result.diffuse += indirectLight.diffuse * light.diffuse.rgb;
            result.specular += indirectLight.specular * light.specular.rgb;
        } else {
            //cosine of incident angle of light
            float NdotL = max(0.0, dot(n, l));

            //cosine of incident angle from halfway vector between the eye and the light
            float NdotH = max(0.0, dot(n, h));

            //Lambert
            float d = NdotL;

            //Blinn-Phong
            float s = pow(NdotH, shininess);

            float atten = lightDistanceAttenuation(Peye, i);
            atten *= lightSpotAttenuation(l, i);

#if USE_SHADOWS
            float shadow = light.hasShadow ?
                shadowing(/*lightIndex=*/i, Peye) : 1.0;
#else
            float shadow = 1.0;
#endif

            const float PI = 3.1415;
            result.ambient += atten * light.ambient.rgb;
            result.diffuse += atten * shadow * d * light.diffuse.rgb / PI;
            result.specular += atten * shadow * s * light.specular.rgb / PI;
        }
    }

    return result;
}

LightingContribution
integrateLightsConstant(vec4 Peye, vec3 Neye, LightingInterfaceProperties props)
{
    LightingContribution result;
    result.ambient = vec3(0);
    result.specular = vec3(0);
    result.diffuse = vec3(1);

    return result;
}

#endif // NUM_LIGHTS == 0


// line 464 "simpleLighting.glslfx"

// ---------------------------------------------------------------------------
// lighting functions
// ---------------------------------------------------------------------------

FORWARD_DECL(LightingContribution integrateLights(vec4 Peye, vec3 Neye,
    LightingInterfaceProperties props));

vec4
simpleLighting(vec4 color, vec4 Peye, vec3 Neye, vec4 Ctint,
               vec4 matDiffuse, vec4 matAmbient, vec4 matSpecular, float matShininess)
{
    LightingInterfaceProperties props;

    // Get the roughness and metallic values

#if defined(HD_HAS_displayMetallic)
    const float metallic  = max(0.0, min(1.0, float(HdGet_displayMetallic())));
#else
    const float metallic = 0.0;
#endif
    props.metallic = metallic;

#if defined(HD_HAS_displayRoughness)
    const float roughness = max(0.0, min(1.0, float(HdGet_displayRoughness())));
    const float specularExp = (1.0 - roughness) * 120.0 + 8.0;
    props.shininess = specularExp;
    matSpecular.rgb = mix(vec3(1.0), matDiffuse.rgb, metallic);
#else
    const float roughness = 0.0;
    props.shininess = matShininess;
#endif
    props.roughness = roughness;
    props.matSpecular = matSpecular.rgb;

    LightingContribution light = integrateLights(Peye, Neye, props);

    // determine the specular and diffuse intensity
    const float Ks = (1.0 - roughness) + 2.0 * metallic;

    color.rgb += light.ambient * matAmbient.rgb;
    color.rgb += Ctint.rgb * light.diffuse * matDiffuse.rgb;
    color.rgb += Ks * light.specular * matSpecular.rgb;

    color.a = matDiffuse.a;

    return color;
}

vec4
simpleLightingMaterial(vec4 color, vec4 Peye, vec3 Neye, vec4 Ctint)
{
    // XXX todo: useColorMaterialDiffuse

    vec4 diffuse = color;
    vec4 ambient = material.ambient;
    vec4 specular = material.specular;
    float shininess = material.shininess;

    color = material.emission + (material.sceneColor * ambient);

    return simpleLighting(color, Peye, Neye, Ctint,
                          diffuse, ambient, specular, shininess);
}

vec4
simpleLighting(vec4 color, vec4 Peye, vec3 Neye, vec4 Ctint)
{
    return simpleLightingMaterial(color, Peye, Neye, Ctint);
}

// line 32 "simpleLightingShader.glslfx"

vec3 FallbackLighting(in vec3 Peye, in vec3 Neye, in vec3 color)
{
    return simpleLightingMaterial(
        vec4(color,1),
        vec4(Peye,1),
        Neye,
        vec4(1)).rgb;
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


// line 153 "renderPass.glslfx"

vec2 HorizontallyNormalizedFilmbackCoordinates()
{
    const vec4 transform =
#ifdef HD_HAS_imageToHorizontallyNormalizedFilmback
        HdGet_imageToHorizontallyNormalizedFilmback();
#else
        vec4(vec2(1.0), vec2(0.0));
#endif
    return ApplyAxisAlignedAffineTransform(transform, gl_FragCoord.xy);
}


// line 205 "renderPass.glslfx"

vec4 ApplySelectionColor(vec4 color)
{
    return color;
}


// line 212 "renderPass.glslfx"

// Forward declare selection functionality.
// XXX: Currently, the non-empty implementation of this is in hdx.
FORWARD_DECL(vec4 ApplySelectionColor(vec4 color));

// XXX: Make sure to update hdx/shaders/renderPass.glslfx when editing these
// color override methods, since they're currently duplicated. This is because
// we don't have a mixin token for color overrides in a render pass yet.
vec4 ApplyColorOverrides(vec4 color)
{
#if defined(HD_HAS_overrideColor)
    // Mix in override color
    vec4 overrideColor = HdGet_overrideColor();
    color.rgb = mix(color.rgb, overrideColor.rgb, overrideColor.a);
#endif
    return ApplySelectionColor(color);
}

vec3 ApplyMaskColor(vec3 color, float weight, vec4 maskColor)
{
    float strength = maskColor.a * clamp(weight, 0.0, 1.0);
    return mix(color, maskColor.rgb, strength);
}

vec4 ApplyColorOverridesPostLighting(vec4 color)
{
    #if defined(HD_HAS_maskWeight)
        float maskWeight = HdGet_maskWeight();
        vec4 maskColor = GetMaskColor();
        color.rgb = ApplyMaskColor(color.rgb, maskWeight, maskColor);
    #endif
    #if defined(HD_HAS_indicatorWeight)
        float indicatorWeight = HdGet_indicatorWeight();
        vec4 indicatorColor = GetIndicatorColor();
        color.rgb = ApplyMaskColor(color.rgb, indicatorWeight, indicatorColor);
    #endif
    return color;
}


// line 269 "renderPass.glslfx"

void RenderColor(vec4 color)
{
    colorOut = color;
}


// line 302 "renderPass.glslfx"

void RenderId()
{
    // do nothing
}


// line 322 "renderPass.glslfx"

void RenderNeye(vec3 Neye)
{
    // do nothing
}


// line 252 "renderPass.glslfx"

void RenderOutput(vec4 Peye, vec3 Neye, vec4 color, vec4 patchCoord)
{
    // Write to any desired AOVs here. The render pass shader configuation
    // decides if any of these are no-ops.
    RenderColor(color);
    RenderId();
    RenderNeye(Neye);
}


// line 33 "fallbackMaterialNetwork.glslfx"

vec4 surfaceShader(vec4 Peye, vec3 Neye, vec4 color, vec4 patchCoord)
{
    // lighting
    color.rgb = FallbackLighting(Peye.xyz, Neye, color.rgb);
    return color;
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

// line 84 "meshNormal.glslfx"

vec3 GetNormal(vec3 Neye, int index)
{
    vec3 normal = vec3(0);
#if defined(HD_HAS_flatNormals)
    normal = vec3(HdGet_flatNormals(index).xyz);
#elif defined(HD_HAS_packedFlatNormals)
    normal = vec3(HdGet_packedFlatNormals(index).xyz);
#endif

    MAT4 transformInv = ApplyInstanceTransformInverse(HdGet_transformInverse());
    normal = vec4(transpose(transformInv * GetWorldToViewInverseMatrix()) *
                  vec4(normal,0)).xyz;

    if (length(normal) > 0.0)
        normal = normalize(normal);
    return normal;
}

vec3 GetNormal(vec3 Neye, int index, vec2 localST)
{
    return GetNormal(Neye, index);
}


// line 184 "meshNormal.glslfx"

vec3 GetShadingNormal(vec3 N, bool isFlipped)
{
    // the fragment shader takes already-flipped-normals.
    // no need to flip here.
    return N;
}


// line 15 "meshFaceCull.glslfx"

void DiscardBasedOnShading(bool frontFacing, bool isFlipped)
{
    // Nothing to do since h/w face culling is used.
}


// line 216 "meshWire.glslfx"

vec4 ApplyEdgeColor(vec4 Cfill, vec4 patchCoord)
{
    return Cfill;
}

// Return a large value, signifying that the fragment isn't near an edge.
float GetMinEdgeDistance()
{
    return 1000.0;
}


// line 118 "meshWire.glslfx"

vec3 GetEdgeParamTriangle()
{
    // Expand barycentric coordinates
    vec2 param = GetPatchCoord(0).xy;
    vec3 barycentric = vec3(param.x, param.y, 1 - param.x - param.y);

    // Match triangle edge order
    return barycentric.yzx;
}

vec3 GetEdgeDistanceTriangle()
{
    vec3 param = GetEdgeParamTriangle();
    return max(vec3(0.0), param / fwidth(param));
}

vec4 GetEdgeParamQuad()
{
    // Expand coordinates to opposite corners of quad
    vec2 leftBottom = GetPatchCoord(0).xy;
    vec2 rightTop = vec2(1.0) - leftBottom;

    // Match quad edge order
    return vec4(leftBottom.y, rightTop.x, rightTop.y, leftBottom.x);
}

vec4 GetEdgeDistanceQuad()
{
    vec4 param = GetEdgeParamQuad();
    return max(vec4(0.0), param / fwidth(param));
}


// line 33 "terminals.glslfx"

struct ReprStyle
{
    vec4  color;
    bool  usePrimvarColor;
    bool  usePrimvarAlpha;
    bool  applyColorOverride;
    bool  useSurfaceShaderColor;
    bool  useSurfaceShaderAlpha;
};

struct ScalarOverride
{
    bool enabled;
    vec3 color;
};

FORWARD_DECL(ReprStyle GetReprStyle());
FORWARD_DECL(ScalarOverride GetScalarOverride());
FORWARD_DECL(
    vec4 surfaceShader(vec4 Peye, vec3 Neye, vec4 color, vec4 patchCoord));
FORWARD_DECL(vec4 postSurfaceShader(vec4 Peye, vec3 Neye, vec4 color));

vec4 ShadingTerminal(vec4 Peye, vec3 Neye, vec4 color, vec4 patchCoord)
{
    ReprStyle reprStyle = GetReprStyle();

    // Apply scalar override.
    ScalarOverride scalarOverride = GetScalarOverride();
    if (scalarOverride.enabled) {
        vec4 result;

        result.rgb = scalarOverride.color;
        result.a   = reprStyle.usePrimvarAlpha ? color.a: reprStyle.color.a;

        vec4 colorOverride = ApplyColorOverrides(result);
        result = reprStyle.applyColorOverride ? colorOverride : result;

        return result;
    }

    // Draw mode can override face color
    vec4 reprColor;

    reprColor.rgb = reprStyle.usePrimvarColor ? color.rgb : reprStyle.color.rgb;
    reprColor.a   = reprStyle.usePrimvarAlpha ? color.a   : reprStyle.color.a;

    // Compute color overrides
    vec4 colorOverride = ApplyColorOverrides(reprColor);
    reprColor = reprStyle.applyColorOverride ? colorOverride : reprColor;


    // Surface shading can be expensive and also can contain undesirable
    // side effects (like discards).  So only run it for reprs that require it.

    if (reprStyle.useSurfaceShaderColor ||
        reprStyle.useSurfaceShaderAlpha) {
        vec4 shadingColor;

        shadingColor = surfaceShader(Peye,
                                     Neye,
                                     reprColor,
                                     patchCoord);

#ifdef HD_HAS_postSurfaceShader
        shadingColor = postSurfaceShader(Peye,
                                         Neye,
                                         shadingColor);
#endif

        // Modify the shaded color by camera exposure.
        shadingColor.rgb *= GetLinearExposure();

        reprColor.rgb = reprStyle.useSurfaceShaderColor ?
                        shadingColor.rgb :
                        reprColor.rgb;

        reprColor.a   = reprStyle.useSurfaceShaderAlpha ?
                        shadingColor.a :
                        reprColor.a;
    }

    vec4 baseColor = color;
    baseColor = ApplyColorOverrides(baseColor);

    vec4 litColor = mix(baseColor,
                        reprColor,
                        GetLightingBlendAmount());

    // Final overrides.

    return ApplyColorOverridesPostLighting(litColor);
}


// line 129 "terminals.glslfx"

#ifdef HD_HAS_integrateLights
#ifndef HD_HAS_definedIntegrateLights
#define HD_HAS_definedIntegrateLights

LightingContribution
integrateLights(vec4 Peye, vec3 Neye, LightingInterfaceProperties props)
{
    return integrateLightsDefault(Peye, Neye, props);
}

#endif // HD_HAS_definedIntegrateLights
#endif

ReprStyle GetReprStyle()
{
    ReprStyle reprStyle;

    reprStyle.color                    = vec4(0.0, 0.0, 0.0, 1.0);
    reprStyle.usePrimvarColor          = true;
    reprStyle.usePrimvarAlpha          = true;
    reprStyle.applyColorOverride       = true;
    reprStyle.useSurfaceShaderColor    = true;
    reprStyle.useSurfaceShaderAlpha    = true;

    return reprStyle;
}


// line 413 "terminals.glslfx"

ScalarOverride GetScalarOverride()
{
    ScalarOverride result;

#if defined(HD_HAS_scalarOverride)
    result.enabled = true;

    // Allow a scalar value to override the color from the surface
    // for previewing heatmaps. This is useful for editing workflows.
#if defined(HD_HAS_scalarOverrideColorRamp)
    int rampCount = constantPrimvars[GetDrawingCoord().constantCoord].
                scalarOverrideColorRamp.length();
    float scalar = HdGet_scalarOverride() * float(rampCount - 1);
    float baseIndex = floor(scalar);
    float nextIndex = min(float(rampCount - 1), baseIndex + 1.0);
    float interp = scalar - baseIndex;
    result.color = mix(HdGet_scalarOverrideColorRamp(int(baseIndex)).rgb,
                       HdGet_scalarOverrideColorRamp(int(nextIndex)).rgb,
                       interp);
#else
    // If no ramp is given just gamma correct the scalar as greyscale.
    result.color = vec3(pow(HdGet_scalarOverride(), 2.2));
#endif // HD_HAS_scalarOverrideColorRamp

#else // HD_HAS_scalarOverride
    result.enabled = false;
    result.color   = vec3(0.0, 0.0, 0.0);
#endif

    return result;
}


// line 14 "edgeId.glslfx"

int GetPrimitiveEdgeId()
{
    return -1;
}

float GetSelectedEdgeOpacity()
{
    return 0;
}

bool SelectWireframeFaceEdges()
{
    return false;
}


// line 67 "pointId.glslfx"

int GetPointId()
{
    return -1;
}


// line 97 "pointDisk.glslfx"

void ApplyDiskSampleMask()
{
    // do nothing
}


// line 14 "visibility.glslfx"
void DiscardBasedOnTopologicalVisibility()
{
    // Nothing to do, since there's no authored opinion.
}


// line 1346 "mesh.glslfx"

vec2 GetPatchCoordLocalST()
{
    return GetBarycentricCoord().yz;
}

vec4 GetInterpolatedPatchCoord()
{
    return InterpolatePatchCoordTriangle(
                        GetPatchCoordLocalST(), GetPatchParam());
}


// line 1443 "mesh.glslfx"

#ifndef HD_HAS_ptexFaceOffset
#define HD_HAS_ptexFaceOffset
int HdGet_ptexFaceOffset()
{
    return 0;
}
#endif

vec4 GetPatchCoord(int localIndex)
{
    vec4 patchCoord = GetInterpolatedPatchCoord();
    return vec4(patchCoord.xyz, patchCoord.w + HdGet_ptexFaceOffset());
}

vec4 GetPatchCoord()
{
    return GetPatchCoord(0);
}

vec3 ComputeScreenSpacePeye()
{
    return inData.Peye.xyz / inData.Peye.w;
}

vec3 ComputeScreenSpaceNeye()
{
    vec3 Peye = ComputeScreenSpacePeye();
    vec3 Neye = normalize(cross(dFdx(Peye), dFdy(Peye)));
    return (gl_FrontFacing ? Neye : -Neye);
}

void main(void)
{
    ApplyDiskSampleMask();

    bool isFlipped = IsFlipped();

    DiscardBasedOnShading(gl_FrontFacing, isFlipped);

    DiscardBasedOnTopologicalVisibility();

    vec4 color = vec4(0.5, 0.5, 0.5, 1);
#ifdef HD_HAS_displayColor
    color.rgb = HdGet_displayColor().rgb;
#endif
#ifdef HD_HAS_displayOpacity
    color.a = HdGet_displayOpacity();
#endif

    vec3 Peye = ComputeScreenSpacePeye();

    vec3 Neye = inData.Neye;
    // Normalize Neye after rasterizer interpolation.
    if (length(Neye) > 0.0) {
        Neye = normalize(Neye);
    }
    // Give the shader key a chance to override the normal.
    Neye = GetNormal(Neye, 0);
    // Orient the normal for shading.
    Neye = GetShadingNormal(Neye, isFlipped);

    vec4 patchCoord = GetPatchCoord();
    color = ShadingTerminal(vec4(Peye, 1), Neye, color, patchCoord);

#if defined(HD_HAS_depthReadback) && defined(HD_EARLY_FRAGMENT_TESTS)
    // This section needs to come after ShadingTerminal to avoid possible
    // non-uniform paths when sampling textures required for shading
    const float bufferVal = texelFetch(HdGetSampler_depthReadback(),
                                       ivec2(gl_FragCoord.xy),
                                       /* lod = */ 0).x;
    if (gl_FragCoord.z >= bufferVal) {
      discard;
    }
#endif

    color = ApplyEdgeColor(color, patchCoord);

#ifdef HD_MATERIAL_TAG_MASKED
    if (ShouldDiscardByAlpha(color)) {
        discard;
        return;
    }
#endif

    RenderOutput(vec4(Peye, 1), Neye, color, patchCoord);
}

