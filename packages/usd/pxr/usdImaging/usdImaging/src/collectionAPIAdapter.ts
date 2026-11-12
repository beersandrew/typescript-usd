// Ported from OpenUSD 26.11.1:
//  pxr/usdImaging/usdImaging/collectionAPIAdapter.cpp,
//  pxr/usdImaging/usdImaging/collectionAPIAdapter.h,
//  pxr/usd/usd/collectionMembershipQuery.cpp
// Copyright 2019, 2022 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/usdImaging/usdImaging/collectionAPIAdapter.{h,cpp}
// (OpenUSD 26.11.1).
//
// Divergence: the TypeScript usd library does not have
// UsdComputePathExpressionFromCollectionMembershipQueryRuleMap
// (pxr/usd/usd/collectionMembershipQuery.cpp:525-721), which this adapter
// calls; it is ported below as a module-private function.

import {
  CollectionSchemaTokens as HdCollectionSchemaTokens,
  CollectionsSchemaTokens as HdCollectionsSchemaTokens,
  ContainerDataSource as HdContainerDataSource,
  DataSourceLocator as HdDataSourceLocator,
  DataSourceLocatorSet as HdDataSourceLocatorSet,
  RetainedContainerDataSource as HdRetainedContainerDataSource,
  RetainedTypedSampledDataSource as HdRetainedTypedSampledDataSource,
  type DataSourceBase as HdDataSourceBase,
} from 'typescript-usd/hd'
import { PathExpression as SdfPathExpression, PathPattern as SdfPathPattern } from 'typescript-usd/sdf'
import { SdfPath } from 'typescript-usd/sdf/path'
import { Type as TfType } from 'typescript-usd/tf'
import { CollectionAPI as UsdCollectionAPI, type CollectionRule as UsdCollectionRule, type Prim as UsdPrim } from 'typescript-usd/usd'
import { UsdImagingAPISchemaAdapter } from './apiSchemaAdapter.ts'
import type { UsdImagingDataSourceStageGlobals } from './dataSourceStageGlobals.ts'
import { TF_CODING_ERROR } from './tfDiagnostic.ts'
import type { UsdImagingPropertyInvalidationType } from './types.ts'

const _SdfPathExpressionType = TfType.declare('SdfPathExpression')

// ----------------------------------------------------------------------------
// UsdComputePathExpressionFromCollectionMembershipQueryRuleMap
// (collectionMembershipQuery.cpp:525-721)

// Use an enum instead of tokens to avoid TfToken refcounting locally.
enum _Rule { ExpandPrims, ExpandPrimsAndProps, Exclude, ExplicitOnly }

function _TokenToRule(token: UsdCollectionRule): _Rule {
  if (token === 'expandPrims') { return _Rule.ExpandPrims }
  if (token === 'expandPrimsAndProperties') { return _Rule.ExpandPrimsAndProps }
  if (token === 'exclude') { return _Rule.Exclude }
  return _Rule.ExplicitOnly
}

let _allPropsExpr: SdfPathExpression | undefined

// Each stack entry contains the path for this rule as 'self', its
// accumulated subexpression thus far (incorporating descendant rules), and
// finally the rule for this path.
class _StackEntry {
  expr: SdfPathExpression = SdfPathExpression.Nothing()

