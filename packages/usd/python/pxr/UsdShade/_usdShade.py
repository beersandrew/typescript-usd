"""_usdShade: the forwarding module upstream's __init__.py for pxr.UsdShade loads.

Input and Output carry wrapInput.cpp / wrapOutput.cpp's ConnectToSource
overloads; the core's ShadeInput/ShadeOutput.connectToSource takes one
source (an input, an output, a ConnectionSourceInfo or a path). Everything
else forwards mechanically.
"""
from pxr._bridge import (Wrapped, register, call_method, construct, wrap,
                         forward_module, ts as _ts)
from pxr import _bridge
from pxr._schema import SchemaBase

_UsdShade = _ts.UsdShade


class _AttributeType(int):
    def __new__(cls, value, name):
        self = int.__new__(cls, value)
        self._name = name
        return self

    def __repr__(self):
        return 'UsdShade.AttributeType.' + self._name


class AttributeType(object):
    """UsdShadeAttributeType (types.h:22-26)."""
    Invalid = _AttributeType(0, 'Invalid')
    Input = _AttributeType(1, 'Input')
    Output = _AttributeType(2, 'Output')


_SOURCE_TYPES = {1: 'input', 2: 'output'}


def _source_args(args, kwargs):
    """ConnectToSource's arguments as the core's single source."""
    args = list(args)
    source = kwargs.pop('source', None)
    if source is None:
        for key in ('sourcePath', 'input', 'output'):
            if key in kwargs:
                source = kwargs.pop(key)
                break
    if source is None and args:
        source = args.pop(0)
    source_name = kwargs.pop('sourceName', args.pop(0) if args else None)
    kwargs.pop('mod', None)
    if source_name is None:
        if isinstance(source, Wrapped):
            return source._js
        return str(source)
    # ConnectToSource(source, sourceName, sourceType=Output, typeName=None):
    # a ConnectionSourceInfo over the source's ConnectableAPI.
    source_type = kwargs.pop('sourceType', args.pop(0) if args else AttributeType.Output)
    type_name = kwargs.pop('typeName', args.pop(0) if args else None)
    prim = source.GetPrim() if hasattr(source, 'GetPrim') else source
    api = construct(_UsdShade.ConnectableAPI, prim._js)
    return construct(_UsdShade.ConnectionSourceInfo, api, str(source_name),
                     _SOURCE_TYPES.get(int(source_type), 'invalid'),
                     str(type_name) if type_name else '')


class _Connectable(Wrapped):
    __slots__ = ()

    def ConnectToSource(self, *args, **kwargs):
        return bool(call_method(self._js, 'connectToSource', _source_args(args, kwargs)))

    def __bool__(self):
        attr = self._js.attr
        return attr is not None and bool(attr.isValid())


class Input(_Connectable):
    """UsdShadeInput (wrapInput.cpp)."""
    __slots__ = ()


class Output(_Connectable):
    """UsdShadeOutput (wrapOutput.cpp)."""
    __slots__ = ()


class MaterialBindingAPI(SchemaBase):
    """UsdShadeMaterialBindingAPI (wrapMaterialBindingAPI.cpp). The binding
    resolution is the core's static computeBoundMaterial(stage, path,
    purpose), which returns the winning material and binding paths."""
    __slots__ = ()
    _jsclass = _UsdShade.MaterialBindingAPI
    _schemaName = 'MaterialBindingAPI'

    def ComputeBoundMaterial(self, materialPurpose='', supportLegacyBindings=True):
        """(material, bindingRel): the resolved material, or an invalid
        Material and Relationship (wrapMaterialBindingAPI.cpp:128-136)."""
        prim = self.GetPrim()
        stage = prim.GetStage()
        found = call_method(_UsdShade.MaterialBindingAPI, 'computeBoundMaterial',
                            stage, str(prim.GetPath()), str(materialPurpose))
        Material = globals()['__getattr__']('Material')
        if found is None:
            # Upstream returns an invalid Material and Relationship; here the
            # relationship is None (also false).
            return (Material(), None)
        material = Material(stage.GetPrimAtPath(str(found.materialPath)))
        owner, name = str(found.bindingRelPath).rsplit('.', 1)
        return (material, call_method(stage.GetPrimAtPath(owner)._js, 'rel', name))

    @staticmethod
    def ComputeBoundMaterials(prims, materialPurpose='', supportLegacyBindings=True):
        found = [MaterialBindingAPI(p).ComputeBoundMaterial(materialPurpose) for p in prims]
        return ([m for m, _ in found], [r for _, r in found])


register(_UsdShade.ShadeInput, Input)
register(_UsdShade.ShadeOutput, Output)
register(_UsdShade.MaterialBindingAPI, MaterialBindingAPI)

forward_module(globals(), _UsdShade, ('UsdShade',))
