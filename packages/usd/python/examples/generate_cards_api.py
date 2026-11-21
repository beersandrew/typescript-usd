#!/usr/bin/env python3
"""API-only variant of usd-cards-generator's src/generate_cards.py (with its
camera/ and utils/ modules folded in, function by function).

Same card definitions, camera placement, aperture and clipping math, ModelAPI
card authoring and usdz wrapper as the original, but through USD APIs only:

- no subprocess: usdrecord is not run (no card image is rendered; the six
  camera prims are the output) and usdzip is replaced by
  UsdUtils.CreateNewUsdzPackage;
- no temporary files: the camera stage (cameras.usda in the original) and
  the usdz wrapper stage are built in memory.

The outputs are exported into --output-dir (without it, main() returns the
in-memory stages and nothing is written):
  cameras.usda           the camera stage (six cameras, sublayering the subject)
  <name>.usda            the subject root layer with the cards applied
                         (or <name>_Cards.usda, the wrapper, for a usdz input)
  <name>_Cards.usdz      with --create-usdz-result
"""

from pxr import Usd, UsdGeom, UsdLux, UsdUtils, Sdf, Gf
from collections import namedtuple
import argparse
import math
import os
import posixpath

# camera/globals.py
FOCAL_LENGTH = 50
APERTURE = 24
FOCUS_DISTANCE = 168.60936

Card = namedtuple('Card', ['name', 'horizontalIndex', 'verticalIndex', 'sign', 'rotations', 'translationIndex', 'parentPath'])
Rotation = namedtuple('Rotation', ['index', 'amount'])
BoundingBox = namedtuple('BoundingBox', ['width', 'height'])

cards = [
    Card('XPos', 2, 1, 1, [Rotation(0, 90), Rotation(1, 90)], 0, None),
    Card('XNeg', 2, 1, -1, [Rotation(0, 90), Rotation(1, 270)], 0, None),
    Card('YPos', 2, 0, 1, [Rotation(1, 180), Rotation(0, 270)], 1, None),
    Card('YNeg', 2, 0, -1, [Rotation(0, 90)], 1, None),
    Card('ZPos', 0, 1, 1, [], 2, None),
    Card('ZNeg', 0, 1, -1, [Rotation(2, 180), Rotation(1, 180)], 2, None)
]

CARDS_LAYER_SUFFIX_USDA = "_Cards.usda"
CARDS_LAYER_SUFFIX = "_Cards"
CARDS_FOLDER_NAME = "cards"
CAMERAS_FILENAME = "cameras.usda"
RENDER_PURPOSE_MAP = {
    "default": UsdGeom.Tokens.default_,
    "render": UsdGeom.Tokens.render,
    "proxy": UsdGeom.Tokens.proxy,
    "guide": UsdGeom.Tokens.guide
}


# ---- utils/arg_parser.py ----------------------------------------------------

def parse_args(argv=None):
    parser = argparse.ArgumentParser(description="API-only cards generator: builds the six card cameras and applies the cards without rendering.")
    parser.add_argument('usd_file', type=str,
                        help='The USD file you want to add cards to. If USDZ is input, a wrapper layer <name>_Cards.usda is created.')
    parser.add_argument('--output-dir', type=str,
                        help='Where the generated layers (and usdz) are exported. Without it nothing is written: main() returns the stages.')
    parser.add_argument('--dome-light', type=str,
                        help='The path to the dome light HDR image to use, if any')
    parser.add_argument('--create-usdz-result', action='store_true',
                        help='Packages the result as <name>_Cards.usdz with UsdUtils.CreateNewUsdzPackage')
    parser.add_argument('--output-extension', type=str, default='png',
                        help='The extension of the card image paths authored.')
    parser.add_argument('--verbose', action='store_true',
                        help='Prints out the steps as they happen')
    parser.add_argument('--apply-cards', action='store_true',
                        help='Authors the image paths as the cards of the given USD file.')
    parser.add_argument('--render-purposes', type=str, default='default',
                        help='A comma separated list of render purposes to include in the bounds. Valid values are: default, render, proxy, guide.')
    parser.add_argument('--image-width', type=int, default=2048,
                        help='The width of the images that would be generated. Default is 2048.')
    args = parser.parse_args(argv)
    args.is_usdz = ".usdz" in args.usd_file
    return args


