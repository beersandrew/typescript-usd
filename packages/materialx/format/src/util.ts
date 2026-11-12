// Ported from MaterialX 1.39.5: source/MaterialXFormat/Util.h,
//  source/MaterialXFormat/Util.cpp
// Copyright Contributors to the MaterialX Project. Apache License 2.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Mirrors source/MaterialXFormat/Util.h and Util.cpp

import * as fs from 'node:fs'
import { getVirtualFileSystem } from './virtualFs.ts'
import {
  Document,
  Element,
  Exception,
  StringResolver,
  ValueElement,
  createDocument,
  EMPTY_STRING,
  FILENAME_TYPE_STRING,
} from '@mtlx/core'
import { FilePath, FileSearchPath, getEnvironmentPath } from './file.ts'
import { MTLX_EXTENSION, XmlReadOptions, readFromXmlFile } from './xmlIo.ts'

// Read the given file and return a string containing its contents; if the
// read is not successful, then the empty string is returned.
export function readFile(filePath: FilePath | string): string {
  const path = typeof filePath === 'string' ? new FilePath(filePath) : filePath
  const virtual = getVirtualFileSystem()?.read(path.asString())
  if (virtual !== null && virtual !== undefined) {
    return virtual
  }
  try {
    return fs.readFileSync(path.asString(), 'utf8')
  } catch {
    return EMPTY_STRING
  }
}

// Get all subdirectories for a given set of directories and search paths.
export function getSubdirectories(
  rootDirectories: FilePath[],
  searchPath: FileSearchPath,
  subDirectories: FilePath[],
): void {
  for (const root of rootDirectories) {
    const rootPath = searchPath.find(root)
    if (rootPath.exists()) {
      subDirectories.push(...rootPath.getSubDirectories())
    }
  }
}

// Scan for all documents under a root path and return documents which can
// be loaded.
export function loadDocuments(
  rootPath: FilePath,
  searchPath: FileSearchPath,
  skipFiles: Set<string>,
  includeFiles: Set<string>,
  documents: Document[],
  documentsPaths: string[],
  readOptions: XmlReadOptions | null = null,
  errors: string[] | null = null,
): void {
  for (const dir of rootPath.getSubDirectories()) {
    for (const file of dir.getFilesInDirectory(MTLX_EXTENSION)) {
      const fileName = file.asString()
      if (!skipFiles.has(fileName) && (includeFiles.size === 0 || includeFiles.has(fileName))) {
        const doc = createDocument()
        const filePath = dir.join(file)
        try {
          const readSearchPath = searchPath.copy()
          readSearchPath.append(dir)
          readFromXmlFile(doc, filePath, readSearchPath, readOptions)
          documents.push(doc)
          documentsPaths.push(filePath.asString())
        } catch (err) {
          if (errors && err instanceof Exception) {
            errors.push('Failed to load: ' + filePath.asString() + '. Error: ' + err.message)
          } else if (!(err instanceof Exception)) {
            throw err
          }
        }
      }
    }
  }
}

// Load a given MaterialX library into a document.
export function loadLibrary(
  file: FilePath | string,
  doc: Document,
  searchPath: FileSearchPath = new FileSearchPath(),
  readOptions: XmlReadOptions | null = null,
): void {
  const libDoc = createDocument()
  readFromXmlFile(libDoc, file, searchPath, readOptions)
  doc.importLibrary(libDoc)
}

// Load all MaterialX files within the given library folders into a
// document, using the given search path to locate the folders on the file
// system. Returns the set of loaded library file paths.
export function loadLibraries(
  libraryFolders: Array<FilePath | string>,
  searchPath: FileSearchPath,
  doc: Document,
  excludeFiles: Set<string> = new Set(),
  readOptions: XmlReadOptions | null = null,
): Set<string> {
  // Append the environment path to the specified search path.
  const librarySearchPath = searchPath.copy()
  librarySearchPath.append(getEnvironmentPath())

  const loadedLibraries = new Set<string>()
  const loadFrom = (libraryPath: FilePath): void => {
    for (const path of libraryPath.getSubDirectories()) {
      for (const filename of path.getFilesInDirectory(MTLX_EXTENSION)) {
        if (!excludeFiles.has(filename.asString())) {
          const file = path.join(filename)
          if (!loadedLibraries.has(file.asString())) {
            loadLibrary(file, doc, searchPath, readOptions)
            loadedLibraries.add(file.asString())
          }
        }
      }
    }
  }

  if (libraryFolders.length === 0) {
    // No libraries are specified, so scan in all search paths.
    for (const libraryPath of librarySearchPath) {
      loadFrom(libraryPath)
    }
  } else {
    // Look for the specific library folders in the search paths.
    for (const libraryName of libraryFolders) {
      loadFrom(librarySearchPath.find(libraryName))
    }
  }
  return loadedLibraries
}

