import { type ReactNode, useCallback, useMemo, useState } from "react";

import { SettingsStateContext } from "@/features/server-settings/lib/settings-state";

export function SettingsStateProvider({ children }: { children: ReactNode }) {
  const [values, setValues] = useState<Record<string, unknown>>({});

  const set = useCallback((key: string, value: unknown) => {
    setValues((current) => ({ ...current, [key]: value }));
  }, []);

  const store = useMemo(() => ({ values, set }), [values, set]);

  return <SettingsStateContext value={store}>{children}</SettingsStateContext>;
}
