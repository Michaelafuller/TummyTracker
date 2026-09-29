import {
  ANTIBIOTIC_NAMES,
  ANTIBIOTIC_TAIL_DAYS,
  DEFAULT_TAIL_DAYS,
  effectTailDays,
  medicationClass,
} from '../medicationClasses';

describe('medicationClass', () => {
  it('matches generic and brand names', () => {
    for (const name of ['Amoxicillin', 'Augmentin', 'Zithromax', 'Cipro', 'Flagyl', 'Bactrim', 'Macrobid']) {
      expect(medicationClass(name)).toBe('antibiotic');
    }
  });

  it('matches every name in the built-in list', () => {
    for (const name of ANTIBIOTIC_NAMES) {
      expect(medicationClass(name)).toBe('antibiotic');
    }
  });

  it('matches names with a strength or extra words', () => {
    expect(medicationClass('Amoxicillin 500')).toBe('antibiotic');
    expect(medicationClass('doxycycline hyclate 100 mg')).toBe('antibiotic');
    expect(medicationClass('Cephalexin (Keflex)')).toBe('antibiotic');
  });

  it('matches the clavulanate combination in any punctuation', () => {
    expect(medicationClass('amoxicillin-clavulanate')).toBe('antibiotic');
    expect(medicationClass('Amoxicillin/Clavulanate 875')).toBe('antibiotic');
    expect(medicationClass('Amoxicillin clavulanate')).toBe('antibiotic');
  });

  it('matches Z-Pak however it is punctuated', () => {
    expect(medicationClass('Z-Pak')).toBe('antibiotic');
    expect(medicationClass('z pak')).toBe('antibiotic');
    expect(medicationClass('Z-PAK 250mg')).toBe('antibiotic');
  });

  it('ignores case and surrounding whitespace', () => {
    expect(medicationClass('   AMOXICILLIN   ')).toBe('antibiotic');
    expect(medicationClass('  Penicillin   V  ')).toBe('antibiotic');
  });

  it('respects word boundaries', () => {
    expect(medicationClass('moxi')).toBeNull();
    expect(medicationClass('Ciprofloxacinol')).toBeNull();
    expect(medicationClass('unamoxicillin')).toBeNull();
    expect(medicationClass('cipros')).toBeNull();
  });

  it('returns null for unknown, empty and blank names', () => {
    expect(medicationClass('Ibuprofen')).toBeNull();
    expect(medicationClass('Omeprazole')).toBeNull();
    expect(medicationClass('')).toBeNull();
    expect(medicationClass('   ')).toBeNull();
  });
});

describe('effectTailDays', () => {
  it('is 7 for antibiotics and 1 for everything else', () => {
    expect(ANTIBIOTIC_TAIL_DAYS).toBe(7);
    expect(DEFAULT_TAIL_DAYS).toBe(1);
    expect(effectTailDays('Amoxicillin 500')).toBe(7);
    expect(effectTailDays('Ibuprofen')).toBe(1);
    expect(effectTailDays('')).toBe(1);
  });
});
