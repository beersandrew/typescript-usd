"""Gf: the parts of pxr/base/gf's Python module the ported tests use.

Each class mirrors its wrap*.cpp; comments cite the `.def` lines forwarded.
"""
from pyodide.ffi import to_js

from pxr._bridge import (Wrapped, register, construct, call_method, wrap,
                         define_operators, comparisons, is_real, ts as _ts)

_Gf = _ts.Gf


def _float(x):
    return float(x)


class _DoubleValue(Wrapped):
    """GfTimeCode / GfDuration: an immutable double with a Python repr."""
    __slots__ = ()

    def __init__(self, value=0.0):
        if not is_real(value):
            raise TypeError('%s(): expected a float, got %s'
                            % (type(self).__name__, type(value).__name__))
        self._js = construct(self._jsclass, float(value))

    def GetValue(self):
        return float(call_method(self._js, 'GetValue'))

    def __repr__(self):
        return call_method(self._js, 'repr')

    def __str__(self):
        return _ts.toString(self._js)

    def __float__(self):
        return float(_ts.toNumber(self._js))

    def __bool__(self):
        return self.GetValue() != 0.0

    def __hash__(self):
        return hash(self.GetValue())


# wrapDuration.cpp:44-80
class Duration(_DoubleValue):
    __slots__ = ()


register(_Gf.Duration, Duration)


# wrapTimeCode.cpp:44-93
class TimeCode(_DoubleValue):
    __slots__ = ()


register(_Gf.TimeCode, TimeCode)


def _is(cls):
    return lambda o: isinstance(o, cls)


_dbl = is_real
_js = lambda o: o._js if hasattr(o, '_js') else float(o)

comparisons(Duration, lambda o: isinstance(o, Duration) or _dbl(o),
            lambda s, o: call_method(s._js, 'compare', _js(o)))
define_operators(Duration, {
    '__mul__': [(_dbl, lambda s, o: call_method(s._js, 'multiply', float(o)))],
    '__rmul__': [(_dbl, lambda s, o: call_method(s._js, 'multiply', float(o)))],
    '__truediv__': [
        (_dbl, lambda s, o: call_method(s._js, 'divide', float(o))),
        (_is(Duration), lambda s, o: _float(call_method(s._js, 'divide', o._js))),
    ],
    '__add__': [(lambda o: isinstance(o, Duration) or _dbl(o),
                 lambda s, o: call_method(s._js, 'add', _js(o)))],
    '__radd__': [(_dbl, lambda s, o: call_method(s._js, 'add', float(o)))],
    '__sub__': [(lambda o: isinstance(o, Duration) or _dbl(o),
                 lambda s, o: call_method(s._js, 'subtract', _js(o)))],
    '__rsub__': [(_dbl, lambda s, o: call_method(
        call_method(s._js, 'getNegated')._js, 'add', float(o)))],
    '__neg__': [(lambda: True, lambda s: call_method(s._js, 'getNegated'))],
})

comparisons(TimeCode, lambda o: isinstance(o, TimeCode) or _dbl(o),
            lambda s, o: call_method(s._js, 'compare', _js(o)))
define_operators(TimeCode, {
    '__mul__': [(_dbl, lambda s, o: call_method(s._js, 'multiply', float(o)))],
    '__rmul__': [(_dbl, lambda s, o: call_method(s._js, 'multiply', float(o)))],
    '__truediv__': [
        (_dbl, lambda s, o: call_method(s._js, 'divide', float(o))),
        (_is(TimeCode), lambda s, o: _float(call_method(s._js, 'divide', o._js))),
    ],
    '__add__': [(lambda o: isinstance(o, (TimeCode, Duration)) or _dbl(o),
                 lambda s, o: call_method(s._js, 'add', _js(o)))],
    '__radd__': [(lambda o: isinstance(o, Duration) or _dbl(o),
                  lambda s, o: call_method(s._js, 'add', _js(o)))],
    '__sub__': [(lambda o: isinstance(o, (TimeCode, Duration)) or _dbl(o),
                 lambda s, o: call_method(s._js, 'subtract', _js(o)))],
    '__rsub__': [(lambda o: isinstance(o, Duration) or _dbl(o),
                  lambda s, o: call_method(
                      call_method(s._js, 'getNegated')._js, 'add', _js(o)))],
    '__neg__': [(lambda: True, lambda s: call_method(s._js, 'getNegated'))],
})


