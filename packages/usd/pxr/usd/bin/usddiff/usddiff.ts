#!/usr/bin/env node
// Ported from OpenUSD 26.11.1: pxr/usd/bin/usddiff/usddiff.py
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// usddiff (usddiff.py): compares two usd-readable files (or directories of
// them, or two usdz packages entry by entry) by converting each to usda text
// with usdcat and diffing the texts, with the diff program $USD_DIFF or
// $DIFF names, else a built-in unified diff; image files in usdz packages
// are compared by $USD_IMAGE_DIFF when it is set.
//
// usddiff(argv, io) runs the tool in process and resolves its exit code;
// standard output and error go to `io` (the process's by default) and the
// environment variables are read from `io.env` (the process's by default).
// Run as a script, the file is the command. usdcat runs in process
// (pxr/usd/bin/usdcat/usdcat.ts) where upstream runs the usdcat binary
// (RunUsdBinary, usdUtils/toolPaths.py:110-155); an external diff or image
// diff program runs as a child process, which only Node can start.
//
// FAITHFULNESS-DEBT(usddiff-argparse-subset): upstream parses its arguments
// with Python's argparse (usddiff.py:510-541). parseArgs reads the same
// files and -n/--noeffect, -f/--flatten and -q/--brief flags, and fails with
// argparse's exit code 2 for no files or an unknown argument; -h/--help
// prints a usage summary, not argparse's formatted help. A port of argparse's
// behaviour would replace it.
//
// FAITHFULNESS-DEBT(usddiff-usd-format-can-read): _getFileFormat asks
// Sdf.FileFormat 'usd' whether it can read a file without a known extension
// (SdfUsdFileFormat::CanRead, sdf/usdFileFormat.cpp:186-192); sdf has no
// CanRead here, so usdFormatCanRead checks the two cookies it checks: crate's
// "PXR-USDC" and usda's "#usda" (sdf/usdaFileFormat.cpp:226-260). A
// SdfFileFormat.canRead in sdf would replace it.

import { _cwd, _deleteFile, _isDir, _isMainScript, _isWritable, _listDir, _makeTmpFileName,
  _modificationTime, _pathExists, _readFile, _writeFile,
} from 'typescript-usd/ar/_internal'
import { GetResolver as ArGetResolver, JoinPackageRelativePath as ArJoinPackageRelativePath } from 'typescript-usd/ar'
import { FileFormat as SdfFileFormat, UsdZipFile as SdfZipFile } from 'typescript-usd/sdf'
import { usdcat } from '../usdcat/usdcat.ts'
import { readLines, unifiedDiff } from './unifiedDiff.ts'

/** Where the tool writes (sys.stdout, sys.stderr) and the environment it
 *  reads (os.environ). */
export interface UsdDiffIO {
  stdout(text: string): void
  stderr(text: string): void
  env?: Readonly<Record<string, string | undefined>>
}

// usddiff.py:16-18.
const NO_DIFF_FOUND_EXIT_CODE = 0
const DIFF_FOUND_EXIT_CODE = 1
const ERROR_EXIT_CODE = 2

// sys.exit, raised by _exit (usddiff.py:20-23).
class SystemExit {
  constructor(readonly code: number) {}
}

// Python's ValueError, raised by _findFiles and caught by main.
class ValueError extends Error {}

class UsdDiff {
  constructor(private readonly io: UsdDiffIO, private readonly env: Readonly<Record<string, string | undefined>>) {}

  private print(msg: string): void { this.io.stdout(`${msg}\n`) }

  // _exit (usddiff.py:20-23).
  private exit(msg: string | undefined, exitCode: number): never {
    if (msg !== undefined) this.io.stderr(`${msg}\n`)
    throw new SystemExit(exitCode)
  }

  // _generateCatOptions (usddiff.py:28-37).
  private generateCatOptions(outPath: string, flatten?: boolean, fmt?: string): string[] {
    const options = ['--out', outPath]
    if (flatten) options.push('--flatten')
    if (fmt && splitExt(outPath)[1] === '.usd') options.push('--usdFormat', fmt)
    return options
  }

