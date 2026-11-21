"""Forwarding for USD schema classes (UsdSchemaBase and the generated
schema classes of every domain library).

Upstream, usdGenSchema writes each schema's Get<Name>Attr/Create<Name>Attr
pair from schema.usda (e.g. pxr/usd/usdGeom/camera.cpp:216-232) and the
wrap<Schema>.cpp that exposes them. Here those methods are derived from the
schema's prim definition in typescript-usd's UsdSchemaRegistry, with the
names usdGenSchema gives them: the property name without an `inputs:`
prefix (UsdLux's convention), each `:`-separated part capitalized
(`model:drawMode` -> ModelDrawMode, `inputs:texture:file` -> TextureFile).
"""
import re

from pxr._bridge import (Wrapped, register, call_method, construct, wrap,
                         unwrap, ts as _ts)
from pxr import _bridge

_registry = _ts.UsdSchemaRegistry


def _accessor_name(prop):
    if prop.startswith('inputs:'):
        prop = prop[len('inputs:'):]
    return ''.join(p[:1].upper() + p[1:] for p in prop.split(':'))


_definitions = {}


def _properties_of(schema_name):
    """{AccessorName: propertyName} for the schema's attributes."""
    props = _definitions.get(schema_name)
    if props is None:
        reg = _registry.getInstance()
        prim_def = reg.findConcretePrimDefinition(schema_name)
        if not prim_def:
            prim_def = reg.findAppliedAPIPrimDefinition(schema_name)
        if not prim_def:
            prim_def = reg.findAbstractPrimDefinition(schema_name)
        props = {}
        if prim_def:
            for name in prim_def.getPropertyNames():
                attr_def = prim_def.getAttributeDefinition(name)
                if attr_def and attr_def.isValid():
                    props[_accessor_name(name)] = (
                        name, attr_def.getTypeNameToken(),
                        attr_def.getVariability())
        _definitions[schema_name] = props
    return props


class SchemaBase(Wrapped):
    """UsdSchemaBase (wrapSchemaBase.cpp) and the generated members of its
    subclasses. `_jsclass` is the core schema class; `_schemaName` its
    registered type name (the class name in schema.usda)."""
    __slots__ = ()
    _schemaName = None

    def __init__(self, prim=None):
        from pxr.Usd import _usd
        if isinstance(prim, SchemaBase):
            prim = prim.GetPrim()
        js_prim = prim._js if isinstance(prim, _usd.Prim) else None
        stage = js_prim.getStage() if js_prim is not None else None
        self._js = construct(type(self)._jsclass, js_prim, stage)

    # The core's schema classes hold their prim as `prim` (SchemaBase) or
    # `_prim` (classes not yet on SchemaBase).
    def _js_prim(self):
        js = self._js
        for name in ('prim', '_prim'):
            p = getattr(js, name, None)
            if p is not None:
                return p
        return None

    def GetPrim(self):
        from pxr.Usd import _usd
        return _usd.prim_result(wrap(self._js_prim()))

    def GetPath(self):
        return self.GetPrim().GetPath()

    def __bool__(self):
        p = self._js_prim()
        if p is None:
            return False
        if _bridge.has_member(self._js, 'isValid'):
            return bool(call_method(self._js, 'isValid'))
        return bool(call_method(p, 'isValid'))

    def _require_valid(self):
        if not self:
            raise _bridge._error_exception_class(
                'Invalid %s schema object' % type(self).__name__)

    def _require_prim(self):
        # The generated Get/Create<Name>Attr act on GetPrim() alone
        # (schemaBase.cpp:75-104): an applied API schema constructed on a
        # prim that does not have it applied (_IsCompatible false,
        # apiSchemaBase.cpp:115-135) still reads and authors attributes.
        p = self._js_prim()
        if p is None or not call_method(p, 'isValid'):
            raise _bridge._error_exception_class(
                'Invalid %s schema object' % type(self).__name__)

    # ---- Define / Get / Apply (generated static methods) ----

    @classmethod
    def Get(cls, stage, path):
        return cls(stage.GetPrimAtPath(path))

    @classmethod
    def Define(cls, stage, path):
        # UsdSchemaBase-derived Define (e.g. camera.cpp:46-58):
        # stage->DefinePrim(path, typeName).
        return cls(stage.DefinePrim(path, cls._schemaName))

    @classmethod
    def Apply(cls, prim):
        # Single-apply API Apply (e.g. modelAPI.cpp:77-84):
        # prim.ApplyAPI<Schema>(); the core's prim.addAppliedSchema.
        if _bridge.has_member(cls._jsclass, 'apply') and not _ts.same(
                cls._jsclass.apply, _ts.functionApply):
            return wrap(call_method(cls._jsclass, 'apply', prim._js))
        call_method(prim._js, 'addAppliedSchema', cls._schemaName)
        return cls(prim)

    @classmethod
    def CanApply(cls, prim):
        return bool(call_method(cls._jsclass, 'canApply', prim._js))

    # ---- Get<Name>Attr / Create<Name>Attr ----

    def __getattr__(self, name):
        m = re.match(r'^(Get|Create)(\w+)Attr$', name)
        if m and not name.startswith('__'):
            props = _properties_of(type(self)._schemaName)
            spec = props.get(m.group(2))
            if spec is not None:
                if m.group(1) == 'Get':
                    return lambda: self._get_attr(spec[0])
                return lambda defaultValue=None, writeSparsely=False: \
                    self._create_attr(spec, defaultValue, writeSparsely)
        return Wrapped.__getattr__(self, name)

    def _get_attr(self, prop):
        self._require_prim()
        return wrap(call_method(self._js_prim(), 'attr', prop))

    def _create_attr(self, spec, default, sparse):
        # UsdSchemaBase::_CreateAttr (schemaBase.cpp:75-104).
        self._require_prim()
        name, type_name, variability = spec
        value = unwrap(default) if default is not None else None
        if _bridge.has_member(self._js, '_createAttr'):
            return call_method(self._js, '_createAttr', name, type_name,
                               False, variability, value, bool(sparse))
        attr = call_method(self._js_prim(), 'createAttribute', name,
                           type_name, False, variability)
        if default is not None:
            attr.Set(default)
        return attr


def _registered_class(js_class):
    for js, py in _bridge._classes:
        if _ts.same(js, js_class):
            return py
    return None


def schema_class(name, js_class, module=None):
    """The forwarding class of a core schema class with no hand-written
    Python class (e.g. UsdGeom.Sphere, UsdGeom.Mesh, UsdLux.SphereLight):
    a SchemaBase subclass whose base is the forwarding class of the core
    class it extends, as wrap<Schema>.cpp's class_<Schema, bases<Base>>.
    None when js_class is not a schema class."""
    schema_name = _ts.schemaTypeName(js_class)
    if schema_name is None:
        return None
    base = None
    parent = _ts.superclassOf(js_class)
    while base is None and _ts.schemaTypeName(parent) is not None:
        base = _registered_class(parent)
        if base is None:
            base = schema_class(str(parent.name).lstrip('_'), parent, module)
        parent = _ts.superclassOf(parent)
    ns = {'__slots__': (), '_schemaName': str(schema_name)}
    if module:
        ns['__module__'] = module
    cls = type(name, (base or SchemaBase,), ns)
    register(js_class, cls)
    return cls


_bridge._schema_class_factory = schema_class
