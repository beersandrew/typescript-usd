"""_sdf: the forwarding module upstream's pxr/usd/sdf/__init__.py loads.

Only the classes the ported tests use: Path (wrapPath.cpp) and LayerOffset
(wrapLayerOffset.cpp), forwarding to typescript-usd's SdfPath and
sdfLayerOffset* functions.
"""
import js
from pyodide.ffi import to_js

from pxr._bridge import (Wrapped, register, call_method, call_function, construct,
                         wrap, unwrap, define_operators, comparisons, is_real,
                         bind, REQUIRED, AnnotatedBoolResult, ts as _ts)
from pxr import Gf

_Sdf = _ts.Sdf
_SdfPath = _Sdf.Path


# ---- Path (wrapPath.cpp:149-354) ---------------------------------------------

def _path_js(x):
    """An SdfPath argument: a Path, or a str by implicitly_convertible<string,
    SdfPath> (wrapPath.cpp:340)."""
    if isinstance(x, Path):
        return x._js
    if isinstance(x, str):
        return call_method(_SdfPath, 'fromString', x)._js
    raise TypeError('expected Sdf.Path, got %s' % type(x).__name__)


def _paths_js(xs):
    return to_js([_path_js(x) for x in xs])


def _same(x):
    return x


def _method(name, core, params=(), ret=None):
    """One forwarded method: `params` are (name, convert, default)."""
    sig = [(p, d) for p, _, d in params]
    convs = [c for _, c, _ in params]

    def fwd(self, *args, **kwargs):
        vals = bind(name, sig, args, kwargs)
        r = call_method(self._js, core, *[c(v) for c, v in zip(convs, vals)])
        return ret(r) if ret else r
    fwd.__name__ = name
    return fwd


def _static(name, core, params=(), ret=None, target=None):
    sig = [(p, d) for p, _, d in params]
    convs = [c for _, c, _ in params]

    def fwd(*args, **kwargs):
        vals = bind(name, sig, args, kwargs)
        args = [c(v) for c, v in zip(convs, vals)]
        if target is None:
            r = call_method(_SdfPath, core, *args)
        else:
            r = call_function(getattr(_Sdf, target), *args)
        return ret(r) if ret else r
    fwd.__name__ = name
    return staticmethod(fwd)


_P = lambda n, d=REQUIRED: (n, _path_js, d)
_S = lambda n, d=REQUIRED: (n, str, d)
_B = lambda n, d=REQUIRED: (n, bool, d)
_I = lambda n, d=REQUIRED: (n, int, d)