  // _findDiffTools (usddiff.py:52-65); usdcat is always available here.
  private findDiffTools(): [string | undefined, string[]] {
    // Prefer USD_DIFF, then DIFF, else use the internal unified diff.
    const [diffCmd, diffCmdArgs] = splitDiffCommand(this.env['USD_DIFF'] || this.env['DIFF'])
    if (diffCmd && !findUsdBinary(diffCmd, this.env)) {
      this.exit(`Error: Failed to find diff tool ${diffCmd}.`, ERROR_EXIT_CODE)
    }
    return [diffCmd, diffCmdArgs]
  }

  // _findImageDiffTools (usddiff.py:68-77).
  private findImageDiffTools(): [string | undefined, string[]] {
    // Prefer USD_IMAGE_DIFF, else use the internal filecmp.
    const [imageDiffCommand, imageDiffCmdArgs] = splitDiffCommand(this.env['USD_IMAGE_DIFF'])
    if (imageDiffCommand && !findUsdBinary(imageDiffCommand, this.env)) {
      this.exit(`Error: Failed to find image diff tool ${imageDiffCommand}`, ERROR_EXIT_CODE)
    }
    return [imageDiffCommand, imageDiffCmdArgs]
  }

  // _findImageDiffFormats (usddiff.py:79-85).
  private findImageDiffFormats(): Set<string> {
    const imgFormatStr = this.env['USD_IMAGE_DIFF_FORMATS']
    if (imgFormatStr !== undefined) return new Set(imgFormatStr.split(',').map(x => x.toLowerCase()))
    return new Set(['bmp', 'jpg', 'jpeg', 'png', 'tga', 'hdr'])
  }

  // _getFileFormat (usddiff.py:98-129).
  private async getFileFormat(path: string): Promise<string | undefined> {
    // Python's os.path.splitext retains the '.' portion when obtaining an
    // extension, but Sdf's FileFormat API doesn't expect one; version
    // specifiers are pruned too.
    const ext = getFileExt(path)
    const resolved = (await ArGetResolver().resolve(path)).toString()

    // Try to find the format by extension.
    let fileFormat = ext ? SdfFileFormat.findByExtension(ext) : undefined

    if (!fileFormat) {
      // Try to see if we can use the 'usd' format to read the file: some
      // extensionless files are actually usda or usdc, and an empty file is
      // treated as a 'usd' file (the _convertTo code special-cases it).
      const usdFormat = SdfFileFormat.findByExtension('usd')
      if (usdFormat) {
        // os.stat(str(path)) raises for a path that resolved to nothing.
        if (!_pathExists(resolved)) throw new Error(`[Errno 2] No such file or directory: '${resolved}'`)
        const bytes = await _readFile(resolved)
        if (bytes.length === 0 || usdFormatCanRead(bytes)) fileFormat = usdFormat
      }
    }

    // Don't check if the file exists: the resolver handles that.
    return fileFormat?.formatId
  }

  // _convertTo (usddiff.py:131-151): 0 on success.
  private async convertTo(inPath: string, outPath: string, flatten?: boolean, fmt?: string): Promise<number> {
    // Just copy empty files: we want something to diff against but the file
    // isn't valid usd.
    if (_pathExists(inPath)) {
      const bytes = await _readFile(inPath)
      if (bytes.length === 0) {
        try {
          await _writeFile(outPath, bytes)
          return 0
        } catch {
          return 1
        }
      }
    }
    return usdcat([...this.generateCatOptions(outPath, flatten, fmt), '--', inPath], this.io)
  }

