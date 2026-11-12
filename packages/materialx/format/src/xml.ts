// Portions ported from MaterialX 1.39.5, including:
//  source/MaterialXFormat/External/PugiXML/pugixml.cpp
// PugiXML: Copyright (c) 2006-2018 Arseny Kapoulkine. MIT License.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// A self-contained XML parser and writer replacing the PugiXML library that
// upstream embeds in MaterialXFormat. Reproduces the behaviors that .mtlx
// round-trip fidelity depends on, including the MaterialX patches to
// PugiXML:
//  - newline tracking: a whitespace run containing N newlines yields N-1
//    newline nodes (so each blank line becomes one node), and a newline
//    node writes back as a bare blank line;
//  - angle brackets are NOT escaped on output; only '&', '"' (in
//    attributes), and control characters (two-digit decimal &#NN;) are;
//  - entity decoding handles &lt; &gt; &amp; &quot; and &#...; forms only,
//    leaving unrecognized entities verbatim.

export type XmlNodeType = 'element' | 'comment' | 'newline' | 'pcdata'

export interface XmlNode {
  type: XmlNodeType
  // Tag name for elements; empty for other node types.
  name: string
  // Attribute name/value pairs in document order.
  attributes: Array<[string, string]>
  children: XmlNode[]
  // Comment or text content.
  value: string
}

export interface XmlParseOptions {
  // Keep comment nodes (PugiXML parse_comments).
  comments?: boolean
  // Track blank lines as newline nodes (MaterialX parse_newlines).
  newlines?: boolean
}

// An error thrown for malformed XML; XmlIo converts it to
// ExceptionParseError.
export class XmlParseException extends Error {
  offset: number

  constructor(message: string, offset: number) {
    super(`${message} at character ${offset}`)
    this.offset = offset
  }
}

export function makeElementNode(name: string): XmlNode {
  return { type: 'element', name, attributes: [], children: [], value: '' }
}

// Mirrors the PugiXML symbol character classes: names may start with a
// letter, underscore, colon, or any non-ASCII character, and continue with
// those plus digits, periods, and hyphens.
function isNameStartChar(c: string): boolean {
  return /[A-Za-z_:]/.test(c) || c.charCodeAt(0) > 127
}

function isNameChar(c: string): boolean {
  return /[A-Za-z0-9_:.-]/.test(c) || c.charCodeAt(0) > 127
}

function isSpace(c: string): boolean {
  return c === ' ' || c === '\t' || c === '\n' || c === '\r'
}

// Decode the XML entity beginning at '&'; returns the decoded character and
// the index just past the entity, or null to copy the '&' verbatim
// (mirroring PugiXML, which leaves unrecognized entities untouched).
function decodeEntity(src: string, i: number): [string, number] | null {
  if (src.startsWith('&lt;', i)) return ['<', i + 4]
  if (src.startsWith('&gt;', i)) return ['>', i + 4]
  if (src.startsWith('&amp;', i)) return ['&', i + 5]
  if (src.startsWith('&quot;', i)) return ['"', i + 6]
  if (src[i + 1] === '#') {
    let j = i + 2
    let code = 0
    if (src[j] === 'x' || src[j] === 'X') {
      j++
      const start = j
      while (j < src.length && /[0-9a-fA-F]/.test(src[j]!)) {
        code = code * 16 + parseInt(src[j]!, 16)
        j++
      }
      if (j === start || src[j] !== ';') return null
    } else {
      const start = j
      while (j < src.length && /[0-9]/.test(src[j]!)) {
        code = code * 10 + (src.charCodeAt(j) - 48)
        j++
      }
      if (j === start || src[j] !== ';') return null
    }
    return [String.fromCodePoint(code), j + 1]
  }
  return null
}

class Parser {
  private src: string
  private pos = 0
  private options: XmlParseOptions

  constructor(source: string, options: XmlParseOptions) {
    // Normalize line endings (PugiXML parse_eol).
    this.src = source.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
    // Skip a UTF-8 BOM if present.
    if (this.src.charCodeAt(0) === 0xfeff) {
      this.src = this.src.slice(1)
    }
    this.options = options
  }

