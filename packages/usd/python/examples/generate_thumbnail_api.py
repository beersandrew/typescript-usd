#!/usr/bin/env python3
"""API-only variant of usd-thumbnail-generator's generate_thumbnail.py.

Same camera framing, bounding-box math, layers and AssetPreviewsAPI
authoring as generate_thumbnail.py, but through USD APIs only:

- no subprocess: usdrecord is not run (no image is rendered) and usdzip is
  replaced by UsdUtils.CreateNewUsdzPackage;
- no temporary files: the camera stage and the usdz wrapper stage are built
  in memory (Usd.Stage.CreateInMemory) and the subject's edits stay in its
  in-memory root layer.

The outputs are the generated layers, exported into --output-dir (without
it, main() returns the in-memory stages and nothing is written):
  default_thumbnail.usda      the camera stage (MainCamera, sublayering the subject)
  <name>.usda                 the subject root layer with the thumbnail applied
                              (or <name>_Thumbnail.usda, the wrapper, for a usdz input)
  <name>_Thumbnail.usdz       with --create-usdz-result
The thumbnail image path authored is the one generate_thumbnail.py would
render to (thumbnails/<name>.<ext>); the image itself is not produced.
"""

from pxr import Usd, UsdGeom, UsdMedia, Sdf, Gf, UsdUtils, UsdLux
import math
import os
import argparse
import posixpath


def parse_args(argv=None):
    parser = argparse.ArgumentParser(description="API-only thumbnail generator: builds the thumbnail camera and applies the thumbnail without rendering.")
    parser.add_argument('--usd-file', type=str, required=True,
                        help='The USD file you want to add a thumbnail to. If USDZ is input, a wrapper layer <name>_Thumbnail.usda is created.')
    parser.add_argument('--output-dir', type=str,
                        help='Where the generated layers (and usdz) are exported. Without it nothing is written: main() returns the stages.')
    parser.add_argument('--dome-light', type=str,
                        help='The path to the dome light HDR image to use, if any')
    parser.add_argument('--create-usdz-result', action='store_true',
                        help='Packages the result as <name>_Thumbnail.usdz with UsdUtils.CreateNewUsdzPackage')
    parser.add_argument('--width', type=int, default=2048,
                        help='The width of the image that would be generated. Default is 2048.')
    parser.add_argument('--height', type=int,
                        help='The height of the image that would be generated. If not specified, the image is square.')
    parser.add_argument('--output-extension', type=str, default='png',
                        help='The extension of the thumbnail image path authored.')
    parser.add_argument('--verbose', action='store_true',
                        help='Prints out the steps as they happen')
    parser.add_argument('--apply-thumbnail', action='store_true',
                        help='Authors the image path as the thumbnail of the given USD file.')
    parser.add_argument('--render-purposes', type=str, default='default',
                        help='A comma separated list of render purposes to include in the bounds. Valid values are: default, render, proxy, guide.')
    parser.add_argument('--camera', type=str,
                        help='The path to an existing camera prim to use instead of generating one')
    return parser.parse_args(argv)


THUMBNAIL_LAYER_SUFFIX_USDA = "_Thumbnail.usda"
THUMBNAIL_LAYER_SUFFIX = "_Thumbnail"
DEFAULT_THUMBNAIL_FILENAME = "default_thumbnail.usda"
DEFAULT_CAMERA_NAME = 'MainCamera'
THUMBNAIL_FOLDER_NAME = "thumbnails"
RENDER_PURPOSE_MAP = {
    "default": UsdGeom.Tokens.default_,
    "render": UsdGeom.Tokens.render,
    "proxy": UsdGeom.Tokens.proxy,
    "guide": UsdGeom.Tokens.guide
}


def generate_thumbnail(args, usd_file, render_purpose_tokens):
    """Returns (camera_stage or None, camera path, image path)."""
    if args.verbose:
        print("Step 1: Setting up the camera...")

    subject_stage = Usd.Stage.Open(usd_file)

    camera_stage = None if args.camera else create_file_to_snapshot(args, subject_stage, render_purpose_tokens)
    image_path = create_image_filename(usd_file, args.output_extension)
    camera_to_snapshot_from = args.camera if args.camera else DEFAULT_CAMERA_NAME

    if args.verbose:
        print("Step 2: (not rendered) the snapshot would be " + image_path)

    return camera_stage, camera_to_snapshot_from, image_path


def create_file_to_snapshot(args, subject_stage, render_purpose_tokens):
    up_axis = UsdGeom.GetStageUpAxis(subject_stage)
    is_z_up = up_axis == 'Z'

    camera_stage = create_camera(args, up_axis)
    move_camera(args, camera_stage, subject_stage, render_purpose_tokens, is_z_up)

    if args.dome_light:
        add_domelight(args, camera_stage, is_z_up)

    sublayer_subject(camera_stage, subject_stage.GetRootLayer().identifier)
    set_camera_stage_draw_mode(camera_stage, subject_stage)

    return camera_stage


