import { afterEach, describe, expect, it, vi } from 'vitest';
import { conLimite, fetchConLimite } from './red';

const abortada = (s: AbortSignal) => new Promise<unknown>((r) => s.addEventListener('abort', () => r(s.reason)));

describe('conLimite (RV-01)', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('aborta a su tiempo', async () => {
    const s = conLimite(20);
    expect(s.aborted).toBe(false);
    await abortada(s);
    expect(s.aborted).toBe(true);
  });

  it('respeta una señal externa ya abortada', () => {
    const c = new AbortController();
    c.abort(new Error('fuera'));
    const s = conLimite(60_000, c.signal);
    expect(s.aborted).toBe(true);
  });

  it('respeta una señal externa que aborta después', async () => {
    const c = new AbortController();
    const s = conLimite(60_000, c.signal);
    c.abort();
    await vi.waitFor(() => expect(s.aborted).toBe(true));
  });

  it('funciona sin AbortSignal.any ni AbortSignal.timeout (Safari 16)', async () => {
    const original = AbortSignal;
    class SinExtras extends EventTarget {}
    vi.stubGlobal('AbortSignal', Object.assign(SinExtras, { timeout: undefined, any: undefined }));
    try {
      const c = new AbortController();
      const s = conLimite(20, c.signal);
      await abortada(s);
      expect(s.aborted).toBe(true);
      const c2 = new AbortController();
      const s2 = conLimite(60_000, c2.signal);
      c2.abort();
      expect(s2.aborted).toBe(true);
    } finally {
      vi.stubGlobal('AbortSignal', original);
    }
  });
});

describe('fetchConLimite (RV-01)', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('pasa a fetch una señal que aborta al límite', async () => {
    const f = vi.fn(
      (_: RequestInfo | URL, init?: RequestInit) =>
        new Promise<Response>((_r, rechazar) =>
          init?.signal?.addEventListener('abort', () => rechazar(new Error('abort'))),
        ),
    );
    vi.stubGlobal('fetch', f);
    await expect(fetchConLimite(() => 20)('https://x')).rejects.toThrow('abort');
    expect(f.mock.calls[0]![1]!.signal).toBeInstanceOf(AbortSignal);
  });
});
