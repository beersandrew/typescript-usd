// Ported from OpenUSD 26.11.1: pxr/usd/sdf/testenv/testSdfTextFile.cpp
// Copyright 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/usd/sdf/testenv/testSdfTextFile.cpp, registration
// testSdfTextFile (pxr/usd/sdf/CMakeLists.txt:725-728): the default
// USD_WRITE_NEW_USDA_FILES_AS_VERSION. The shared body and the mapping of
// upstream's private Sdf_StringOutput onto Layer.exportToString are in
// textFileCases.ts.

import { defineTextFileTests } from './textFileCases.ts'

delete process.env.USD_WRITE_NEW_USDA_FILES_AS_VERSION

defineTextFileTests('testSdfTextFile', undefined)
