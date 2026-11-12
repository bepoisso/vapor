import { Outlet } from "@tanstack/react-router";
import { TopBar } from "@/components/TopBar/TopBar";
import { TagEditor } from "@/features/library/components/TagEditor";
import styles from "./AppShell.module.css";

export function AppShell() {
  return (
    <div className={styles.shell}>
      <TopBar />
      <Outlet />
      <TagEditor />
    </div>
  );
}
