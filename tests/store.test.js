// Tests the real browser store (assets/js/store-local.js), not a copy of it.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const STORE_SRC = readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'assets', 'js', 'store-local.js'), 'utf8');

// A small course: module 1 has two lessons and two questions, module 2 has one lesson and one question.
const COURSE = {
  config: { passMark: 80, requireAllLessonsRead: true, certificatePrefix: 'CERT', storageKey: 'test-learning-v1' },
  catalog: [
    { id: 'm01', version: '1.0', lessons: [{ id: 'a' }, { id: 'b' }] },
    { id: 'm02', version: '1.0', lessons: [{ id: 'c' }] },
  ],
  assessments: [
    { moduleId: 'm01', questions: [{ id: 'm01-q01', answer: 'x', explanation: 'e1' }, { id: 'm01-q02', answer: 'y', explanation: 'e2' }] },
    { moduleId: 'm02', questions: [{ id: 'm02-q01', answer: 'z', explanation: 'e3' }] },
  ],
};

// Loads a fresh copy of the store, the same way the page does: a plain script that sets Course.store.
function loadStore() {
  globalThis.window ??= globalThis;
  globalThis.Course = JSON.parse(JSON.stringify(COURSE));
  new Function(STORE_SRC)();
  return globalThis.Course.store;
}

const passAll = async (store) => {
  await store.markRead('m01', 'a');
  await store.markRead('m01', 'b');
  return store.submitAssessment('m01', { 'm01-q01': 'x', 'm01-q02': 'y' });
};

describe('browser store', () => {
  let store;
  beforeEach(() => {
    localStorage.clear();
    store = loadStore();
  });
  afterEach(() => {
    localStorage.clear();
  });

  it('records each lesson once', async () => {
    await store.markRead('m01', 'a');
    await store.markRead('m01', 'a');
    await store.markRead('m01', 'b');
    const state = await store.getState();
    expect(state.read.m01).toEqual(['a', 'b']);
  });

  it('will not score an assessment until every lesson in the module is read', async () => {
    await store.markRead('m01', 'a');
    await expect(store.submitAssessment('m01', { 'm01-q01': 'x', 'm01-q02': 'y' }))
      .rejects.toThrow('Read all lessons before taking the assessment.');
  });

  it('scores correct answers as a pass, with a module certificate', async () => {
    const res = await passAll(store);
    expect(res.score).toBe(2);
    expect(res.percent).toBe(100);
    expect(res.passed).toBe(true);
    expect(res.certificate.id).toMatch(/^CERT-M01-[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{4}-[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{4}$/);
    expect(res.programmeCertificate).toBeNull();
  });

  it('fails a wrong attempt and issues no certificate', async () => {
    await store.markRead('m01', 'a');
    await store.markRead('m01', 'b');
    const res = await store.submitAssessment('m01', { 'm01-q01': 'wrong', 'm01-q02': 'wrong' });
    expect(res.passed).toBe(false);
    expect(res.certificate).toBeNull();
    const state = await store.getState();
    expect(state.attempts.m01).toHaveLength(1);
    expect(state.certificates.m01).toBeUndefined();
  });

  it('issues the programme certificate only when every module is passed', async () => {
    const first = await passAll(store);
    expect(first.programmeCertificate).toBeNull();
    await store.markRead('m02', 'c');
    const second = await store.submitAssessment('m02', { 'm02-q01': 'z' });
    expect(second.programmeCertificate.id).toMatch(/^CERT-ALL-/);
  });

  it('renames issued certificates when the learner changes their name', async () => {
    await store.saveProfile({ fullName: 'Jane Smith', email: '' });
    await passAll(store);
    await store.saveProfile({ fullName: 'Jane Jones', email: '' });
    const state = await store.getState();
    expect(state.certificates.m01.fullName).toBe('Jane Jones');
  });

  it('keeps the best practice score', async () => {
    await store.recordPractice('m01', 3, 5);
    await store.recordPractice('m01', 1, 5);
    const state = await store.getState();
    expect(state.practice.m01.best).toBe(3);
  });

  it('resets progress but keeps the learner profile', async () => {
    await store.saveProfile({ fullName: 'Jane Smith', email: '' });
    await passAll(store);
    await store.resetProgress();
    const state = await store.getState();
    expect(state.read).toEqual({});
    expect(state.certificates).toEqual({});
    expect((await store.getProfile()).fullName).toBe('Jane Smith');
  });

  it('keeps working when browser storage is blocked', async () => {
    const original = { get: localStorage.getItem, set: localStorage.setItem };
    localStorage.getItem = () => { throw new Error('blocked'); };
    localStorage.setItem = () => { throw new Error('blocked'); };
    try {
      const blocked = loadStore();
      await blocked.markRead('m01', 'a');
      const state = await blocked.getState();
      expect(state.read.m01).toEqual(['a']);
    } finally {
      localStorage.getItem = original.get;
      localStorage.setItem = original.set;
    }
  });
});
