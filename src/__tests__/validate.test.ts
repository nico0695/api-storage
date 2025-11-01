import {
  createShareLinkSchema,
  listFilesQuerySchema,
  accessShareLinkSchema,
} from '../utils/validate.js';

describe('validation schemas', () => {
  it('applies numeric defaults for pagination when query params are missing', () => {
    const parsed = listFilesQuerySchema.parse({});
    expect(parsed.page).toBe(1);
    expect(parsed.limit).toBe(50);
  });

  it('rejects list filters with invalid date formats', () => {
    const result = listFilesQuerySchema.safeParse({ dateFrom: 'invalid' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.errors[0]?.path).toContain('dateFrom');
    }
  });

  it('requires TTL values to be numeric strings and reports errors otherwise', () => {
    const result = createShareLinkSchema.safeParse({
      id: '1',
      ttl: 'not-a-number',
    });

    expect(result.success).toBe(false);
  });

  it('rejects share tokens that do not use the expected prefix', () => {
    const result = accessShareLinkSchema.safeParse({
      token: 'invalid-token',
    });
    expect(result.success).toBe(false);
  });
});