# ---- Vec{2,3,4}{d,f,h,i} (wrapVec.template.cpp) -------------------------------

def _repr_component(x, integral):
    # TfPyRepr of the scalar: Python's repr of a float (or int).
    return repr(int(x)) if integral else repr(float(x))


class _Vec(Wrapped):
    """GfVec<N><s>: forwards to the core's GfVec<N><s> (gf/src/vec.ts).
    Components are read with get(i) and written with setComponent(i, v);
    arithmetic follows wrapVec.template.cpp's operator .defs."""
    __slots__ = ()
    _dim = 0
    _integral = False

    def __init__(self, *args):
        if len(args) == 1 and isinstance(args[0], (list, tuple)):
            args = tuple(args[0])
        conv = []
        for a in args:
            if isinstance(a, _Vec):
                conv.append(a._js)
            elif is_real(a) or isinstance(a, bool):
                conv.append(float(a))
            else:
                raise TypeError('%s(): unexpected argument %r'
                                % (type(self).__name__, a))
        self._js = construct(self._jsclass, *conv)

    def __len__(self):
        return self._dim

    def _index(self, i):
        if not isinstance(i, int):
            raise TypeError('indices must be integers')
        if i < 0:
            i += self._dim
        if not 0 <= i < self._dim:
            raise IndexError('index out of range')
        return i

    def __getitem__(self, i):
        if isinstance(i, slice):
            return [self[j] for j in range(*i.indices(self._dim))]
        v = self._js.get(self._index(i))
        return int(v) if self._integral else float(v)

    def __setitem__(self, i, value):
        call_method(self._js, 'setComponent', self._index(i), float(value))

    def __iter__(self):
        for i in range(self._dim):
            yield self[i]

    def __contains__(self, value):
        return value in list(self)

    def __repr__(self):
        return 'Gf.%s(%s)' % (type(self).__name__, ', '.join(
            _repr_component(x, self._integral) for x in self))

    def __str__(self):
        return _ts.toString(self._js)

    def __hash__(self):
        return hash(tuple(self))

    def _same(self, o):
        return isinstance(o, type(self))

    def __eq__(self, o):
        if isinstance(o, _Vec) and len(o) == self._dim:
            return list(self) == list(o)
        return NotImplemented

    def __ne__(self, o):
        r = self.__eq__(o)
        return r if r is NotImplemented else not r

    def __add__(self, o):
        return call_method(self._js, 'add', o._js) if self._same(o) else NotImplemented

    def __sub__(self, o):
        return call_method(self._js, 'subtract', o._js) if self._same(o) else NotImplemented

    def __mul__(self, o):
        if is_real(o):
            return call_method(self._js, 'getScaled', float(o))
        if self._same(o):
            return float(call_method(self._js, 'dot', o._js))
        return NotImplemented

    def __rmul__(self, o):
        return call_method(self._js, 'getScaled', float(o)) if is_real(o) else NotImplemented

    def __truediv__(self, o):
        return call_method(self._js, 'getDivided', float(o)) if is_real(o) else NotImplemented

    def __neg__(self):
        return call_method(self._js, 'getNegated')

    def __iadd__(self, o):
        if not self._same(o):
            return NotImplemented
        call_method(self._js, 'addInPlace', o._js)
        return self

    def __isub__(self, o):
        if not self._same(o):
            return NotImplemented
        call_method(self._js, 'subtractInPlace', o._js)
        return self

    def __imul__(self, o):
        if not is_real(o):
            return NotImplemented
        call_method(self._js, 'scaleInPlace', float(o))
        return self

    def __itruediv__(self, o):
        if not is_real(o):
            return NotImplemented
        call_method(self._js, 'divideInPlace', float(o))
        return self


for _n in (2, 3, 4):
    for _s in 'dfhi':
        _name = 'Vec%d%s' % (_n, _s)
        _cls = type(_name, (_Vec,), {'__slots__': (), '_dim': _n,
                                      '_integral': _s == 'i',
                                      '__module__': __name__})
        register(getattr(_Gf, _name), _cls)
        globals()[_name] = _cls
del _n, _s, _name, _cls


# ---- Matrix{2,3,4}{d,f} (wrapMatrix{2,3,4}.template.cpp) ----------------------

