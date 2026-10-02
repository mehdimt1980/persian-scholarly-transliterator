# Architecture

The core public function is `transliterate(input, profile)`. It returns original and normalized input, output profile, overall status, warnings, and token-level evidence.

1. Normalization preserves the original string and applies NFC, Arabic/Persian character normalization, joiner, and whitespace handling.
2. Tokenization preserves punctuation, whitespace, numbers, Latin text, and offsets.
3. Lexical resolution consults data entries rather than conditionals in application code.
4. Context analysis is represented by the same token/result model; the first slice has a source-grounded `ولایت فقیه` izāfat detector.
5. Canonical results carry status, confidence, applied rules, lexical source, warnings, and alternatives.
6. Profiles format canonical output. Title presentation strips diacritics after canonical generation.

The engine has no React or Next dependency and can be reused by a CLI, API, batch processor, or reference manager integration.
