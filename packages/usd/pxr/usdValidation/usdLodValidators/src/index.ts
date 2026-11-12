import './plugin/registerPlugin.ts'
import './validators.ts'
// OpenUSD 26.11.1 pxr/usdValidation/usdLodValidators: its validators register
// with UsdValidationRegistry on import; the library has no Python module, so
// its tokens are exported with the library prefix dropped, as the framework's.
export {
  UsdLodValidationErrorNameTokens as ValidationErrorNameTokens,
  UsdLodValidatorKeywordTokens as ValidatorKeywordTokens,
  UsdLodValidatorNameTokens as ValidatorNameTokens,
} from './validatorTokens.ts'
