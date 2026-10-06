import { describe, expect, it } from 'vitest';
import {
  environmentTypes,
  workspaceRoles,
  validateName,
  validateId,
} from '../src/index.js';
describe('identity rules', () => {
  it('limits roles and environment types to supported concepts', () => {
    expect(workspaceRoles).toEqual(['OWNER', 'ADMIN', 'MEMBER']);
    expect(environmentTypes).toEqual(['DEVELOPMENT', 'STAGING', 'PRODUCTION']);
  });
  it('normalizes names and validates Unicode length and control characters', () => {
    expect(validateName('  Payments API  ')).toBe('Payments API');
    expect(validateName('😀'.repeat(80))).toHaveLength(160);
    for (const value of [
      null,
      '',
      'a',
      'x'.repeat(81),
      '😀'.repeat(81),
      'Unsafe\nname',
      'bad\u007fname',
    ])
      expect(() => validateName(value)).toThrow();
  });
  it('rejects forged malformed identifiers', () => {
    expect(validateId('10000000-0000-0000-0000-000000000001')).toBe(
      '10000000-0000-0000-0000-000000000001',
    );
    for (const value of [
      null,
      "' OR true --",
      '../projects',
      'other-workspace',
    ])
      expect(() => validateId(value)).toThrow();
  });
});
