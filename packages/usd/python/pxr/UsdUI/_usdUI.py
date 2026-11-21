"""_usdUI: the forwarding module upstream's __init__.py for pxr.UsdUI loads.
Nothing is written by hand yet: every name forwards mechanically."""
from pxr._bridge import forward_module, ts as _ts

forward_module(globals(), _ts.UsdUI, ('UsdUI',))
