import type { AnchorHTMLAttributes } from "react";
import { href, type Path, usePath } from "@/app/navigation";

type LinkProps = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href"> & { to: Path };

/** A plain anchor to a route (cheap enough to render by the hundred in grids). */
export function Link({ to, children, ...props }: LinkProps) {
  return (
    <a href={href(to)} {...props}>
      {children}
    </a>
  );
}

/**
 * A link that marks itself `aria-current="page"` on its route (top bar tabs), and on paths
 * starting with `section` (the Library tab stays current on game pages).
 */
export function NavLink({ to, section, children, ...props }: LinkProps & { section?: string }) {
  const path = usePath();
  const current = path === to || (section !== undefined && path.startsWith(section));
  return (
    <a href={href(to)} aria-current={current ? "page" : undefined} {...props}>
      {children}
    </a>
  );
}