def _matrix_args(args):
    """Constructor arguments as the core's GfMatrix takes them: scalars,
    a diagonal vector, a list of rows, another matrix (matrixData.ts)."""
    out = []
    for a in args:
        if isinstance(a, (_Vec, _Matrix, _Quat)):
            out.append(a._js)
        elif isinstance(a, (list, tuple)):
            out.append(to_js([list(r) if isinstance(r, (list, tuple, _Vec)) else float(r)
                              for r in a]))
        elif is_real(a) or isinstance(a, bool):
            out.append(float(a))
        else:
            out.append(a)
    return out


class _Matrix(Wrapped):
    """GfMatrix<N><s>: forwards to the core's GfMatrix<N><s>
    (gf/src/matrixData.ts). m[i] is row i as a vector, m[i, j] an element;
    * multiplies matrices, scales by a number, and applies to a vector
    (matrix * column vector, row vector * matrix) as wrapMatrix does."""
    __slots__ = ()
    _dim = 0

    def __init__(self, *args):
        self._js = construct(self._jsclass, *_matrix_args(args))

    def __len__(self):
        return self._dim

    def _row_class(self):
        return globals()['Vec%d%s' % (self._dim, self._scalar)]

    def __getitem__(self, i):
        if isinstance(i, tuple):
            r, c = i
            return float(call_method(self._js, 'getElement', int(r), int(c)))
        if not isinstance(i, int):
            raise TypeError('indices must be integers')
        if i < 0:
            i += self._dim
        if not 0 <= i < self._dim:
            raise IndexError('index out of range')
        return self._row_class()(*[float(call_method(self._js, 'getElement', i, j))
                                   for j in range(self._dim)])

    def __setitem__(self, i, value):
        if isinstance(i, tuple):
            call_method(self._js, 'SetElement', int(i[0]), int(i[1]), float(value))
        else:
            call_method(self._js, 'setRow', int(i), to_js([float(x) for x in value]))

    def __iter__(self):
        for i in range(self._dim):
            yield self[i]

    def __contains__(self, value):
        return any(value in row for row in self) if is_real(value) else value in list(self)

    def GetArray(self):
        return [float(x) for x in call_method(self._js, 'GetArray')]

    def __repr__(self):
        return 'Gf.%s(%s)' % (type(self).__name__, ', '.join(
            repr(float(x)) for x in self.GetArray()))

    def __str__(self):
        return _ts.toString(self._js)

    def __eq__(self, o):
        if isinstance(o, _Matrix) and o._dim == self._dim:
            return self.GetArray() == o.GetArray()
        return NotImplemented

    def __ne__(self, o):
        r = self.__eq__(o)
        return r if r is NotImplemented else not r

    __hash__ = None

    def __mul__(self, o):
        if isinstance(o, _Matrix) and o._dim == self._dim:
            return call_method(self._js, 'getMultiply', o._js)
        if is_real(o):
            return call_method(self._js, 'getScalarMultiply', float(o))
        if isinstance(o, _Vec) and len(o) == self._dim:
            return call_method(self._js, 'multMatrixVec', o._js)
        return NotImplemented

    def __rmul__(self, o):
        if is_real(o):
            return call_method(self._js, 'getScalarMultiply', float(o))
        if isinstance(o, _Vec) and len(o) == self._dim:
            return call_method(self._js, 'multVecMatrix', o._js)
        return NotImplemented

    def __imul__(self, o):
        if isinstance(o, _Matrix) and o._dim == self._dim:
            call_method(self._js, 'multiplyInPlace', o._js)
            return self
        if is_real(o):
            call_method(self._js, 'scalarMultiplyInPlace', float(o))
            return self
        return NotImplemented

    def __add__(self, o):
        return call_method(self._js, 'getAdd', o._js) if isinstance(o, type(self)) else NotImplemented

    def __sub__(self, o):
        return call_method(self._js, 'getSubtract', o._js) if isinstance(o, type(self)) else NotImplemented

    def __neg__(self):
        return call_method(self._js, 'getNegated')

    def __truediv__(self, o):
        if isinstance(o, _Matrix):
            return call_method(self._js, 'getDivide', o._js)
        if is_real(o):
            return call_method(self._js, 'getScalarMultiply', 1.0 / float(o))
        return NotImplemented

    def Transform(self, v):
        return call_method(self._js, 'Transform', v._js)

    def TransformDir(self, v):
        return call_method(self._js, 'transformDir', v._js)

    def TransformAffine(self, v):
        return call_method(self._js, 'transformAffine', v._js)

    def GetRow(self, i):
        return self[i]

    def GetColumn(self, j):
        return self._row_class()(*[self[i, j] for i in range(self._dim)])


