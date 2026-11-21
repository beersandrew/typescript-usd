"""The pxr package over typescript-usd.

Upstream installs each library as lib/python/pxr/<Lib>/ holding the library's
own __init__.py (e.g. pxr/usd/sdf/__init__.py) beside its compiled module
_<lib>.so, built from the library's wrap*.cpp files.  Here the compiled
module is replaced by a forwarding module, python/pxr/<Lib>/_<lib>.py, over
typescript-usd's core (python/bridge.ts), and each library's __init__.py is
upstream's, read unchanged from the OpenUSD source tree: the finder below
imports pxr.<Lib> from <OpenUSD>/pxr/<area>/<lib>/__init__.py with
python/pxr/<Lib> as the package's search path, so its
`Tf.PreparePythonModule()` imports the forwarding module as `._<lib>`.
"""
import importlib.abc
import importlib.util
import os
import sys

import _tsusd

_HERE = os.path.dirname(os.path.abspath(__file__))
_SRC = os.path.join(_tsusd.openusdSrc, 'pxr')
_AREAS = ('base', 'usd', 'imaging', 'usdImaging', 'exec')


def _upstream_init(lib):
    name = lib[0].lower() + lib[1:]
    for area in _AREAS:
        init = os.path.join(_SRC, area, name, '__init__.py')
        if os.path.isfile(init):
            return init
    return None


class _UpstreamLibraryFinder(importlib.abc.MetaPathFinder):
    def find_spec(self, fullname, path=None, target=None):
        parts = fullname.split('.')
        if len(parts) != 2 or parts[0] != 'pxr':
            return None
        local = os.path.join(_HERE, parts[1])
        init = _upstream_init(parts[1])
        if init is None or not os.path.isdir(local):
            return None
        # The library's own Python submodules (e.g. usdUtils/usdzUtils.py)
        # are installed beside its __init__.py upstream: search there after
        # the forwarding module's directory.
        return importlib.util.spec_from_file_location(
            fullname, init,
            submodule_search_locations=[local, os.path.dirname(init)])


sys.meta_path.insert(0, _UpstreamLibraryFinder())