def create_camera(args, up_axis):
    stage = Usd.Stage.CreateInMemory()

    stage.SetDefaultPrim(stage.DefinePrim('/ThumbnailGenerator', 'Xform'))
    stage.SetMetadata('metersPerUnit', 0.01)
    UsdGeom.SetStageUpAxis(stage, up_axis)

    camera = UsdGeom.Camera.Define(stage, '/ThumbnailGenerator/MainCamera')

    camera.CreateFocusDistanceAttr(168.60936)
    camera.CreateFStopAttr(0)
    camera.CreateHorizontalApertureAttr(24)
    camera.CreateHorizontalApertureOffsetAttr(0)
    camera.CreateProjectionAttr("perspective")
    camera.CreateVerticalApertureAttr(24)
    camera.CreateVerticalApertureOffsetAttr(0)

    if args.height:
        camera.CreateHorizontalApertureAttr(24 * args.width / args.height)

    return stage


def set_camera_stage_draw_mode(camera_stage, subject_stage):
    defaultPrim_path = subject_stage.GetDefaultPrim().GetPath()
    subject_defaultPrim = camera_stage.GetPrimAtPath(defaultPrim_path)
    geom_model_api = UsdGeom.ModelAPI(subject_defaultPrim)
    geom_model_api.CreateModelDrawModeAttr(UsdGeom.Tokens.default_)


def move_camera(args, camera_stage, subject_stage, render_purpose_tokens, is_z_up):
    camera_prim = UsdGeom.Camera.Get(camera_stage, '/ThumbnailGenerator/MainCamera')
    camera_translation = create_camera_translation_and_clipping(args, subject_stage, camera_prim, render_purpose_tokens, is_z_up)
    apply_camera_transforms(camera_prim, camera_translation, is_z_up)


def add_domelight(args, camera_stage, is_z_up):
    UsdLux.DomeLight.Define(camera_stage, '/ThumbnailGenerator/DomeLight')
    domeLight = UsdLux.DomeLight(camera_stage.GetPrimAtPath('/ThumbnailGenerator/DomeLight'))
    domeLight.CreateTextureFileAttr().Set(args.dome_light)
    domeLight.CreateTextureFormatAttr().Set("latlong")

    if (is_z_up):
        xformRoot = UsdGeom.Xformable(domeLight.GetPrim())
        xformRoot.AddRotateXOp().Set(90)


def create_camera_translation_and_clipping(args, subject_stage, camera_prim, render_purpose_tokens, is_z_up):
    bounding_box = get_bounding_box(subject_stage, render_purpose_tokens)
    min_bound = bounding_box.GetMin()
    max_bound = bounding_box.GetMax()

    subject_center = (min_bound + max_bound) / 2.0

    center_of_thumbnail_face = Gf.Vec3d(subject_center[0], min_bound[1], subject_center[2]) if is_z_up else Gf.Vec3d(subject_center[0], subject_center[1], max_bound[2])

    # Conversion from mm to cm
    distance = get_distance_to_camera(min_bound, max_bound, camera_prim, is_z_up)
    distanceInCm = distance / 10.0

    cameraPosition = center_of_thumbnail_face + get_camera_translation(distanceInCm, is_z_up)

    clipIndex = 1 if is_z_up else 2

    # We're extending the clipping planes in both directions to accommodate for different fields of view
    nearClip = (distanceInCm + min_bound[clipIndex]) * 0.5
    farClip = (distanceInCm + max_bound[clipIndex]) * 2
    nearClip = max(nearClip, 0.0000001)
    clippingPlanes = Gf.Vec2f(nearClip, farClip)
    if args.verbose:
        print("Calculating clipping planes... " + str(clippingPlanes))
    camera_prim.GetClippingRangeAttr().Set(clippingPlanes)

    return cameraPosition


def get_bounding_box(subject_stage, render_purpose_tokens):
    bboxCache = UsdGeom.BBoxCache(Usd.TimeCode(0.0), render_purpose_tokens)
    # Compute the bounding box for all geometry under the root
    root = subject_stage.GetPseudoRoot()
    return bboxCache.ComputeWorldBound(root).GetBox()


def get_distance_to_camera(min_bound, max_bound, camera_prim, is_z_up):
    focal_length = camera_prim.GetFocalLengthAttr().Get()
    horizontal_aperture = camera_prim.GetHorizontalApertureAttr().Get()
    vertical_aperture = camera_prim.GetVerticalApertureAttr().Get()

    verticalIndex = 2 if is_z_up else 1

    distance_to_capture_horizontal = calculate_field_of_view_distance(horizontal_aperture, (max_bound[0] - min_bound[0]) * 10, focal_length)
    distance_to_capture_vertical = calculate_field_of_view_distance(vertical_aperture, (max_bound[verticalIndex] - min_bound[verticalIndex]) * 10, focal_length)

    return max(distance_to_capture_horizontal, distance_to_capture_vertical)


def calculate_field_of_view_distance(sensor_size, object_size, focal_length):
    return calculate_camera_distance(object_size, calculate_field_of_view(focal_length, sensor_size))


def calculate_field_of_view(focal_length, sensor_size):
    # Focal length and sensor size should be in the same units (e.g., mm)
    field_of_view = 2 * math.atan(sensor_size / (2 * focal_length))
    return field_of_view