class Path(Wrapped):
    __slots__ = ()
    # add_property (wrapPath.cpp:166-191, 220)
    _properties = {'pathElementCount': None, 'pathString': None,
                   'name': None, 'elementString': None,
                   'targetPath': 'getTargetPath', 'isEmpty': None}

    def __init__(self, path=None):
        if path is None:
            self._js = _SdfPath.emptyPath
        elif isinstance(path, Path):
            self._js = path._js
        elif isinstance(path, str):
            self._js = _path_js(path)
        else:
            raise TypeError('Sdf.Path(): expected str or Sdf.Path, got %s'
                            % type(path).__name__)

    GetPrefixes = _method('GetPrefixes', 'getPrefixes', [_I('numPrefixes', 0)])
    GetAncestorsRange = _method('GetAncestorsRange', 'getAncestorsRange')
    HasPrefix = _method('HasPrefix', 'hasPrefix', [_P('prefix')])
    MakeAbsolutePath = _method('MakeAbsolutePath', 'makeAbsolutePath', [_P('anchor')])
    MakeRelativePath = _method('MakeRelativePath', 'makeRelativePath', [_P('anchor')])
    AppendPath = _method('AppendPath', 'appendPath', [_P('newSuffix')])
    AppendTarget = _method('AppendTarget', 'appendTarget', [_P('targetPath')])
    AppendMapper = _method('AppendMapper', 'appendMapper', [_P('targetPath')])
    ReplacePrefix = _method('ReplacePrefix', 'replacePrefix',
                            [_P('oldPrefix'), _P('newPrefix'),
                             _B('fixTargetPaths', True)])
    GetCommonPrefix = _method('GetCommonPrefix', 'getCommonPrefix', [_P('path')])
    # return_value_policy<TfPyPairToTuple>
    RemoveCommonSuffix = _method('RemoveCommonSuffix', 'removeCommonSuffix',
                                 [_P('otherPath'), _B('stopAtRootPrim', False)],
                                 ret=tuple)
    GetVariantSelection = _method('GetVariantSelection', 'getVariantSelection',
                                  ret=tuple)
    ReplaceTargetPath = _method('ReplaceTargetPath', 'replaceTargetPath',
                                [_P('newTargetPath')])

    GetConciseRelativePaths = _static(
        'GetConciseRelativePaths', 'getConciseRelativePaths',
        [('paths', _paths_js, REQUIRED)])
    RemoveDescendentPaths = _static(
        'RemoveDescendentPaths', 'removeDescendentPaths',
        [('paths', _paths_js, REQUIRED)])
    RemoveAncestorPaths = _static(
        'RemoveAncestorPaths', 'removeAncestorPaths',
        [('paths', _paths_js, REQUIRED)])
    IsValidIdentifier = _static('IsValidIdentifier', 'isValidIdentifier', [_S('name')])
    IsValidNamespacedIdentifier = _static(
        'IsValidNamespacedIdentifier', 'isValidNamespacedIdentifier', [_S('name')])
    TokenizeIdentifier = _static('TokenizeIdentifier', 'tokenizeIdentifier', [_S('name')])
    StripNamespace = _static('StripNamespace', 'stripNamespace', [_S('name')])
    StripPrefixNamespace = _static('StripPrefixNamespace', 'stripPrefixNamespace',
                                   [_S('name'), _S('matchNamespace')], ret=tuple)

    @staticmethod
    def JoinIdentifier(*args):
        # Two overloads (wrapPath.cpp:264-271): a sequence, or lhs and rhs.
        if len(args) == 1:
            return call_method(_SdfPath, 'joinIdentifier', to_js([str(a) for a in args[0]]))
        lhs, rhs = args
        return call_method(_SdfPath, 'joinIdentifier', str(lhs), str(rhs))

    @staticmethod
    def IsValidPathString(pathString):
        # _IsValidPathString (wrapPath.cpp:76-84): Sdf_PathIsValidPathStringResult.
        err = to_js({}, dict_converter=js.Object.fromEntries)
        ok = call_method(_SdfPath, 'isValidPathString', str(pathString), err)
        msg = getattr(err, 'value', None)
        return AnnotatedBoolResult(ok, msg if isinstance(msg, str) else '',
                                   'errorMessage')

    @staticmethod
    def FindPrefixedRange(paths, prefix):
        # _FindPrefixedRange (wrapPath.cpp:42-51): a slice of `paths`.
        begin, end = call_function(_Sdf.sdfPathFindPrefixedRange,
                                   _paths_js(paths), _path_js(prefix))
        return slice(begin, end)

    @staticmethod
    def FindLongestPrefix(paths, path):
        # _FindLongestPrefix (wrapPath.cpp:53-61): the path, or None.
        paths = list(paths)
        i = call_function(_Sdf.sdfPathFindLongestPrefix, _paths_js(paths),
                          _path_js(path))
        return None if i == len(paths) else paths[i]

    @staticmethod
    def FindLongestStrictPrefix(paths, path):
        paths = list(paths)
        i = call_function(_Sdf.sdfPathFindLongestStrictPrefix,
                          _paths_js(paths), _path_js(path))
        return None if i == len(paths) else paths[i]

    def __str__(self):
        return self._js.pathString

    def __bool__(self):
        return not self._js.isEmpty()

    def __repr__(self):
        # _Repr (wrapPath.cpp:22-31)
        if self._js.isEmpty():
            return 'Sdf.Path.emptyPath'
        return 'Sdf.Path(%r)' % self._js.pathString

    def __hash__(self):
        return hash(self._js.pathString)


