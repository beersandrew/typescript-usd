"""_usdUtils: the forwarding module upstream's pxr/usd/usdUtils/__init__.py
loads. Functions forward mechanically to typescript-usd/usdUtils's
UsdUtils<Name> exports (wrapAuthoring.cpp, wrapUsdzPackage.cpp,
wrapDependencies.cpp, ...); the few whose Python signature differs are
written by hand."""
from pxr._bridge import call_function, forward_module, ts as _ts

_UsdUtils = _ts.UsdUtils


# wrapAuthoring.cpp: (source, destination, skipSublayers=False,
# bakeUnauthoredFallbacks=False).
def CopyLayerMetadata(source, destination, skipSublayers=False,
                      bakeUnauthoredFallbacks=False):
    return call_function(_UsdUtils.UsdUtilsCopyLayerMetadata, source,
                         destination, bool(skipSublayers),
                         bool(bakeUnauthoredFallbacks))


# wrapUsdzPackage.cpp: (assetPath, usdzFilePath, firstLayerName='',
# editLayersInPlace=False). The core returns a Promise; it is awaited.
def CreateNewUsdzPackage(assetPath, usdzFilePath, firstLayerName='',
                         editLayersInPlace=False):
    return bool(call_function(_UsdUtils.UsdUtilsCreateNewUsdzPackage,
                              assetPath, str(usdzFilePath),
                              str(firstLayerName), bool(editLayersInPlace)))


forward_module(globals(), _UsdUtils, ('UsdUtils',))
