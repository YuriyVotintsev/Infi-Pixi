/** Minimal observable value compatible with Svelte's store contract (`$store`). */
export interface Store<T> {
  get(): T;
  set(v: T): void;
  update(fn: (v: T) => T): void;
  subscribe(fn: (v: T) => void): () => void;
}

export function store<T>(initial: T): Store<T> {
  let value = initial;
  const subs = new Set<(v: T) => void>();
  return {
    get: () => value,
    set(v) {
      if (Object.is(v, value)) return;
      value = v;
      for (const fn of subs) fn(value);
    },
    update(fn) {
      this.set(fn(value));
    },
    subscribe(fn) {
      subs.add(fn);
      fn(value);
      return () => subs.delete(fn);
    },
  };
}

/** Store whose value is mirrored to localStorage. */
export function persisted<T>(key: string, initial: T): Store<T> {
  let start = initial;
  try {
    const raw = localStorage.getItem('infi-pixi:' + key);
    if (raw != null) start = JSON.parse(raw);
  } catch {
    /* storage unavailable */
  }
  const s = store(start);
  s.subscribe((v) => {
    try {
      localStorage.setItem('infi-pixi:' + key, JSON.stringify(v));
    } catch {
      /* ignore */
    }
  });
  return s;
}
