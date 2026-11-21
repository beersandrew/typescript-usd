"""_usdGeom: the forwarding module upstream's pxr/usd/usdGeom/__init__.py
loads.

Schema classes forward through pxr._schema (generated Get/Create<Name>Attr
from the schema registry). typescript-usd's UsdGeom keeps several
computations as static helpers over (stage, path) or (prim) rather than
instance methods (pxr/usd/usdGeom/src/imageable.ts, pointBased.ts), so
those forward by hand.
"""
from pyodide.ffi import to_js

from pxr._bridge import (Wrapped, register, call_method, call_function, forward_module,
                         construct, wrap, unwrap, ts as _ts)
from pxr import _bridge
from pxr._schema import SchemaBase
from pxr.Usd import _usd

_UsdGeom = _ts.UsdGeom


class Tokens(object):
    """UsdGeomTokens (pxr/usd/usdGeom/tokens.h), as Python str (TfToken
    converts to str). Core gap: typescript-usd/usdGeom exports no tokens
    object, so the values used here are written out from tokens.h."""
    default_ = 'default'
    render = 'render'
    proxy = 'proxy'
    guide = 'guide'
    inherited = 'inherited'
    invisible = 'invisible'
    visible = 'visible'
    points = 'points'
    x = 'X'
    y = 'Y'
    z = 'Z'
    perspective = 'perspective'
    orthographic = 'orthographic'
    origin = 'origin'
    bounds = 'bounds'
    cards = 'cards'
    cross = 'cross'
    box = 'box'
    fromTexture = 'fromTexture'


# Every other token, from the core's UsdGeomTokens (usdGeom/src/tokens.ts),
# under its tokens.h name.
for _k in _UsdGeom.Tokens.object_keys():
    if not hasattr(Tokens, str(_k)):
        setattr(Tokens, str(_k), str(getattr(_UsdGeom.Tokens, str(_k))))
del _k


# ---- metrics.h ---------------------------------------------------------------

def GetStageUpAxis(stage):
    return call_function(_UsdGeom.getStageUpAxis, stage)


def SetStageUpAxis(stage, axis):
    return call_function(_UsdGeom.setStageUpAxis, stage, str(axis))


def GetStageMetersPerUnit(stage):
    return call_function(_UsdGeom.getStageMetersPerUnit, stage)


def SetStageMetersPerUnit(stage, metersPerUnit):
    return call_function(_UsdGeom.setStageMetersPerUnit, stage, float(metersPerUnit))


# ---- Schemas -----------------------------------------------------------------

class _Schema(SchemaBase):
    __slots__ = ()


class Imageable(_Schema):
    __slots__ = ()
    _jsclass = _UsdGeom.Imageable
    _schemaName = 'Imageable'

    def ComputeVisibility(self, time=None):
        self._require_valid()
        return call_method(_UsdGeom.Imageable, 'computeVisibility',
                           self._js.stage, self._js.path,
                           _usd.time_arg(time))

    def MakeVisible(self, time=None):
        self._require_valid()
        return call_method(self._js, 'makeVisible')

    def MakeInvisible(self, time=None):
        self._require_valid()
        return call_method(self._js, 'makeInvisible')


register(_UsdGeom.Imageable, Imageable)


# ---- XformOp (wrapXformOp.cpp) -----------------------------------------------

class _Enum(int):
    """A TfEnum value as Python sees it: an int with the enum's name, shown
    under the class that wraps it (TfPyWrapEnum)."""
    def __new__(cls, value, name, scope='UsdGeom.XformOp'):
        self = int.__new__(cls, value)
        self._name = name
        self._scope = scope
        return self

    @property
    def name(self):
        return self._name

    def _typed(self):
        # The XformOp.Type value with this number.
        return getattr(XformOp, 'Type' + _OP_TYPES[int(self)])

    def __repr__(self):
        return self._scope + '.' + self._name

    __str__ = __repr__


# xformOp.h:110-140 (Type) and 149-153 (Precision), in declaration order.
_OP_TYPES = ['Invalid', 'TranslateX', 'TranslateY', 'TranslateZ', 'Translate',
             'ScaleX', 'ScaleY', 'ScaleZ', 'Scale', 'RotateX', 'RotateY',
             'RotateZ', 'RotateXYZ', 'RotateXZY', 'RotateYXZ', 'RotateYZX',
             'RotateZXY', 'RotateZYX', 'Orient', 'Transform']