  // _tryEdit (usddiff.py:153-161).
  private async tryEdit(fileName: string, tempFileName: string, fileType: string, flattened: boolean): Promise<number> {
    if (flattened) this.exit('Error: Cannot write out flattened result.', ERROR_EXIT_CODE)
    if (!_isWritable(fileName)) {
      this.exit(`Error: Cannot write to ${fileName}, insufficient permissions`, ERROR_EXIT_CODE)
    }
    return this.convertTo(tempFileName, fileName, undefined, fileType)
  }

  // _launchDiffTool (usddiff.py:222-250).
  private async launchDiffTool(
    diffCmd: string | undefined, diffCmdArgs: string[], baseline: string, comparison: string, brief: boolean,
  ): Promise<number> {
    if (diffCmd) {
      // Run the external diff tool.
      if (brief) diffCmdArgs.push('--brief')
      return call([diffCmd, ...diffCmdArgs, baseline, comparison], this.io, this.env)
    }

    // Read the files (text mode: universal newlines).
    const baselineData = readLines(await readText(baseline))
    const comparisonData = readLines(await readText(comparison))

    if (baselineData.length === comparisonData.length && baselineData.every((line, i) => line === comparisonData[i])) {
      return 0
    }

    if (brief) {
      this.print(`Files ${baseline} and ${comparison} differ`)
    } else {
      // Generate a unified diff and output it; skip the file names.
      const diff = [...unifiedDiff(baselineData, comparisonData, baseline, comparison, 0)]
      for (const line of diff.slice(2)) this.io.stdout(line)
    }
    return 1
  }

  // _diffUsdz (usddiff.py:264-341): the archives' common files whose CRC or
  // size differ are diffed one by one, nested usdz packages recursively.
  // Nested packages are read from their bytes in the outer archive, which
  // Sdf.ZipFile.Open of their package-relative path reads upstream.
  private async diffUsdz(
    baseZip: SdfZipFile, compZip: SdfZipFile, brief: boolean, baseStack: string[], compStack: string[],
  ): Promise<number> {
    const imageFormats = this.findImageDiffFormats()
    const [imageDiffCmd, imageDiffCmdArgs] = this.findImageDiffTools()

    const baseFiles = new Set(baseZip.getFileNames())
    const compFiles = new Set(compZip.getFileNames())

    const common = [...baseFiles].filter(f => compFiles.has(f))
    const baseOnly = [...baseFiles].filter(f => !compFiles.has(f))
    const compareOnly = [...compFiles].filter(f => !baseFiles.has(f))

    let diffResult = baseOnly.length > 0 || compareOnly.length > 0 ? 1 : 0
    common.sort()

    for (const commonFile of common) {
      const baseInfo = baseZip.getFileInfo(commonFile)!
      const compInfo = compZip.getFileInfo(commonFile)!
      const commonFileExt = getFileExt(commonFile).toLowerCase()
      const isImageDiff = imageFormats.has(commonFileExt)

      if (baseInfo.crc === compInfo.crc && baseInfo.uncompressedSize === compInfo.uncompressedSize) continue

      const basePath = getArchivePath(baseStack, commonFile)
      const compPath = getArchivePath(compStack, commonFile)

      // Check for cases where file extraction is not necessary.
      if (isImageDiff && imageDiffCmd === undefined) {
        this.print(`Differences in ${basePath} and ${compPath}:`)
        diffResult = 1
        continue
      } else if (commonFileExt === 'usdz') {
        baseStack.push(commonFile)
        compStack.push(commonFile)
        diffResult |= await this.diffUsdz(
          SdfZipFile.fromBytes(await baseZip.extract(commonFile)),
          SdfZipFile.fromBytes(await compZip.extract(commonFile)), brief, baseStack, compStack)
        baseStack.pop()
        compStack.pop()
        continue
      }

      // Extract from the usdz archive and write to disk for the diff.
      await withNamedTemporaryFiles([`__.${commonFileExt}`, `__.${commonFileExt}`],
        async ([tempBaseline, tempComparison]) => {
          await _writeFile(tempBaseline, await baseZip.extract(commonFile))
          await _writeFile(tempComparison, await compZip.extract(commonFile))

          this.print(`Differences in ${basePath} and ${compPath}:`)

          if (isImageDiff) {
            // Run an image diff.
            diffResult |= await call([imageDiffCmd!, ...imageDiffCmdArgs, tempBaseline, tempComparison],
              this.io, this.env)
          } else {
            // Run a traditional diff.
            diffResult |= await this.runDiff(tempBaseline, tempComparison, false, true, brief)
          }
        })
    }

    for (const b of baseOnly) this.print(`Only in baseline: ${getArchivePath(baseStack, b)}.`)
    for (const c of compareOnly) this.print(`Not in baseline: ${getArchivePath(compStack, c)}.`)

    return diffResult
  }

