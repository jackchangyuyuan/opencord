import { createContext, use, useCallback, useState } from "react";

export interface SettingsStore {
  values: Record<string, unknown>;
  set: (key: string, value: unknown) => void;
}

export const SettingsStateContext = createContext<SettingsStore | null>(null);

export function useSettingsState<T>(
  key: string,
  initial: T,
): [T, (next: T) => void] {
  const store = use(SettingsStateContext);
  const [local, setLocal] = useState(initial);

  const set = useCallback(
    (next: T) => {
      if (store === null) {
        setLocal(next);
      } else {
        store.set(key, next);
      }
    },
    [key, store],
  );

  if (store === null) {
    return [local, set];
  }

  return [
    Object.hasOwn(store.values, key) ? (store.values[key] as T) : initial,
    set,
  ];
}
