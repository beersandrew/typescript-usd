"""_usd: the forwarding module upstream's pxr/usd/usd/__init__.py loads.

Stage (wrapStage.cpp), Prim (wrapPrim.cpp) and TimeCode (wrapTimeCode.cpp),
as far as the ported tests use them.
"""
from pxr._bridge import (Wrapped, register, call_method, call_function,
                         get_property, construct, wrap, is_real, comparisons,
                         auto_class, ts as _ts)
from pxr import Sdf

_Usd = _ts.Usd


class _UsdWrapped(Wrapped):
    """typescript-usd's Usd core takes prim and property paths as strings and
    scene-description type names as their token strings."""
    __slots__ = ()

    @staticmethod
    def _convert_arg(a):
        if isinstance(a, Sdf.Path):
            return a.pathString
        if isinstance(a, Sdf.ValueTypeName):
            return str(a)
        if isinstance(a, TimeCode):
            return a._js
        return a


# ---- TimeCode (wrapTimeCode.cpp) ---------------------------------------------

class TimeCode(Wrapped):
    __slots__ = ()

    def __init__(self, value=0.0):
        if isinstance(value, TimeCode):
            self._js = value._js
        else:
            self._js = construct(_Usd.TimeCode, float(value))

    @staticmethod
    def EarliestTime():
        return call_method(_Usd.TimeCode, 'EarliestTime')

    @staticmethod
    def Default():
        return call_method(_Usd.TimeCode, 'Default')

    def GetValue(self):
        return float(call_method(self._js, 'GetValue'))

    def IsDefault(self):
        return call_method(self._js, 'isDefault')

    def __repr__(self):
        # wrapTimeCode.cpp:38-57 __repr__, TF_PY_REPR_PREFIX 'Usd.'.
        tail = '.Default()'
        if not call_method(self._js, 'isDefault'):
            value = float(call_method(self._js, 'GetValue'))
            earliest = call_method(self._js, 'isEarliestTime')
            if call_method(self._js, 'isPreTime'):
                tail = ('.PreTime(Usd.TimeCode.EarliestTime().GetValue())'
                        if earliest else '.PreTime(%r)' % value)
            elif earliest:
                tail = '.EarliestTime()'
            else:
                tail = '()' if value == 0.0 else '(%r)' % value
        return 'Usd.TimeCode' + tail

    def __str__(self):
        # wrapTimeCode.cpp:33-36 _Str: TfStringify (timeCode.cpp:33-47).
        return call_function(_Usd.usdTimeCodeToStreamString, self._js)


def _time_compare(a, b):
    # timeCode.h:165-209: Default() equals Default() and is less than every
    # numeric time; a pre-time is less than the time it precedes.
    a_default = call_method(a._js, 'isDefault')
    b_default = call_method(b._js, 'isDefault')
    if a_default or b_default:
        return (b_default - a_default) * -1 if a_default != b_default else 0
    av, bv = a.GetValue(), b.GetValue()
    if av != bv:
        return -1 if av < bv else 1
    ap, bp = call_method(a._js, 'isPreTime'), call_method(b._js, 'isPreTime')
    return 0 if ap == bp else (-1 if ap else 1)


# wrapTimeCode.cpp:89-94 (self == self, ... self >= self).
comparisons(TimeCode, lambda o: isinstance(o, TimeCode), _time_compare)


def _time_hash(self):
    # wrapTimeCode.cpp:31 __hash__ over hash_value (timeCode.h:212-214):
    # (value, isPreTime); every Default() is equal, so they hash alike.
    if call_method(self._js, 'isDefault'):
        return hash('Usd.TimeCode.Default')
    return hash((self.GetValue(), bool(call_method(self._js, 'isPreTime'))))


TimeCode.__hash__ = _time_hash
register(_Usd.TimeCode, TimeCode)


# Scalar value types whose VtValue holds a C++ floating-point type, which
# boost.python returns as a Python float (sdf/types.h). The core keeps them
# as JavaScript numbers, which Pyodide hands to Python as an int when the
# number is whole (a value authored from TypeScript as `set(5)`).
_FLOAT_SCALARS = frozenset(('double', 'float', 'half', 'timecode'))


def _scalar_value(type_name, value):
    if (isinstance(value, int) and not isinstance(value, bool)
            and str(type_name) in _FLOAT_SCALARS):
        return float(value)
    return value


def time_arg(t):
    """A UsdTimeCode argument as the core's numeric time: the core's
    schema helpers take `time?: number`, with undefined for Default."""
    if t is None:
        return None
    if isinstance(t, TimeCode):
        t = t.GetValue()
    t = float(t)
    return None if t != t else t