  // _runDiff (usddiff.py:343-421).
  async runDiff(baseline: string, comparison: string, flatten: boolean, noeffect: boolean, brief: boolean): Promise<number> {
    let diffResult = 0

    const [diffCmd, diffCmdArgs] = this.findDiffTools()

    // FileManager (usddiff.py:163-220): typed temporary copies when an
    // extension doesn't match its file type.
    const baselineFileType = await this.getFileFormat(baseline)
    const comparisonFileType = await this.getFileFormat(comparison)
    const typedCopies: string[] = []
    const makeTempCopy = async (fileName: string, fileType: string): Promise<string> => {
      const typedFileName = _makeTmpFileName('tmp', `.${fileType}`)
      await _writeFile(typedFileName, await _readFile(fileName))
      typedCopies.push(typedFileName)
      return typedFileName
    }
    try {
      const baselineName = baselineFileType && getFileExt(baseline) !== baselineFileType
        ? await makeTempCopy(baseline, baselineFileType) : baseline
      const comparisonName = comparisonFileType && getFileExt(comparison) !== comparisonFileType
        ? await makeTempCopy(comparison, comparisonFileType) : comparison

      const pluginError = (path: string) => `Error: Cannot find supported file format plugin for ${path}`
      if (baselineFileType === undefined) this.exit(pluginError(baseline), ERROR_EXIT_CODE)
      if (comparisonFileType === undefined) this.exit(pluginError(comparison), ERROR_EXIT_CODE)

      if (baselineFileType === 'usdz' && comparisonFileType === 'usdz') {
        const baseZip = await SdfZipFile.open(baselineName)
        const compZip = await SdfZipFile.open(comparisonName)
        if (!baseZip || !compZip) throw new Error(`Sdf.ZipFile.Open failed for '${!baseZip ? baselineName : comparisonName}'`)
        return await this.diffUsdz(baseZip, compZip, brief, [baselineName], [comparisonName])
      } else if (baselineFileType === 'usdz' || comparisonFileType === 'usdz') {
        // Comparing any non usdz to a usdz is a "these files differ" result.
        this.print(`Files ${baseline} and ${comparison} differ`)
        return 1
      }

      // Recognizable suffixes for the files in the temp dir, of the form
      // /temp/string__originalFileName.usda, so users can tell which file is
      // which when diffing.
      const tempBaselineFileName = `__${splitExt(baseName(baseline))[0]}.usda`
      const tempComparisonFileName = `__${splitExt(baseName(comparison))[0]}.usda`

      await withNamedTemporaryFiles([tempBaselineFileName, tempComparisonFileName],
        async ([tempBaseline, tempComparison]) => {
          // Dump the contents of our files into the temporaries.
          const convertError = (from: string, to: string) => `Error: failed to convert from ${from} to ${to}.`
          if (await this.convertTo(baselineName, tempBaseline, flatten) !== 0) {
            this.exit(convertError(baseline, tempBaseline), ERROR_EXIT_CODE)
          }
          if (await this.convertTo(comparisonName, tempComparison, flatten) !== 0) {
            this.exit(convertError(comparison, tempComparison), ERROR_EXIT_CODE)
          }

          const tempBaselineTimestamp = _modificationTime(tempBaseline)?.getTime()
          const tempComparisonTimestamp = _modificationTime(tempComparison)?.getTime()

          diffResult |= await this.launchDiffTool(diffCmd, diffCmdArgs, tempBaseline, tempComparison, brief)

          const tempBaselineChanged = _modificationTime(tempBaseline)?.getTime() !== tempBaselineTimestamp
          const tempComparisonChanged = _modificationTime(tempComparison)?.getTime() !== tempComparisonTimestamp

          // If we intend to edit either of the files.
          if (!noeffect) {
            if (tempBaselineChanged &&
                await this.tryEdit(baseline, tempBaseline, baselineFileType!, flatten) !== 0) {
              this.exit(convertError(baseline, tempBaseline), ERROR_EXIT_CODE)
            }
            if (tempComparisonChanged &&
                await this.tryEdit(comparison, tempComparison, comparisonFileType!, flatten) !== 0) {
              this.exit(convertError(comparison, tempComparison), ERROR_EXIT_CODE)
            }
          }
        })
    } finally {
      // Clean up any temp files we created.
      for (const typedCopy of typedCopies) await _deleteFile(typedCopy)
    }
    return diffResult
  }

