import { ValidationResult } from './types';

const ARABIC_SCRIPT_REGEX = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/u;
const CONTROL_CHAR_REGEX = /[\u0000-\u001F\u007F-\u009F]/u;

/**
 * Validates manual canonical transliteration entered by a human reviewer.
 * Enforces structural safety while respecting scholarly Unicode input.
 */
export function validateManualTransliteration(input?: string): ValidationResult {
  if (input === undefined || input === null) {
    return { valid: false, error: 'Transliteration value is required.' };
  }

  const trimmed = input.trim();
  if (trimmed.length === 0) {
    return { valid: false, error: 'Transliteration cannot be empty.' };
  }

  if (CONTROL_CHAR_REGEX.test(trimmed)) {
    return { valid: false, error: 'Transliteration contains invalid control characters or newlines.' };
  }

  if (ARABIC_SCRIPT_REGEX.test(trimmed)) {
    return { valid: false, error: 'Transliteration cannot contain Persian or Arabic script characters.' };
  }

  return { valid: true, normalized: trimmed };
}
