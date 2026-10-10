import {
  MAX_SPEC_BYTES,
  SpecError,
  formatForFilename,
  parseApiSpec,
} from '@testpilot/api-spec';
import type { ApiKnowledgeRepository } from '@testpilot/domain';

export async function importSpecification(
  repository: ApiKnowledgeRepository,
  workspaceId: string,
  projectId: string,
  form: FormData,
) {
  const mode = form.get('mode');
  let source: string;
  let format: 'json' | 'yaml';
  let filename: string | null = null;
  if (mode === 'file') {
    const file = form.get('file');
    if (!(file instanceof File) || !file.size)
      throw new SpecError('FILE', 'Choose a specification file.');
    if (file.size > MAX_SPEC_BYTES)
      throw new SpecError(
        'SIZE',
        'Specifications must be no larger than 2 MiB.',
      );
    filename = file.name;
    format = formatForFilename(filename);
    try {
      source = new TextDecoder('utf-8', { fatal: true }).decode(
        await file.arrayBuffer(),
      );
    } catch {
      throw new SpecError(
        'ENCODING',
        'Specification files must contain UTF-8 text.',
      );
    }
  } else if (mode === 'paste') {
    const input = form.get('source');
    const inputFormat = form.get('format');
    if (typeof input !== 'string' || !input.trim())
      throw new SpecError('EMPTY', 'Paste a specification.');
    if (inputFormat !== 'json' && inputFormat !== 'yaml')
      throw new SpecError('FORMAT', 'Choose JSON or YAML.');
    source = input;
    format = inputFormat;
  } else throw new SpecError('MODE', 'Choose paste or file import.');
  const input = parseApiSpec(source, format, filename);
  return repository.save(workspaceId, projectId, input);
}