  // _findFiles (usddiff.py:423-507): [baseline-only, matching pairs,
  // comparison-only].
  async findFiles(args: readonly string[]): Promise<[string[], [string, string][], string[]]> {
    // Must have FILE FILE, DIR DIR, DIR FILES... or FILES... DIR.
    const err = () => new ValueError('Error: File arguments must be one of: ' +
      'FILE FILE, DIR DIR, DIR FILES..., or FILES... DIR.')
    if (args.length < 2) throw err()

    const resolver = ArGetResolver()
    // undefined for an arg that is not on disk (os.stat failing).
    const stats: ('dir' | 'file' | undefined)[] = []
    for (const arg of args) {
      if (_pathExists(arg)) {
        stats.push(_isDir(arg) ? 'dir' : 'file')
      } else {
        if (!(await resolver.resolve(arg)).toString()) {
          throw new ValueError(`Error: ${arg} does not exist, and cannot be resolved`)
        }
        stats.push(undefined)
      }
    }

    const isdir = (st: 'dir' | 'file' | undefined) => st === 'dir'

    // If any of the directory forms are used, no paths may be unresolved
    // assets.
    const validateFiles = () => {
      stats.forEach((st, i) => {
        if (st === undefined) {
          throw new ValueError(`Error: ${args[i]} did not exist on disk, and using a directory comparison form`)
        }
      })
    }

    // DIR FILES...
    if (isdir(stats[0]) && !stats.slice(1).some(isdir)) {
      validateFiles()
      const dirpath = args[0]!
      const files = new Set(args.slice(1).map(relPath))
      const dirfiles = listFiles(dirpath)
      return [
        [],
        [...files].filter(p => dirfiles.has(p)).map(p => [joinPath(dirpath, p), p] as [string, string]),
        [...files].filter(p => !dirfiles.has(p)),
      ]
    }
    // FILES... DIR
    if (!stats.slice(0, -1).some(isdir) && isdir(stats.at(-1))) {
      validateFiles()
      const dirpath = args.at(-1)!
      const files = new Set(args.slice(0, -1).map(relPath))
      const dirfiles = listFiles(dirpath)
      return [
        [...files].filter(p => !dirfiles.has(p)),
        [...files].filter(p => dirfiles.has(p)).map(p => [p, joinPath(dirpath, p)] as [string, string]),
        [],
      ]
    }
    // FILE FILE or DIR DIR
    if (args.length === 2) {
      // DIR DIR
      if (stats.every(isdir)) {
        const [ldir, rdir] = args as [string, string]
        const lhs = listFiles(ldir)
        const rhs = listFiles(rdir)
        return [
          // Baseline only.
          [...lhs].filter(p => !rhs.has(p)).map(p => joinPath(ldir, p)).sort(),
          // Corresponding.
          [...lhs].filter(p => rhs.has(p)).map(p => [joinPath(ldir, p), joinPath(rdir, p)] as [string, string])
            .sort((x, y) => x[0] < y[0] ? -1 : x[0] > y[0] ? 1 : x[1] < y[1] ? -1 : x[1] > y[1] ? 1 : 0),
          // Comparison only.
          [...rhs].filter(p => !lhs.has(p)).map(p => joinPath(rdir, p)).sort(),
        ]
      }
      // FILE FILE
      if (!stats.some(isdir)) return [[], [[args[0]!, args[1]!]], []]
    }

    throw err()
  }
}

