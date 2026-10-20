import { describe, it, expect } from 'vitest';

describe('URL Normalization - Deduplication', () => {
  function normalizeUrl(url) {
    if (!url) return '';
    return url.toLowerCase()
      .replace(/^https?:\/\//, '')
      .replace(/\/$/, '')
      .split('#')[0];
  }

  it('should normalize https to http equivalent', () => {
    const https = "https://example.com/path";
    const http = "http://example.com/path";
    expect(normalizeUrl(https)).toBe(normalizeUrl(http));
  });

  it('should remove trailing slash', () => {
    const withSlash = "https://example.com/path/";
    const noSlash = "https://example.com/path";
    expect(normalizeUrl(withSlash)).toBe(normalizeUrl(noSlash));
  });

  it('should remove anchor/hash', () => {
    const withAnchor = "https://example.com/path#section";
    const noAnchor = "https://example.com/path";
    expect(normalizeUrl(withAnchor)).toBe(normalizeUrl(noAnchor));
  });

  it('should be case-insensitive', () => {
    const upper = "HTTPS://EXAMPLE.COM/PATH";
    const lower = "https://example.com/path";
    expect(normalizeUrl(upper)).toBe(normalizeUrl(lower));
  });

  it('should handle complex URLs', () => {
    const url1 = "https://example.com/docs/guide#intro/";
    const url2 = "http://example.com/docs/guide";
    expect(normalizeUrl(url1)).toBe(normalizeUrl(url2));
    expect(normalizeUrl(url1)).toBe("example.com/docs/guide");
  });

  it('should detect duplicate resources', () => {
    const resources = [
      { title: "UK Systems Overview", url: "https://www.gov.uk/guidance/positioning-navigation-and-timing-overview" },
      { title: "Systems Overview", url: "http://www.gov.uk/guidance/positioning-navigation-and-timing-overview/" },
      { title: "Something Else", url: "https://example.com/other" }
    ];

    const seen = new Set();
    const deduped = resources.filter(r => {
      const norm = normalizeUrl(r.url);
      if (seen.has(norm)) return false;
      seen.add(norm);
      return true;
    });

    expect(deduped.length).toBe(2);
    expect(seen.size).toBe(2);
  });

  it('should handle empty/null URLs', () => {
    expect(normalizeUrl('')).toBe('');
    expect(normalizeUrl(null)).toBe('');
    expect(normalizeUrl(undefined)).toBe('');
  });

  it('should skip modules with no unique items', () => {
    const modules = [
      { number: 1, items: [{ url: "https://example.com/a" }] },
      { number: 2, items: [{ url: "https://example.com/a/" }] },  // duplicate
      { number: 3, items: [{ url: "https://example.com/b" }] }
    ];

    const seen = new Set();
    const result = modules.filter(m => {
      const unique = m.items.filter(item => {
        const norm = normalizeUrl(item.url);
        if (seen.has(norm)) return false;
        seen.add(norm);
        return true;
      });
      return unique.length > 0;
    });

    expect(result.length).toBe(2);  // modules 1 and 3
    expect(result.map(m => m.number)).toEqual([1, 3]);
  });
});
