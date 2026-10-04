import { transliterate } from '../domain/engine';
import { LexiconRepository } from '../domain/lexicon/repository';
import { evaluateSingleCase } from './evaluateCase';
import { CaseEvaluationResult, ScholarlyValidationCase } from './types';

export function runSingleCase(
  testCase: ScholarlyValidationCase,
  lexicon?: LexiconRepository
): CaseEvaluationResult {
  const result = transliterate(testCase.input, testCase.profile, [], lexicon);
  return evaluateSingleCase(testCase, result);
}
