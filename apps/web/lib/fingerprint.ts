import FingerprintJS from '@fingerprintjs/fingerprintjs';
import { getStoredFingerprint, storeFingerprint } from './fingerprint-store';

let fingerprintPromise: Promise<string> | undefined;

export function getDeviceFingerprint(): Promise<string> {
  if (typeof window === 'undefined') {
    const serverFingerprint = globalThis.crypto?.randomUUID?.() ?? `server-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    return Promise.resolve(serverFingerprint);
  }

  const storedFingerprint = getStoredFingerprint();
  if (storedFingerprint) return Promise.resolve(storedFingerprint);

  if (!fingerprintPromise) {
    fingerprintPromise = (async () => {
      const agent = await FingerprintJS.load();
      const result = await agent.get();
      storeFingerprint(result.visitorId);
      return result.visitorId;
    })();
  }
  return fingerprintPromise;
}