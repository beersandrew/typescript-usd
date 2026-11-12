
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
#define drawIndirectResult_Binding 4
#define HD_HAS_drawIndirectResult 1
#define dispatchBuffer_Binding 5
#define HD_HAS_dispatchBuffer 1
#define ulocCullParams_Binding 6
#define HD_HAS_ulocCullParams 1
#define drawCullInput_Binding 7
#define HD_HAS_drawCullInput 1
#define HD_NUM_PRIMITIVE_VERTS 0
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

// //////// Codegen Accessors //////// 
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
// Read-Write Accessors & Mutators
// Read-Only Accessors

// //////// Codegen CS Source //////// 
struct hd_DrawIndex {
  int drawId;
  int instanceId;
} hd_drawIndex;

void SetDrawIndex(int drawId, int instanceId) {
  hd_drawIndex.drawId = drawId;
  hd_drawIndex.instanceId = instanceId;
}

int GetDrawingCoordField(int offset) {
  const int drawIndexOffset = 5;
  const int drawIndexStride = 16;
  const int base = hd_drawIndex.drawId * drawIndexStride + drawIndexOffset;
  return int(drawCullInput[base + offset]);
}
hd_instanceIndex GetInstanceIndex() {  hd_instanceIndex r; r.indices[0] = 0; return r; }
// Compute shaders read the drawCommands buffer directly.
hd_drawingCoord GetDrawingCoord() {
  hd_drawingCoord dc;
  dc.modelCoord              = GetDrawingCoordField(0);
  dc.constantCoord           = GetDrawingCoordField(1);
  dc.elementCoord            = GetDrawingCoordField(2);
  dc.primitiveCoord          = GetDrawingCoordField(3);
  dc.fvarCoord               = GetDrawingCoordField(4);
  dc.shaderCoord             = GetDrawingCoordField(6);
  dc.vertexCoord             = GetDrawingCoordField(7);
  dc.topologyVisibilityCoord = GetDrawingCoordField(8);
  dc.varyingCoord            = GetDrawingCoordField(9);
  hd_instanceIndex r = GetInstanceIndex();
  dc.instanceIndex[0] = r.indices[0];
  return dc;
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

// line 34 "frustumCull.glslfx"

void
FrustumCullCountVisibleInstances(int resultInstanceCount)
{
    // do nothing
}


// line 43 "frustumCull.glslfx"

bool
FrustumCullIsTinyPrim(vec4 bboxMin, vec4 bboxMax, vec2 drawRangeNDC)
{
    // do nothing
    return false;
}


// line 76 "frustumCull.glslfx"

bool
FrustumCullIsVisible(MAT4 toClip, vec4 localMin, vec4 localMax, vec2 drawRangeNDC)
{
    // Disable culling when:
    // (a) BBox is empty. An empty bbox defaults to [FLT_MAX, -FLT_MAX]), so
    //     min > max.
    // (b) Bounds are infinite.
    if (any(greaterThan(localMin, localMax)) ||
        any(isinf(localMin)) || any(isinf(localMax))) {
        return true;
    }

    // Transform the corners of the bounding box to clipping space.
    vec4 p[8];
    p[0] = vec4(toClip * vec4(localMin.x, localMin.y, localMin.z, 1));
    p[2] = vec4(toClip * vec4(localMin.x, localMax.y, localMin.z, 1));
    p[5] = vec4(toClip * vec4(localMax.x, localMin.y, localMax.z, 1));
    p[7] = vec4(toClip * vec4(localMax.x, localMax.y, localMax.z, 1));

    // This prim is visible if it wasn't culled and at least one tiny prim test
    // failed. Test two axes here because size is measured in screen space.
    // We front-load this test because it saves quite a bit of compute: in one
    // test the framerate went from 7.7 to 9.0 FPS.
    if (FrustumCullIsTinyPrim(p[0], p[7], drawRangeNDC) &&
        FrustumCullIsTinyPrim(p[2], p[5], drawRangeNDC))
    {
        return false;
    }

    // Finish computing points and perform frustum culling.
    p[1] = vec4(toClip * vec4(localMin.x, localMin.y, localMax.z, 1));
    p[3] = vec4(toClip * vec4(localMin.x, localMax.y, localMax.z, 1));
    p[4] = vec4(toClip * vec4(localMax.x, localMin.y, localMin.z, 1));
    p[6] = vec4(toClip * vec4(localMax.x, localMax.y, localMin.z, 1));

    // Test the corners of the bounding box against the clipping volume.
    // clipFlags is effectively a 6-bit field, holding one bit of information
    // per frustum plane. Each component of the vector holds 2 bits.
    // If the bounding box overlaps the clip volume, then clipFlags will be
    // (0b11, 0b11, 0b11).
    ivec3 clipFlags = ivec3(0);
    for (int i=0; i<8; ++i) {
        vec4 clipPos = p[i];
        bvec3 clip0 = lessThan(clipPos.xyz, vec3(clipPos.w));
        bvec3 clip1 = greaterThan(clipPos.xyz, -vec3(clipPos.w));
        clipFlags |= ivec3(clip0) /* bit 0 */ + 2*ivec3(clip1) /*bit 1*/;
    }

    return all(equal(clipFlags, ivec3(3)));
}


// line 347 "frustumCull.glslfx"

MAT4 GetCullMatrix()
{
    return MAT4(cullMatrix);
}

void compute(int drawCommandIndex)
{
    SetDrawIndex(drawCommandIndex, 0);

    // instanceCountOffset is a relative offset in drawcommand struct.
    // it's a second entry in both DrawArraysCommand and DrawElementsCommand.
    const uint instanceCountOffset = 1;

    MAT4 transform = HdGet_transform();
    MAT4 toClip = GetCullMatrix() * transform;

    vec4 localMin = HdGet_bboxLocalMin();
    vec4 localMax = HdGet_bboxLocalMax();

    bool isVisible = FrustumCullIsVisible(
        toClip, localMin, localMax, drawRangeNDC);

    // Compute the index to the 'instanceCount' struct member in drawCommands.
    uint instanceIndex = uint(drawCommandIndex) *
        drawCommandNumUints + instanceCountOffset;

    // Set the resulting instance count to 0 if the primitive is culled
    // otherwise pass through the original incoming instance count.
    uint resultInstanceCount = drawCullInput[instanceIndex] * uint(isVisible);
    drawCommands[instanceIndex] = resultInstanceCount;

    FrustumCullCountVisibleInstances(int(resultInstanceCount));
}


void main() {
  int computeCoordinate = int(hd_GlobalInvocationID.x);
  if (computeCoordinate >= indexEnd) {
    return;
  };
  compute(computeCoordinate);
}
