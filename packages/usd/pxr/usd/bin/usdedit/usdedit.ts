#!/usr/bin/env node
// Ported from OpenUSD 26.11.1: pxr/usd/bin/usdedit/usdedit.py
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// usdedit (usdedit.py): converts a usd-readable file to usda text in a
// temporary file, runs an editor on it, and, after the editor exits, writes
// the edited content back over the original file in its own format, unless
// -n (--noeffect) is given.
//
// usdedit(argv, io) runs the tool in process and resolves its exit code;
// standard output and error go to `io`, the editor's to `io` as well (the
// process's by default, where the editor shares the terminal), and the
// environment is read from `io.env`. Run as a script, the file is the
// command. usdcat runs in process (pxr/usd/bin/usdcat/usdcat.ts) where
// upstream runs the usdcat binary (RunUsdBinary,
// usdUtils/toolPaths.py:110-155); the editor runs as a child process, which
// only Node can start. sys.exit("message") is the message on standard error
// and exit code 1.
//
// FAITHFULNESS-DEBT(usdedit-argparse-subset): upstream parses its arguments
// with Python's argparse (usdedit.py:123-151). parseArgs reads the same flags,
// --prefix and file, and fails with argparse's exit code 2 for a missing or
// extra file, an unknown argument and a missing --prefix value; -h/--help
// prints a usage summary, not argparse's formatted help. A port of argparse's
// behaviour would replace it.

import { _chmod, _cwd, _deleteFile, _isDir, _isFile, _isMainScript, _isWritable, _makeTmpFileName,
  _modificationTime, _pathExists, _readFile, _writeFile,
} from 'typescript-usd/ar/_internal'
import { GetResolver as ArGetResolver, SplitPackageRelativePathOuter as ArSplitPackageRelativePathOuter } from 'typescript-usd/ar'
import { FileFormat as SdfFileFormat, Layer as SdfLayer } from 'typescript-usd/sdf'
import { TfErrorMark } from 'typescript-usd/tf'
import { usdcat } from '../usdcat/usdcat.ts'

/** Where the tool writes (sys.stdout, sys.stderr) and the environment it
 *  reads (os.environ). `interactive` gives the editor the process's terminal
 *  instead of passing its output to `stdout` and `stderr`. */
export interface UsdEditIO {
  stdout(text: string): void
  stderr(text: string): void
  env?: Readonly<Record<string, string | undefined>>
  interactive?: boolean
}

// sys.exit(message).
class SystemExit {
  constructor(readonly message: string | undefined, readonly code: number) {}
}

function exit(message: string): never {
  throw new SystemExit(message, 1)
}

// shlex.split(s) in POSIX mode: words split on whitespace, with single
// quotes, double quotes and backslash escapes as a shell takes them.
export function shlexSplit(s: string): string[] {
  const words: string[] = []
  let word = ''
  let inWord = false
  for (let i = 0; i < s.length; ++i) {
    const c = s[i]!
    if (c === "'") {
      const end = s.indexOf("'", i + 1)
      if (end < 0) throw new Error('No closing quotation')
      word += s.slice(i + 1, end)
      inWord = true
      i = end
    } else if (c === '"') {
      inWord = true
      let j = i + 1
      for (; j < s.length && s[j] !== '"'; ++j) {
        if (s[j] === '\\' && j + 1 < s.length && '\\"$`\n'.includes(s[j + 1]!)) ++j
        word += s[j]
      }
      if (j >= s.length) throw new Error('No closing quotation')
      i = j
    } else if (c === '\\') {
      if (i + 1 >= s.length) throw new Error('No escaped character')
      word += s[++i]
      inWord = true
    } else if (/\s/.test(c)) {
      if (inWord) words.push(word)
      word = ''
      inWord = false
    } else {
      word += c
      inWord = true
    }
  }
  if (inWord) words.push(word)
  return words
}

// shutil.which(name).
function which(name: string, env: Readonly<Record<string, string | undefined>>): string | undefined {
  for (const dir of (env['PATH'] ?? '').split(':')) {
    if (dir === '') continue
    const candidate = `${dir.replace(/\/+$/, '')}/${name}`
    if (_isFile(candidate)) return candidate
  }
  return undefined
}

