"""_vt: the forwarding module upstream's pxr/base/vt/__init__.py loads.

Only what upstream's pxr/usd/sdf/__init__.py imports so far.
"""


class TimeCodeArray(list):
    """Vt.TimeCodeArray (wrapArrayTimeCode.cpp); not yet forwarded."""


class TokenArray(list):
    """Vt.TokenArray (wrapArrayToken.cpp): token[] values are Python lists
    of str in this layer, so the array is a list of str."""

    def __init__(self, values=()):
        list.__init__(self, [str(v) for v in values])