# ---- camera/utils/distanceCalculator.py -------------------------------------

def get_distance_to_frame_subject(bounding_box, aperture, focal_length):
    distance_to_capture_horizontal = calculate_field_of_view_distance(aperture, bounding_box.width, focal_length)
    distance_to_capture_vertical = calculate_field_of_view_distance(aperture, bounding_box.height, focal_length)

    return max(distance_to_capture_horizontal, distance_to_capture_vertical)


def calculate_field_of_view_distance(sensor_size, object_size, focal_length):
    return calculate_camera_distance(object_size, calculate_field_of_view(sensor_size, focal_length))


def calculate_field_of_view(sensor_size, focal_length):
    # Focal length and sensor size should be in the same units (e.g., mm)
    field_of_view = 2 * math.atan(sensor_size / (2 * focal_length))
    return field_of_view


def calculate_camera_distance(subject_size, field_of_view):
    # Subject size and field of view should be in the same units (e.g., mm and degrees)
    distance = (subject_size / 2) / math.tan(field_of_view / 2)
    return distance


# ---- camera/cameraGenerator.py ----------------------------------------------

def create_camera_for_card(card, camera_stage, center_of_card_face, bounding_box, camera_view_axis_distance):
    camera_prim = create_camera_with_defaults(camera_stage, card.name)

    distance = get_distance_to_frame_subject(bounding_box, APERTURE, FOCAL_LENGTH)

    nearClip = distance / 10.0
    farClip = (( distance + camera_view_axis_distance ) / 10.0) * 2
    clippingPlanes = Gf.Vec2f(nearClip, farClip)
    camera_prim.GetClippingRangeAttr().Set(clippingPlanes)

    position_camera(camera_prim, card, center_of_card_face, distance)

    calculate_apertures(camera_prim, bounding_box, distance, card)

    rotate_camera(card, camera_prim)


def create_camera_with_defaults(camera_stage, name):
    camera_prim = UsdGeom.Camera.Define(camera_stage, '/CardGenerator/' + name)
    camera_prim.CreateFocalLengthAttr(FOCAL_LENGTH)
    camera_prim.CreateFocusDistanceAttr(FOCUS_DISTANCE)
    camera_prim.CreateFStopAttr(0)
    camera_prim.CreateHorizontalApertureOffsetAttr(0)
    camera_prim.CreateProjectionAttr("perspective")
    camera_prim.CreateVerticalApertureOffsetAttr(0)

    return camera_prim


def position_camera(camera_prim, card, center_of_card_face, distance):
    camera_translation = create_camera_translation(card, center_of_card_face, distance)
    apply_camera_translation(camera_prim, camera_translation)


def create_camera_translation(card, center_of_card_face, distance):
    return center_of_card_face + create_translate_vector(distance * card.sign, card.translationIndex)


def calculate_apertures(camera_prim, bounding_box, distance, card):
    flip_aperatures = False
    for rotation in card.rotations:
        if rotation.amount != 180:
            flip_aperatures = True
            break

    actual_horizontal_aperture = FOCAL_LENGTH * bounding_box.width / distance
    actual_vertical_aperture = FOCAL_LENGTH * bounding_box.height / distance

    if flip_aperatures:
        camera_prim.CreateHorizontalApertureAttr(actual_vertical_aperture)
        camera_prim.CreateVerticalApertureAttr(actual_horizontal_aperture)
    else:
        camera_prim.CreateHorizontalApertureAttr(actual_horizontal_aperture)
        camera_prim.CreateVerticalApertureAttr(actual_vertical_aperture)


def rotate_camera(card, camera_prim):
    for rotation in card.rotations:
        apply_camera_rotation(camera_prim, rotation.index, rotation.amount)


def create_translate_vector(distance, translationIndex):
    vector = Gf.Vec3d(0, 0, 0)
    vector[translationIndex] = distance / 10.0 # convert units from mm to cm
    return vector


def apply_camera_translation(camera_prim, camera_translation):
    xformRoot = UsdGeom.Xformable(camera_prim.GetPrim())
    translateOp = xformRoot.AddTranslateOp(UsdGeom.XformOp.PrecisionDouble)
    translateOp.Set(camera_translation)


