import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { recognizableCredentialPattern } from '../src/credentials.js';
it('SQL and domain use exactly the same recognizable credential rule', () => {
  const sql = readFileSync(
    'supabase/migrations/20261007000700_evidence_findings.sql',
    'utf8',
  );
  expect(sql.match(/note_input ~\* '([^']+)'/)?.[1]).toBe(
    recognizableCredentialPattern,
  );
});
