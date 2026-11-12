// Extracted unchanged from OpenUSD v26.11.1 hdSt/materialNetwork.cpp.
// Copyright Pixar. Licensed under LICENSE.txt at https://openusd.org/license.
static TfToken
_GetMaterialTag(
    VtDictionary const& metadata,
    HdMaterialNode2 const& terminal)
{
    // Strongest materialTag opinion is a hardcoded tag in glslfx meta data.
    // This can be used for masked, additive, translucent or volume materials.
    // See HdMaterialTagTokens.
    VtValue vtMetaTag = TfMapLookupByValue(
        metadata,
        HdShaderTokens->materialTag,
        VtValue());

    if (vtMetaTag.IsHolding<std::string>()) {
        return TfToken(vtMetaTag.UncheckedGet<std::string>());
    }

    // Next check for authored terminal.opacityThreshold value > 0
    for (auto const& paramIt : terminal.parameters) {
        if (paramIt.first != _tokens->opacityThreshold) continue;

        VtValue const& vtOpacityThreshold = paramIt.second;
        if (vtOpacityThreshold.Get<float>() > 0.0f) {
            return HdStMaterialTagTokens->masked;
        }
    }

    bool isTranslucent = false;

    // Next strongest opinion is a connection to 'terminal.opacity'
    auto const& opacityConIt = terminal.inputConnections.find(_tokens->opacity);
    isTranslucent = (opacityConIt != terminal.inputConnections.end());

    // Weakest opinion is an authored terminal.opacity value.
    if (!isTranslucent) {
        for (auto const& paramIt : terminal.parameters) {
            if (paramIt.first != _tokens->opacity) continue;

            VtValue const& vtOpacity = paramIt.second;
            isTranslucent = vtOpacity.Get<float>() < 1.0f;
            break;
        }
    }

    if (isTranslucent) {
        return HdStMaterialTagTokens->translucent;
    }

    // An empty materialTag on the HdRprimCollection level means: 'ignore all
    // materialTags and add everything to the collection'. Instead we return a
    // default token because we want materialTags to drive HdSt collections.
    return HdStMaterialTagTokens->defaultMaterialTag;
}