// _findEditor (usdedit.py:26-51).
function findEditor(usdFileName: string, readOnly: boolean, env: Readonly<Record<string, string | undefined>>): string[] {
  // Ensure we have a suitable editor available.
  const editorCmd = env['USD_EDITOR'] || env['EDITOR'] || which('emacs', env) || which('vim', env) ||
    which('notepad', env)

  if (!editorCmd) {
    exit("Error: Couldn't find a suitable text editor to use. Expected $USD_EDITOR or $EDITOR to be set, or " +
      'emacs/vim/notepad to be installed and available in PATH.')
  }

  const editorArgs = shlexSplit(editorCmd)

  // Special handling for emacs users.
  if (editorCmd.includes('emacs')) {
    // Passed as a single argument, so the file name needs no quoting.
    const title = `usdedit ${readOnly ? '--noeffect ' : ''}${usdFileName}`
    editorArgs.push('-name', title)
  }

  return editorArgs
}

// os.path.splitext(os.path.basename(path))[0].
function stem(path: string): string {
  const base = path.slice(path.lastIndexOf('/') + 1)
  const leadingDots = base.length - base.replace(/^\.+/, '').length
  const dot = base.lastIndexOf('.')
  return dot < leadingDots ? base : base.slice(0, dot)
}

// tempfile.mkstemp(prefix, suffix, dir): a new, empty file whose name is
// `prefix`, random characters and `suffix`, in `dir` or the temporary
// directory.
async function mkstemp(prefix: string, suffix: string, dir: string | undefined): Promise<string> {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789_'
  for (let attempt = 0; attempt < 100; ++attempt) {
    const random = Array.from({ length: 8 }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
    const name = dir === undefined
      ? _makeTmpFileName(`${prefix}${random}`, suffix)
      : `${dir.replace(/\/+$/, '')}/${prefix}${random}${suffix}`
    if (!_pathExists(name)) {
      await _writeFile(name, new Uint8Array())
      return name
    }
  }
  throw new Error('No usable temporary file name found')
}

// _generateTemporaryFile (usdedit.py:53-85).
async function generateTemporaryFile(
  usdFileName: string, readOnly: boolean, prefix: string | undefined, io: UsdEditIO,
): Promise<string> {
  // The base name of the USD file opened.
  const usdFileNameBasename = stem(usdFileName)

  const fullPrefix = prefix || `${usdFileNameBasename}_tmp`

  // If readOnly is set, create a temp file in a default location guided by
  // the TMPDIR/TEMP/TMP environment variables.
  const targetDir = readOnly ? undefined : _cwd()
  const usdaFileName = await mkstemp(fullPrefix, '.usda', targetDir)

  // Use -o rather than redirecting stdout.
  await usdcat(['-o', usdaFileName, '--', usdFileName], io)

  if (readOnly) await _chmod(usdaFileName, 0o444)

  // An empty temp file means the USD file could not be read.
  if ((await _readFile(usdaFileName)).length === 0) exit(`Error: Failed to open file ${usdFileName}, exiting.`)

  return usdaFileName
}

// subprocess.call(args): runs `args` and resolves its exit code.
async function call(args: readonly string[], io: UsdEditIO, env: Readonly<Record<string, string | undefined>>): Promise<number> {
  if (typeof process === 'undefined' || !process.versions?.node) {
    throw new Error(`Cannot run '${args[0]}': no host process`)
  }
  const specifier = ['node', 'child_process'].join(':')
  const { spawn } = await import(/* @vite-ignore */ specifier) as {
    spawn(cmd: string, args: readonly string[], options: object): {
      stdout: { on(event: 'data', fn: (chunk: Uint8Array) => void): void } | null
      stderr: { on(event: 'data', fn: (chunk: Uint8Array) => void): void } | null
      on(event: 'close', fn: (code: number | null) => void): void
      on(event: 'error', fn: (error: Error) => void): void
    }
  }
  return new Promise((resolve, reject) => {
    const child = spawn(args[0]!, args.slice(1), { stdio: io.interactive ? 'inherit' : ['inherit', 'pipe', 'pipe'], env })
    const decoder = new TextDecoder()
    child.stdout?.on('data', chunk => io.stdout(decoder.decode(chunk)))
    child.stderr?.on('data', chunk => io.stderr(decoder.decode(chunk)))
    child.on('error', reject)
    child.on('close', code => resolve(code ?? 1))
  })
}

// _editTemporaryFile (usdedit.py:87-99): whether the editor changed the file.
async function editTemporaryFile(
  editorArgs: readonly string[], usdaFileName: string, io: UsdEditIO, env: Readonly<Record<string, string | undefined>>,
): Promise<boolean> {
  // Check the timestamp before updating a file's mtime.
  const initialTimeStamp = _modificationTime(usdaFileName)?.getTime()
  await call([...editorArgs, usdaFileName], io, env)
  const newTimeStamp = _modificationTime(usdaFileName)?.getTime()
  // Indicate whether the file was changed.
  return initialTimeStamp !== newTimeStamp
}

// _writeOutChanges (usdedit.py:101-120): writes the temporary layer's content
// over the permanent file; whether it saved.
async function writeOutChanges(temporaryFileName: string, permanentFileName: string): Promise<boolean> {
  // Sdf.Layer.FindOrOpen raises Tf.ErrorException when it posts errors.
  const mark = new TfErrorMark()
  let temporaryLayer: SdfLayer | undefined
  try {
    temporaryLayer = await SdfLayer.findOrOpen(temporaryFileName)
    if (!mark.isClean()) {
      const err = mark.getErrors().map(e => e.getCommentary()).join('\n')
      mark.clear()
      exit(`Error: Failed to open temporary layer ${temporaryFileName}, and therefore cannot save your edits back ` +
        `to original file ${permanentFileName}. An error occurred trying to parse the file: ${err}`)
    }
  } finally {
    mark.dispose()
  }

  // Overwrite the permanent file's contents rather than creating a new
  // layer, so the original's file format parameters are kept.
  const outLayer = await SdfLayer.findOrOpen(permanentFileName)
  if (!outLayer) {
    exit(`Error: Unable to save edits back to the original file ${permanentFileName}. ` +
      `Your edits can be found in ${temporaryFileName}.`)
  }
  outLayer.transferContent(temporaryLayer!)
  return outLayer.save()
}

const PROG = 'usdedit'
const USAGE = `usage: ${PROG} [-h] [-n] [-f] [-p PREFIX] usdFileName`
const HELP = `${USAGE}

Convert a usd-readable file to the .usda text format in
a temporary location and invoke an editor on it.  After
saving and quitting the editor, the edited file will be
converted back to the original format and OVERWRITE the
original file, unless you supply the "-n" (--noeffect) flag,
in which case no changes will be saved back to the original file.
The editor to use will be looked up as follows:
    - USD_EDITOR environment variable
    - EDITOR environment variable
    - emacs in PATH
    - vim in PATH
    - notepad in PATH

positional arguments:
  usdFileName           The usd file to edit.

options:
  -h, --help            show this help message and exit
  -n, --noeffect        Do not edit the file. Create the temporary file in a
                        default location guided by the TMPDIR, TEMP, and TMP
                        environment variables.
  -f, --forcewrite      Override file permissions to allow writing.
  -p, --prefix PREFIX   Provide a prefix for the temporary file name.
`

type Parsed = { readOnly: boolean, forceWrite: boolean, prefix: string | undefined, usdFileName: string } |
  { exitCode: number }

// usdedit.py:123-151. See FAITHFULNESS-DEBT(usdedit-argparse-subset).
function parseArgs(argv: readonly string[], io: UsdEditIO): Parsed {
  const fail = (message: string): Parsed => {
    io.stderr(`${USAGE}\n${PROG}: error: ${message}\n`)
    return { exitCode: 2 }
  }
  const positionals: string[] = []
  const extras: string[] = []
  let readOnly = false
  let forceWrite = false
  let prefix: string | undefined
  let positionalOnly = false
  for (let i = 0; i < argv.length; ++i) {
    const arg = argv[i]!
    if (positionalOnly || !arg.startsWith('-') || arg === '-') { positionals.push(arg); continue }
    if (arg === '--') { positionalOnly = true; continue }
    if (arg === '-h' || arg === '--help') { io.stdout(HELP); return { exitCode: 0 } }
    if (arg === '-n' || arg === '--noeffect') { readOnly = true; continue }
    if (arg === '-f' || arg === '--forcewrite') { forceWrite = true; continue }
    if (arg === '-p' || arg === '--prefix') {
      const value = argv[i + 1]
      if (value === undefined || (value.startsWith('-') && value !== '-')) {
        return fail('argument -p/--prefix: expected one argument')
      }
      prefix = value
      ++i
      continue
    }
    if (arg.startsWith('--prefix=')) { prefix = arg.slice('--prefix='.length); continue }
    extras.push(arg)
  }
  if (positionals.length === 0) return fail('the following arguments are required: usdFileName')
  extras.push(...positionals.slice(1))
  if (extras.length > 0) return fail(`unrecognized arguments: ${extras.join(' ')}`)
  return { readOnly, forceWrite, prefix, usdFileName: positionals[0]! }
}

// main (usdedit.py:122-209).
async function main(
  args: { readOnly: boolean, forceWrite: boolean, prefix: string | undefined, usdFileName: string },
  io: UsdEditIO, env: Readonly<Record<string, string | undefined>>,
): Promise<void> {
  let { readOnly, forceWrite } = args
  const { usdFileName, prefix } = args

  // Verify our usd file exists, and permissions args are sane.
  if (readOnly && forceWrite) exit('Error: Cannot set read only(-n) and force  write(-f) together.')

  const resolvedPath = (await ArGetResolver().resolve(usdFileName)).toString()
  if (!resolvedPath) exit(`Error: Cannot find file ${usdFileName}`)

  // Layers in packages cannot be written using the Sdf API.
  const [pkg] = ArSplitPackageRelativePathOuter(resolvedPath)

  // Sdf.FileFormat.FindByExtension(Sdf.FileFormat.GetFileExtension(package)).
  const fileFormat = SdfFileFormat.findByExtension(pkg)
  if (!fileFormat) exit('Error: Unknown file format')

  if (fileFormat.isPackage()) {
    const extension = pkg.slice(pkg.lastIndexOf('.') + 1)
    io.stdout(`Warning: Edits cannot be saved to layers in ${extension} files. Starting in no-effect mode.\n`)
    readOnly = true
    forceWrite = false
  }

  const writable = _isFile(usdFileName) && !_isDir(usdFileName) && _isWritable(usdFileName)
  if (!(writable || readOnly || forceWrite)) {
    exit("Error: File isn't writable, and readOnly(-n)/forceWrite(-f) haven't been marked.")
  }

  // Ensure we have a text editor available.
  const editorArgs = findEditor(usdFileName, readOnly, env)

  // Generate our temporary file with proper permissions and edit.
  const usdaFileName = await generateTemporaryFile(usdFileName, readOnly, prefix, io)
  const tempFileChanged = await editTemporaryFile(editorArgs, usdaFileName, io, env)

  if ((!readOnly || forceWrite) && tempFileChanged) {
    // No need to overwrite usdFileName's write permissions: a new layer is
    // created at that path.
    if (!await writeOutChanges(usdaFileName, usdFileName)) {
      exit(`Error: Unable to save edits back to the original file ${usdFileName}. ` +
        `Your edits can be found in ${usdaFileName}. `)
    }
  }

  if (readOnly) await _chmod(usdaFileName, 0o644)
  await _deleteFile(usdaFileName)
}

const processIO: UsdEditIO = {
  stdout: text => { process.stdout.write(text) },
  stderr: text => { process.stderr.write(text) },
  interactive: true,
}

/** Runs usdedit with the arguments `argv` (without the program name) and
 *  resolves its exit code. */
export async function usdedit(argv: readonly string[], io: UsdEditIO = processIO): Promise<number> {
  const parsed = parseArgs(argv, io)
  if ('exitCode' in parsed) return parsed.exitCode
  const env = io.env ?? (typeof process !== 'undefined' ? process.env : {})
  try {
    await main(parsed, io, env)
    return 0
  } catch (e) {
    if (e instanceof SystemExit) {
      if (e.message !== undefined) io.stderr(`${e.message}\n`)
      return e.code
    }
    // An uncaught exception: Python prints the traceback and exits with 1.
    io.stderr(`${e instanceof Error ? `${e.name}: ${e.message}` : String(e)}\n`)
    return 1
  }
}

// Run as a script: `usdedit ...` on the command line.
if (await _isMainScript(import.meta.url)) process.exitCode = await usdedit(process.argv.slice(2))