register(_SdfPath, Path)


def _is_path_like(o):
    return isinstance(o, (Path, str))


comparisons(Path, _is_path_like,
            lambda s, o: _SdfPath.compare(s._js, _path_js(o)))

# def_readonly constants (wrapPath.cpp:157-164) and SdfPathTokens
# (wrapPath.cpp:325-334).
Path.absoluteRootPath = Path._from_js(_SdfPath.absoluteRootPath)
Path.reflexiveRelativePath = Path._from_js(_SdfPath.reflexiveRelativePath)
Path.emptyPath = Path._from_js(_SdfPath.emptyPath)
for _token in ('absoluteIndicator', 'childDelimiter', 'propertyDelimiter',
               'relationshipTargetStart', 'relationshipTargetEnd',
               'parentPathElement', 'mapperIndicator', 'expressionIndicator',
               'mapperArgDelimiter', 'namespaceDelimiter'):
    setattr(Path, _token, getattr(_SdfPath, _token))
del _token


def _PathGetDebuggerPathText(path):
    # Sdf_PathGetDebuggerPathText (path.cpp): the path's text.
    return Path(path).pathString


def _DumpPathStats():
    # Sdf_DumpPathStats prints node-table statistics; typescript-usd keeps
    # no path node tables, so there is nothing to report.
    print('Sdf path stats: not tracked by typescript-usd')


# ---- LayerOffset (wrapLayerOffset.cpp:56-92) ---------------------------------

def _offset_js(offset, scale):
    return to_js({'offset': float(offset), 'scale': float(scale)},
                 dict_converter=js.Object.fromEntries)


class LayerOffset(object):
    """An immutable SdfLayerOffset; the core's is a plain {offset, scale}
    record with free functions (pxr/usd/sdf/src/layerOffset.ts)."""
    __slots__ = ('_js',)

    def __init__(self, offset=0.0, scale=1.0):
        if isinstance(offset, LayerOffset):
            self._js = offset._js
        else:
            self._js = _offset_js(offset, scale)

    @classmethod
    def _from_js(cls, value):
        self = cls.__new__(cls)
        self._js = value
        return self

    @property
    def offset(self):
        return float(self._js.offset)

    @property
    def scale(self):
        return float(self._js.scale)

    def IsIdentity(self):
        return call_function(_Sdf.sdfLayerOffsetIsIdentity, self._js)

    def GetInverse(self):
        inv = call_function(_Sdf.sdfLayerOffsetInverse, self._js)
        if inv is None:
            # layerOffset.cpp:37-50: a zero scale inverts to an infinite one.
            return LayerOffset(-self.offset * float('inf'), float('inf'))
        return LayerOffset._from_js(inv)

    def __repr__(self):
        # _Repr (wrapLayerOffset.cpp:28-41)
        offset, scale = self.offset, self.scale
        args = ''
        if offset != 0.0 or scale != 1.0:
            args = _ts.toString(offset)
            if scale != 1.0:
                args += ', ' + _ts.toString(scale)
        return 'Sdf.LayerOffset(%s)' % args

    def __hash__(self):
        return hash((self.offset, self.scale))


