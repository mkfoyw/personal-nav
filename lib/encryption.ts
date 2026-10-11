export interface EncryptedData {
  format: "qidian-encrypted";
  version: 1 | 2;
  salt: string;
  iv: string;
  data: string;
}

const ITERATIONS = 310_000;
const encoder = new TextEncoder();

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function fromBase64(value: string): Uint8Array {
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(value)) throw new Error("加密数据格式无效");
  return Uint8Array.from(atob(value), (character) => character.charCodeAt(0));
}

export function isEncryptedData(value: unknown): value is EncryptedData {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const data = value as Record<string, unknown>;
  return data.format === "qidian-encrypted" && (data.version === 1 || data.version === 2) &&
    typeof data.salt === "string" && typeof data.iv === "string" && typeof data.data === "string";
}

async function keyFor(password: string, salt: Uint8Array): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey({ name: "PBKDF2", salt: salt as BufferSource, iterations: ITERATIONS, hash: "SHA-256" }, base,
    { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
}

export function createSharedSalt(): string {
  if (!globalThis.crypto?.getRandomValues) throw new Error("当前浏览器不支持安全加密");
  return toBase64(crypto.getRandomValues(new Uint8Array(16)));
}

async function encryptWithSalt(text: string, password: string, purpose: string, saltValue: string, version: 1 | 2): Promise<EncryptedData> {
  if (password.length < 12) throw new Error("密码至少需要 12 个字符");
  if (!globalThis.crypto?.subtle) throw new Error("当前浏览器不支持安全加密");
  const salt = fromBase64(saltValue);
  if (salt.length !== 16) throw new Error("加密密钥格式无效");
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await keyFor(password, salt);
  const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv: iv as BufferSource, additionalData: encoder.encode(purpose) }, key, encoder.encode(text));
  return { format: "qidian-encrypted", version, salt: saltValue, iv: toBase64(iv), data: toBase64(new Uint8Array(encrypted)) };
}

// Kept for reading and testing notes written before the shared-key format.
export async function encryptText(text: string, password: string, purpose: string): Promise<EncryptedData> {
  return encryptWithSalt(text, password, purpose, createSharedSalt(), 1);
}

export async function encryptSharedText(text: string, password: string, purpose: string, sharedSalt: string): Promise<EncryptedData> {
  return encryptWithSalt(text, password, purpose, sharedSalt, 2);
}

export async function decryptText(value: EncryptedData, password: string, purpose: string): Promise<string> {
  if (!isEncryptedData(value)) throw new Error("加密数据格式无效");
  if (!globalThis.crypto?.subtle) throw new Error("当前浏览器不支持安全加密");
  try {
    const salt = fromBase64(value.salt);
    const iv = fromBase64(value.iv);
    const data = fromBase64(value.data);
    if (salt.length !== 16 || iv.length !== 12 || data.length < 16) throw new Error("invalid");
    const key = await keyFor(password, salt);
    const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: iv as BufferSource, additionalData: encoder.encode(purpose) }, key, data as BufferSource);
    return new TextDecoder("utf-8", { fatal: true }).decode(plain);
  } catch {
    throw new Error("密码错误或加密数据已损坏");
  }
}

