import { TopBar } from "@/components/TopBar/TopBar";
import { ShelfEditor } from "@/features/library/components/ShelfEditor";
import { TagEditor } from "@/features/library/components/TagEditor";
import styles from "./AppShell.module.css";
import { Router } from "./router";

export function AppShell() {
  return (
    <div className={styles.shell}>
      <TopBar />
      <Router />
      <TagEditor />
      <ShelfEditor />
    </div>
  );
}