// Flatten all filenames in the given document, applying string resolvers at
// the scope of each element and removing all file prefix attributes.
export function flattenFilenames(
  doc: Document,
  searchPath: FileSearchPath = new FileSearchPath(),
  customResolver: StringResolver | null = null,
): void {
  for (const elem of doc.traverseTree()) {
    const valueElem = elem.asA(ValueElement)
    if (!valueElem || valueElem.getType() !== FILENAME_TYPE_STRING) {
      continue
    }

    const unresolvedValue = new FilePath(valueElem.getValueString())
    if (unresolvedValue.isEmpty()) {
      continue
    }
    const elementResolver = elem.createStringResolver()
    // If the path is already absolute then don't allow an additional
    // prefix, as this would make the path invalid.
    if (unresolvedValue.isAbsolute()) {
      elementResolver.setFilePrefix(EMPTY_STRING)
    }
    let resolvedString = valueElem.getResolvedValueString(elementResolver)

    // Convert relative to absolute pathing if the file is not already found.
    if (!searchPath.isEmpty()) {
      const resolvedValue = new FilePath(resolvedString)
      if (!resolvedValue.isAbsolute()) {
        for (let i = 0; i < searchPath.size(); i++) {
          const testPath = searchPath.getItem(i).join(resolvedValue).getNormalized()
          if (testPath.exists()) {
            resolvedString = testPath.asString()
            break
          }
        }
      }
    }

    // Apply any custom filename resolver.
    if (customResolver && StringResolver.isResolvedType(FILENAME_TYPE_STRING)) {
      resolvedString = customResolver.resolve(resolvedString, FILENAME_TYPE_STRING)
    }

    valueElem.setValueString(resolvedString)
  }

  // Remove any file prefix attributes.
  for (const elem of doc.traverseTree()) {
    if (elem.hasFilePrefix()) {
      elem.removeAttribute(Element.FILE_PREFIX_ATTRIBUTE)
    }
  }
}

// Return a file search path containing the parent folder of each source URI
// in the given document.
export function getSourceSearchPath(doc: Document): FileSearchPath {
  const pathSet = new Set<string>()
  for (const elem of doc.traverseTree()) {
    if (elem.hasSourceUri()) {
      pathSet.add(new FilePath(elem.getSourceUri()).getParentPath().asString())
    }
  }

  const searchPath = new FileSearchPath()
  for (const path of pathSet) {
    searchPath.append(new FilePath(path))
  }

  return searchPath
}

// Return a search path for the MaterialX data libraries, found by walking
// upward from the current module and working directory until a folder
// containing libraries/targets is discovered. (The C++ version walks up
// from the executable path.)
export function getDefaultDataSearchPath(): FileSearchPath {
  // With a virtual file system active (browser), its root is the data root.
  const vfs = getVirtualFileSystem()
  if (vfs) {
    return new FileSearchPath(vfs.getRoot())
  }

  const REQUIRED_LIBRARY_FOLDER = new FilePath('libraries/targets')

  const searchPath = new FileSearchPath()
  for (let currentPath of [FilePath.getModulePath(), FilePath.getCurrentPath()]) {
    while (!currentPath.isEmpty()) {
      if (currentPath.join(REQUIRED_LIBRARY_FOLDER).exists()) {
        searchPath.append(currentPath)
        return searchPath
      }
      currentPath = currentPath.getParentPath()
    }
  }
  return searchPath
}