  constructor(readonly self: SdfPath, readonly rule: _Rule) {
    // Note that this cannot be a property path.  Those are handled in
    // explicitIncludes/Excludes.
    if (!self.isAbsoluteRootOrPrimPath()) {
      TF_CODING_ERROR('Failed axiom: \' self.IsAbsoluteRootOrPrimPath() \'')
    }

    // If this is an exclude of the absolute root path, our expression
    // is just Nothing.
    if (self.isAbsoluteRootPath() && rule === _Rule.Exclude) {
      return
    }
    // Otherwise build the initial expression for this path's rule,
    // starting with the path itself.
    const pattern = new SdfPathPattern(self)
    pattern.appendChild('') // tack on '//'
    this.expr = SdfPathExpression.makeAtom(pattern)
    // If the rule is ExpandPrims (not properties) subtract properties.
    if (rule === _Rule.ExpandPrims) {
      const allPropsExpr = _allPropsExpr ??= new SdfPathExpression('//*.*')
      this.expr = SdfPathExpression.makeOp('difference',
        this.expr, allPropsExpr)
    }
    // Finally, to get correct precedence, we insert a weaker reference
    // '%_' on the left hand side joined with the operator for our rule.
    // So for an include it's like '%_ /self//' and for an exclude it's
    // like '%_ - /self//'.  The parent will compose this expression
    // over its own as the weaker reference to insert in the correct
    // spot.  But if this rule is for the absolute root, we do not
    // include a weaker reference since it's the final rule.
    if (!self.isAbsoluteRootPath()) {
      this.expr = SdfPathExpression.makeOp(
        rule === _Rule.Exclude ? 'difference' : 'union',
        SdfPathExpression.weakerRef(), this.expr)
    }
  }
}

