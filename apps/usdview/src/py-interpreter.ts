// Portions ported from OpenUSD 26.11.1, including:
//  pxr/usdImaging/usdviewq/pythonInterpreter.py,
//  pxr/usdImaging/usdviewq/usdviewApi.py
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.
//
// Window > Python Interpreter's language (src/interpreter-language.ts):
// usdview's own console language, Python, run by Pyodide over the library's
// pxr forwarding layer (packages/usd/python). The session (code.Interactive-
// Interpreter, the redirected streams, help and _Completer of
// pythonInterpreter.py) is the library's python/interactive.ts; this file
// loads it on first use, seeds it as Myconsole and _DoAutoImports do
// (pythonInterpreter.py:285-290, 911-925) and hands it to the console.
//
// Pyodide, the pxr package and upstream's library __init__.py files are
// served by the dev server and shipped inside a build (scripts/pxr-python.ts:
// pxr-pyodide/ next to index.html, the Python files in this chunk's
// virtual:pxr-python), so a static file server is enough. Core calls that return a Promise are awaited
// from Python with run_sync, which needs JSPI (Safari 27.3 has it).
import { viewerRoot } from './app-root'
import type { InterpreterContext, InterpreterLanguage, InterpreterOutput, SharedVariables } from './interpreter-language'
import { peerVariables } from './shared-variables'
import { usdviewApiDocs } from './usdview-api'

type PxrModule = typeof import('virtual:pxr-python')
type PagePython = { py: PxrModule, pxr: import('virtual:pxr-python').BrowserPxrPython, pyodide: unknown }
let loading: Promise<PagePython> | undefined

/** One Pyodide per page, with the pxr package on sys.path (browser.ts);
 *  the Python example runner (src/python-runner.ts) shares it. */
export function loadPagePython(): Promise<PagePython> {
  loading ??= (async () => {
    const py = await import('virtual:pxr-python')
    if (!py.jspiSupported()) throw new Error('Python needs JavaScript Promise Integration (WebAssembly.Suspending), which this browser does not provide.')
    // A viewer file (app-root.ts): the dev server serves it at /pxr-pyodide/,
    // a build next to its index.html.
    const indexURL = new URL('pxr-pyodide/', viewerRoot()).href
    const pyodideUrl = new URL('pyodide.mjs', indexURL).href
    const { loadPyodide } = await import(/* @vite-ignore */ pyodideUrl) as { loadPyodide: (o: { indexURL: string }) => Promise<unknown> }
    const pxr = await py.loadPxrPythonInBrowser({
      loadPyodide, indexURL,
      files: py.files, pythonDir: py.pythonDir, openusdSrc: py.openusdSrc,
    })
    return { py, pxr, pyodide: pxr.pyodide }
  })()
  loading.catch(() => { loading = undefined })
  return loading
}

/** Python setup run in the session's locals: _DoAutoImports
 *  (pythonInterpreter.py:285-290: every loaded pxr module under its name;
 *  here every library the forwarding layer provides) and Myconsole's
 *  usdviewApi (:911-925) as a forwarding object over the viewer's port
 *  (src/usdview-api.ts), whose members carry usdviewApi.py's names. */