def apply_camera_rotation(camera_prim, rotationDirection, rotationAmount):
    xformRoot = UsdGeom.Xformable(camera_prim.GetPrim())
    if rotationDirection == 0:
        rotateOp = xformRoot.AddRotateXOp()
        rotateOp.Set(rotationAmount)
    elif rotationDirection == 1:
        rotateOp = xformRoot.AddRotateYOp()
        rotateOp.Set(rotationAmount)
    else:
        rotateOp = xformRoot.AddRotateZOp()
        rotateOp.Set(rotationAmount)


# ---- camera/cameraManager.py ------------------------------------------------

def setup_cameras(subject_stage, file_to_sublayer, cards, dome_light, render_purposes):
    camera_stage = create_camera_stage()
    create_cameras(camera_stage, subject_stage, cards, render_purposes)
    sublayer_subject(camera_stage, file_to_sublayer)

    if dome_light:
        add_domelight(camera_stage, dome_light)

    return camera_stage


def create_camera_stage():
    stage = Usd.Stage.CreateInMemory()
    stage.SetMetadata('metersPerUnit', 0.01)

    return stage


def create_cameras(camera_stage, subject_stage, cards, render_purposes):
    render_purpose_tokens = convert_render_purposes_to_tokens(render_purposes)
    stage_bounding_box = get_bounding_box(subject_stage, render_purpose_tokens)
    min_bound = stage_bounding_box.GetMin()
    max_bound = stage_bounding_box.GetMax()
    subject_center = (min_bound + max_bound) / 2.0

    for card in cards:
        card_width = (max_bound[card.horizontalIndex] - min_bound[card.horizontalIndex]) * 10
        card_height = (max_bound[card.verticalIndex] - min_bound[card.verticalIndex]) * 10
        card_bounding_box = BoundingBox(card_width, card_height)

        faceTranslationValue = max_bound[card.translationIndex] if card.sign > 0 else min_bound[card.translationIndex]
        center_of_card_face = Gf.Vec3d(subject_center[0], subject_center[1], subject_center[2])
        center_of_card_face[card.translationIndex] = faceTranslationValue

        camera_view_axis_distance = card_height = (max_bound[card.translationIndex] - min_bound[card.translationIndex])

        create_camera_for_card(card, camera_stage, center_of_card_face, card_bounding_box, camera_view_axis_distance)


def convert_render_purposes_to_tokens(render_purposes):
    return [RENDER_PURPOSE_MAP[key] for key in render_purposes.split(',')]


def get_bounding_box(subject_stage, render_purpose_tokens):
    bboxCache = UsdGeom.BBoxCache(Usd.TimeCode(0.0), render_purpose_tokens)
    root = subject_stage.GetPseudoRoot()
    return bboxCache.ComputeWorldBound(root).GetBox()


def sublayer_subject(camera_stage, input_file):
    camera_stage.GetRootLayer().subLayerPaths = [input_file]


def add_domelight(camera_stage, dome_light):
    UsdLux.DomeLight.Define(camera_stage, '/CardGenerator/DomeLight')
    domeLight = UsdLux.DomeLight(camera_stage.GetPrimAtPath('/CardGenerator/DomeLight'))
    domeLight.CreateTextureFileAttr().Set(dome_light)
    domeLight.CreateTextureFormatAttr().Set("latlong")


# ---- camera/renderManger.py (image names only: nothing is rendered) --------

def create_image_filename(card_name, extension, parent_path):
    folder = posixpath.join(parent_path, CARDS_FOLDER_NAME) if CARDS_FOLDER_NAME else parent_path
    return posixpath.join(folder, card_name + "." + extension)


def card_image_names(cards, output_extension):
    return [create_image_filename(card.name, output_extension, card.parentPath) for card in cards]


# ---- generate_cards.py ------------------------------------------------------

def generate_card_images(file_to_sublayer, usd_file, subject_stage, dome_light, output_extension, verbose, apply_cards, render_purposes):

    if apply_cards:
        if verbose:
            print("Step 1: Applying cards default values...")
        apply_cards_defaults(subject_stage, verbose)

    if verbose:
        print("Step 2: Setting up the cameras...")

    camera_stage = setup_cameras(subject_stage, file_to_sublayer, cards, dome_light, render_purposes)

    parent = posixpath.dirname(usd_file.replace("\\", "/"))
    for i, card in enumerate(cards):
        cards[i] = card._replace(parentPath=parent)

    return camera_stage, card_image_names(cards, output_extension)


