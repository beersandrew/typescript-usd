"""Forwarding machinery shared by the pxr modules.

Upstream, boost.python (pxr/external/boost/python) turns wrap*.cpp `.def`
declarations into Python classes over C++ objects.  Here every Python object
holds the typescript-usd core value it forwards to in `_js`, and calls go
through `_tsusd` (python/bridge.ts) under a TfErrorMark: errors posted by
the core become Tf.ErrorException, as TfPyConvertTfErrorsToPythonException
does (pxr/base/tf/pyError.cpp:31-60).
"""

import re
import js
import _tsusd as _ts
from pyodide.ffi import JsProxy, JsException, to_js, run_sync, jsnull

ts = _ts


# Tf.ErrorException, defined by upstream's pxr/base/tf/__init__.py and
# handed to the forwarding module through _tf.__SetErrorExceptionClass, as
# Tf_PySetErrorExceptionClass does (pxr/base/tf/pyErrorInternal.cpp).
_error_exception_class = RuntimeError


def set_error_exception_class(cls):
    global _error_exception_class
    _error_exception_class = cls


# ---- Naming -----------------------------------------------------------------

def camel_name(name):
    """The core's member name for an upstream one (scripts/rename/camelName.mjs,
    style-guide rule 1): lowercase first letter, leading acronym lowered."""
    m = re.match(r'^(_*)([A-Z]+)(.*)$', name, re.S)
    if not m:
        return name
    under, run, rest = m.groups()
    if len(run) == 1:
        return under + run.lower() + rest
    if re.match(r'^[a-z]', rest):
        if rest == 's' or re.match(r'^s[^a-z]', rest):
            return under + run.lower() + rest
        return under + run[:-1].lower() + run[-1] + rest
    return under + run.lower() + rest


# ---- Values across the boundary ---------------------------------------------

# Core constructor -> Python wrapper class, filled by register().
_classes = []


def register(js_class, py_class):
    _classes.append((js_class, py_class))
    py_class._jsclass = js_class
    return py_class


def _py_class_for(obj):
    ctor = _ts.ctorOf(obj)
    for js_class, py_class in _classes:
        if _ts.same(ctor, js_class):
            return py_class
    # A core schema class first met as a value (e.g. the ConnectableAPI a
    # method returns): its forwarding class, made as forward_module does.
    if _schema_class_factory is not None:
        try:
            made = _schema_class_factory(str(ctor.name), ctor, None)
        except Exception:
            made = None
        if made is not None:
            return made
    # A subclass of a registered class (e.g. a schema's prim): nearest base.
    for js_class, py_class in reversed(_classes):
        if _ts.isInstance(obj, js_class):
            return py_class
    return None


def wrap(value):
    """A core value as a Python value."""
    if value is jsnull:
        return None
    if not isinstance(value, JsProxy):
        return value
    kind = _ts.kindOf(value)
    if kind == 'array':
        return [wrap(v) for v in value]
    if kind == 'promise':
        return wrap(run_sync(value))
    if kind in ('object', 'iterable'):
        cls = _py_class_for(value)
        if cls is not None:
            return cls._from_js(value)
    if kind == 'iterable':
        # A core range or generator (e.g. SdfPath.getAncestorsRange):
        # upstream wraps these as Python iterables (TfPyIterator-style).
        return _Range(value)
    if kind == 'object':
        # An instance of a core class with no forwarding class: forward it
        # mechanically.
        return Opaque._from_js(value)
    return value


class _Range(object):
    """A core iterable (a range, a generator or a VtArray-like value) as a
    Python sequence: iterable, and for a value read once (e.g. an array
    attribute's value) also len(), indexing and == with any sequence, as
    upstream's VtArray wrappers compare (wrapArray.h)."""
    __slots__ = ('_js', '_items')

    def __init__(self, js):
        self._js = js
        self._items = None

    def _list(self):
        if self._items is None:
            self._items = [wrap(v) for v in _ts.arrayFrom(self._js)]
        return self._items

    def __iter__(self):
        if self._items is not None:
            return iter(self._items)
        return (wrap(v) for v in _ts.arrayFrom(self._js))

    def __len__(self):
        return len(self._list())

    def __getitem__(self, i):
        return self._list()[i]

    def __eq__(self, other):
        if isinstance(other, (list, tuple, _Range)):
            return self._list() == list(other)
        return NotImplemented

    def __ne__(self, other):
        r = self.__eq__(other)
        return r if r is NotImplemented else not r

    __hash__ = None

    def __repr__(self):
        return repr(self._list())


def unwrap(value):
    """A Python value as a core value."""
    # A value the core takes in another form (Sdf.ValueTypeName: the core's
    # public APIs take the type's name).
    as_core = getattr(type(value), '_as_core_argument', None)
    if as_core is not None:
        return as_core(value)
    js = getattr(value, '_js', None)
    if js is not None:
        return js
    if isinstance(value, (list, tuple)):
        return to_js([unwrap(v) for v in value])
    if isinstance(value, dict):
        return to_js({k: unwrap(v) for k, v in value.items()},
                     dict_converter=js.Object.fromEntries)
    return value