// os.path.splitext: [root, ext], the extension of the last component with
// its dot; leading dots do not start one.
function splitExt(path: string): [string, string] {
  const slash = path.lastIndexOf('/')
  const base = path.slice(slash + 1)
  const leadingDots = base.length - base.replace(/^\.+/, '').length
  const dot = base.lastIndexOf('.')
  if (dot < leadingDots) return [path, '']
  return [path.slice(0, slash + 1 + dot), base.slice(dot)]
}

// os.path.basename.
function baseName(path: string): string {
  return path.slice(path.lastIndexOf('/') + 1)
}

// os.path.join for two components.
function joinPath(a: string, b: string): string {
  if (b.startsWith('/')) return b
  return a === '' || a.endsWith('/') ? a + b : `${a}/${b}`
}

// os.path.normpath.
function normPath(path: string): string {
  const absolute = path.startsWith('/')
  const parts: string[] = []
  for (const part of path.split('/')) {
    if (part === '' || part === '.') continue
    if (part === '..' && parts.length > 0 && parts.at(-1) !== '..') parts.pop()
    else if (part !== '..' || !absolute) parts.push(part)
  }
  const joined = parts.join('/')
  return absolute ? `/${joined}` : joined || '.'
}

// os.path.relpath(path): `path` relative to the working directory.
function relPath(path: string): string {
  const cwd = normPath(_cwd())
  const abs = normPath(path.startsWith('/') ? path : `${cwd}/${path}`)
  const from = cwd.split('/').filter(Boolean)
  const to = abs.split('/').filter(Boolean)
  let common = 0
  while (common < from.length && common < to.length && from[common] === to[common]) ++common
  const rel = [...Array(from.length - common).fill('..'), ...to.slice(common)]
  return rel.join('/') || '.'
}

// listFiles (usddiff.py:435-440): every file under `dirpath`, relative to
// it (os.walk).
function listFiles(dirpath: string): Set<string> {
  const ret = new Set<string>()
  const walk = (dir: string, prefix: string) => {
    for (const name of _listDir(dir)) {
      const full = joinPath(dir, name)
      if (_isDir(full)) walk(full, `${prefix}${name}/`)
      else ret.add(prefix + name)
    }
  }
  walk(dirpath, '')
  return ret
}

// _splitDiffCommand (usddiff.py:39-49).
function splitDiffCommand(diffCmdIn: string | undefined): [string | undefined, string[]] {
  if (diffCmdIn === undefined || diffCmdIn === '') return [diffCmdIn || undefined, []]
  const diffCmdList = diffCmdIn.split(/\s+/).filter(Boolean)
  return [diffCmdList[0], diffCmdList.slice(1)]
}

// _getFileExt (usddiff.py:87-96): the extension without its dot or any
// version specifier.
function getFileExt(path: string): string {
  const ext = splitExt(path)[1]
  if (ext.length <= 1) return ''
  let result = ext.slice(1)
  const versionSpecifierPos = result.lastIndexOf('#')
  if (versionSpecifierPos !== -1) result = result.slice(0, versionSpecifierPos)
  return result
}

// _getArchivePath (usddiff.py:253-255): a readable path for a file in a usd
// archive.
function getArchivePath(usdzStack: readonly string[], archiveFile: string): string {
  return ArJoinPackageRelativePath([...usdzStack, archiveFile])
}

