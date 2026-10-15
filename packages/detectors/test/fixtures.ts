import { verhoeffCheckDigit } from '../src/checksums';

/** A synthetic 12-digit number that passes Verhoeff. Not a real Aadhaar. */
export function syntheticAadhaar(first11 = '23456789012'): string {
  return first11 + verhoeffCheckDigit(first11);
}

/** Same 11 digits with a wrong check digit. */
export function badAadhaar(first11 = '23456789012'): string {
  const good = Number(verhoeffCheckDigit(first11));
  return first11 + String((good + 1) % 10);
}

export function group444(d: string, sep = ' '): string {
  return [d.slice(0, 4), d.slice(4, 8), d.slice(8, 12)].join(sep);
}

// Fake keys are assembled at runtime so secret scanners on the repo don't flag the test file.
export const fake = {
  github: () => 'ghp' + '_' + 'a1B2c3D4e5F6g7H8i9J0k1L2m3N4o5P6q7R8',
  openai: () => 'sk' + '-proj-' + 'Abcdefghijklmnopqrstuvwxyz012345',
  groq: () => 'gsk' + '_' + 'Q'.repeat(20) + '7'.repeat(32),
  stripe: () => 'sk' + '_live_' + 'Zz9'.repeat(9),
  google: () => 'AIza' + 'Sy' + 'B'.repeat(33),
  awsAccess: () => 'AKIA' + 'IOSFODNN7EXAMPLE',
};