def _check(guarded):
    errors, value, thrown = guarded
    if errors is not None:
        raise _error_exception_class(*list(errors))
    return value


def call_method(obj, name, *args):
    return wrap(_check(_ts.callMethod(obj, name, *[unwrap(a) for a in args])))


def call_function(fn, *args):
    return wrap(_check(_ts.callFunction(fn, *[unwrap(a) for a in args])))


def construct(cls, *args):
    return _check(_ts.construct(cls, *[unwrap(a) for a in args]))


def get_property(obj, name):
    return wrap(_check(_ts.getProperty(obj, name)))


def has_member(obj, name):
    try:
        return _ts.kindOf(getattr(obj, name)) != 'undefined'
    except AttributeError:
        return False


# ---- Wrapped classes ---------------------------------------------------------

class _ForwardMeta(type):
    """Class-level forwarding: an upstream static method or constant
    `Cls.Foo` forwards to the core class's static `foo` (rule 1)."""

    def __getattr__(cls, name):
        if name.startswith('__') or name.startswith('_js'):
            raise AttributeError(name)
        js_class = cls.__dict__.get('_jsclass') or getattr(cls, '_jsclass', None)
        if js_class is not None:
            for core in (camel_name(name), name):
                if has_member(js_class, core):
                    member = getattr(js_class, core)
                    if _ts.kindOf(member) == 'function' and not _is_class(member):
                        return _StaticForward(cls, js_class, core)
                    return get_property(js_class, core)
        raise AttributeError("type object '%s' has no attribute '%s'"
                             % (cls.__name__, name))


def _is_class(fn):
    try:
        return _ts.kindOf(fn) == 'function' and str(fn.toString()).startswith('class')
    except Exception:
        return False


class Wrapped(object, metaclass=_ForwardMeta):
    """Base of every forwarding class.

    Unknown attribute names are forwarded mechanically: an upstream method
    name `Foo` calls the core's `foo` (rule 1), falling back to `Foo`.  Names
    listed in `_properties` are Python properties (wrap*.cpp add_property /
    add_static_property): the core member is read, and called if it is a
    zero-argument method.  Arguments pass through `_convert_arg`.
    """
    __slots__ = ('_js',)
    _properties = {}

    def __init__(self, *args):
        # A class with no hand-written constructor forwards to `new`.
        self._js = construct(type(self)._jsclass,
                             *[type(self)._convert_arg(a) for a in args])

    @classmethod
    def _from_js(cls, js):
        self = cls.__new__(cls)
        self._js = js
        return self

    @staticmethod
    def _convert_arg(a):
        return a

    def __getattr__(self, name):
        if name.startswith('__'):
            raise AttributeError(name)
        js = object.__getattribute__(self, '_js')
        cls = type(self)
        props = cls._properties
        if name in props:
            core = props[name] or camel_name(name)
            if _ts.kindOf(getattr(js, core)) == 'function':
                return call_method(js, core)
            return get_property(js, core)
        for core in (camel_name(name), name):
            if has_member(js, core):
                if _ts.kindOf(getattr(js, core)) == 'function':
                    return _BoundForward(js, core, cls._convert_arg)
                return get_property(js, core)
        raise AttributeError("'%s' object has no attribute '%s'"
                             % (cls.__name__, name))

    # Identity of the forwarded object, unless a class says otherwise.
    def __eq__(self, other):
        if not isinstance(other, Wrapped):
            return NotImplemented
        return _ts.same(self._js, other._js)

    def __ne__(self, other):
        r = self.__eq__(other)
        return r if r is NotImplemented else not r

    def __hash__(self):
        return _ts.objectId(self._js)

    def __bool__(self):
        js = object.__getattribute__(self, '_js')
        if has_member(js, 'isValid'):
            return bool(call_method(js, 'isValid'))
        return True


    # Core objects with a scoped lifetime (UsdEditContext, SdfChangeBlock,
    # TfErrorMark: [Symbol.dispose]) are Python context managers, as their
    # upstream wrappers are (e.g. wrapEditContext.cpp).
    def __enter__(self):
        return self

    def __exit__(self, *exc):
        js = object.__getattribute__(self, '_js')
        for name in ('close', 'dispose'):
            if has_member(js, name):
                call_method(js, name)
                break
        return False


class Opaque(Wrapped):
    """Any core object without a hand-written forwarding class."""
    __slots__ = ()


# Set by pxr._schema: builds the forwarding class of a core schema class
# (Get/Create<Name>Attr, Define, Get, Apply), or returns None for others.
_schema_class_factory = None


def auto_class(name, js_class, base=Wrapped, properties=None, module=None):
    """A forwarding class with no hand-written members: everything goes
    through the mechanical rules."""
    ns = {'__slots__': ()}
    if properties:
        ns['_properties'] = dict(properties)
    if module:
        ns['__module__'] = module
    cls = type(name, (base,), ns)
    register(js_class, cls)
    return cls