def calculate_camera_distance(subject_size, field_of_view):
    # Subject size and field of view should be in the same units (e.g., mm and degrees)
    distance = (subject_size / 2) / math.tan(field_of_view / 2)
    return distance


def get_camera_translation(distance, is_z_up):
    return Gf.Vec3d(0, -distance, 0) if is_z_up else Gf.Vec3d(0, 0, distance)


def apply_camera_transforms(camera_prim, camera_translation, is_z_up):
    xformRoot = UsdGeom.Xformable(camera_prim.GetPrim())
    translateOp = None
    # Go through each operation in the xformable schema
    for op in xformRoot.GetOrderedXformOps():
        # If the operation is a translate operation, we've found our operation
        if op.GetOpType() == UsdGeom.XformOp.TypeTranslate:
            translateOp = op
            break

    # If no translate operation exists, create one
    if translateOp is None:
        translateOp = xformRoot.AddTranslateOp(UsdGeom.XformOp.PrecisionDouble)

    if (is_z_up):
        xformRoot.AddRotateXOp().Set(90)

    translateOp.Set(camera_translation)


def sublayer_subject(camera_stage, input_file):
    camera_stage.GetRootLayer().subLayerPaths = [input_file]
    return camera_stage


def create_image_filename(input_path, extension):
    # The path generate_thumbnail.py renders to (thumbnails/<name>.<ext>
    # beside the input), computed as a string: no directory is created.
    parent, name = posixpath.split(input_path.replace("\\", "/"))
    stem = posixpath.splitext(name)[0]
    folder = posixpath.join(parent, THUMBNAIL_FOLDER_NAME) if THUMBNAIL_FOLDER_NAME else parent
    return posixpath.join(folder, stem + "." + extension)


def link_image_to_subject(subject_stage, image_name):
    subject_root_prim = subject_stage.GetDefaultPrim()
    mediaAPI = UsdMedia.AssetPreviewsAPI.Apply(subject_root_prim)
    thumbnails = UsdMedia.AssetPreviewsAPI.Thumbnails(defaultImage = Sdf.AssetPath(image_name))
    mediaAPI.SetDefaultThumbnails(thumbnails)


def create_usdz_wrapper_stage(usdz_file):
    existing_stage = Usd.Stage.Open(usdz_file)
    new_stage = Usd.Stage.CreateInMemory()

    UsdUtils.CopyLayerMetadata(existing_stage.GetRootLayer(), new_stage.GetRootLayer())

    new_stage.GetRootLayer().subLayerPaths = [existing_stage.GetRootLayer().identifier]
    return new_stage


def output_stem(usd_file):
    return os.path.splitext(os.path.basename(usd_file))[0]


def generate_single_thumbnail(args):
    usd_file = args.usd_file
    is_usdz = usd_file.endswith(".usdz")
    stem = output_stem(usd_file)
    outputs = {}

    purpose_tokens = [RENDER_PURPOSE_MAP[key] for key in args.render_purposes.split(',')]

    camera_stage, camera, image_name = generate_thumbnail(args, usd_file, purpose_tokens)
    if camera_stage is not None and args.output_dir:
        path = os.path.join(args.output_dir, DEFAULT_THUMBNAIL_FILENAME)
        camera_stage.GetRootLayer().Export(path)
        outputs['camera'] = path

    subject_stage = create_usdz_wrapper_stage(usd_file) if is_usdz and args.apply_thumbnail else Usd.Stage.Open(usd_file)

    if args.apply_thumbnail:
        if args.verbose:
            print("Step 3: Linking thumbnail to subject...")
        link_image_to_subject(subject_stage, image_name)

    if args.output_dir:
        subject_name = stem + (THUMBNAIL_LAYER_SUFFIX_USDA if is_usdz and args.apply_thumbnail else ".usda")
        subject_path = os.path.join(args.output_dir, subject_name)
        subject_stage.GetRootLayer().Export(subject_path)
        outputs['subject'] = subject_path

        if args.create_usdz_result:
            if args.verbose:
                print("Step 4: Creating usdz result...")
            usdz_path = os.path.join(args.output_dir, stem + THUMBNAIL_LAYER_SUFFIX + ".usdz")
            # False when a dependency is missing; the authored image paths
            # always are (nothing is rendered), so the package holds the layers
            # and whatever assets do exist.
            outputs['usdzComplete'] = bool(UsdUtils.CreateNewUsdzPackage(Sdf.AssetPath(subject_path), usdz_path))
            outputs['usdz'] = usdz_path

    outputs['cameraPath'] = '/ThumbnailGenerator/MainCamera' if camera_stage is not None else camera
    outputs['image'] = image_name
    for key, value in outputs.items():
        print("%s: %s" % (key, value))
    if not args.output_dir:
        outputs['cameraStage'] = camera_stage
        outputs['subjectStage'] = subject_stage
    return outputs


def main(argv=None):
    return generate_single_thumbnail(parse_args(argv))


if __name__ == "__main__":
    main()