function _UsdComputePathExpressionFromCollectionMembershipQueryRuleMap(
  ruleMap: ReadonlyMap<string, UsdCollectionRule>,
): SdfPathExpression {
  // If there are no rules, we don't match anything.
  if (ruleMap.size === 0) {
    return SdfPathExpression.Nothing()
  }

  // Build a lexicographically ordered list of entries to process.  This
  // ensures that we will see ancestor paths prior to descendant paths.
  //
  // During this process we also collect any explictOnly prim paths, and all
  // property paths separately.  These can all be treated as ExplicitOnly
  // entries, either included or excluded.  We combine these with the final
  // expression at the end, in such a way that they are evaluated first, since
  // they are the fastest to evaluate.
  const entries: [SdfPath, _Rule][] = []

  // These subexpressions track explicitly included or excluded single-path
  // rules.  They are both just union chains, like '/foo /bar /baz' etc.
  let explicitIncludes = SdfPathExpression.Nothing()
  let explicitExcludes = SdfPathExpression.Nothing()
  const addUnion = (expr: SdfPathExpression, path: SdfPath): SdfPathExpression =>
    SdfPathExpression.makeOp('impliedUnion', expr, SdfPathExpression.makeAtom(path))

  // std::map<SdfPath, TfToken> iteration order.
  const sortedRules = [...ruleMap].map(([p, r]) => [SdfPath.fromString(p), r] as const)
    .sort(([a], [b]) => SdfPath.compare(a, b))
  for (const [path, ruleToken] of sortedRules) {
    const rule = _TokenToRule(ruleToken)
    // Collect explicit-only rules separately.
    if (rule === _Rule.ExplicitOnly) {
      explicitIncludes = addUnion(explicitIncludes, path)
    }
    // Property paths can always be treated as explicit since they don't
    // have descendant prims/properties.
    else if (!path.isAbsoluteRootOrPrimPath()) {
      if (rule === _Rule.Exclude) {
        explicitExcludes = addUnion(explicitExcludes, path)
      } else {
        explicitIncludes = addUnion(explicitIncludes, path)
      }
    }
    // Other rules for prim-like paths are handled by the shift/reduce
    // builder.
    else {
      entries.push([path, rule])
    }
  }
  entries.sort(([pa, ra], [pb, rb]) => SdfPath.compare(pa, pb) || ra - rb)

  // Build the expression shift-reduce style, merging the most descendant
  // expressions into ancestral expressions.
  const stack: _StackEntry[] = []

  // Helper function to reduce the stack top (back()) into the next
  // (ancestral) stack entry by merging its accumulated expression into the
  // ancestor, reducing the stack size by one. If the stack is not empty,
  // return the empty expression.  If the stack has only one element, return
  // the final expression and leave the stack empty.
  const reduce = (): SdfPathExpression => {
    let topExpr = stack.pop()!.expr
    // If the stack is empty, return the final expression.
    if (stack.length === 0) {
      return topExpr
    }
    // Otherwise combine into the next entry by composing the oldTop's
    // expression over the newTop's -- replacing the oldTop's weaker
    // reference '%_' with the newTop's expression.
    const newTop = stack[stack.length - 1]!
    newTop.expr = topExpr.composeOver(newTop.expr)
    // Return empty since the expression is not yet complete.
    topExpr = SdfPathExpression.Nothing()
    return topExpr
  }

  // For uniformity we want the stack top to always be '/'.  If the first
  // entry in 'entries' is not '/', it means that '/' is implicitly excluded,
  // so in that case we push an exclude of '/' manually.  Otherwise the loop
  // over entries below will push the '/' on its first iteration.  If entries
  // is empty here, it means that all paths were explicit and there are no
  // other rules.
  if (entries.length !== 0 && !entries[0]![0].isAbsoluteRootPath()) {
    stack.push(new _StackEntry(SdfPath.fromString('/'), _Rule.Exclude))
  }

  // Process each entry in lexicographical order, which ensures we process
  // ancestors prior to descendants.
  for (const [curPath, curRule] of entries) {
    // Reduce the stack until we find an ancestor of 'curEntry'.  Note that
    // this loop will never reduce stack to empty() -- it is only possibly
    // empty the first time through.
    while (stack.length !== 0 && !curPath.hasPrefix(stack[stack.length - 1]!.self)) {
      reduce()
    }
    // Push/shift this new descendant, unless it is redundant.  The rule map
    // computation sometimes produces redundant entries, like
    // excludes=[/foo, /foo/bar].  So skip this entry if it is subsumed by
    // the stack top.  This is true when top=exclude and cur=exclude, or
    // when top=expandPrims and cur=expandPrims, or when
    // top=expandPrimsAndProps and cur!=exclude.
    if (stack.length !== 0) {
      const topRule = stack[stack.length - 1]!.rule
      if ((topRule === _Rule.Exclude && curRule === _Rule.Exclude) ||
          (topRule === _Rule.ExpandPrims && curRule === _Rule.ExpandPrims) ||
          (topRule === _Rule.ExpandPrimsAndProps && curRule !== _Rule.Exclude)) {
        // This entry is redundant with the stack top, so skip it.  Any
        // descendant entries of this curEntry will still be processed.
        continue
      }
    }
    // Push new descendant.
    stack.push(new _StackEntry(curPath, curRule))
  }

  // Reduce the remainder of the stack to complete building the expression.
  let result = SdfPathExpression.Nothing()
  while (stack.length !== 0) {
    result = reduce()
  }

  // Put it all together.  The overall final form of the expression is:
  //
  // (incl_1 + ... + incl_N) + (~(excl_1 + ... + excl_N) & result)
  //  ~~~~~~~~~~~~~~~~~~~~~       ~~~~~~~~~~~~~~~~~~~~~
  //  ^ explicitIncludes ^        ^ explicitExcludes ^
  //
  // Where 'result' is the previously shift/reduce-computed expression dealing
  // with hierarchical include/exclude rules, and 'incl/excl_1..N' are the
  // explicit includes & excludes.

  return SdfPathExpression.makeOp('impliedUnion',
    explicitIncludes,
    SdfPathExpression.makeOp('intersection',
      SdfPathExpression.makeComplement(
        explicitExcludes),
      result))
}

// ----------------------------------------------------------------------------

/** collectionAPIAdapter.cpp:32-78 */
class _CollectionContainerDataSource extends HdContainerDataSource {
  constructor(private readonly _api: UsdCollectionAPI) { super() }

  static new(api: UsdCollectionAPI): _CollectionContainerDataSource {
    return new _CollectionContainerDataSource(api)
  }

  private static _names: string[] | undefined
  getNames(): string[] {
    return _CollectionContainerDataSource._names ??=
      [HdCollectionSchemaTokens.membershipExpression]
  }

