/**
 * LargeSecureStore — AES-256 storage adapter for Supabase sessions in Expo.
 *
 * Supabase sessions can exceed expo-secure-store's 2 KB limit.
 * Solution: store an AES encryption key in SecureStore, store the
 * encrypted session ciphertext in AsyncStorage.
 */
import * as SecureStore from "expo-secure-store";
import AsyncStorage from "@react-native-async-storage/async-storage";
import type { SupportedStorage } from "@supabase/supabase-js";

const ENCRYPTION_KEY_NAME = "foodo_rider_session_key";

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

async function getOrCreateKey(): Promise<CryptoKey> {
  const stored = await SecureStore.getItemAsync(ENCRYPTION_KEY_NAME);

  if (stored) {
    const raw = base64ToArrayBuffer(stored);
    return crypto.subtle.importKey("raw", raw, "AES-GCM", false, [
      "encrypt",
      "decrypt",
    ]);
  }

  const key = await crypto.subtle.generateKey(
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt", "decrypt"]
  );
  const exported = await crypto.subtle.exportKey("raw", key);
  await SecureStore.setItemAsync(
    ENCRYPTION_KEY_NAME,
    arrayBufferToBase64(exported)
  );
  return key;
}

async function encrypt(key: CryptoKey, plaintext: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(plaintext);
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    encoded
  );
  // Store iv + ciphertext as base64 JSON
  return JSON.stringify({
    iv: arrayBufferToBase64(iv.buffer),
    data: arrayBufferToBase64(ciphertext),
  });
}

async function decrypt(key: CryptoKey, stored: string): Promise<string> {
  const { iv, data } = JSON.parse(stored);
  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: base64ToArrayBuffer(iv) },
    key,
    base64ToArrayBuffer(data)
  );
  return new TextDecoder().decode(decrypted);
}

export class LargeSecureStore implements SupportedStorage {
  async getItem(key: string): Promise<string | null> {
    try {
      const stored = await AsyncStorage.getItem(key);
      if (!stored) return null;
      const cryptoKey = await getOrCreateKey();
      return await decrypt(cryptoKey, stored);
    } catch {
      return null;
    }
  }

  async setItem(key: string, value: string): Promise<void> {
    const cryptoKey = await getOrCreateKey();
    const encrypted = await encrypt(cryptoKey, value);
    await AsyncStorage.setItem(key, encrypted);
  }

  async removeItem(key: string): Promise<void> {
    await AsyncStorage.removeItem(key);
  }
}
