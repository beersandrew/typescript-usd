// Ported from MaterialX 1.39.5: source/MaterialXFormat/XmlIo.h,
//  source/MaterialXFormat/XmlIo.cpp
// Copyright Contributors to the MaterialX Project. Apache License 2.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Mirrors source/MaterialXFormat/XmlIo.h and XmlIo.cpp

import * as fs from 'node:fs'
import { getVirtualFileSystem } from './virtualFs.ts'
import {
  CommentElement,
  Document,
  Element,
  NewlineElement,
  createDocument,
  Exception,
  type ElementPredicate,
} from '@mtlx/core'
import { FilePath, FileSearchPath, getEnvironmentPath } from './file.ts'
import { parseXml, serializeXml, makeElementNode, XmlParseException, type XmlNode, type XmlParseOptions } from './xml.ts'

export const MTLX_EXTENSION = 'mtlx'

export const MAX_XINCLUDE_DEPTH = 256
export const MAX_XML_TREE_DEPTH = 256

const XINCLUDE_TAG = 'xi:include'
const XINCLUDE_NAMESPACE = 'xmlns:xi'
const XINCLUDE_URL = 'http://www.w3.org/2001/XInclude'

// A standard function that reads from an XML file into a Document, with
// optional search path and read options.
export type XmlReadFunction = (
  doc: Document,
  filename: FilePath | string,
  searchPath?: FileSearchPath,
  readOptions?: XmlReadOptions | null,
) => void

// An exception that is thrown when a requested document cannot be parsed.
export class ExceptionParseError extends Exception {}

// An exception that is thrown when a requested file cannot be opened.
export class ExceptionFileMissing extends Exception {}

// A set of options for controlling the behavior of XML read functions.
export class XmlReadOptions {
  // If true, XML comments are read into documents as comment elements.
  readComments = false
  // If true, XML newlines are read into documents as newline elements.
  readNewlines = false
  // If true, documents from earlier versions of MaterialX are upgraded to
  // the current version.
  upgradeVersion = true
  // Invoked when an XInclude reference needs to be read into a document.
  // Defaults to readFromXmlFile; set to null to disable XIncludes.
  readXIncludeFunction: XmlReadFunction | null = readFromXmlFile
  // The vector of parent XIncludes at the scope of the current document.
  parentXIncludes: string[] = []

  copy(): XmlReadOptions {
    const res = new XmlReadOptions()
    res.readComments = this.readComments
    res.readNewlines = this.readNewlines
    res.upgradeVersion = this.upgradeVersion
    res.readXIncludeFunction = this.readXIncludeFunction
    res.parentXIncludes = [...this.parentXIncludes]
    return res
  }
}

// A set of options for controlling the behavior of XML write functions.
export class XmlWriteOptions {
  // If true, elements with source file markings are written as XIncludes
  // rather than explicit data.
  writeXIncludeEnable = true
  // If provided, excludes specific elements (those returning false) from
  // the write operation.
  elementPredicate: ElementPredicate | null = null
}

function documentToXml(doc: Document, xmlRoot: XmlNode, writeOptions: XmlWriteOptions | null): void {
  const writeXIncludeEnable = writeOptions ? writeOptions.writeXIncludeEnable : true
  const elementPredicate = writeOptions ? writeOptions.elementPredicate : null

  const writeElement = (elem: Element, xmlNode: XmlNode): void => {
    // Store attributes in XML.
    if (elem.getName() !== '') {
      xmlNode.attributes.push([Element.NAME_ATTRIBUTE, elem.getName()])
    }
    for (const attrName of elem.getAttributeNames()) {
      xmlNode.attributes.push([attrName, elem.getAttribute(attrName)])
    }

    // Create child elements and recurse.
    const writtenSourceFiles = new Set<string>()
    for (const child of elem.getChildren()) {
      if (elementPredicate && !elementPredicate(child)) {
        continue
      }

      // Write XInclude references if requested.
      if (writeXIncludeEnable && child.hasSourceUri()) {
        const sourceUri = child.getSourceUri()
        if (sourceUri !== elem.getDocument().getSourceUri()) {
          if (!writtenSourceFiles.has(sourceUri)) {
            if (!xmlNode.attributes.some(([name]) => name === XINCLUDE_NAMESPACE)) {
              xmlNode.attributes.push([XINCLUDE_NAMESPACE, XINCLUDE_URL])
            }
            const includeNode = makeElementNode(XINCLUDE_TAG)
            // Write relative include paths in POSIX format, and absolute
            // include paths in native format.
            const includePath = new FilePath(sourceUri)
            const includeFormat = includePath.isAbsolute() ? FilePath.FormatNative : FilePath.FormatPosix
            includeNode.attributes.push(['href', includePath.asString(includeFormat)])
            xmlNode.children.push(includeNode)

            writtenSourceFiles.add(sourceUri)
          }
          continue
        }
      }

      // Handle the interpretation of comments and newlines.
      if (child.getCategory() === CommentElement.CATEGORY) {
        xmlNode.children.push({
          type: 'comment',
          name: '',
          attributes: [],
          children: [],
          value: child.getAttribute(Element.DOC_ATTRIBUTE),
        })
        continue
      }
      if (child.getCategory() === NewlineElement.CATEGORY) {
        xmlNode.children.push({ type: 'newline', name: '', attributes: [], children: [], value: '\n' })
        continue
      }

      const xmlChild = makeElementNode(child.getCategory())
      xmlNode.children.push(xmlChild)
      writeElement(child, xmlChild)
    }
  }

  writeElement(doc, xmlRoot)
}