_PRECISIONS = ['Double', 'Float', 'Half']
_PRECISION_OF_TYPE = {'double': 'Double', 'float': 'Float', 'half': 'Half',
                      'double3': 'Double', 'float3': 'Float', 'half3': 'Half',
                      'quatd': 'Double', 'quatf': 'Float', 'quath': 'Half',
                      'matrix4d': 'Double'}


class XformOp(Wrapped):
    """UsdGeomXformOp (wrapXformOp.cpp) over the core's XformOp
    (usdGeom/src/xformOp.ts). As upstream's __getattribute__ does, a name
    the op does not define is looked up on its attribute."""
    __slots__ = ()

    for _i, _n in enumerate(_OP_TYPES):
        locals()['Type' + _n] = _Enum(_i, 'Type' + _n)
    for _i, _n in enumerate(_PRECISIONS):
        locals()['Precision' + _n] = _Enum(_i, 'Precision' + _n)
    del _i, _n

    def __init__(self, attr=None, isInverseOp=False):
        js_attr = attr._js if attr is not None else None
        self._js = construct(_UsdGeom.XformOp, js_attr, bool(isInverseOp))

    @classmethod
    def _from_core(cls, op):
        return cls._from_js(op)

    @classmethod
    def _from_attr(cls, attr, inverse=False):
        return cls(attr, inverse)

    def GetAttr(self):
        return wrap(self._js.getAttr())

    def IsInverseOp(self):
        return bool(self._js.isInverseOp())

    def IsDefined(self):
        return bool(self._js.isDefined())

    def GetName(self):
        return str(self._js.getName())

    def GetBaseName(self):
        return str(self._js.getBaseName())

    def GetNamespace(self):
        return str(self._js.getNamespace())

    def SplitName(self):
        return [str(p) for p in self._js.splitName()]

    def GetTypeName(self):
        return self.GetAttr().GetTypeName()

    def GetOpName(self):
        return str(self._js.getOpName())

    def GetOpType(self):
        return getattr(XformOp, 'Type' + _OP_TYPES[int(self._js.getOpType())])

    def GetPrecision(self):
        return getattr(XformOp, 'Precision' + _PRECISIONS[int(self._js.getPrecision())])

    def Get(self, time=None):
        if time is None:
            return self.GetAttr().Get()
        return self.GetAttr().Get(time)

    def Set(self, value, time=None):
        return bool(call_method(self._js, 'set', value, _usd.time_arg(time)))

    def GetTimeSamples(self):
        return [float(t) for t in call_method(self._js, 'getTimeSamples')]

    def GetTimeSamplesInInterval(self, interval):
        return [float(t) for t in call_method(self._js, 'getTimeSamplesInInterval', interval)]

    def GetNumTimeSamples(self):
        return int(call_method(self._js, 'getNumTimeSamples'))

    def GetOpTransform(self, time=None):
        return call_method(self._js, 'getOpTransform', _usd.time_arg(time))

    def MightBeTimeVarying(self):
        return bool(call_method(self._js, 'mightBeTimeVarying'))

    @staticmethod
    def GetOpTypeToken(opType):
        return str(call_method(_UsdGeom.XformOp, 'getOpTypeToken', int(opType)))

    @staticmethod
    def GetOpTypeEnum(opTypeToken):
        return getattr(XformOp, 'Type' + _OP_TYPES[int(call_method(
            _UsdGeom.XformOp, 'getOpTypeEnum', str(opTypeToken)))])

    def __bool__(self):
        # operator bool: IsDefined (xformOp.h).
        return self.IsDefined()

    def __eq__(self, other):
        if isinstance(other, XformOp):
            return bool(call_method(self._js, 'equals', other._js))
        return NotImplemented

    def __ne__(self, other):
        r = self.__eq__(other)
        return r if r is NotImplemented else not r

    __hash__ = None

    def __getattr__(self, name):
        if name.startswith('_'):
            raise AttributeError(name)
        return getattr(self.GetAttr(), name)

    def __repr__(self):
        attr = self._js.getAttr()
        if attr is None:
            return 'UsdGeom.XformOp()'
        return 'UsdGeom.XformOp(Usd.Prim(<%s>).GetAttribute(%r), %r)' % (
            attr.primPath, str(attr.name), self.IsInverseOp())


register(_UsdGeom.XformOp, XformOp)


# xformable.h: the default precision of each Add<Op>Op.
_DEFAULT_PRECISION = {'Translate': 'Double', 'TranslateX': 'Double',
                      'TranslateY': 'Double', 'TranslateZ': 'Double',
                      'Transform': 'Double'}


