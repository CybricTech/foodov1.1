/**
 * Supabase session storage adapter backed by expo-secure-store (OS keychain /
 * Android Keystore), satisfying the PRD security requirement that auth tokens
 * live in the OS secure store rather than plain storage.
 *
 * SecureStore has a per-value size soft limit (~2KB on Android). Supabase
 * session payloads (access + refresh token + user) can exceed that, so this
 * adapter transparently CHUNKS large values across multiple SecureStore keys.
 *
 * It implements the `SupportedStorage` shape expected by supabase-js
 * (getItem/setItem/removeItem).
 */
import * as SecureStore from "expo-secure-store";

const CHUNK_SIZE = 1800; // stay comfortably under SecureStore's ~2KB limit
const META_SUFFIX = "__meta"; // stores the chunk count for a key

// SecureStore keys must match /^[A-Za-z0-9._-]+$/. Supabase keys can contain
// characters outside that set, so we sanitize while keeping uniqueness.
function safeKey(key: string): string {
  return key.replace(/[^A-Za-z0-9._-]/g, "_");
}

async function getChunkCount(base: string): Promise<number> {
  const meta = await SecureStore.getItemAsync(`${base}${META_SUFFIX}`);
  if (!meta) return 0;
  const n = parseInt(meta, 10);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

async function clearChunks(base: string, count: number): Promise<void> {
  const deletions: Promise<void>[] = [
    SecureStore.deleteItemAsync(`${base}${META_SUFFIX}`),
  ];
  for (let i = 0; i < count; i += 1) {
    deletions.push(SecureStore.deleteItemAsync(`${base}.${i}`));
  }
  await Promise.all(deletions);
}

export const SecureStoreAdapter = {
  async getItem(key: string): Promise<string | null> {
    const base = safeKey(key);
    const count = await getChunkCount(base);

    // Legacy / small single-value path.
    if (count === 0) {
      return SecureStore.getItemAsync(base);
    }

    const parts: string[] = [];
    for (let i = 0; i < count; i += 1) {
      const part = await SecureStore.getItemAsync(`${base}.${i}`);
      if (part == null) {
        // Corrupted/partial write — treat as missing so Supabase re-auths.
        return null;
      }
      parts.push(part);
    }
    return parts.join("");
  },

  async setItem(key: string, value: string): Promise<void> {
    const base = safeKey(key);

    // Clean up any previous representation (single or chunked).
    const prevCount = await getChunkCount(base);
    if (prevCount > 0) {
      await clearChunks(base, prevCount);
    } else {
      await SecureStore.deleteItemAsync(base);
    }

    if (value.length <= CHUNK_SIZE) {
      await SecureStore.setItemAsync(base, value);
      return;
    }

    const chunks: string[] = [];
    for (let i = 0; i < value.length; i += CHUNK_SIZE) {
      chunks.push(value.slice(i, i + CHUNK_SIZE));
    }
    await Promise.all(
      chunks.map((chunk, i) =>
        SecureStore.setItemAsync(`${base}.${i}`, chunk)
      )
    );
    await SecureStore.setItemAsync(
      `${base}${META_SUFFIX}`,
      String(chunks.length)
    );
  },

  async removeItem(key: string): Promise<void> {
    const base = safeKey(key);
    const count = await getChunkCount(base);
    if (count > 0) {
      await clearChunks(base, count);
    }
    await SecureStore.deleteItemAsync(base);
  },
};
