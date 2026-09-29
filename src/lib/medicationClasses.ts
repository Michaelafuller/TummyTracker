// Built-in medication classes for the correlation engine (GitHub #20). A small
// heuristic for common names — NOT a drug database. It only decides how long a
// logged dose keeps counting as "exposed" (its effect window); it never
// changes what the user logged, and an unknown name simply gets the default.
// No React, no I/O.

import { normalizeToken } from '@/lib/ingredients';

export type MedicationClass = 'antibiotic';

/**
 * Lowercase name tokens (generic and common brand names) that mark a
 * medication as an antibiotic. Matched at word boundaries against the
 * medication's name, so "Amoxicillin 500" and "amoxicillin-clavulanate" match
 * but "moxi" does not. Extend by hand; unknown names are treated as ordinary
 * medications, never guessed.
 */
export const ANTIBIOTIC_NAMES: readonly string[] = [
  'amoxicillin',
  'augmentin',
  'amoxicillin-clavulanate',
  'azithromycin',
  'zithromax',
  'z-pak',
  'clarithromycin',
  'doxycycline',
  'minocycline',
  'tetracycline',
  'ciprofloxacin',
  'cipro',
  'levofloxacin',
  'metronidazole',
  'flagyl',
  'cephalexin',
  'keflex',
  'cefuroxime',
  'cefdinir',
  'clindamycin',
  'nitrofurantoin',
  'macrobid',
  'trimethoprim',
  'sulfamethoxazole',
  'bactrim',
  'penicillin',
  'erythromycin',
  'rifaximin',
  'vancomycin',
];

/** Days AFTER the dose day an antibiotic dose still counts as exposed. */
export const ANTIBIOTIC_TAIL_DAYS = 7;
/** Days AFTER the dose day any other medication's dose still counts (the dose day plus the next day). */
export const DEFAULT_TAIL_DAYS = 1;

/**
 * Lowercases and reduces everything except letters/digits to single spaces, so
 * "Amoxicillin/clavulanate", "amoxicillin-clavulanate" and "Z-Pak" compare on
 * word boundaries regardless of punctuation. Uses the same token normalizer as
 * watch terms, after turning separators into spaces.
 */
function normalizeForMatch(value: string): string {
  return normalizeToken(value.replace(/[^a-zA-Z0-9]+/g, ' '));
}

const ANTIBIOTIC_PADDED = ANTIBIOTIC_NAMES.map((token) => ` ${normalizeForMatch(token)} `);

/** The built-in class of a medication name, or null when it isn't on any list. */
export function medicationClass(name: string): MedicationClass | null {
  const normalized = normalizeForMatch(name);
  if (normalized.length === 0) return null;
  const padded = ` ${normalized} `;
  return ANTIBIOTIC_PADDED.some((token) => padded.includes(token)) ? 'antibiotic' : null;
}

/** Days AFTER the dose day that still count as exposed: antibiotic → 7, otherwise → 1. */
export function effectTailDays(name: string): number {
  return medicationClass(name) === 'antibiotic' ? ANTIBIOTIC_TAIL_DAYS : DEFAULT_TAIL_DAYS;
}
