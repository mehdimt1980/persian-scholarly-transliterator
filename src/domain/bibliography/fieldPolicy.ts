import { ProfileId } from '../types';
import { BibliographyFieldPath } from './types';

export interface FieldTransliterationPolicy {
  isTransformable: boolean;
  profile: ProfileId | null;
}

export function getFieldPolicy(fieldPath: BibliographyFieldPath): FieldTransliterationPolicy {
  if (fieldPath === 'title' || fieldPath === 'containerTitle') {
    return {
      isTransformable: true,
      profile: 'ijmes_citation_title'
    };
  }

  if (
    fieldPath.startsWith('authors.') ||
    fieldPath.startsWith('editors.') ||
    fieldPath.startsWith('translators.') ||
    fieldPath === 'publisher' ||
    fieldPath === 'place'
  ) {
    return {
      isTransformable: true,
      profile: 'ijmes_full'
    };
  }

  return {
    isTransformable: false,
    profile: null
  };
}