  parse(): XmlNode[] {
    const rootChildren: XmlNode[] = []
    const stack: XmlNode[] = []
    const src = this.src

    const currentChildren = (): XmlNode[] =>
      stack.length > 0 ? stack[stack.length - 1]!.children : rootChildren

    while (this.pos < src.length) {
      if (src[this.pos] !== '<') {
        // Text content between tags.
        const start = this.pos
        let lineCount = 0
        while (this.pos < src.length && src[this.pos] !== '<') {
          if (src[this.pos] === '\n') lineCount++
          this.pos++
        }
        const text = src.slice(start, this.pos)
        if (text.trim() === '') {
          // Whitespace-only runs become newline nodes when tracking is on
          // (one per blank line, i.e. newline count minus one).
          if (this.options.newlines) {
            for (let i = 1; i < lineCount; i++) {
              currentChildren().push({ type: 'newline', name: '', attributes: [], children: [], value: '\n' })
            }
          }
        } else {
          // Non-whitespace text becomes a pcdata node (PugiXML
          // parse_pcdata); MaterialX itself never authors text content.
          currentChildren().push({
            type: 'pcdata',
            name: '',
            attributes: [],
            children: [],
            value: this.decodeText(text),
          })
        }
        continue
      }

      // A '<' marker.
      if (src.startsWith('<?', this.pos)) {
        this.skipUntil('?>', 'Unterminated processing instruction')
      } else if (src.startsWith('<!--', this.pos)) {
        const start = this.pos + 4
        const end = src.indexOf('-->', start)
        if (end === -1) throw new XmlParseException('Unterminated comment', this.pos)
        if (this.options.comments) {
          currentChildren().push({
            type: 'comment',
            name: '',
            attributes: [],
            children: [],
            value: src.slice(start, end),
          })
        }
        this.pos = end + 3
      } else if (src.startsWith('<![CDATA[', this.pos)) {
        const start = this.pos + 9
        const end = src.indexOf(']]>', start)
        if (end === -1) throw new XmlParseException('Unterminated CDATA section', this.pos)
        currentChildren().push({
          type: 'pcdata',
          name: '',
          attributes: [],
          children: [],
          value: src.slice(start, end),
        })
        this.pos = end + 3
      } else if (src.startsWith('<!', this.pos)) {
        this.skipDoctype()
      } else if (src.startsWith('</', this.pos)) {
        // Close tag.
        this.pos += 2
        const name = this.readName('Invalid end tag')
        this.skipSpace()
        if (src[this.pos] !== '>') throw new XmlParseException('Malformed end tag', this.pos)
        this.pos++
        const open = stack.pop()
        if (!open || open.name !== name) {
          throw new XmlParseException(`Mismatched end tag </${name}>`, this.pos)
        }
      } else {
        // Open tag.
        this.pos++
        if (this.pos >= src.length || !isNameStartChar(src[this.pos]!)) {
          throw new XmlParseException('Unrecognized tag', this.pos)
        }
        const node = makeElementNode(this.readName('Invalid start tag'))
        this.parseAttributes(node)
        if (src.startsWith('/>', this.pos)) {
          this.pos += 2
          currentChildren().push(node)
        } else if (src[this.pos] === '>') {
          this.pos++
          currentChildren().push(node)
          stack.push(node)
        } else {
          throw new XmlParseException('Malformed start tag', this.pos)
        }
      }
    }

    if (stack.length > 0) {
      throw new XmlParseException(`Unclosed element <${stack[stack.length - 1]!.name}>`, this.pos)
    }

    return rootChildren
  }

  private parseAttributes(node: XmlNode): void {
    const src = this.src
    for (;;) {
      this.skipSpace()
      if (this.pos >= src.length) throw new XmlParseException('Unterminated start tag', this.pos)
      const c = src[this.pos]!
      if (c === '>' || src.startsWith('/>', this.pos)) return
      if (!isNameStartChar(c)) throw new XmlParseException('Malformed attribute name', this.pos)

      const name = this.readName('Malformed attribute name')
      this.skipSpace()
      if (src[this.pos] !== '=') throw new XmlParseException('Expected = after attribute name', this.pos)
      this.pos++
      this.skipSpace()
      const quote = src[this.pos]
      if (quote !== '"' && quote !== "'") throw new XmlParseException('Expected quoted attribute value', this.pos)
      this.pos++

      let value = ''
      for (;;) {
        if (this.pos >= src.length) throw new XmlParseException('Unterminated attribute value', this.pos)
        const vc = src[this.pos]!
        if (vc === quote) {
          this.pos++
          break
        }
        if (vc === '&') {
          const decoded = decodeEntity(src, this.pos)
          if (decoded) {
            value += decoded[0]
            this.pos = decoded[1]
            continue
          }
          value += '&'
          this.pos++
          continue
        }
        // Whitespace normalization in attribute values (PugiXML
        // parse_wconv_attribute, part of parse_default).
        value += vc === '\t' || vc === '\n' ? ' ' : vc
        this.pos++
      }

      node.attributes.push([name, value])
    }
  }

