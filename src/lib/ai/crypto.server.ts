/**
 * Server-only encryption helpers for user-supplied AI API keys.
 *
 * The master key lives in the server environment variable AI_CONFIG_ENCRYPTION_KEY
 * and is never exposed to the browser. This file is `*.server.ts`, so the bundler
 * blocks it from every client bundle.
 */

const ENC_PREFIX = "v1";

function getMasterKeyMaterial(): string {
  const key = process.env["AI_CONFIG_ENCRYPTION_KEY"];
  if (!key) {
    throw new Error("服务端缺少 AI_CONFIG_ENCRYPTION_KEY，无法加密或解密 API Key。");
  }
  return key;
}

async function getAesKey(): Promise<CryptoKey> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(getMasterKeyMaterial()));
  return crypto.subtle.importKey("raw", digest, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function fromBase64(value: string): Uint8Array<ArrayBuffer> {
  const binary = atob(value);
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export async function encryptApiKey(plaintext: string): Promise<string> {
  const key = await getAesKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipher = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    new TextEncoder().encode(plaintext),
  );
  return `${ENC_PREFIX}.${toBase64(iv)}.${toBase64(new Uint8Array(cipher))}`;
}

export async function decryptApiKey(payload: string): Promise<string> {
  if (!payload) return "";
  const parts = payload.split(".");
  if (parts.length !== 3 || parts[0] !== ENC_PREFIX) {
    throw new Error("保存的 API Key 无法解密，请重新填写一次 API Key。");
  }
  try {
    const key = await getAesKey();
    const plain = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: fromBase64(parts[1]!) },
      key,
      fromBase64(parts[2]!),
    );
    return new TextDecoder().decode(plain);
  } catch (error) {
    if (error instanceof Error && error.message.includes("AI_CONFIG_ENCRYPTION_KEY")) {
      throw error;
    }
    throw new Error("保存的 API Key 无法用当前服务密钥解密，请重新填写并保存一次 API Key。");
  }
}

/** Mask for display only — never reveals enough to reuse the key. */
export function maskApiKey(plaintext: string): string {
  if (!plaintext) return "";
  const tail = plaintext.slice(-4);
  return `••••••••${tail}`;
}