def _add_op(op):
    core = 'add%sOp' % op

    def add(self, precision=None, opSuffix='', isInverseOp=False):
        # UsdGeomXformable::Add<Op>Op (xformable.h:511-801): the core's
        # add<Op>Op takes the same arguments and returns a UsdGeomXformOp.
        self._require_prim()
        args = [] if precision is None else [int(precision)]
        if opSuffix or isInverseOp:
            if precision is None:
                default = getattr(XformOp, 'Precision' + _DEFAULT_PRECISION.get(op, 'Float'))
                args = [int(default)]
            args += [str(opSuffix), bool(isInverseOp)]
        return XformOp._from_core(_bridge._check(_ts.callMethod(self._js, core, *args)))
    add.__name__ = 'Add%sOp' % op
    return add


class Xformable(Imageable):
    __slots__ = ()
    _jsclass = _UsdGeom.Xformable
    _schemaName = 'Xformable'

    def GetOrderedXformOps(self):
        # UsdGeomXformable::GetOrderedXformOps (wrapXformable.cpp
        # _GetOrderedXformOps): the ops, without resetsXformStack.
        self._require_prim()
        return [XformOp._from_js(op) for op in self._js.getOrderedXformOps()]

    def SetXformOpOrder(self, orderedXformOps, resetXformStack=False):
        self._require_prim()
        return bool(call_method(self._js, 'setXformOpOrder',
                                to_js([op._js for op in orderedXformOps]), bool(resetXformStack)))

    def GetLocalTransformation(self, *args, **kwargs):
        """GetLocalTransformation(time=Default) or (ops, time=Default)
        (wrapXformable.cpp _GetLocalTransformation1/2)."""
        self._require_prim()
        args = list(args)
        ops = kwargs.pop('ops', None)
        if ops is None and args and isinstance(args[0], (list, tuple)):
            ops = args.pop(0)
        time = kwargs.pop('time', args[0] if args else None)
        if ops is not None:
            return call_method(_UsdGeom.Xformable, 'getLocalTransformation',
                               to_js([op._js for op in ops]), _usd.time_arg(time))
        return call_method(self._js, 'getLocalTransformation', _usd.time_arg(time))

    def GetXformOp(self, opType, opSuffix='', isInverseOp=False):
        self._require_prim()
        return XformOp._from_js(call_method(self._js, 'getXformOp', int(opType), str(opSuffix), bool(isInverseOp))._js)


def _get_op(op):
    core = 'get%sOp' % op

    def get(self, opSuffix='', isInverseOp=False):
        self._require_prim()
        return XformOp._from_js(_bridge._check(_ts.callMethod(self._js, core, str(opSuffix), bool(isInverseOp))))
    get.__name__ = 'Get%sOp' % op
    return get


for _op in _OP_TYPES[1:]:
    setattr(Xformable, 'Add%sOp' % _op, _add_op(_op))
    setattr(Xformable, 'Get%sOp' % _op, _get_op(_op))
del _op

register(_UsdGeom.Xformable, Xformable)


class Xform(Xformable):
    __slots__ = ()
    _jsclass = _UsdGeom.Xform
    _schemaName = 'Xform'


register(_UsdGeom.Xform, Xform)


class Camera(Xformable):
    __slots__ = ()
    _jsclass = _UsdGeom.Camera
    _schemaName = 'Camera'

    def GetCamera(self, time=None):
        self._require_valid()
        return call_method(_UsdGeom.Camera, 'getCamera', self._js.prim,
                           _usd.time_arg(time))


register(_UsdGeom.Camera, Camera)


class Points(Imageable):
    __slots__ = ()
    _jsclass = _UsdGeom.Points
    _schemaName = 'Points'

    @staticmethod
    def Get(stage, path):
        return Points(stage.GetPrimAtPath(path))

    def GetPointCount(self, timeCode=None):
        # UsdGeomPointBased::GetPointCount (pointBased.h): a coding error on
        # an invalid schema object, as every Get<Name>Attr is.
        self._require_valid()
        return call_method(_UsdGeom.Points, 'getPointCount', self._js.prim,
                           _usd.time_arg(timeCode))


register(_UsdGeom.Points, Points)


class ModelAPI(SchemaBase):
    __slots__ = ()
    _jsclass = _UsdGeom.ModelAPI
    _schemaName = 'GeomModelAPI'


register(_UsdGeom.ModelAPI, ModelAPI)


# ---- BBoxCache (wrapBBoxCache.cpp) -------------------------------------------

