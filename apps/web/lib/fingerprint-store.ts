let fingerprint: string | undefined;

export function getStoredFingerprint(): string | undefined {
  return fingerprint;
}

export function storeFingerprint(value: string): void {
  fingerprint = value;
}