function elementFromXml(xmlNode: XmlNode, elem: Element, readOptions: XmlReadOptions | null, depth = 1): void {
  // Store attributes in the element.
  for (const [name, value] of xmlNode.attributes) {
    if (name !== Element.NAME_ATTRIBUTE) {
      elem.setAttribute(name, value)
    }
  }

  // Create child elements and recurse.
  for (const xmlChild of xmlNode.children) {
    // Get the child category.
    const category = xmlChild.name
    if (category === XINCLUDE_TAG) {
      continue
    }

    // Get the child name and skip duplicates.
    const name = xmlChild.attributes.find(([attrName]) => attrName === Element.NAME_ATTRIBUTE)?.[1] ?? ''
    if (name !== '' && elem.getChild(name)) {
      continue
    }

    // Enforce the maximum tree depth.
    if (depth >= MAX_XML_TREE_DEPTH) {
      throw new ExceptionParseError('Maximum tree depth exceeded.')
    }

    // Create the child element.
    let child = elem.addChildOfCategory(category, name)
    elementFromXml(xmlChild, child, readOptions, depth + 1)

    // Handle the interpretation of XML comments and newlines.
    if (readOptions && category === '') {
      if (readOptions.readComments && xmlChild.type === 'comment') {
        child = elem.changeChildCategory(child, CommentElement.CATEGORY)!
        child.setDocString(xmlChild.value)
      } else if (readOptions.readNewlines && xmlChild.type === 'newline') {
        elem.changeChildCategory(child, NewlineElement.CATEGORY)
      }
    }
  }
}

function documentFromXml(
  doc: Document,
  xmlRootNodes: XmlNode[],
  searchPath: FileSearchPath,
  readOptions: XmlReadOptions | null,
): void {
  const xmlRoot = xmlRootNodes.find((node) => node.type === 'element' && node.name === Document.CATEGORY)
  if (!xmlRoot) {
    throw new ExceptionParseError('No root MaterialX element found.')
  }

  // Process XInclude directives.
  const readXIncludeFunction = readOptions ? readOptions.readXIncludeFunction : readFromXmlFile
  if (readXIncludeFunction) {
    for (const xmlChild of xmlRoot.children) {
      if (xmlChild.name === XINCLUDE_TAG) {
        const filename = xmlChild.attributes.find(([attrName]) => attrName === 'href')?.[1] ?? ''
        const parents = readOptions ? readOptions.parentXIncludes : []

        // Validate the XInclude state.
        if (parents.includes(filename)) {
          throw new ExceptionParseError('XInclude cycle detected.')
        }
        if (parents.length >= MAX_XINCLUDE_DEPTH) {
          throw new ExceptionParseError('Maximum XInclude depth exceeded.')
        }

        // Read the included file into a library document.
        const library = createDocument()
        const xiReadOptions = readOptions ? readOptions.copy() : new XmlReadOptions()
        xiReadOptions.parentXIncludes.push(filename)
        readXIncludeFunction(library, filename, searchPath, xiReadOptions)

        // Import the library document.
        doc.importLibrary(library)
      }
    }
  }

  // Build the element tree.
  elementFromXml(xmlRoot, doc, readOptions)

  // Upgrade the version if requested.
  if (!readOptions || readOptions.upgradeVersion) {
    doc.upgradeVersion()
  }
}

