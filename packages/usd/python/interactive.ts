// Portions ported from OpenUSD 26.11.1, including:
//  pxr/usdImaging/usdviewq/pythonInterpreter.py
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.
//
// An interactive Python session over the pxr forwarding layer, as usdview's
// interpreter console runs one (pythonInterpreter.py): the Python half of
// Window > Python Interpreter. It holds upstream's Interpreter
// (code.InteractiveInterpreter whose output brush colours syntax errors and
// tracebacks, :146-175), the stdin/stdout/stderr redirection of the
// Controller (_Redirected, :28-37; write, :386-420), its help (_Helper,
// :177-192) and its completer (_Completer, :39-144), all in Python, so
// codeop decides incomplete input and sys.displayhook prints results exactly
// as CPython does. The console UI that drives it is the viewer's
// (apps/usdview/src/interpreter-console.ts).
//
// Each entry runs under callPromising, so a core call that returns a
// Promise (Usd.Stage.Open) can be awaited from Python with run_sync (JSPI);
// see browser.ts and runUpstream.ts.
import type { PyodideInterface } from 'pyodide'

/** pythonInterpreter.py:146-175 output brushes, as styles: '#ffcc63' syntax errors, '#ff0000' tracebacks. */
export type InteractiveStyle = 'output' | 'syntaxError' | 'traceback'

// PLATFORM-DIVERGENCE(usdview-python-readline): the Controller's readline
// (pythonInterpreter.py:340-384) blocks input() in a nested Qt event loop
// until the user enters a line; a page cannot block its thread for input, so
// input() in the console raises RuntimeError.
export const INTERACTIVE = `
import sys, keyword, re
from code import InteractiveInterpreter

class _Interpreter(InteractiveInterpreter):
    """pythonInterpreter.py:146-175 Interpreter: the output brush is a style."""
    def __init__(self, locals=None):
        InteractiveInterpreter.__init__(self, locals)
        self._outputBrush = None

    def showsyntaxerror(self, filename=None, **kwargs):
        self._outputBrush = 'syntaxError'
        try:
            InteractiveInterpreter.showsyntaxerror(self, filename, **kwargs)
        finally:
            self._outputBrush = None

    def showtraceback(self):
        self._outputBrush = 'traceback'
        try:
            InteractiveInterpreter.showtraceback(self)
        finally:
            self._outputBrush = None

    def GetOutputBrush(self):
        return self._outputBrush


class _Helper(object):
    """pythonInterpreter.py:177-192 _Helper."""
    def __init__(self, input, output):
        import pydoc
        self._helper = pydoc.Helper(input, output)

    def __repr__(self):
        return "Type help() for interactive help, " \\
               "or help(object) for help about object."

    def __call__(self, *args, **kwds):
        return self._helper(*args, **kwds)


def _GetClassMembers(cls):
    ret = dir(cls)
    if hasattr(cls, '__bases__'):
        for base in cls.__bases__:
            ret = ret + _GetClassMembers(base)
    return ret


class _Completer(object):
    """pythonInterpreter.py:39-144 _Completer."""
    def __init__(self, locals):
        self.locals = locals

    def Complete(self, text, state):
        if state == 0:
            if "." in text:
                self.matches = self._AttrMatches(text)
            else:
                self.matches = self._GlobalMatches(text)
        try:
            return self.matches[state]
        except IndexError:
            return None

    def _GlobalMatches(self, text):
        import builtins
        import __main__
        matches = set()
        n = len(text)
        for l in [keyword.kwlist, builtins.__dict__.keys(),
                  __main__.__dict__.keys(), self.locals.keys()]:
            for word in l:
                if word[:n] == text and word != "__builtins__":
                    matches.add(word)
        return list(matches)

    def _AttrMatches(self, text):
        import __main__
        assert len(text)
        splitChars = ' )(;,+=*/-%!<>'
        index = -1
        for char in splitChars:
            index = max(text.rfind(char), index)
        if index >= len(text)-1:
            return []
        prefix = ''
        suffix = text
        if index >= 0:
            prefix = text[:index+1]
            suffix = text[index+1:]
        m = re.match(r"([^.]+(\\.[^.]+)*)\\.(.*)", suffix)
        if not m:
            return []
        expr, attr = m.group(1, 3)
        try:
            myobject = eval(expr, __main__.__dict__, self.locals)
        except (AttributeError, NameError, SyntaxError):
            return []
        words = set(dir(myobject))
        if hasattr(myobject, '__class__'):
            words.add('__class__')
        words = words.union(set(_GetClassMembers(myobject.__class__)))
        words = list(words)
        matches = set()
        n = len(attr)
        for word in words:
            if word[:n] == attr and word != "__builtins__":
                matches.add("%s%s.%s" % (prefix, expr, word))
        return list(matches)


class _Session(object):
    """The Controller's interpreter, completer and redirected streams
    (pythonInterpreter.py:194-283, 322-420). Writes are collected as
    (text, style) chunks for the console to show."""
    def __init__(self):
        self.interpreter = _Interpreter({'__name__': '__console__', '__doc__': None})
        self.completer = _Completer(self.interpreter.locals)
        self.chunks = []
        # :240-245: the prompts, unless the host set them.
        try:
            sys.ps1
        except AttributeError:
            sys.ps1 = ">>> "
        try:
            sys.ps2
        except AttributeError:
            sys.ps2 = "... "
        # :218: help writes into the console.
        self.interpreter.locals['help'] = _Helper(self, self)

    # ---- stdin, stdout and stderr (:322-420) ----
    def write(self, text):
        self.chunks.append((str(text), self.interpreter.GetOutputBrush() or 'output'))

    def flush(self):
        pass

    def isatty(self):
        return 1

    def readline(self):
        # input(): see usdview-python-readline in interactive.ts.
        raise RuntimeError("input() is not supported in the browser interpreter.")

    def _redirected(self, run):
        """_Redirected (:28-37)."""
        old = sys.stdin, sys.stdout, sys.stderr
        sys.stdin, sys.stdout, sys.stderr = self, self, self
        try:
            return run()
        finally:
            sys.stdin, sys.stdout, sys.stderr = old

    def take(self):
        chunks, self.chunks = self.chunks, []
        return [list(c) for c in chunks]

    def runsource(self, source):
        """The Controller's runsource of the entered lines (:608): True
        when the source is incomplete."""
        more = self._redirected(lambda: self.interpreter.runsource(source))
        return [bool(more), self.take()]

    def complete(self, token):
        """_CompleteSlot's loop (:422-441)."""
        def run():
            completions = []
            try:
                p = self.completer.Complete(token, len(completions))
                while p is not None:
                    completions.append(p)
                    p = self.completer.Complete(token, len(completions))
            except Exception:
                return []
            return completions
        completions = self._redirected(run)
        self.chunks = []
        return completions
`

