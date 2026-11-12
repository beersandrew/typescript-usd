// Ported from OpenUSD 26.11.1: pxr/imaging/hd/testenv/testHdCommand.cpp
// Copyright 2021 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/imaging/hd/testenv/testHdCommand.cpp
//
// Exercises render-delegate command introspection + invocation: a test
// render delegate registers a "print" command, and the test gets the
// descriptors (expects >= 1), checks the command name, then invokes
// "print" with a message arg and expects it to succeed.

import { describe, it, expect } from 'vitest'
import { HdRenderDelegate } from '../../src/renderDelegate.ts'
import { HdRenderIndex } from '../../src/renderIndex.ts'
import type {
  HdCommandDescriptors,
  HdCommandArgs,
} from '../../src/command.ts'
import type { HdRprim } from '../../src/rprim.ts'
import type { HdSprim } from '../../src/sprim.ts'
import type { HdBprim } from '../../src/bprim.ts'

// A minimal render delegate that registers a single "print" command, mirroring
// the test/null render delegate used by testHdCommand.cpp.
class CommandTestRenderDelegate extends HdRenderDelegate {
  printedMessages: unknown[] = []

  getSupportedRprimTypes(): string[] { return [] }
  getSupportedSprimTypes(): string[] { return [] }
  getSupportedBprimTypes(): string[] { return [] }

  createRprim(): HdRprim { throw new Error('not supported') }
  destroyRprim(): void {}
  createSprim(): HdSprim { throw new Error('not supported') }
  destroySprim(): void {}
  createBprim(): HdBprim { throw new Error('not supported') }
  destroyBprim(): void {}
  CommitResources(): void {}

  getCommandDescriptors(): HdCommandDescriptors {
    return [
      {
        commandName: 'print',
        commandDescription: 'Print the given message to the console.',
        commandArgs: [{ argName: 'message', defaultValue: '' }],
      },
    ]
  }

  invokeCommand(command: string, args?: HdCommandArgs): boolean {
    if (command !== 'print') return false
    this.printedMessages.push(args?.['message'])
    return true
  }
}

describe('HdCommand', () => {
  it('gets command descriptors and invokes the print command', () => {
    const renderDelegate = new CommandTestRenderDelegate()
    const index = HdRenderIndex.new(renderDelegate)

    // sceneDelegate.GetRenderIndex().GetRenderDelegate()
    const delegate = index.getRenderDelegate()
    expect(delegate).toBe(renderDelegate)

    const commands = delegate.getCommandDescriptors()
    expect(commands.length).toBeGreaterThanOrEqual(1)
    expect(commands[0]!.commandName).toBe('print')

    // Try to invoke the print command.
    const args: HdCommandArgs = { message: 'Hello from test.' }
    expect(delegate.invokeCommand('print', args)).toBe(true)
    expect(renderDelegate.printedMessages).toContain('Hello from test.')
  })

  it('base render delegate has no commands and invocation fails', () => {
    // The HdRenderDelegate base defaults: empty descriptors, InvokeCommand false.
    const renderDelegate = new CommandTestRenderDelegate()
    expect(HdRenderDelegate.prototype.getCommandDescriptors.call(renderDelegate))
      .toHaveLength(0)
    expect(HdRenderDelegate.prototype.invokeCommand.call(renderDelegate, 'print'))
      .toBe(false)
  })
})
