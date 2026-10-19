import { NavLink } from "react-router";
import { Badge } from "./Badge.tsx";
import styles from "./NavBar.module.css";

export interface NavBarItem {
  to: string;
  label: string;
  // A count beside the label; `label` is what a screen reader announces for it.
  badge?: { count: number; label: string };
}

export function NavBar({ label, items }: { label: string; items: NavBarItem[] }) {
  return (
    <nav className={styles.nav} aria-label={label}>
      <ul className={styles.list}>
        {items.map((item) => (
          <li key={item.label}>
            {/* `end`: an item is current on its own path only; NavLink sets aria-current="page" on it. */}
            <NavLink className={styles.link} to={item.to} end>
              <span className={styles.label}>{item.label}</span>
              {item.badge !== undefined && (
                <Badge tone="attention">
                  <span aria-hidden="true">{item.badge.count}</span>
                  <span className={styles.srOnly}>{item.badge.label}</span>
                </Badge>
              )}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
