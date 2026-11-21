// The seam between the interpreter console (src/interpreter-console.ts, a port
// of OpenUSD 26.11.1 usdviewq/pythonInterpreter.py's Controller and View) and
// a language that runs its input: TypeScript here (src/ts-interpreter.ts),
// Python through Pyodide later. Each language is one panel of the Window menu
// built on the same console.
import type { UsdviewApi } from './usdview-api'

/** Output colours of pythonInterpreter.py:152-167: syntax errors #ffcc63, tracebacks #ff0000. */
export type InterpreterOutputStyle = 'output' | 'syntaxError' | 'traceback'
export interface InterpreterOutput { write(text: string, style?: InterpreterOutputStyle): void }

/** code.InteractiveInterpreter with pythonInterpreter.py's _Completer. */
export interface InterpreterLanguage {
  /** The Window menu and panel title: "TypeScript Interpreter". */
  readonly title: string
  /** sys.ps1, sys.ps2 (pythonInterpreter.py:237-245). */
  readonly ps1: string
  readonly ps2: string
  /** The first banner line (pythonInterpreter.py:272: 'Python %s on %s.'). */
  readonly banner: string
  /** InteractiveInterpreter.runsource: runs the lines entered so far, joined
   *  with '\n', writing results and errors to `output`. Resolves true when
   *  the source is incomplete and the console should ask for more lines. */
  runSource(source: string, output: InterpreterOutput): Promise<boolean>
  /** _Completer.Complete for every state: the completions of `text`. */
  complete(text: string): string[]
  /** interpreter.locals (Myconsole.locals, pythonInterpreter.py:922-923). */
  readonly locals: Record<string, unknown>
  /** The language's variables as the other console reads and writes them
   *  (src/shared-variables.ts), in JavaScript form: library objects are the
   *  core's own objects. */
  readonly shared?: SharedVariables
  /** A line after the initial prompt naming the other console's variables. */
  readonly sharedHint?: string
}

/** One console's variables, seen from the other (src/shared-variables.ts). */
export interface SharedVariables {
  /** The names the user defined (not the seeded modules and usdviewApi). */
  names(): string[]
  has(name: string): boolean
  get(name: string): unknown
  set(name: string, value: unknown): void
}
export type InterpreterKind = 'typescript' | 'python'
/** The other consoles of the page, once each has loaded. */
export interface InterpreterPeers { get(kind: InterpreterKind): InterpreterLanguage | undefined }

/** What each language seeds its namespace with (pythonInterpreter.py:912-920). */
export interface InterpreterContext { usdviewApi: UsdviewApi, peers?: InterpreterPeers }
export type InterpreterLanguageFactory = (context: InterpreterContext) => Promise<InterpreterLanguage>