function parseOptionsFor(readOptions: XmlReadOptions | null): XmlParseOptions {
  return {
    comments: readOptions?.readComments ?? false,
    newlines: readOptions?.readNewlines ?? false,
  }
}

function parseXmlOrThrow(str: string, readOptions: XmlReadOptions | null, filename?: FilePath): XmlNode[] {
  try {
    return parseXml(str, parseOptionsFor(readOptions))
  } catch (err) {
    if (err instanceof XmlParseException) {
      let message = 'XML parse error'
      if (filename && !filename.isEmpty()) {
        message += ' in ' + filename.asString()
      }
      throw new ExceptionParseError(`${message} (${err.message})`)
    }
    throw err
  }
}

// --- Reading ---

// Read a Document as XML from the given string.
export function readFromXmlString(
  doc: Document,
  str: string,
  searchPath: FileSearchPath = new FileSearchPath(),
  readOptions: XmlReadOptions | null = null,
): void {
  const fullSearchPath = searchPath.copy()
  fullSearchPath.append(getEnvironmentPath())

  const xmlRootNodes = parseXmlOrThrow(str, readOptions)
  documentFromXml(doc, xmlRootNodes, fullSearchPath, readOptions)
}

// Read a Document as XML from the given character buffer.
export function readFromXmlBuffer(
  doc: Document,
  buffer: string,
  searchPath: FileSearchPath = new FileSearchPath(),
  readOptions: XmlReadOptions | null = null,
): void {
  readFromXmlString(doc, buffer, searchPath, readOptions)
}

// Read a Document as XML from the given filename, applying the given search
// path when locating the file and its XIncludes.
export function readFromXmlFile(
  doc: Document,
  filename: FilePath | string,
  searchPath: FileSearchPath = new FileSearchPath(),
  readOptions: XmlReadOptions | null = null,
): void {
  const fullSearchPath = searchPath.copy()
  fullSearchPath.append(getEnvironmentPath())
  let filePath = typeof filename === 'string' ? new FilePath(filename) : filename
  filePath = fullSearchPath.find(filePath)

  let contents: string
  const virtual = getVirtualFileSystem()?.read(filePath.asString())
  if (virtual !== null && virtual !== undefined) {
    contents = virtual
  } else {
    try {
      contents = fs.readFileSync(filePath.asString(), 'utf8')
    } catch {
      throw new ExceptionFileMissing('Failed to open file for reading: ' + filePath.asString())
    }
  }
  const xmlRootNodes = parseXmlOrThrow(contents, readOptions, filePath)

  // Store the source URI of the document.
  let sourcePath =
    readOptions && readOptions.parentXIncludes.length > 0 ? new FilePath(readOptions.parentXIncludes[0]!) : filePath
  doc.setSourceUri(sourcePath.asString())

  // Enable XIncludes that are relative to this document.
  if (!sourcePath.isAbsolute()) {
    sourcePath = fullSearchPath.find(sourcePath)
  }
  fullSearchPath.prepend(sourcePath.getParentPath())

  documentFromXml(doc, xmlRootNodes, fullSearchPath, readOptions)
}

// --- Writing ---

// Write a Document as XML to a new string, returned by value.
export function writeToXmlString(doc: Document, writeOptions: XmlWriteOptions | null = null): string {
  const xmlRoot = makeElementNode('materialx')
  documentToXml(doc, xmlRoot, writeOptions)
  return serializeXml([xmlRoot])
}

// Write a Document as XML to the given filename.
export function writeToXmlFile(doc: Document, filename: FilePath | string, writeOptions: XmlWriteOptions | null = null): void {
  const filePath = typeof filename === 'string' ? new FilePath(filename) : filename
  fs.writeFileSync(filePath.asString(), writeToXmlString(doc, writeOptions))
}

// --- Editing ---

// Add an XInclude reference to the top of a Document, creating a generic
// element to hold the reference filename.
export function prependXInclude(doc: Document, filename: FilePath | string): void {
  const filePath = typeof filename === 'string' ? new FilePath(filename) : filename
  if (!filePath.isEmpty()) {
    const elem = doc.addNode('xinclude')
    elem.setSourceUri(filePath.asString())
    doc.setChildIndex(elem.getName(), 0)
  }
}