  private decodeText(text: string): string {
    let res = ''
    let i = 0
    while (i < text.length) {
      if (text[i] === '&') {
        const decoded = decodeEntity(text, i)
        if (decoded) {
          res += decoded[0]
          i = decoded[1]
          continue
        }
      }
      res += text[i]
      i++
    }
    return res
  }

  private readName(error: string): string {
    const src = this.src
    const start = this.pos
    while (this.pos < src.length && isNameChar(src[this.pos]!)) {
      this.pos++
    }
    if (this.pos === start) throw new XmlParseException(error, this.pos)
    return src.slice(start, this.pos)
  }

  private skipSpace(): void {
    while (this.pos < this.src.length && isSpace(this.src[this.pos]!)) {
      this.pos++
    }
  }

  private skipUntil(token: string, error: string): void {
    const end = this.src.indexOf(token, this.pos)
    if (end === -1) throw new XmlParseException(error, this.pos)
    this.pos = end + token.length
  }

  // Skip a doctype declaration, which may contain a bracketed subset.
  private skipDoctype(): void {
    const src = this.src
    let depth = 0
    let i = this.pos + 2
    for (; i < src.length; i++) {
      const c = src[i]
      if (c === '<') depth++
      else if (c === '[') depth++
      else if (c === ']') depth--
      else if (c === '>') {
        if (depth <= 0) {
          this.pos = i + 1
          return
        }
        depth--
      }
    }
    throw new XmlParseException('Unterminated doctype declaration', this.pos)
  }
}

// Parse an XML document, returning its top-level nodes.
export function parseXml(source: string, options: XmlParseOptions = {}): XmlNode[] {
  return new Parser(source, options).parse()
}

// Escape an attribute value the way the MaterialX-patched PugiXML does:
// '&' and '"' as entities, control characters (except tab) as two-digit
// decimal references, and angle brackets left as-is.
function escapeAttribute(value: string): string {
  let res = ''
  for (const c of value) {
    const code = c.charCodeAt(0)
    if (c === '&') res += '&amp;'
    else if (c === '"') res += '&quot;'
    else if (code < 32 && c !== '\t') res += `&#${String(code).padStart(2, '0')};`
    else res += c
  }
  return res
}

// Escape text content: '&' as an entity, control characters (except tab,
// newline, carriage return) as decimal references, angle brackets as-is.
function escapePcdata(value: string): string {
  let res = ''
  for (const c of value) {
    const code = c.charCodeAt(0)
    if (c === '&') res += '&amp;'
    else if (code < 32 && c !== '\t' && c !== '\n' && c !== '\r') res += `&#${String(code).padStart(2, '0')};`
    else res += c
  }
  return res
}

const INDENT = '  '

// Serialize a node as a block of lines (no trailing newline). Mirrors the
// PugiXML format_indent output that upstream uses for all .mtlx files.
function serializeNode(node: XmlNode, depth: number): string {
  const indent = INDENT.repeat(depth)
  switch (node.type) {
    case 'comment':
      return `${indent}<!--${node.value}-->`
    case 'newline':
      // A newline node contributes one blank line.
      return ''
    case 'pcdata':
      return escapePcdata(node.value)
    case 'element': {
      let tag = `${indent}<${node.name}`
      for (const [name, value] of node.attributes) {
        tag += ` ${name}="${escapeAttribute(value)}"`
      }
      if (node.children.length === 0) {
        return `${tag} />`
      }
      const childLines = node.children.map((child) => serializeNode(child, depth + 1))
      return `${tag}>\n${childLines.join('\n')}\n${indent}</${node.name}>`
    }
  }
}

// Serialize a document with the default XML declaration, matching the
// PugiXML xml_document::save output that upstream uses.
export function serializeXml(rootNodes: XmlNode[]): string {
  let out = '<?xml version="1.0"?>\n'
  for (const node of rootNodes) {
    out += serializeNode(node, 0) + '\n'
  }
  return out
}
