// Variables shared between the two interpreter windows: a web addition, not
// usdview behaviour (usdview has one Python console). The TypeScript console
// is seeded with `py`, the Python console with `ts`; each reads and writes the
// other console's variables:
//
//   TypeScript  >>> py.ball                 the Python variable `ball`
//               >>> py.radius = 2           sets `radius` in Python
//   Python      >>> ts.box                  the TypeScript variable `box`
//               >>> ts.scale = 0.5          sets `scale` in TypeScript
//
// Values cross in the receiving language's form: a library object is the
// same core object on both sides (a Python Usd.Prim is the TypeScript
// Usd.Prim it forwards to), numbers, strings and booleans are copied, lists
// and dicts become arrays and objects (and back), and a function from the
// other language is callable with values converted the same way. Python's
// side of the conversion is in src/py-interpreter.ts (_share_in/_share_out).
//
// Each console loads on first use, so the other console's variables are
// available once its window has been opened.
import type { InterpreterKind, InterpreterLanguage, InterpreterPeers, SharedVariables } from './interpreter-language'

const titles: Record<InterpreterKind, string> = { typescript: 'TypeScript Interpreter', python: 'Python Interpreter' }

/** The page's consoles, registered as each finishes loading. */
export class InterpreterPeerRegistry implements InterpreterPeers {
  readonly #languages = new Map<InterpreterKind, InterpreterLanguage>()
  register(kind: InterpreterKind, language: InterpreterLanguage): void { this.#languages.set(kind, language) }
  get(kind: InterpreterKind): InterpreterLanguage | undefined { return this.#languages.get(kind) }
}

/** The error for a peer whose window has not been opened yet. */
export function peerNotOpen(kind: InterpreterKind): Error {
  return new Error(`The ${titles[kind]} has not been opened: open Window > ${titles[kind]} to share its variables.`)
}

/** The shared variables of `kind`, or the reason they are not available. */
export function peerVariables(peers: InterpreterPeers | undefined, kind: InterpreterKind): SharedVariables {
  const shared = peers?.get(kind)?.shared
  if (!shared) throw peerNotOpen(kind)
  return shared
}

const probes = new Set(['then', 'toJSON', 'constructor', 'valueOf', 'inspect', 'asymmetricMatch', '$$typeof', 'nodeType'])

/** The TypeScript console's `py`: Python's variables as properties. Reading a
 *  name Python does not define gives undefined, as a missing property does. */
export function peerObject(peers: InterpreterPeers | undefined, kind: InterpreterKind): Record<string, unknown> {
  const label = kind === 'python' ? 'Python' : 'TypeScript'
  const shared = () => peerVariables(peers, kind)
  return new Proxy({}, {
    get: (_, key) => {
      if (key === Symbol.toStringTag) return `${label} variables`
      if (typeof key !== 'string') return undefined
      // Probes of the object itself (await's thenable check, JSON, the
      // console's printing) are not variable reads.
      if (probes.has(key) && !peers?.get(kind)?.shared?.has(key)) return undefined
      if (key === 'toString') return () => `[${label} variables: ${peers?.get(kind)?.shared?.names().join(', ') ?? 'not open'}]`
      const variables = shared()
      return variables.has(key) ? variables.get(key) : undefined
    },
    set: (_, key, value) => {
      if (typeof key !== 'string') return false
      shared().set(key, value)
      return true
    },
    has: (_, key) => typeof key === 'string' && !!peers?.get(kind)?.shared?.has(key),
    ownKeys: () => peers?.get(kind)?.shared?.names() ?? [],
    getOwnPropertyDescriptor: (_, key) => {
      const variables = peers?.get(kind)?.shared
      if (typeof key !== 'string' || !variables?.has(key)) return undefined
      return { configurable: true, enumerable: true, writable: true, value: variables.get(key) }
    },
    deleteProperty: () => false,
  })
}