define_operators(LayerOffset, {
    '__eq__': [(lambda o: isinstance(o, LayerOffset),
                lambda s, o: call_function(_Sdf.sdfLayerOffsetEquals, s._js, o._js))],
    '__ne__': [(lambda o: isinstance(o, LayerOffset),
                lambda s, o: not call_function(_Sdf.sdfLayerOffsetEquals, s._js, o._js))],
    # Overload order matters (wrapLayerOffset.cpp:80-85).
    '__mul__': [
        (lambda o: isinstance(o, LayerOffset),
         lambda s, o: LayerOffset._from_js(
             call_function(_Sdf.sdfLayerOffsetCompose, s._js, o._js))),
        (lambda o: isinstance(o, Gf.TimeCode),
         lambda s, o: call_function(_Sdf.sdfLayerOffsetApply, s._js, o._js)),
        (lambda o: isinstance(o, Gf.Duration),
         lambda s, o: call_function(_Sdf.sdfLayerOffsetApply, s._js, o._js)),
        (is_real, lambda s, o: float(call_function(
            _Sdf.sdfLayerOffsetApply, s._js, float(o)))),
    ],
})


# ---- AssetPath (wrapAssetPath.cpp:96-130) ------------------------------------

def _repr_str(s):
    return repr(str(s))


class AssetPath(Wrapped):
    __slots__ = ()
    _properties = {'path': 'getAssetPath', 'authoredPath': 'getAuthoredPath',
                   'evaluatedPath': 'getEvaluatedPath',
                   'resolvedPath': 'getResolvedPath'}

    def __init__(self, *args, **kwargs):
        # boost.python tries the overloads last-registered first
        # (wrapAssetPath.cpp:100-105): (authoredPath, resolvedPath),
        # (authoredPath), (AssetPath), then MakeAssetPath's raw
        # keyword-only form, then ().
        if not args and not kwargs:
            self._js = construct(_Sdf.AssetPath)
            return
        try:
            a, r = bind('AssetPath', [('authoredPath', REQUIRED),
                                      ('resolvedPath', REQUIRED)],
                        args, dict(kwargs))
            self._js = construct(_Sdf.AssetPath, str(a), str(r))
            return
        except TypeError:
            pass
        try:
            (a,) = bind('AssetPath', [('authoredPath', REQUIRED)], args, dict(kwargs))
            if isinstance(a, AssetPath):
                self._js = construct(_Sdf.AssetPath, a._js)
            else:
                self._js = construct(_Sdf.AssetPath, str(a))
            return
        except TypeError:
            pass
        # MakeAssetPath (wrapAssetPath.cpp:62-92)
        if args:
            raise TypeError("Use keyword arguments 'authoredPath', "
                            "'evaluatedPath', and/or 'resolvedPath'")
        params = {}
        for k, v in kwargs.items():
            if k not in ('authoredPath', 'evaluatedPath', 'resolvedPath'):
                raise TypeError("Keyword arguments must be 'authoredPath', "
                                "'evaluatedPath', or 'resolvedPath'")
            params[k] = str(v)
        self._js = construct(_Sdf.AssetPath, to_js(
            params, dict_converter=js.Object.fromEntries))

    def __repr__(self):
        # _Repr (wrapAssetPath.cpp:28-44)
        s = 'Sdf.AssetPath(authoredPath=' + _repr_str(self.authoredPath)
        if self.evaluatedPath:
            s += ', evaluatedPath=' + _repr_str(self.evaluatedPath)
        if self.resolvedPath:
            s += ', resolvedPath=' + _repr_str(self.resolvedPath)
        return s + ')'

    def __str__(self):
        # TfStringify(SdfAssetPath): operator<< writes @path@.
        return '@' + self.path + '@'

    def __bool__(self):
        return bool(self.path)

    def __hash__(self):
        return hash((self.authoredPath, self.evaluatedPath, self.resolvedPath))


register(_Sdf.AssetPath, AssetPath)


def _asset_compare(s, o):
    if call_method(s._js, 'lessThan', o._js):
        return -1
    if call_method(o._js, 'lessThan', s._js):
        return 1
    return 0


comparisons(AssetPath, lambda o: isinstance(o, AssetPath), _asset_compare)
# == is SdfAssetPath::operator== (all three paths), not !(a<b) && !(b<a).
define_operators(AssetPath, {
    '__eq__': [(lambda o: isinstance(o, AssetPath),
                lambda s, o: call_method(s._js, 'equals', o._js))],
    '__ne__': [(lambda o: isinstance(o, AssetPath),
                lambda s, o: not call_method(s._js, 'equals', o._js))],
})


