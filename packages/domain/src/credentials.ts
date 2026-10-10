// Recognizable formats only: not universal detection of arbitrary secrets.
export const recognizableCredentialPattern = String.raw`-----BEGIN|sb_secret_|eyJ[A-Za-z0-9_-]{15,}\.|(?:authorization|proxy-authorization)\s*:|bearer\s+[A-Za-z0-9._~+/-]+=*|[a-z][a-z0-9+.-]*://[^\s/@:]+:[^\s/@]+@|(?:password|passwd|access[_-]?token|token|secret|api.?key|apikey|client[_-]?secret|cookie|credential|session)\s*[:=]`;
export function containsRecognizableCredential(value: string): boolean {
  return new RegExp(recognizableCredentialPattern, 'i').test(value);
}