const SEED = `
import os, importlib, pxr
from pxr import _bridge
# Each library directory of the package (python/pxr/<Lib>/, whose
# __init__.py is upstream's, found by pxr/__init__.py's finder).
for _name in sorted(os.listdir(pxr.__path__[0])):
    if not _name.startswith('_') and os.path.isdir(os.path.join(pxr.__path__[0], _name)):
        try:
            globals()[_name] = importlib.import_module('pxr.' + _name)
        except Exception:
            pass

# usdviewApi.py:14-246 UsdviewApi's public names; dir() lists those the
# viewer's port provides (members forward by rule 1: PrintStatus -> printStatus).
_USDVIEW_API_NAMES = (
    'dataModel', 'stage', 'frame', 'prim', 'validationErrors',
    'selectedValidationErrors', 'selectedPoint', 'selectedPrims',
    'selectedPaths', 'selectedInstances', 'spec', 'layer', 'cameraPrim',
    'currentGfCamera', 'viewportSize', 'configDir', 'stageIdentifier',
    'qMainWindow', 'viewerMode', 'property', 'ComputeModelsFromSelection',
    'ComputeSelectedPrimsOfType', 'UpdateGUI', 'PrintStatus', 'GetSettings',
    'ClearPrimSelection', 'AddPrimToSelection', 'GrabWindowShot',
    'GrabViewportShot', 'UpdateViewport', 'SetViewportRenderer',
    'GetViewportRendererNames', 'GetViewportCurrentRendererId')

class UsdviewApi(_bridge.Opaque):
    """This class is an interface that provides access to Usdview context for
    Usdview plugins and other clients. It abstracts away the implementation of
    Usdview so that the core can change without affecting clients.
    """
    __slots__ = ()

    def __dir__(self):
        # Membership only (Reflect.has): dir() reads no property.
        from js import Reflect
        return sorted(n for n in _USDVIEW_API_NAMES
                      if Reflect.has(self._js, _bridge.camel_name(n))
                      or Reflect.has(self._js, n))


class UsdviewDataModel(_bridge.Opaque):
    """rootDataModel.py RootDataModel / appController's data model: the
    stage, the current frame and the selection the viewer considers."""
    __slots__ = ()

    @property
    def currentFrame(self):
        """Get a Usd.TimeCode object which represents the current frame being
        considered in Usdview."""
        return _bridge.get_property(self._js, 'currentFrame')

    @currentFrame.setter
    def currentFrame(self, value):
        """Set the current frame to a new Usd.TimeCode object."""
        # rootDataModel.py:152-162: a Usd.TimeCode, else ValueError.
        from pxr import Usd as _Usd
        if not isinstance(value, _Usd.TimeCode):
            raise ValueError("Expected Usd.TimeCode, got: {}".format(value))
        self._js.currentFrame = value._js


def _usdviewApiMember(name, doc):
    """usdviewApi.py's properties (lower-case names) and methods, with their
    docstrings, forwarding to the port's member of the rule-1 name; only
    viewerMode has a setter (usdviewApi.py:146-156)."""
    core = _bridge.camel_name(name)
    if name == 'dataModel':
        def fget(self):
            return UsdviewDataModel._from_js(self._js.dataModel)
        return property(fget, None, doc=doc)
    if name[:1].islower():
        def fget(self):
            return _bridge.get_property(self._js, core)
        fset = None
        if name == 'viewerMode':
            def fset(self, value):
                self._js.viewerMode = bool(value)
        return property(fget, fset, doc=doc)
    def method(self, *args):
        return _bridge.call_method(self._js, core, *args)
    method.__name__ = name
    method.__qualname__ = 'UsdviewApi.' + name
    method.__doc__ = doc
    return method


_docs = _usdviewApiDocs.to_py()
for _name in _USDVIEW_API_NAMES:
    _doc = _docs.get(_bridge.camel_name(_name))
    if _doc is not None:
        setattr(UsdviewApi, _name, _usdviewApiMember(_name, _doc))

usdviewApi = UsdviewApi._from_js(_usdviewApiJs)
del _usdviewApiJs, _usdviewApiDocs, _docs, _doc, _name

# ---- Variables shared with the TypeScript console (src/shared-variables.ts)
# A web addition: 'ts' reads and writes the TypeScript console's variables;
# the TypeScript console's 'py' reads and writes these, through _share_get,
# _share_set and _share_names. Library objects cross as the core's objects
# (a Python wrapper's _js), lists and dicts as arrays and objects, and
# functions as callables that convert their arguments and results.
from pyodide.ffi import JsProxy as _JsProxy, to_js as _to_js, create_proxy as _create_proxy, run_sync as _run_sync


def _share_out(value):
    """A Python value as the TypeScript console sees it."""
    import js
    if value is None or isinstance(value, (bool, int, float, str, _JsProxy)):
        return value
    if (getattr(type(value), '_as_core_argument', None) is not None
            or getattr(value, '_js', None) is not None):
        return _bridge.unwrap(value)
    if isinstance(value, (list, tuple)):
        return _to_js([_share_out(v) for v in value])
    if isinstance(value, dict):
        return _to_js({str(k): _share_out(v) for k, v in value.items()},
                      dict_converter=js.Object.fromEntries)
    if callable(value) and not isinstance(value, type):
        def call(*args):
            return _share_out(value(*[_share_in(a) for a in args]))
        return _create_proxy(call)
    return value


def _share_in(value):
    """A TypeScript value as Python sees it."""
    import inspect
    if inspect.isawaitable(value):
        # A Promise (an async function's result), as Pyodide hands it over.
        return _share_in(_run_sync(value))
    if not isinstance(value, _JsProxy):
        return value
    kind = _bridge.ts.kindOf(value)
    if kind == 'array':
        return [_share_in(v) for v in value]
    if kind == 'record':
        return {str(e[0]): _share_in(e[1]) for e in value.object_entries()}
    if kind == 'promise':
        return _share_in(_run_sync(value))
    if kind == 'function' and not _bridge._is_class(value):
        def call(*args):
            return _share_in(value(*[_share_out(a) for a in args]))
        call.__name__ = str(getattr(value, 'name', '') or 'function')
        return call
    return _bridge.wrap(value)


class _TypeScriptVariables(object):
    """The TypeScript console's variables: ts.name reads one, ts.name = value
    sets it."""
    __slots__ = ()

    def __getattr__(self, name):
        if name.startswith('__'):
            raise AttributeError(name)
        if not _tsPeerJs.has(name):
            raise AttributeError('the TypeScript console has no variable %r' % name)
        return _share_in(_tsPeerJs.get(name))

    def __setattr__(self, name, value):
        _tsPeerJs.set(name, _share_out(value))

    def __dir__(self):
        try:
            return sorted(str(n) for n in _tsPeerJs.names())
        except Exception:
            return []

    def __repr__(self):
        try:
            return '<TypeScript variables: %s>' % ', '.join(self.__dir__())
        except Exception:
            return '<TypeScript variables>'


ts = _TypeScriptVariables()
_share_scope = globals()


def _share_names():
    return _to_js([n for n in _share_scope if n not in _share_seeded and not n.startswith('_')])


def _share_has(name):
    return name in _share_scope


def _share_get(name):
    return _share_out(_share_scope[name])


def _share_set(name, value):
    _share_scope[name] = _share_in(value)


_share_seeded = set(globals()) | {'_share_seeded'}
`