  Get(name: string): HdDataSourceBase | undefined {
    if (name === HdCollectionSchemaTokens.membershipExpression) {
      return new HdRetainedTypedSampledDataSource<SdfPathExpression>(
        _CollectionContainerDataSource._computePathExpressionFromCollection(this._api),
        _SdfPathExpressionType)
    }

    return undefined
  }

  private static _computePathExpressionFromCollection(
    api: UsdCollectionAPI,
  ): SdfPathExpression {
    // A collection can be either rule-based (includes, excludes, ..)
    // or path-expression-based.
    // Construct a query object to determine the flavor.
    const query = api.computeMembershipQuery()

    if (query.usesPathExpansionRuleMap()) {
      const ruleMap = query.getAsPathExpansionRuleMap()
      return _UsdComputePathExpressionFromCollectionMembershipQueryRuleMap(
        ruleMap)
    }

    // UsdCollectionAPI::ResolveCompleteMembershipExpression returns the
    // expression's text in this port.
    const text = api.resolveCompleteMembershipExpression()
    return new SdfPathExpression(typeof text === 'string' ? text : undefined)
  }
}

/** collectionAPIAdapter.cpp:83-108 */
class _CollectionsContainerDataSource extends HdContainerDataSource {
  private readonly _api: UsdCollectionAPI

  constructor(prim: UsdPrim, name: string) {
    super()
    this._api = new UsdCollectionAPI(prim, prim.getStage(), name)
  }

  static new(prim: UsdPrim, name: string): _CollectionsContainerDataSource {
    return new _CollectionsContainerDataSource(prim, name)
  }

  getNames(): string[] {
    return [this._api.getName()]
  }

  Get(name: string): HdDataSourceBase | undefined {
    if (name === this._api.getName()) {
      return _CollectionContainerDataSource.new(this._api)
    }
    return undefined
  }
}

// ----------------------------------------------------------------------------

/** collectionAPIAdapter.h:17-36 */
export class UsdImagingCollectionAPIAdapter extends UsdImagingAPISchemaAdapter {
  /** collectionAPIAdapter.cpp:116-133 */
  override getImagingSubprimData(
    prim: UsdPrim,
    subprim: string,
    appliedInstanceName: string,
    _stageGlobals: UsdImagingDataSourceStageGlobals,
  ): HdContainerDataSource | undefined {
    if (subprim !== '' || appliedInstanceName === '') {
      return undefined
    }

    // Note: When multiple collections are present, we'll overlay the containers
    //       and thus aggregate the individual collection's.
    return HdRetainedContainerDataSource.new(
      [HdCollectionsSchemaTokens.collections],
      [_CollectionsContainerDataSource.new(prim, appliedInstanceName)],
    )
  }

  /** collectionAPIAdapter.cpp:135-166 */
  override invalidateImagingSubprim(
    _prim: UsdPrim,
    subprim: string,
    appliedInstanceName: string,
    properties: readonly string[],
    _invalidationType: UsdImagingPropertyInvalidationType,
  ): HdDataSourceLocatorSet {
    if (subprim !== '' || appliedInstanceName === '') {
      return new HdDataSourceLocatorSet()
    }

    // XXX Code below does not handle updates to referenced collections in
    //     the collection instance's membership expression.
    // e.g. If we have
    // </Foo.collection:abc:membershipExpression> = "//Stuff//" and
    // </Bar.collection:xyz:membershipExpression> = "/Foo:abc"
    //
    // changes to the former won't trigger invalidation of the latter.
    //
    const prefix = `collection:${appliedInstanceName}:`

    for (const propertyName of properties) {
      if (propertyName.startsWith(prefix)) {
        return new HdDataSourceLocatorSet(new HdDataSourceLocator(
          HdCollectionsSchemaTokens.collections, appliedInstanceName))
      }
    }

    return new HdDataSourceLocatorSet()
  }
}