export interface PxrInteractive {
  /** pythonInterpreter.py:272: 'Python %s on %s.' */
  readonly banner: string
  readonly ps1: string
  readonly ps2: string
  /** InteractiveInterpreter.runsource; true when more input is needed. */
  runSource(source: string): Promise<{ more: boolean, output: [string, InteractiveStyle][] }>
  /** Every completion of `token` (_Completer.Complete for state 0, 1, ...). */
  complete(token: string): string[]
  /** Runs `source` in the session's locals without output (setup code). */
  exec(source: string): Promise<void>
  /** The interpreter's locals, as a Python dict (a PyProxy). */
  readonly locals: { get(key: string): unknown, set(key: string, value: unknown): void, has(key: string): boolean, keys(): Iterable<string> }
}

interface PyCallable {
  (...args: unknown[]): unknown
  callPromising(...args: unknown[]): Promise<unknown>
}
interface PyList { toJs(): unknown, destroy(): void }

/** A session in a Pyodide that already has the pxr package on sys.path
 *  (browser.ts loadPxrPythonInBrowser, runUpstream.ts loadPxrPython). */
export function createPxrInteractive(pyodide: PyodideInterface): PxrInteractive {
  pyodide.runPython(INTERACTIVE)
  const session = (pyodide.globals.get('_Session') as PyCallable)() as Record<string, PyCallable> & { interpreter: { locals: PxrInteractive['locals'] } }
  const locals = session.interpreter.locals
  const sys = pyodide.pyimport('sys') as { version: string, platform: string, ps1: string, ps2: string }
  const runsource = session.runsource!
  const complete = session.complete!
  return {
    banner: `Python ${sys.version} on ${sys.platform}.`,
    ps1: String(sys.ps1),
    ps2: String(sys.ps2),
    async runSource(source) {
      const result = await runsource.callPromising(source) as PyList
      const [more, output] = result.toJs() as [boolean, [string, InteractiveStyle][]]
      result.destroy()
      return { more, output }
    },
    complete(token) {
      const result = complete(token) as PyList
      const list = result.toJs() as string[]
      result.destroy()
      return list
    },
    async exec(source) {
      const run = pyodide.runPython('lambda source, ns: exec(source, ns)') as PyCallable
      try { await run.callPromising(source, locals) } finally { (run as unknown as { destroy(): void }).destroy() }
    },
    locals,
  }
}