for _n in (2, 3, 4):
    for _s in 'df':
        _name = 'Matrix%d%s' % (_n, _s)
        _cls = type(_name, (_Matrix,), {'__slots__': (), '_dim': _n, '_scalar': _s,
                                         '__module__': __name__})
        register(getattr(_Gf, _name), _cls)
        globals()[_name] = _cls
del _n, _s, _name, _cls


# ---- Quat{d,f,h} (wrapQuat.template.cpp) --------------------------------------

class _Quat(Wrapped):
    """GfQuat<s>(real, imaginary) over the core's GfQuat<s>
    (gf/src/quaternion.ts)."""
    __slots__ = ()

    def __init__(self, *args):
        conv = []
        for a in args:
            if isinstance(a, (_Vec, _Quat)):
                conv.append(a._js)
            elif isinstance(a, (list, tuple)):
                conv.append(to_js([float(x) for x in a]))
            else:
                conv.append(float(a))
        self._js = construct(self._jsclass, *conv)

    def GetReal(self):
        return float(call_method(self._js, 'GetReal'))

    def GetImaginary(self):
        return call_method(self._js, 'GetImaginary')

    def __repr__(self):
        i = self.GetImaginary()
        return 'Gf.%s(%r, Gf.Vec3%s(%s))' % (type(self).__name__, self.GetReal(), self._scalar,
                                           ', '.join(repr(float(x)) for x in i))

    def __str__(self):
        return _ts.toString(self._js)

    def __eq__(self, o):
        if isinstance(o, _Quat):
            return self.GetReal() == o.GetReal() and list(self.GetImaginary()) == list(o.GetImaginary())
        return NotImplemented

    def __ne__(self, o):
        r = self.__eq__(o)
        return r if r is NotImplemented else not r

    __hash__ = None

    def __mul__(self, o):
        if isinstance(o, _Quat):
            return call_method(self._js, 'getMultiply', o._js)
        if is_real(o):
            return call_method(self._js, 'getScaled', float(o))
        return NotImplemented

    def __rmul__(self, o):
        return call_method(self._js, 'getScaled', float(o)) if is_real(o) else NotImplemented

    def __add__(self, o):
        return call_method(self._js, 'add', o._js) if isinstance(o, _Quat) else NotImplemented

    def __sub__(self, o):
        return call_method(self._js, 'subtract', o._js) if isinstance(o, _Quat) else NotImplemented

    def __neg__(self):
        return call_method(self._js, 'getNegated')


for _s in 'dfh':
    _name = 'Quat%s' % _s
    _cls = type(_name, (_Quat,), {'__slots__': (), '_scalar': _s, '__module__': __name__})
    register(getattr(_Gf, _name), _cls)
    globals()[_name] = _cls
del _s, _name, _cls


def IsClose(a, b, epsilon):
    """GfIsClose (math.h:42-45 for scalars; vec.template.h GfIsClose:
    |a - b|^2 <= epsilon^2 for vectors; matrix.template.h: every element)."""
    if is_real(a) and is_real(b):
        return abs(float(a) - float(b)) < float(epsilon)
    if isinstance(a, _Vec) and isinstance(b, _Vec):
        return sum((x - y) ** 2 for x, y in zip(a, b)) <= float(epsilon) ** 2
    if isinstance(a, _Matrix) and isinstance(b, _Matrix):
        return bool(_ts.callFunction(_Gf.IsCloseMatrix, a._js, b._js, float(epsilon))[1])
    rows_a, rows_b = list(a), list(b)
    flat_a = [float(x) for r in rows_a for x in (r if hasattr(r, '__iter__') else [r])]
    flat_b = [float(x) for r in rows_b for x in (r if hasattr(r, '__iter__') else [r])]
    return len(flat_a) == len(flat_b) and all(
        abs(x - y) <= float(epsilon) for x, y in zip(flat_a, flat_b))