export class PythonInterpreter implements InterpreterLanguage {
  readonly title = 'Python Interpreter'
  readonly ps1: string
  readonly ps2: string
  readonly banner: string
  readonly locals: Record<string, unknown>
  readonly shared: SharedVariables
  readonly sharedHint = 'Use `ts.name` to read or set the TypeScript Interpreter\'s variable `name`.'
  constructor(private readonly _session: import('virtual:pxr-python').PxrInteractive) {
    this.ps1 = _session.ps1
    this.ps2 = _session.ps2
    this.banner = _session.banner
    const dict = _session.locals
    // interpreter.locals (Myconsole.locals, :924-925) read from JavaScript.
    this.locals = new Proxy({}, {
      get: (_, key) => typeof key === 'string' && dict.has(key) ? dict.get(key) : undefined,
      has: (_, key) => typeof key === 'string' && dict.has(key),
      ownKeys: () => [...dict.keys()],
      getOwnPropertyDescriptor: (_, key) => typeof key === 'string' && dict.has(key) ? { configurable: true, enumerable: true, value: dict.get(key) } : undefined,
    })
    // The TypeScript console's `py` (src/shared-variables.ts), through the
    // seed's _share_* functions.
    const fn = (name: string) => dict.get(name) as (...args: unknown[]) => unknown
    this.shared = {
      names: () => [...fn('_share_names')() as string[]],
      has: name => !!fn('_share_has')(name),
      get: name => fn('_share_get')(name),
      set: (name, value) => { fn('_share_set')(name, value) },
    }
  }

  async runSource(source: string, output: InterpreterOutput): Promise<boolean> {
    const { more, output: chunks } = await this._session.runSource(source)
    for (const [text, style] of chunks) output.write(text, style)
    return more
  }

  complete(text: string): string[] { return this._session.complete(text) }
}

/** The console's language over a session (python/interactive.ts), seeded with
 *  the pxr modules and usdviewApi. */
export async function seededPythonInterpreter(session: import('virtual:pxr-python').PxrInteractive, context: InterpreterContext): Promise<PythonInterpreter> {
  session.locals.set('_usdviewApiJs', context.usdviewApi)
  session.locals.set('_usdviewApiDocs', usdviewApiDocs)
  // `ts`: the TypeScript console's variables (src/shared-variables.ts).
  const peer = () => peerVariables(context.peers, 'typescript')
  session.locals.set('_tsPeerJs', {
    names: () => peer().names(), has: (name: string) => peer().has(name),
    get: (name: string) => peer().get(name), set: (name: string, value: unknown) => peer().set(name, value),
  })
  await session.exec(SEED)
  return new PythonInterpreter(session)
}

export async function createPythonInterpreter(context: InterpreterContext): Promise<InterpreterLanguage> {
  const { py, pyodide } = await loadPagePython()
  return seededPythonInterpreter(py.createPxrInteractive(pyodide), context)
}