# ---- ValueTypeName (wrapValueTypeName.cpp) -----------------------------------

class ValueTypeName(object):
    """SdfValueTypeName; the core's is a plain record (valueTypeName.ts)."""
    __slots__ = ('_js',)

    @classmethod
    def _from_js(cls, value):
        self = cls.__new__(cls)
        self._js = value
        return self

    def __str__(self):
        return self._js.name

    def _as_core_argument(self):
        # The core's APIs take a value type as its name (e.g.
        # UsdShadeShader.createInput(name, typeName: string)).
        return str(self._js.name)

    def __repr__(self):
        return 'Sdf.ValueTypeName(%r)' % self._js.name

    def __eq__(self, other):
        if isinstance(other, str):
            return self._js.name == other
        if isinstance(other, ValueTypeName):
            return self._js.name == other._js.name
        return NotImplemented

    def __hash__(self):
        return hash(self._js.name)

    @property
    def isArray(self):
        return bool(self._js.isArray)

    @property
    def isScalar(self):
        return bool(self._js.isScalar)

    @property
    def role(self):
        return self._js.role

    @property
    def cppTypeName(self):
        return self._js.cppTypeName

    @property
    def arrayType(self):
        return ValueTypeName._from_js(self._js.arrayType)

    @property
    def scalarType(self):
        return ValueTypeName._from_js(self._js.scalarType)


class _ValueTypeNames(object):
    """Sdf.ValueTypeNames (wrapTypes.cpp): SdfValueTypeNames' members."""

    def __getattr__(self, name):
        value = getattr(_Sdf.ValueTypeNames, name, None)
        if value is None:
            raise AttributeError(name)
        return ValueTypeName._from_js(value)


ValueTypeNames = _ValueTypeNames()


# ---- Layer (wrapLayer.cpp) ---------------------------------------------------

class _SubLayerPathsProxy(object):
    """SdfSubLayerProxy (wrapLayer.cpp: subLayerPaths): a live list view
    writing through to the layer."""
    __slots__ = ('_layer',)

    def __init__(self, layer):
        self._layer = layer

    def _get(self):
        return list(call_method(self._layer, 'getSubLayerPaths'))

    def __len__(self):
        return len(self._get())

    def __iter__(self):
        return iter(self._get())

    def __getitem__(self, i):
        return self._get()[i]

    def __eq__(self, other):
        return self._get() == list(other)

    def __repr__(self):
        return repr(self._get())

    def append(self, path):
        call_method(self._layer, 'insertSubLayerPath', str(path), -1)

    def insert(self, index, path):
        call_method(self._layer, 'insertSubLayerPath', str(path), index)

    def remove(self, path):
        paths = self._get()
        call_method(self._layer, 'removeSubLayerPath', paths.index(path))

    def clear(self):
        call_method(self._layer, 'setSubLayerPaths', to_js([]))


class Layer(Wrapped):
    __slots__ = ()
    _properties = {'identifier': None, 'realPath': None, 'anonymous': 'isAnonymous',
                   'dirty': 'isDirty', 'defaultPrim': None}

    def __init__(self, *args):
        raise TypeError('Sdf.Layer: no constructor defined')

    @property
    def subLayerPaths(self):
        return _SubLayerPathsProxy(self._js)

    @subLayerPaths.setter
    def subLayerPaths(self, paths):
        call_method(self._js, 'setSubLayerPaths', to_js([str(p) for p in paths]))

    def __setattr__(self, name, value):
        if name == '_js' or isinstance(getattr(type(self), name, None), property):
            object.__setattr__(self, name, value)
        else:
            raise AttributeError("can't set attribute %r" % name)

    def __repr__(self):
        return "Sdf.Find(%r)" % self.identifier


register(_Sdf.Layer, Layer)
