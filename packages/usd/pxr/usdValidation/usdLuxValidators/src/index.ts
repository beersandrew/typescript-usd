import './plugin/registerPlugin.ts'
import './validators.ts'
// OpenUSD 26.11.1 pxr/usdValidation/usdLuxValidators: its validators register
// with UsdValidationRegistry on import; the library has no Python module, so
// its tokens are exported with the library prefix dropped, as the framework's.
export {
  UsdLuxValidationErrorNameTokens as ValidationErrorNameTokens,
  UsdLuxValidatorKeywordTokens as ValidatorKeywordTokens,
  UsdLuxValidatorNameTokens as ValidatorNameTokens,
} from './validatorTokens.ts'