def time_value(t):
    """A UsdTimeCode argument as the core takes it where it accepts
    `number | UsdTimeCode` (e.g. UsdGeomBBoxCache)."""
    if isinstance(t, TimeCode):
        return t._js
    return float(t)


# ---- Prim (wrapPrim.cpp) -----------------------------------------------------

class Prim(_UsdWrapped):
    """UsdPrim. An invalid prim (Usd.Prim(), or GetPrimAtPath of a missing
    path) holds no core prim: the core returns undefined instead."""
    __slots__ = ()

    def __init__(self):
        self._js = None

    @classmethod
    def _from_js(cls, js):
        self = cls.__new__(cls)
        self._js = js
        return self

    def IsValid(self):
        return self._js is not None and bool(call_method(self._js, 'isValid'))

    def __bool__(self):
        return self.IsValid()

    def GetPath(self):
        return Sdf.Path(self._js.path) if self._js is not None else Sdf.Path()

    def GetName(self):
        # UsdObject::GetName (object.h): the name of the prim's path; the
        # core's Prim has no name member of its own.
        return self.GetPath().name if self._js is not None else ''

    def GetTypeName(self):
        return self._js.typeName

    def GetStage(self):
        return call_method(self._js, 'getStage')

    def GetAttribute(self, attrName):
        return call_method(self._js, 'attr', str(attrName))

    def HasAttribute(self, attrName):
        return call_method(self._js, 'getAttr', str(attrName)) is not None

    def __eq__(self, other):
        if not isinstance(other, Prim):
            return NotImplemented
        if self._js is None or other._js is None:
            return self._js is None and other._js is None
        return self._js.path == other._js.path and _ts.same(
            call_method(self._js, 'getStage')._js,
            call_method(other._js, 'getStage')._js)

    def __ne__(self, other):
        r = self.__eq__(other)
        return r if r is NotImplemented else not r

    def __hash__(self):
        return hash(self._js.path if self._js is not None else '')

    def __repr__(self):
        if not self.IsValid():
            return 'invalid null prim'
        return 'Usd.Prim(<%s>)' % self._js.path

    def __getattr__(self, name):
        if object.__getattribute__(self, '_js') is None and not name.startswith('__'):
            def invalid(*args, **kwargs):
                from pxr._bridge import _error_exception_class
                raise _error_exception_class(
                    'Used null prim')
            return invalid
        return Wrapped.__getattr__(self, name)


register(_Usd.Prim, Prim)


class _Property(_UsdWrapped):
    """UsdProperty: equal when they name the same property of the same
    stage (UsdObject::operator==, object.h)."""
    __slots__ = ()

    # The core's properties spell UsdObject::GetPath by rule 1 (getPath);
    # its prims use a `path` getter (prim.ts) — a naming exception.
    def GetPath(self):
        return Sdf.Path(self._js.getPath())

    def GetName(self):
        return self._js.name

    def __eq__(self, other):
        if not isinstance(other, _Property) or type(self) is not type(other):
            return NotImplemented
        return self._js.getPath() == other._js.getPath() and _ts.same(
            self._js.getStage(), other._js.getStage())

    def __hash__(self):
        return hash(self._js.getPath())

    def __repr__(self):
        return 'Usd.%s(<%s>)' % (type(self).__name__, self._js.getPath())


class Attribute(_Property):
    __slots__ = ()

    # wrapAttribute.cpp: Get(time=Default), Set(value, time=Default).
    def Get(self, time=None):
        t = time_arg(time)
        if t is None:
            value = call_method(self._js, 'getValue')
        else:
            # UsdAttribute::Get(value, time) (attribute.h): the core's
            # get(time) resolves time samples, splines and value clips.
            value = call_method(self._js, 'get', t)
        return _scalar_value(self._js.typeName, value)

    def Set(self, value, time=None):
        t = time_arg(time)
        if t is None:
            call_method(self._js, 'set', value)
        else:
            call_method(self._js, 'setTimeSample', t, value)
        return True

    def GetTimeSamples(self):
        return [float(t) for t in call_method(self._js, 'getTimeSampleKeys')]

    def GetNumTimeSamples(self):
        return len(self.GetTimeSamples())

    def GetTypeName(self):
        return Sdf.ValueTypeName._from_js(
            _ts.callFunction(_ts.Sdf.findValueTypeName, self._js.typeName)[1])

    def IsValid(self):
        return bool(call_method(self._js, 'isValid'))

    def __bool__(self):
        return self.IsValid()


