/**
 * Tests whether a string contains any Arabic or Persian script characters.
 * Covers standard Arabic, Arabic Supplement, Arabic Extended-A/B, and Presentation Forms.
 */
const ARABIC_SCRIPT_REGEX = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/u;

export function containsArabicScript(text: string): boolean {
  return ARABIC_SCRIPT_REGEX.test(text);
}
