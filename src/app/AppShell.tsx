import { TopBar } from "@/components/TopBar/TopBar";
import { Toast } from "@/components/Toast/Toast";
import { TagEditor } from "@/features/library/components/TagEditor";
import { SaveShelfDialog } from "@/features/shelves/components/SaveShelfDialog";
import styles from "./AppShell.module.css";
import { Router } from "./router";

export function AppShell() {
  return (
    <div className={styles.shell}>
      <TopBar />
      <Router />
      <TagEditor />
      <SaveShelfDialog />
      <Toast />
    </div>
  );
}
