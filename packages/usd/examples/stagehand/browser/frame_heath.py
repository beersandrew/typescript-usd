"""Extents, extentsHint and ShotCam framing for the Stagehand heath (W13).

Run with OpenUSD 26.11 Python and the Stagehand schema on PXR_PLUGINPATH_NAME (../resources):
  python3 frame_heath.py heath.usda heath.usda
Checked on the Duo in Today: all subjects in view on the cover screen (viewport aspect 0.68) and
on one half of the open Duo (0.33); pinch and double-tap work from ShotCam."""
import math, sys
from pxr import Usd, UsdGeom, Gf, Vt, Sdf, CameraUtil
src, dst = sys.argv[1], sys.argv[2]
stage = Usd.Stage.Open(src)
times = [0, 24, 48, 72, 96]

# 1. Each recipe mesh: an authored extent covering every profile it takes over the animation.
for prim in stage.Traverse():
    if "StagehandRevolveAPI" not in prim.GetAppliedSchemas(): continue
    a = prim.GetAttribute("stagehand:revolve:profile")
    samples = a.GetTimeSamples() or [Usd.TimeCode.Default()]
    rmax = hmin = hmax = None
    for t in samples:
        for r, y in a.Get(t):
            rmax = r if rmax is None else max(rmax, r)
            hmin = y if hmin is None else min(hmin, y)
            hmax = y if hmax is None else max(hmax, y)
    UsdGeom.Mesh(prim).GetExtentAttr().Set(Vt.Vec3fArray([Gf.Vec3f(-rmax, hmin, -rmax), Gf.Vec3f(rmax, hmax, rmax)]))
    print(prim.GetPath(), "extent r", round(rmax, 3), "y", hmin, hmax)

# 2. extentsHint on the model, from the bbox cache (default + render purposes).
heath = stage.GetPrimAtPath("/Heath")
cache = UsdGeom.BBoxCache(Usd.TimeCode.Default(), [UsdGeom.Tokens.default_, UsdGeom.Tokens.render])
UsdGeom.ModelAPI(heath).SetExtentsHint(UsdGeom.ModelAPI(heath).ComputeExtentsHint(cache))
print("extentsHint", UsdGeom.ModelAPI(heath).GetExtentsHint())

# 3. ShotCam: aim at the subjects (witches + cauldron, not the ground) and back off until every
#    corner of their world bounds fits, with usdview's scene-camera fit (match vertically), at the
#    narrowest screen Today gives it (aspect 0.33, one half of the open Duo; 0.30 for margin) and at 1.6 (landscape).
corners = []
for path in ["/Heath/Cauldron", "/Heath/Witches/FirstRobe", "/Heath/Witches/SecondRobe", "/Heath/Witches/ThirdRobe"]:
    p = stage.GetPrimAtPath(path)
    box = UsdGeom.BBoxCache(0, [UsdGeom.Tokens.default_]).ComputeWorldBound(p).ComputeAlignedRange()
    mn, mx = box.GetMin(), box.GetMax()
    corners += [Gf.Vec3d(x, y, z) for x in (mn[0], mx[0]) for y in (mn[1], mx[1]) for z in (mn[2], mx[2])]
lo = Gf.Vec3d(*[min(c[i] for c in corners) for i in range(3)])
hi = Gf.Vec3d(*[max(c[i] for c in corners) for i in range(3)])
target = (lo + hi) * 0.5
print("subjects", lo, hi, "target", target)
cam = UsdGeom.Camera(stage.GetPrimAtPath("/Heath/ShotCam"))
FOCAL = float(__import__("os").environ.get("FOCAL", "18"))
cam.GetFocalLengthAttr().Set(FOCAL)
gc = cam.GetCamera(0)
elev, margin = math.radians(16), 0.9

def fits(dist, aspect):
    eye = target + Gf.Vec3d(0, math.sin(elev), math.cos(elev)) * dist
    g = Gf.Camera(gc)
    g.transform = Gf.Matrix4d().SetLookAt(eye, target, Gf.Vec3d(0, 1, 0)).GetInverse()
    CameraUtil.ConformWindow(g, CameraUtil.MatchVertically, aspect)
    f = g.frustum
    m = f.ComputeViewMatrix() * f.ComputeProjectionMatrix()
    return all(abs(v[0]) <= margin and abs(v[1]) <= margin for v in (m.Transform(c) for c in corners)), eye, g

dist = 2.0
while not (fits(dist, 0.30)[0] and fits(dist, 1.6)[0]): dist += 0.05
ok, eye, g = fits(dist, 0.30)
print("focal", FOCAL, "distance", round(dist, 2), "eye", eye)
# usdview's free camera (pinch, tumble) starts from the scene camera and orbits its focus
# distance (FreeCamera.FromGfCamera): put it on the subjects, not GfCamera's 1 m default.
cam.GetFocusDistanceAttr().Set(float(dist))
cam.GetPrim().GetAttribute("xformOp:transform").Set(Gf.Matrix4d().SetLookAt(eye, target, Gf.Vec3d(0, 1, 0)).GetInverse())
stage.GetRootLayer().Export(dst)
