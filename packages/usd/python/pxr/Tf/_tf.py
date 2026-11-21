"""_tf: the forwarding module upstream's pxr/base/tf/__init__.py loads.

Mirrors the names pxr/base/tf/wrapDiagnostic.cpp, wrapError.cpp and
wrapScopeDescription.cpp define that __init__.py itself uses.
"""
from pxr import _bridge
from pxr._bridge import ts as _ts

_Tf = _ts.Tf


# wrapError.cpp: Tf_PySetErrorExceptionClass.
def __SetErrorExceptionClass(cls):
    _bridge.set_error_exception_class(cls)


# wrapDiagnostic.cpp: _Warn/_Status/_RaiseCodingError/_RaiseRuntimeError/
# _Fatal(msg, moduleName, functionName, fileName, lineNo).
def _Warn(msg, *codeInfo):
    _Tf.TF_WARN(msg)


def _Status(msg, *codeInfo):
    _Tf.TF_STATUS(msg)


def _RaiseCodingError(msg, *codeInfo):
    _Tf.TF_CODING_ERROR(msg)


def _RaiseRuntimeError(msg, *codeInfo):
    _Tf.TF_RUNTIME_ERROR(msg)


def _Fatal(msg, *codeInfo):
    _bridge.call_function(_Tf.TF_FATAL_ERROR, msg)


def RepostErrors(exc):
    """wrapError.cpp _RepostErrors: put an ErrorException's errors back on
    the error list; True when there were any."""
    errors = getattr(exc, 'args', ())
    for e in errors:
        _Tf.TF_RUNTIME_ERROR(str(e))
    return bool(errors)


class _ScopeDescription(object):
    """wrapScopeDescription.cpp: a context manager over TfScopeDescription."""

    def __init__(self, description):
        self._description = description
        self._js = None

    def __enter__(self):
        self._js = _bridge.construct(_Tf.TfScopeDescription, self._description)
        return self

    def __exit__(self, *exc):
        if self._js is not None:
            _bridge.call_method(self._js, 'dispose')
            self._js = None
        return False

    def SetDescription(self, description):
        self._description = description
