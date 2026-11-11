import { Outlet } from "@tanstack/react-router";
import { TopBar } from "@/components/TopBar/TopBar";
import styles from "./AppShell.module.css";

export function AppShell() {
  return (
    <div className={styles.shell}>
      <TopBar />
      <Outlet />
    </div>
  );
}