class BBoxCache(Wrapped):
    __slots__ = ()

    def __init__(self, time, includedPurposes, useExtentsHint=False,
                 ignoreVisibility=False):
        self._js = construct(_UsdGeom.BBoxCache, _time(time),
                             to_js([str(p) for p in includedPurposes]),
                             bool(useExtentsHint), bool(ignoreVisibility))


register(_UsdGeom.BBoxCache, BBoxCache)

# ---- XformCommonAPI (wrapXformCommonAPI.cpp) ---------------------------------

def _vec3(value):
    """A GfVec3 argument as the core's [x, y, z] (gf/src/rotation.ts Vec3)."""
    return to_js([float(x) for x in value])


# xformCommonAPI.h:113-121 RotationOrder and 128-136 OpFlags.
_ROTATION_ORDERS = ['XYZ', 'XZY', 'YXZ', 'YZX', 'ZXY', 'ZYX']
_OP_FLAGS = [('OpNone', 0), ('OpTranslate', 1), ('OpPivot', 2), ('OpRotate', 4),
             ('OpScale', 8)]


def _time(time):
    # A UsdTimeCode argument (default: UsdTimeCode::Default()) as the core's.
    return None if time is None else _usd.time_value(time)


def _rotation_order(order):
    """A RotationOrder argument as the core's ('XYZ', ...)."""
    if isinstance(order, int) and 0 <= int(order) < len(_ROTATION_ORDERS):
        return _ROTATION_ORDERS[int(order)]
    raise _bridge._error_exception_class('Invalid rotation order <%r>.' % (order,))


def _rotation_order_enum(core):
    return getattr(XformCommonAPI, 'RotationOrder' + str(core))


class XformCommonAPI(SchemaBase):
    """UsdGeomXformCommonAPI. Vectors are Gf vectors in Python and
    [x, y, z] arrays in the core; RotationOrder is an enum here and the
    order's name ('XYZ') in the core."""
    __slots__ = ()
    _jsclass = _UsdGeom.XformCommonAPI
    _schemaName = 'XformCommonAPI'

    for _i, _n in enumerate(_ROTATION_ORDERS):
        locals()['RotationOrder' + _n] = _Enum(_i, 'RotationOrder' + _n, 'UsdGeom.XformCommonAPI')
    for _n, _v in _OP_FLAGS:
        locals()[_n] = _Enum(_v, _n, 'UsdGeom.XformCommonAPI')
    del _i, _n, _v

    def __bool__(self):
        # operator bool: _IsCompatible (xformCommonAPI.cpp:141-154).
        return self._js_prim() is not None and bool(call_method(self._js, 'isValid'))

    def __repr__(self):
        return 'UsdGeom.XformCommonAPI(%r)' % (self.GetPrim(),)

    def SetXformVectors(self, translation, rotation, scale, pivot, rotationOrder, time):
        return bool(call_method(self._js, 'setXformVectors', _vec3(translation),
                                _vec3(rotation), _vec3(scale), _vec3(pivot),
                                _rotation_order(rotationOrder), _time(time)))

    def _vectors(self, method, time):
        from pxr import Gf
        result = call_method(self._js, method, _time(time))
        if not result:
            return ()
        t, r, s, p, order = list(result)
        return (Gf.Vec3d(*list(t)), Gf.Vec3f(*list(r)), Gf.Vec3f(*list(s)),
                Gf.Vec3f(*list(p)), _rotation_order_enum(order))

    def GetXformVectors(self, time):
        """(translation, rotation, scale, pivot, rotationOrder) at the time,
        or () when the prim's ops are not compatible."""
        return self._vectors('getXformVectors', time)

    def GetXformVectorsByAccumulation(self, time):
        return self._vectors('getXformVectorsByAccumulation', time)

    def SetTranslate(self, translation, time=None):
        return bool(call_method(self._js, 'setTranslate', _vec3(translation), _time(time)))

    def SetPivot(self, pivot, time=None):
        return bool(call_method(self._js, 'setPivot', _vec3(pivot), _time(time)))

    def SetRotate(self, rotation, rotationOrder=0, time=None):
        return bool(call_method(self._js, 'setRotate', _vec3(rotation),
                                _rotation_order(rotationOrder), _time(time)))

    def SetScale(self, scale, time=None):
        return bool(call_method(self._js, 'setScale', _vec3(scale), _time(time)))

    def GetResetXformStack(self):
        return bool(call_method(self._js, 'getResetXformStack'))

    def SetResetXformStack(self, resetXformStack):
        return bool(call_method(self._js, 'setResetXformStack', bool(resetXformStack)))

    def CreateXformOps(self, *args, **kwargs):
        """CreateXformOps(rotationOrder, op1..op4) or CreateXformOps(op1..op4):
        (translateOp, pivotOp, rotateOp, scaleOp, inversePivotOp)."""
        args = list(args)
        if 'rotationOrder' in kwargs:
            args.insert(0, kwargs.pop('rotationOrder'))
        args += [kwargs.pop('op%d' % i) for i in range(1, 5) if 'op%d' % i in kwargs]
        if kwargs:
            raise TypeError('CreateXformOps() got unexpected arguments %r' % list(kwargs))
        core = []
        for i, a in enumerate(args):
            if i == 0 and isinstance(a, _Enum) and a._name.startswith('RotationOrder'):
                core.append(_rotation_order(a))
            else:
                core.append(int(a))
        ops = call_method(self._js, 'createXformOps', *core)
        return tuple(XformOp._from_core(getattr(ops, n)) for n in
                     ('translateOp', 'pivotOp', 'rotateOp', 'scaleOp', 'inversePivotOp'))

    @staticmethod
    def GetRotationTransform(rotation, rotationOrder):
        return call_method(_UsdGeom.XformCommonAPI, 'getRotationTransform',
                           _vec3(rotation), _rotation_order(rotationOrder))

    @staticmethod
    def ConvertRotationOrderToOpType(rotationOrder):
        return _Enum(int(call_method(_UsdGeom.XformCommonAPI, 'convertRotationOrderToOpType',
                                     _rotation_order(rotationOrder))), '', 'UsdGeom.XformOp')._typed()

    @staticmethod
    def ConvertOpTypeToRotationOrder(opType):
        return _rotation_order_enum(call_method(_UsdGeom.XformCommonAPI,
                                                'convertOpTypeToRotationOrder', int(opType)))

    @staticmethod
    def CanConvertOpTypeToRotationOrder(opType):
        return bool(call_method(_UsdGeom.XformCommonAPI,
                                'canConvertOpTypeToRotationOrder', int(opType)))


