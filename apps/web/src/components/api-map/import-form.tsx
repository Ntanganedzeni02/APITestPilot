'use client';
import { useActionState, useState } from 'react';
import {
  importApiAction,
  type ImportState,
} from '../../lib/api-knowledge/actions';
import { Button } from '../ui/button';

export function ImportForm() {
  const [mode, setMode] = useState('paste');
  const [clientError, setClientError] = useState<string>();
  const [state, action, pending] = useActionState<ImportState, FormData>(
    importApiAction,
    {},
  );
  return (
    <form
      action={action}
      className="mt-6 space-y-5"
      aria-busy={pending}
      onSubmit={(event) => {
        const data = new FormData(event.currentTarget);
        const file = data.get('file');
        const source = data.get('source');
        const size =
          mode === 'file' && file instanceof File
            ? file.size
            : typeof source === 'string'
              ? new TextEncoder().encode(source).length
              : 0;
        if (size > 2097152) {
          event.preventDefault();
          setClientError('Specifications must be no larger than 2 MiB.');
        } else setClientError(undefined);
      }}
    >
      <p className="text-sm text-muted-foreground">
        OpenAPI 3.0.x or 3.1.x, up to 2 MiB. Local references only. Each import
        is a new immutable version. Remove credentials before importing;
        examples, defaults and vendor extensions are omitted from storage.
      </p>
      <fieldset disabled={pending} className="flex flex-wrap gap-5">
        <legend className="mb-2 font-medium">Import source</legend>
        <label>
          <input
            type="radio"
            name="mode"
            value="paste"
            checked={mode === 'paste'}
            onChange={() => setMode('paste')}
          />{' '}
          Paste specification
        </label>
        <label>
          <input
            type="radio"
            name="mode"
            value="file"
            checked={mode === 'file'}
            onChange={() => setMode('file')}
          />{' '}
          Upload file
        </label>
      </fieldset>
      {mode === 'paste' ? (
        <>
          <label className="form-label">
            Format
            <select name="format" className="form-input" disabled={pending}>
              <option value="json">JSON</option>
              <option value="yaml">YAML</option>
            </select>
          </label>
          <label className="form-label">
            Specification
            <textarea
              name="source"
              required
              rows={12}
              maxLength={2097152}
              spellCheck={false}
              className="form-input font-mono text-xs"
              disabled={pending}
            />
          </label>
        </>
      ) : (
        <label className="form-label">
          Specification file
          <input
            name="file"
            type="file"
            accept=".json,.yaml,.yml"
            required
            className="form-input"
            disabled={pending}
          />
        </label>
      )}
      {clientError && (
        <p role="alert" className="text-sm">
          {clientError}
        </p>
      )}
      {state.error && (
        <div
          role="alert"
          className="break-words rounded-md border border-danger/30 p-3 text-sm"
        >
          <p>{state.error}</p>
          {state.code && (
            <p className="mt-2 font-mono text-xs">
              {state.code}
              {state.pointer ? ` · ${state.pointer}` : ''}
            </p>
          )}
        </div>
      )}
      <Button disabled={pending}>
        {pending ? 'Validating and importing…' : 'Validate and import'}
      </Button>
    </form>
  );
}
