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

/** A link that marks itself `aria-current="page"` on its route (top bar tabs). */
export function NavLink({ to, children, ...props }: LinkProps) {
  const path = usePath();
  return (
    <a href={href(to)} aria-current={path === to ? "page" : undefined} {...props}>
      {children}
    </a>
  );
}
