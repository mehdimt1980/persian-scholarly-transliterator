/**
 * Tests whether a string contains any actual Arabic or Persian script letters or vocalization marks.
 * Punctuation alone (e.g. Arabic comma '،' or semicolon '؛') will not trigger transliteration on Latin metadata.
 */
const ARABIC_LETTER_OR_MARK_REGEX = /(?=[\p{sc=Arabic}])[\p{L}\p{M}]/u;

export function containsArabicScript(text: string): boolean {
  return ARABIC_LETTER_OR_MARK_REGEX.test(text);
}
