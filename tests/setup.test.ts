/**
 * Basic setup test to verify Jest configuration works
 */

describe('Jest Configuration', () => {
  it('should be properly configured for TypeScript ES modules', () => {
    expect(true).toBe(true);
  });

  it('should have Jest globals available', () => {
    expect(describe).toBeDefined();
    expect(it).toBeDefined();
    expect(expect).toBeDefined();
    // jest global is not available in ES module mode
  });

  it('should handle basic TypeScript features', () => {
    const testObject: { name: string; value: number } = {
      name: 'test',
      value: 42,
    };

    expect(testObject.name).toBe('test');
    expect(testObject.value).toBe(42);
  });
});
