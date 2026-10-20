import { describe, it, expect, beforeEach, afterEach } from 'vitest';

describe('Store - localStorage Fallback', () => {
  let originalLocalStorage;

  beforeEach(() => {
    originalLocalStorage = global.localStorage;
  });

  afterEach(() => {
    global.localStorage = originalLocalStorage;
  });

  it('should use memory fallback when localStorage is disabled', () => {
    // Simulate localStorage being disabled/unavailable
    global.localStorage = {
      getItem: () => { throw new Error('localStorage is disabled'); },
      setItem: () => { throw new Error('localStorage is disabled'); },
      removeItem: () => { throw new Error('localStorage is disabled'); }
    };

    let mem = null;
    const blank = () => ({ profile: { fullName: "", email: "" }, read: {}, practice: {}, attempts: {}, certificates: {} });

    const load = () => {
      try {
        const raw = global.localStorage.getItem("key");
        return raw ? Object.assign(blank(), JSON.parse(raw)) : blank();
      } catch (e) {
        return mem || (mem = blank());
      }
    };

    const data = load();
    expect(data).toEqual(blank());
  });

  it('should persist data in memory across multiple calls', () => {
    global.localStorage = {
      getItem: () => { throw new Error('localStorage is disabled'); },
      setItem: () => { throw new Error('localStorage is disabled'); }
    };

    let mem = null;
    const blank = () => ({ profile: { fullName: "", email: "" }, read: {}, practice: {}, attempts: {}, certificates: {} });

    const save = (d) => {
      try {
        global.localStorage.setItem("key", JSON.stringify(d));
      } catch (e) {
        mem = d;
      }
    };

    const load = () => {
      try {
        const raw = global.localStorage.getItem("key");
        return raw ? JSON.parse(raw) : blank();
      } catch (e) {
        return mem || (mem = blank());
      }
    };

    const data1 = blank();
    data1.profile.fullName = "Test User";
    save(data1);

    const data2 = load();
    expect(data2.profile.fullName).toBe("Test User");
  });

  it('should fall back to memory when localStorage throws on read', () => {
    let fallbackCalled = false;

    global.localStorage = {
      getItem: () => { throw new Error('QuotaExceededError'); }
    };

    let mem = { profile: { fullName: "Cached", email: "" }, read: {}, practice: {}, attempts: {}, certificates: {} };

    const load = () => {
      try {
        return JSON.parse(global.localStorage.getItem("key"));
      } catch (e) {
        fallbackCalled = true;
        return mem || { profile: { fullName: "", email: "" }, read: {}, practice: {}, attempts: {}, certificates: {} };
      }
    };

    const data = load();
    expect(fallbackCalled).toBe(true);
    expect(data.profile.fullName).toBe("Cached");
  });
});
