import argon2 from 'argon2';

// Argon2id configuration per spec
const ARGON2_OPTIONS: argon2.Options = {
  type: argon2.argon2id,
  memoryCost: 65536, // 64 MiB
  timeCost: 3,       // 3 iterations
  parallelism: 4,    // 4 parallel threads
};

export async function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, ARGON2_OPTIONS);
}

export async function verifyPassword(hash: string, password: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, password);
  } catch {
    return false;
  }
}

// Generate a random API key
export function generateApiKey(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  const base64 = Buffer.from(bytes).toString('base64url');
  return `ctx_${base64}`;
}

// Hash API key for storage
export async function hashApiKey(apiKey: string): Promise<string> {
  return argon2.hash(apiKey, ARGON2_OPTIONS);
}

export async function verifyApiKey(hash: string, apiKey: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, apiKey);
  } catch {
    return false;
  }
}
