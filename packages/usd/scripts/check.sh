#!/bin/sh
# Pre-commit gate. Runs every check in order: typecheck, library layering,
# then the full test suite. None needs an OpenUSD build or source checkout.
# The checks of generated files against their sources (the schema libraries
# by usdGenSchema --check --all, the library graph table, the debt ledger,
# the naming map) run with the tooling kept outside this repository
# (FIXTURES.md); the tests that read those files run here. Every step except
# library layering stops at its first failure. Layering violations are known
# gaps that run as plain failing tests, so that step reports them and the
# remaining checks still run; the gate then exits non-zero.
# Extra arguments are passed to the full-suite vitest run (e.g. --maxWorkers=4).
set -eu
cd "$(dirname "$0")/.."

step() { printf '\n== %s\n' "$1"; }

step 'Typecheck (pnpm typecheck)'
pnpm typecheck

step 'Library layering (pxr/tests/architecture/libraryLayering.test.ts)'
layering=0
npx vitest run pxr/tests/architecture/libraryLayering.test.ts || layering=$?

step 'Full test suite'
npx vitest run "$@"

if [ "$layering" -ne 0 ]; then
  printf '\nLibrary layering reported failing tests (see above); all other checks passed\n'
  exit "$layering"
fi
printf '\nAll checks passed\n'