register(_UsdGeom.XformCommonAPI, XformCommonAPI)


# ---- XformCache (wrapXformCache.cpp) -----------------------------------------

def _matrix4d(m):
    """The core's Matrix4 (16 numbers, row-major, gf/src/matrix.ts) as a
    Gf.Matrix4d."""
    from pxr import Gf
    return Gf.Matrix4d(*[float(x) for x in m])


class XformCache(Wrapped):
    """UsdGeomXformCache. Its transforms are Gf.Matrix4d here and the
    core's Matrix4 arrays there."""
    __slots__ = ()

    def __init__(self, time=None):
        t = _usd.time_arg(time)
        self._js = construct(_UsdGeom.XformCache) if t is None else construct(_UsdGeom.XformCache, t)

    def GetLocalToWorldTransform(self, prim):
        return _matrix4d(call_method(self._js, 'getLocalToWorldTransform', prim))

    def GetParentToWorldTransform(self, prim):
        return _matrix4d(call_method(self._js, 'getParentToWorldTransform', prim))

    def GetLocalTransformation(self, prim):
        """(transform, resetsXformStack), as wrapXformCache.cpp returns."""
        r = call_method(self._js, 'getLocalTransformation', prim)
        return (_matrix4d(r.matrix), bool(r.resetsXformStack))

    def ComputeRelativeTransform(self, prim, ancestor):
        """(transform, resetXformStack) of prim relative to ancestor."""
        r = call_method(self._js, 'computeRelativeTransform', prim, ancestor)
        return (_matrix4d(r.matrix), bool(r.resetXformStack))

    def GetTime(self):
        t = call_method(self._js, 'getTime')
        return _usd.TimeCode() if t is None else _usd.TimeCode(t)

    def SetTime(self, time):
        call_method(self._js, 'setTime', _usd.time_arg(time))

    def Clear(self):
        call_method(self._js, 'clear')

    def Swap(self, other):
        call_method(self._js, 'swap', other._js)

    def TransformMightBeTimeVarying(self, prim):
        return bool(call_method(self._js, 'transformMightBeTimeVarying', prim))

    def GetResetXformStack(self, prim):
        return bool(call_method(self._js, 'getResetXformStack', prim))


register(_UsdGeom.XformCache, XformCache)

forward_module(globals(), _UsdGeom, ('UsdGeom',))
