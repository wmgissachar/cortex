// Patterns for detecting secrets that should be blocked
const SECRET_PATTERNS = [
  // OpenAI API keys
  /sk-[A-Za-z0-9]{40,}/,

  // GitHub tokens
  /ghp_[A-Za-z0-9]{30,}/,
  /gho_[A-Za-z0-9]{30,}/,
  /ghu_[A-Za-z0-9]{30,}/,
  /ghs_[A-Za-z0-9]{30,}/,
  /ghr_[A-Za-z0-9]{30,}/,

  // AWS keys
  /AKIA[0-9A-Z]{16}/,

  // Private keys
  /-----BEGIN\s+(?:RSA\s+)?PRIVATE\s+KEY-----/,
  /-----BEGIN\s+EC\s+PRIVATE\s+KEY-----/,
  /-----BEGIN\s+OPENSSH\s+PRIVATE\s+KEY-----/,

  // Generic API key patterns (optional, may have false positives)
  // /api[_-]?key[_-]?[=:]\s*['"]?[A-Za-z0-9]{20,}['"]?/i,

  // Anthropic API keys
  /sk-ant-[A-Za-z0-9-]{40,}/,
];

export interface SecretDetectionResult {
  containsSecret: boolean;
  patterns: string[];
}

export function detectSecrets(content: string): SecretDetectionResult {
  const matchedPatterns: string[] = [];

  for (const pattern of SECRET_PATTERNS) {
    if (pattern.test(content)) {
      matchedPatterns.push(pattern.source);
    }
  }

  return {
    containsSecret: matchedPatterns.length > 0,
    patterns: matchedPatterns,
  };
}

export function containsSecret(content: string): boolean {
  return SECRET_PATTERNS.some(pattern => pattern.test(content));
}
