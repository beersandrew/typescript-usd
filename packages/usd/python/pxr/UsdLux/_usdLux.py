"""_usdLux: the forwarding module upstream's pxr/usd/usdLux/__init__.py
loads. Light schema classes forward through pxr._schema; everything else
mechanically."""
from pxr._bridge import register, forward_module, ts as _ts
from pxr.UsdGeom._usdGeom import Xformable

_UsdLux = _ts.UsdLux


class DomeLight(Xformable):
    __slots__ = ()
    _jsclass = _UsdLux.DomeLight
    _schemaName = 'DomeLight'


register(_UsdLux.DomeLight, DomeLight)

forward_module(globals(), _UsdLux, ('UsdLux',))