// See FAITHFULNESS-DEBT(usddiff-usd-format-can-read).
function usdFormatCanRead(bytes: Uint8Array): boolean {
  const head = new TextDecoder().decode(bytes.subarray(0, 8))
  return head === 'PXR-USDC' || head.startsWith('#usda')
}

// open(path, "r").read(): the text with universal newlines.
async function readText(path: string): Promise<string> {
  return new TextDecoder().decode(await _readFile(path)).replace(/\r\n?/g, '\n')
}

// Tf.NamedTemporaryFile(suffix=...) for each suffix: empty files in the
// temporary directory, removed after `body`.
async function withNamedTemporaryFiles<T>(
  suffixes: readonly [string, string], body: (names: [string, string]) => Promise<T>,
): Promise<T> {
  const names: string[] = []
  try {
    for (const suffix of suffixes) {
      const name = _makeTmpFileName('tmp', suffix)
      await _writeFile(name, new Uint8Array())
      names.push(name)
    }
    return await body(names as [string, string])
  } finally {
    for (const name of names) await _deleteFile(name)
  }
}

// FindUsdBinary (usdUtils/toolPaths.py:19-51): whether `name` is a file
// itself or names one on $PATH.
function findUsdBinary(name: string, env: Readonly<Record<string, string | undefined>>): string | undefined {
  if (name.includes('/')) return _pathExists(name) && !_isDir(name) ? name : undefined
  for (const dir of (env['PATH'] ?? '').split(':')) {
    if (dir === '') continue
    const candidate = joinPath(dir, name)
    if (_pathExists(candidate) && !_isDir(candidate)) return candidate
  }
  return undefined
}

// subprocess.call(args): runs `args` and resolves its exit code, its output
// passed to `io`.
async function call(args: string[], io: UsdDiffIO, env: Readonly<Record<string, string | undefined>>): Promise<number> {
  if (typeof process === 'undefined' || !process.versions?.node) {
    throw new Error(`Cannot run '${args[0]}': no host process`)
  }
  const specifier = ['node', 'child_process'].join(':')
  const { spawn } = await import(/* @vite-ignore */ specifier) as {
    spawn(cmd: string, args: string[], options: object): {
      stdout: { on(event: 'data', fn: (chunk: Uint8Array) => void): void }
      stderr: { on(event: 'data', fn: (chunk: Uint8Array) => void): void }
      on(event: 'close', fn: (code: number | null) => void): void
      on(event: 'error', fn: (error: Error) => void): void
    }
  }
  return new Promise((resolve, reject) => {
    const child = spawn(findUsdBinary(args[0]!, env) ?? args[0]!, args.slice(1),
      { stdio: ['inherit', 'pipe', 'pipe'], env })
    const decoder = new TextDecoder()
    child.stdout.on('data', chunk => io.stdout(decoder.decode(chunk)))
    child.stderr.on('data', chunk => io.stderr(decoder.decode(chunk)))
    child.on('error', reject)
    child.on('close', code => resolve(code ?? 1))
  })
}

const PROG = 'usddiff'
const USAGE = `usage: ${PROG} [-h] [-n] [-f] [-q] files [files ...]`
const HELP = `${USAGE}

Compares two usd-readable files using a selected diff program. This is chosen
by looking at the $USD_DIFF environment variable. If this is unset, it will
consult the $DIFF environment variable. Lastly, if neither of these is set,
it will try to use the canonical unix program, diff. This will relay the exit
code of the selected diff program.When comparing two usdz files, each file
contained in the package will be examined individually. The $USD_IMAGE_DIFF
environment variable specifies a specific diff program for comparing image
files. The $USD_IMAGE_DIFF_FORMATS environment variable specifies supported
image formats using a "," separated list of file extensions.

positional arguments:
  files            The files to compare. These must be of the form DIR DIR,
                   FILE... DIR, DIR FILE... or FILE FILE.

options:
  -h, --help       show this help message and exit
  -n, --noeffect   Do not edit either file.
  -f, --flatten    Fully compose both layers as Usd Stages and flatten into
                   single layers.
  -q, --brief      Do not return full results of diffs. Passes --brief to the
                   diff command.
`