class _StaticForward(object):
    __slots__ = ('_cls', '_js', '_name')

    def __init__(self, cls, js, name):
        self._cls = cls
        self._js = js
        self._name = name

    def __call__(self, *args):
        return call_method(self._js, self._name,
                           *[self._cls._convert_arg(a) for a in args])


class _BoundForward(object):
    __slots__ = ('_obj', '_name', '_convert')

    def __init__(self, obj, name, convert=None):
        self._obj = obj
        self._name = name
        self._convert = convert or (lambda a: a)

    def __call__(self, *args):
        return call_method(self._obj, self._name,
                           *[self._convert(a) for a in args])


def is_real(x):
    return isinstance(x, (int, float)) and not isinstance(x, bool)


def define_operators(cls, table):
    """Python operator slots from boost.python `.def(self OP T)` overloads:
    each slot tries its overloads in declaration order and returns
    NotImplemented when none accepts the operand, so Python raises the
    TypeError upstream's tests expect."""
    def make(overloads):
        def slot(self, *args):
            for accepts, fn in overloads:
                if accepts(*args):
                    return fn(self, *args)
            return NotImplemented
        return slot
    for dunder, overloads in table.items():
        setattr(cls, dunder, make(overloads))


def comparisons(cls, accepts, compare):
    """==, !=, <, <=, >, >= from one three-way compare (the boost.python
    `self OP self` / `self OP double()` families)."""
    ops = {
        '__eq__': lambda c: c == 0, '__ne__': lambda c: c != 0,
        '__lt__': lambda c: c < 0, '__le__': lambda c: c <= 0,
        '__gt__': lambda c: c > 0, '__ge__': lambda c: c >= 0,
    }
    def make(test):
        return lambda self, other: test(compare(self, other))
    define_operators(cls, {k: [(accepts, make(t))] for k, t in ops.items()})


# ---- Signatures --------------------------------------------------------------

REQUIRED = object()


def bind(name, params, args, kwargs):
    """Python argument binding for one boost.python overload: `params` are
    (name, default) pairs from the .def's arg(...) list (REQUIRED when it has
    no default). Raises TypeError, as Boost.Python.ArgumentError does."""
    if len(args) > len(params):
        raise TypeError('%s() takes at most %d arguments (%d given)'
                        % (name, len(params), len(args)))
    values = list(args)
    for pname, default in params[len(args):]:
        if pname in kwargs:
            values.append(kwargs.pop(pname))
        elif default is REQUIRED:
            raise TypeError('%s() missing argument %r' % (name, pname))
        else:
            values.append(default)
    if kwargs:
        raise TypeError('%s() got unexpected keyword arguments %s'
                        % (name, ', '.join(kwargs)))
    return values


class AnnotatedBoolResult(object):
    """TfPyAnnotatedBoolResult (pxr/base/tf/pyAnnotatedBoolResult.h): a bool
    carrying an annotation, also unpackable as (value, annotation)."""
    __slots__ = ('_value', '_annotation', '_name')

    def __init__(self, value, annotation, name):
        self._value = bool(value)
        self._annotation = annotation
        self._name = name

    def __bool__(self):
        return self._value

    def __eq__(self, other):
        return self._value == other

    def __ne__(self, other):
        return self._value != other

    def __hash__(self):
        return hash(self._value)

    def __getitem__(self, i):
        return (self._value, self._annotation)[i]

    def __getattr__(self, name):
        if name == object.__getattribute__(self, '_name'):
            return object.__getattribute__(self, '_annotation')
        raise AttributeError(name)

    def __repr__(self):
        return '(%r, %r)' % (self._value, self._annotation)


# ---- Module-level forwarding --------------------------------------------------

def forward_module(namespace, js_module, prefixes=()):
    """Give a forwarding module a PEP 562 __getattr__ (PrepareModule copies
    it into the library's package, pxr/base/tf/__init__.py): an upstream
    name `Foo` not written by hand forwards to the core module's `Foo`,
    `<prefix>Foo` (e.g. UsdUtilsCopyLayerMetadata) or rule-1 `foo`. Classes
    become mechanical forwarding classes; functions are called under a
    TfErrorMark with their arguments unwrapped."""
    module_name = namespace.get('__name__')

    def __getattr__(name):
        if name.startswith('__'):
            raise AttributeError(name)
        for core in [name] + [p + name for p in prefixes] + [camel_name(name)]:
            if not has_member(js_module, core):
                continue
            member = getattr(js_module, core)
            if _ts.kindOf(member) == 'function':
                if _is_class(member):
                    for js_class, py_class in _classes:
                        if _ts.same(js_class, member):
                            value = py_class
                            break
                    else:
                        value = None
                        if _schema_class_factory is not None:
                            value = _schema_class_factory(name, member, module_name)
                        if value is None:
                            value = auto_class(name, member, module=module_name)
                else:
                    def value(*args, _fn=member):
                        return call_function(_fn, *args)
                    value.__name__ = name
            else:
                value = wrap(member)
            namespace[name] = value
            return value
        raise AttributeError("module %r has no attribute %r" % (module_name, name))

    namespace['__getattr__'] = __getattr__
