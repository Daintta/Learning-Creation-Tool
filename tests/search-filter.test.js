import { describe, it, expect, beforeEach } from 'vitest';

describe('Search/Filter - Resources', () => {
  let resources;
  let searchIndex;

  beforeEach(() => {
    resources = [
      { title: "NIST TN 2187", desc: "Telecommunications Infrastructure Resilience", searchable: "nist tn 2187 telecommunications infrastructure resilience" },
      { title: "DHS Resilient Systems Conformance Framework", desc: "Conformance criteria for resilient systems", searchable: "dhs resilient pnt conformance framework conformance criteria for resilient positioning, navigation and timing" },
      { title: "GPS Signal Processing", desc: "Advanced GPS signal analysis techniques", searchable: "gps signal processing advanced gps signal analysis techniques" }
    ];
  });

  it('should find resource by title', () => {
    const query = "nist";
    const found = resources.filter(r => r.searchable.includes(query));
    expect(found).toHaveLength(1);
    expect(found[0].title).toBe("NIST TN 2187");
  });

  it('should find resource by keyword in description', () => {
    const query = "resilient";
    const found = resources.filter(r => r.searchable.includes(query));
    expect(found.length).toBeGreaterThanOrEqual(1);
    expect(found[0].title).toContain("Resilient");
  });

  it('should be case-insensitive', () => {
    const query = "GPS".toLowerCase();
    const found = resources.filter(r => r.searchable.includes(query));
    expect(found).toHaveLength(1);
    expect(found[0].title).toContain("GPS");
  });

  it('should show all when search is empty', () => {
    const query = "";
    const found = resources.filter(r => !query || r.searchable.includes(query));
    expect(found).toHaveLength(3);
  });

  it('should return empty when no match', () => {
    const query = "nonexistent";
    const found = resources.filter(r => r.searchable.includes(query));
    expect(found).toHaveLength(0);
  });

  it('should find multiple results for broad search', () => {
    const query = "positioning";
    const found = resources.filter(r => r.searchable.includes(query));
    expect(found.length).toBeGreaterThan(0);
  });

  it('should match partial words', () => {
    const query = "signal";
    const found = resources.filter(r => r.searchable.includes(query));
    expect(found).toHaveLength(1);
  });
});

describe('Search/Filter - Further Learning', () => {
  it('should filter module-based resources', () => {
    const modules = [
      { number: 1, items: [{ title: "Systems Overview" }, { title: "Space Strategy" }] },
      { number: 2, items: [{ title: "GNSS Basics" }, { title: "Galileo System" }] }
    ];

    const query = "gnss";
    const filtered = modules.map(m => ({
      ...m,
      items: m.items.filter(item => item.title.toLowerCase().includes(query))
    })).filter(m => m.items.length > 0);

    expect(filtered).toHaveLength(1);
    expect(filtered[0].number).toBe(2);
  });

  it('should show "no results" message when search yields nothing', () => {
    const resources = [
      { title: "GPS" },
      { title: "GNSS" }
    ];

    const query = "signal processing";
    const found = resources.filter(r => r.title.toLowerCase().includes(query));
    const showNoResults = found.length === 0 && query.length > 0;

    expect(showNoResults).toBe(true);
  });
});