type Parsed = { files: string[], noeffect: boolean, flatten: boolean, brief: boolean } | { exitCode: number }

// usddiff.py:510-541. See FAITHFULNESS-DEBT(usddiff-argparse-subset).
function parseArgs(argv: readonly string[], io: UsdDiffIO): Parsed {
  const fail = (message: string): Parsed => {
    io.stderr(`${USAGE}\n${PROG}: error: ${message}\n`)
    return { exitCode: 2 }
  }
  const files: string[] = []
  const extras: string[] = []
  const parsed = { files, noeffect: false, flatten: false, brief: false }
  let positionalOnly = false
  for (const arg of argv) {
    if (positionalOnly || !arg.startsWith('-') || arg === '-') { files.push(arg); continue }
    if (arg === '--') { positionalOnly = true; continue }
    if (arg === '-h' || arg === '--help') { io.stdout(HELP); return { exitCode: 0 } }
    if (arg === '-n' || arg === '--noeffect') { parsed.noeffect = true; continue }
    if (arg === '-f' || arg === '--flatten') { parsed.flatten = true; continue }
    if (arg === '-q' || arg === '--brief') { parsed.brief = true; continue }
    // Combined short flags, e.g. -nq.
    if (/^-[nfq]+$/.test(arg)) {
      for (const c of arg.slice(1)) parsed[({ n: 'noeffect', f: 'flatten', q: 'brief' } as const)[c as 'n' | 'f' | 'q']] = true
      continue
    }
    extras.push(arg)
  }
  if (files.length === 0) return fail('the following arguments are required: files')
  if (extras.length > 0) return fail(`unrecognized arguments: ${extras.join(' ')}`)
  return parsed
}

const processIO: UsdDiffIO = {
  stdout: text => { process.stdout.write(text) },
  stderr: text => { process.stderr.write(text) },
}

/** main (usddiff.py:509-562): runs usddiff with the arguments `argv`
 *  (without the program name) and resolves its exit code. */
export async function usddiff(argv: readonly string[], io: UsdDiffIO = processIO): Promise<number> {
  const parsed = parseArgs(argv, io)
  if ('exitCode' in parsed) return parsed.exitCode
  const env = io.env ?? (typeof process !== 'undefined' ? process.env : {})
  const tool = new UsdDiff(io, env)
  let diffResult = NO_DIFF_FOUND_EXIT_CODE
  try {
    try {
      const [baselineOnly, common, comparisonOnly] = await tool.findFiles(parsed.files)

      for (const [baseline, comparison] of common) {
        if (await tool.runDiff(baseline, comparison, parsed.flatten, parsed.noeffect, parsed.brief)) {
          diffResult = DIFF_FOUND_EXIT_CODE
        }
      }

      const mismatchMsg = (p: string) => `No corresponding file found for ${p}, skipping.\n`
      for (const b of baselineOnly) io.stdout(mismatchMsg(b))
      for (const c of comparisonOnly) io.stdout(mismatchMsg(c))
    } catch (err) {
      if (err instanceof ValueError) {
        io.stderr(`${err.message}\n`)
        return ERROR_EXIT_CODE
      }
      throw err
    }
  } catch (e) {
    if (e instanceof SystemExit) return e.code
    // An uncaught exception: Python prints the traceback and exits with 1.
    io.stderr(`${e instanceof Error ? `${e.name}: ${e.message}` : String(e)}\n`)
    return 1
  }
  return diffResult
}

// Run as a script: `usddiff ...` on the command line.
if (await _isMainScript(import.meta.url)) process.exitCode = await usddiff(process.argv.slice(2))