class Relationship(_Property):
    __slots__ = ()


register(_Usd.Attribute, Attribute)
register(_Usd.Rel, Relationship)
StageCache = auto_class('StageCache', _Usd.StageCache, base=_UsdWrapped)


def prim_result(js):
    """A UsdPrim return value: invalid when the core returns undefined."""
    return js if isinstance(js, Prim) else Prim._from_js(None)


# ---- Stage (wrapStage.cpp) ---------------------------------------------------

class Stage(_UsdWrapped):
    """UsdStage. typescript-usd composes a stage's layer edits (sublayers,
    references, payloads that load layers) asynchronously, settled by
    `await stage.flushChanges()` (packages/usd/AGENTS.md, "Interim APIs");
    upstream's change processing is synchronous (stage.cpp
    _HandleLayersDidChange). So every call through a Stage first awaits
    flushChanges, and Python sees the stage as composed after each edit."""
    __slots__ = ()

    def _flush(self):
        call_method(self._js, 'flushChanges')

    def __getattr__(self, name):
        attr = _UsdWrapped.__getattr__(self, name)
        if callable(attr):
            def flushed(*args, **kwargs):
                self._flush()
                return attr(*args, **kwargs)
            return flushed
        return attr

    @staticmethod
    def Open(filePath, load=None):
        # UsdStage.open returns a Promise: its asset reads go through Ar
        # asynchronously. wrap() awaits it with pyodide.ffi.run_sync.
        if hasattr(filePath, '_js'):
            filePath = filePath._js
        return call_method(_Usd.Stage, 'open', filePath)

    @staticmethod
    def CreateInMemory(identifier=None):
        return call_method(_Usd.Stage, 'createNew')

    # The time range and rates (stage.cpp:10086-10230): Set* author the
    # stage metadata (SetMetadata); Get* read the core's resolved values,
    # whose fallbacks are those of sdf/schema.cpp (start/end 0, 24 fps).
    def GetStartTimeCode(self):
        v = self._js.startTimeCode
        return 0.0 if v is None else float(v)

    def GetEndTimeCode(self):
        v = self._js.endTimeCode
        return 0.0 if v is None else float(v)

    def SetStartTimeCode(self, startTime):
        call_method(self._js, 'setMetadata', 'startTimeCode', float(startTime))

    def SetEndTimeCode(self, endTime):
        call_method(self._js, 'setMetadata', 'endTimeCode', float(endTime))

    def HasAuthoredTimeCodeRange(self):
        return self._js.startTimeCode is not None and self._js.endTimeCode is not None

    def GetTimeCodesPerSecond(self):
        return float(self._js.timeCodesPerSecond)

    def SetTimeCodesPerSecond(self, timeCodesPerSecond):
        call_method(self._js, 'setMetadata', 'timeCodesPerSecond', float(timeCodesPerSecond))

    def GetFramesPerSecond(self):
        return float(self._js.framesPerSecond)

    def SetFramesPerSecond(self, framesPerSecond):
        call_method(self._js, 'setMetadata', 'framesPerSecond', float(framesPerSecond))

    def GetPrimAtPath(self, path):
        self._flush()
        return prim_result(call_method(self._js, 'getPrim', str(path)))

    def DefinePrim(self, path, typeName=''):
        self._flush()
        return prim_result(call_method(self._js, 'definePrim', str(path),
                                       typeName or None))

    def GetDefaultPrim(self):
        self._flush()
        return prim_result(call_method(self._js, 'getDefaultPrim'))

    def GetPseudoRoot(self):
        return self.GetPrimAtPath('/')

    def Traverse(self, predicate=None):
        # wrapStage.cpp:450-454; UsdStage::Traverse is UsdPrimRange::Stage
        # (stage.cpp:4183-4193; call_method wraps it as a Python iterable of Usd.Prim): a range of prims. (The core's
        # stage.traverse() yields prim paths.)
        self._flush()
        if predicate is None:
            return call_method(_Usd.PrimRange, 'stage', self._js)
        return call_method(_Usd.PrimRange, 'stage', self._js, predicate)

    def TraverseAll(self):
        # UsdStage::TraverseAll (stage.cpp:4196-4199).
        self._flush()
        return call_method(_Usd.PrimRange, 'stage', self._js,
                           get_property(_Usd, 'PrimAllPrimsPredicate'))

    def GetObjectAtPath(self, path):
        self._flush()
        r = call_method(self._js, 'getObjectAtPath', str(path))
        return r if r is not None else Prim._from_js(None)


register(_Usd.Stage, Stage)
