// Runs a ported tool in the page as a command line runs it: its standard
// output and error go to `io`, and Tf diagnostics posted while it runs go
// to its standard error.
import { TfDiagnosticMgr, type Error as TfError, type StatusObject as TfStatus, type Warning as TfWarning } from 'typescript-usd/tf'

export interface ToolIO {
  stdout(text: string): void
  stderr(text: string): void
  readonly stdoutIsTTY?: boolean
  readonly stderrIsTTY?: boolean
  /** The environment the tool reads (usddiff: $USD_DIFF, $DIFF); empty in a page. */
  readonly env?: Readonly<Record<string, string | undefined>>
}

// Tf diagnostics posted while a tool runs go to its standard error, as the
// command-line tools print them there: the commentary on its own line, as
// TypeScript USD's default printer writes it (tf/src/diagnostic.ts, which has
// no C++ function, file and line to name as upstream's
// "Warning: in <function> at line <n> of <file> -- " prefix does).
let diagnosticsTo: ((text: string) => void) | undefined
TfDiagnosticMgr.GetInstance().addDelegate({
  issueError: (e: TfError) => report(e),
  issueWarning: (w: TfWarning) => report(w),
  issueStatus: (s: TfStatus) => report(s),
})
function report(diagnostic: TfError | TfWarning | TfStatus): void {
  if (diagnostic.getQuiet()) return
  const text = diagnostic.getCommentary()
  if (diagnosticsTo) diagnosticsTo(`${text}\n`)
  else console.warn(text)
}


/** Runs `run(argv, io)` and resolves its exit code; a thrown error is written
 *  to standard error and exits -1. Runs one at a time: the page's
 *  AsyncContext is single-lane (public/async-context.js). */
let queue: Promise<unknown> = Promise.resolve()
export function runTool(
  run: (argv: readonly string[], io: ToolIO) => Promise<number>, argv: readonly string[], io: ToolIO,
): Promise<number> {
  const next = queue.then(async () => {
    diagnosticsTo = io.stderr
    try {
      return await run(argv, { stdout: io.stdout, stderr: io.stderr, stdoutIsTTY: false, stderrIsTTY: false, env: io.env ?? {} })
    } catch (error) {
      io.stderr(`${error instanceof Error ? `${error.name}: ${error.message}\n${error.stack ?? ''}` : String(error)}\n`)
      return -1
    } finally {
      diagnosticsTo = undefined
    }
  })
  queue = next.catch(() => undefined)
  return next
}
