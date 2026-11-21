"""_usdMedia: the forwarding module upstream's pxr/usd/usdMedia/__init__.py
loads. AssetPreviewsAPI (wrapAssetPreviewsAPI.cpp); everything else
forwards mechanically."""
from pxr._bridge import (Wrapped, register, construct, call_method, unwrap,
                         forward_module, ts as _ts)
from pxr._schema import SchemaBase

_UsdMedia = _ts.UsdMedia


class AssetPreviewsAPI(SchemaBase):
    __slots__ = ()
    _jsclass = _UsdMedia.AssetPreviewsAPI
    _schemaName = 'AssetPreviewsAPI'

    class Thumbnails(Wrapped):
        """UsdMediaAssetPreviewsAPI::Thumbnails (wrapAssetPreviewsAPI.cpp:
        init<SdfAssetPath>((arg("defaultImage")=SdfAssetPath())) and the
        defaultImage read/write member)."""
        __slots__ = ()

        def __init__(self, defaultImage=None):
            args = [unwrap(defaultImage)] if defaultImage is not None else []
            self._js = construct(_UsdMedia.AssetPreviewsAPI.Thumbnails, *args)

        @property
        def defaultImage(self):
            from pxr._bridge import wrap
            return wrap(self._js.defaultImage)

        @defaultImage.setter
        def defaultImage(self, value):
            self._js.defaultImage = unwrap(value)

    def GetDefaultThumbnails(self):
        r = call_method(self._js, 'getDefaultThumbnails')
        return r


register(_UsdMedia.AssetPreviewsAPI, AssetPreviewsAPI)
register(_UsdMedia.AssetPreviewsAPI.Thumbnails, AssetPreviewsAPI.Thumbnails)

forward_module(globals(), _UsdMedia, ('UsdMedia',))
