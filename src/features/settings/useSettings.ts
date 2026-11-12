import { isTauri } from "@tauri-apps/api/core";
import { useEffect, useState } from "react";
import { commands, events, type SettingsView } from "@/lib/bindings";
import { errorMessage } from "@/lib/errors";

export type SettingsSection = "apiKey" | "account" | "steamFolder" | "store";

/**
 * Settings as the backend reports them. Every action returns the new settings; a failure is
 * kept per section so it shows next to the control that caused it. Refreshes when the library
 * changes (a background sync updates the owned-games count).
 */
export function useSettings() {
  const [view, setView] = useState<SettingsView | null>(null);
  const [error, setError] = useState<{ section: SettingsSection; message: string } | null>(null);
  const [pending, setPending] = useState<SettingsSection | null>(null);

  useEffect(() => {
    if (!isTauri()) return;
    let active = true;
    const refresh = () => {
      void commands
        .getSettings()
        .then((next) => active && setView(next))
        .catch(() => undefined);
    };
    refresh();
    const unlisten = events.libraryUpdated.listen(refresh);
    return () => {
      active = false;
      void unlisten.then((stop) => stop());
    };
  }, []);

  const run = async (section: SettingsSection, action: () => Promise<SettingsView>) => {
    setPending(section);
    setError(null);
    try {
      setView(await action());
      return true;
    } catch (failure) {
      setError({ section, message: errorMessage(failure) });
      return false;
    } finally {
      setPending(null);
    }
  };

  const errorFor = (section: SettingsSection) =>
    error?.section === section ? error.message : null;

  return { view, run, pending, errorFor };
}
