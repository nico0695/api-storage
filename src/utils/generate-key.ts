import crypto from 'crypto';

/**
 * Generates a cryptographically secure API key
 * Format: sk_<32 random hex characters>
 * Example: sk_a7f3b9e1c4d2f8a6b5c3e9d1f7a4b2c8
 */
export function generateAPIKey(): string {
  const randomBytes = crypto.randomBytes(32);
  const hexString = randomBytes.toString('hex');
  return `sk_${hexString}`;
}
