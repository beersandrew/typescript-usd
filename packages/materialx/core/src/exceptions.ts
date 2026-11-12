// Ported from MaterialX 1.39.5: source/MaterialXCore/Exception.h
// Copyright Contributors to the MaterialX Project. Apache License 2.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Mirrors source/MaterialXCore/Exception.h

// The base class for exceptions that are propagated from the MaterialX
// library to the client application.
export class Exception extends Error {
  constructor(msg: string) {
    super(msg)
    this.name = this.constructor.name
  }
}

// An exception that is thrown when a type mismatch is encountered.
export class ExceptionTypeError extends Exception {}
