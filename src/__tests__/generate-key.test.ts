import { generateAPIKey, generateShareToken } from '../utils/generate-key.js';

describe('generate-key utilities', () => {
  it('creates API keys with the expected prefix and entropy', () => {
    const key = generateAPIKey();
    expect(key).toMatch(/^sk_[0-9a-f]{64}$/);
  });

  it('creates share tokens with the expected prefix and entropy', () => {
    const token = generateShareToken();
    expect(token).toMatch(/^share_[0-9a-f]{64}$/);
  });

  it('produces non-colliding keys across multiple calls', () => {
    const iterations = 50;
    const keys = new Set<string>();
    for (let i = 0; i < iterations; i += 1) {
      keys.add(generateShareToken());
    }
    expect(keys.size).toBe(iterations);
  });
});
