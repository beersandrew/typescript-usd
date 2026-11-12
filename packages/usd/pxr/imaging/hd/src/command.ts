// Ported from OpenUSD 26.11.1: pxr/imaging/hd/command.cpp,
//  pxr/imaging/hd/command.h
// Copyright 2021 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Mirrors pxr/imaging/hd/command.h
//
// A "command" is simply a token that can be invoked and delivered to the
// render delegate. Each command carries a description and a list of argument
// descriptors. Command arguments are a map of tokens to values (VtDictionary).

// Stand-in for VtValue: an argument default / invocation value of any type.
export type VtValue = unknown

// A bundle of state describing an argument to a command.
export interface HdCommandArgDescriptor {
  // The name of the argument.
  argName: string
  // Default value for this argument.
  defaultValue: VtValue
}

export type HdCommandArgDescriptors = HdCommandArgDescriptor[]

// Command arguments are a map of tokens to values (upstream VtDictionary).
export type HdCommandArgs = { [argName: string]: VtValue }

// A bundle of state describing a "command".
export interface HdCommandDescriptor {
  // A token representing a command that can be invoked.
  commandName: string
  // A description of the command suitable for display in a UI for example.
  commandDescription: string
  // List of arguments this command supports, may be empty.
  commandArgs: HdCommandArgDescriptors
}

export type HdCommandDescriptors = HdCommandDescriptor[]
