// One OpenUSD pxr_register_test registration of a command-line tool, run in
// process: COMMAND in a temporary copy of its TESTENV (an empty directory
// when it names none) that is the working directory, with its own layer
// registry (each registration is its own process); STDOUT_REDIRECT to a file
// in that directory; CLEAN_OUTPUT stripped from the redirected output
// (cmake/macros/testWrapper.py _stripPath, :122-150); DIFF_COMPARE of the
// named files with those in baseline/ (diff --strip-trailing-cr).
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { _resetResolverForTest } from 'typescript-usd/ar/_internal'

export interface ToolIO {
  stdout(text: string): void
  stderr(text: string): void
}

export type Tool = (argv: readonly string[], io: ToolIO) => Promise<number>

export interface Registration {
  /** The testenv directory to copy, or undefined for an empty one. */
  testenv?: string | undefined
  /** COMMAND's arguments after the tool. */
  args: readonly string[]
  stdoutRedirect?: string
  cleanOutput?: RegExp
  /** Run after COMMAND, in the directory (POST_COMMANDs). */
  post?: (dir: string) => void | Promise<void>
  diffCompare?: readonly string[]
}

export interface RegistrationResult {
  exitCode: number
  stdout: string
  stderr: string
  dir: string
  /** For each DIFF_COMPARE file: [output, baseline]. */
  compared: [string, string, string][]
}

export async function runRegistration(tool: Tool, registration: Registration): Promise<RegistrationResult> {
  const dir = mkdtempSync(path.join(tmpdir(), 'toolRegistration'))
  const cwd = process.cwd()
  try {
    if (registration.testenv !== undefined) cpSync(registration.testenv, dir, { recursive: true })
    process.chdir(dir)
    _resetResolverForTest()
    let stdout = ''
    let stderr = ''
    const exitCode = await tool(registration.args, { stdout: t => { stdout += t }, stderr: t => { stderr += t } })
    if (registration.stdoutRedirect !== undefined) {
      const cleaned = registration.cleanOutput ? stdout.replace(registration.cleanOutput, '') : stdout
      writeFileSync(path.join(dir, registration.stdoutRedirect), cleaned)
    }
    await registration.post?.(dir)
    const strip = (s: string) => s.replace(/\r\n/g, '\n')
    const compared: [string, string, string][] = (registration.diffCompare ?? []).map(file => [
      file,
      strip(readFileSync(path.join(dir, file), 'utf8')),
      strip(readFileSync(path.join(dir, 'baseline', file), 'utf8')),
    ])
    return { exitCode, stdout, stderr, dir, compared }
  } finally {
    process.chdir(cwd)
    rmSync(dir, { recursive: true, force: true })
  }
}