def apply_cards_defaults(subject_stage, verbose):
    subject_root_prim = subject_stage.GetDefaultPrim()
    subject_root_prim.SetMetadata("kind", "component")
    UsdGeom.ModelAPI.Apply(subject_root_prim)
    geom_model_api = UsdGeom.ModelAPI(subject_root_prim)
    geom_model_api.CreateModelApplyDrawModeAttr(False)
    geom_model_api.CreateModelCardGeometryAttr("box")
    geom_model_api.CreateModelDrawModeAttr("cards")
    geom_model_api.CreateModelDrawModeColorAttr((1, 0, 0))


def link_images_to_subject(subject_stage, images):
    subject_root_prim = subject_stage.GetDefaultPrim()

    geom_model_api = UsdGeom.ModelAPI(subject_root_prim)
    geom_model_api.CreateModelCardTextureXPosAttr(images[0])
    geom_model_api.CreateModelCardTextureXNegAttr(images[1])
    geom_model_api.CreateModelCardTextureYPosAttr(images[2])
    geom_model_api.CreateModelCardTextureYNegAttr(images[3])
    geom_model_api.CreateModelCardTextureZPosAttr(images[4])
    geom_model_api.CreateModelCardTextureZNegAttr(images[5])
    geom_model_api.CreateModelApplyDrawModeAttr(True)


def create_usdz_wrapper_stage(usdz_file):
    existing_stage = Usd.Stage.Open(usdz_file)
    new_stage = Usd.Stage.CreateInMemory()

    UsdUtils.CopyLayerMetadata(existing_stage.GetRootLayer(), new_stage.GetRootLayer())

    new_stage.GetRootLayer().subLayerPaths = [existing_stage.GetRootLayer().identifier]

    return new_stage


def main(argv=None):
    args = parse_args(argv)
    stem = os.path.splitext(os.path.basename(args.usd_file))[0]
    outputs = {}

    subject_stage = create_usdz_wrapper_stage(args.usd_file) if args.is_usdz else Usd.Stage.Open(args.usd_file)
    file_to_sublayer = subject_stage.GetRootLayer().identifier

    camera_stage, images = generate_card_images(file_to_sublayer, args.usd_file, subject_stage, args.dome_light, args.output_extension, args.verbose, args.apply_cards, args.render_purposes)

    if args.apply_cards:
        if args.verbose:
            print("Step 4: Linking cards to subject...")
        parent = posixpath.dirname(args.usd_file.replace("\\", "/"))
        stripped_image_paths = [image.replace(parent, "").lstrip('/') for image in images]
        link_images_to_subject(subject_stage, stripped_image_paths)

    if args.output_dir:
        cameras_path = os.path.join(args.output_dir, CAMERAS_FILENAME)
        camera_stage.GetRootLayer().Export(cameras_path)
        outputs['camera'] = cameras_path

        subject_name = stem + (CARDS_LAYER_SUFFIX_USDA if args.is_usdz else ".usda")
        subject_path = os.path.join(args.output_dir, subject_name)
        subject_stage.GetRootLayer().Export(subject_path)
        outputs['subject'] = subject_path

        if args.create_usdz_result:
            if args.verbose:
                print("Step 5: Zipping cards as usdz...")
            usdz_path = os.path.join(args.output_dir, stem + CARDS_LAYER_SUFFIX + ".usdz")
            # False when a dependency is missing; the authored image paths
            # always are (nothing is rendered), so the package holds the layers
            # and whatever assets do exist.
            outputs['usdzComplete'] = bool(UsdUtils.CreateNewUsdzPackage(Sdf.AssetPath(subject_path), usdz_path))
            outputs['usdz'] = usdz_path

    outputs['cameraPaths'] = ['/CardGenerator/' + card.name for card in cards]
    outputs['images'] = images
    for key, value in outputs.items():
        print("%s: %s" % (key, value))
    if not args.output_dir:
        outputs['cameraStage'] = camera_stage
        outputs['subjectStage'] = subject_stage
    return outputs


if __name__ == "__main__":
    main()
