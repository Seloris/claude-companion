import { NavLink } from "react-router";
import { Badge, type BadgeTone } from "./Badge.tsx";
import styles from "./NavBar.module.css";

export interface NavBarBadge {
  count: number;
  // What a screen reader announces for the count.
  label: string;
  tone: BadgeTone;
}

export interface NavBarItem {
  to: string;
  label: string;
  // Counts beside the label.
  badges?: NavBarBadge[];
}

// `isWide`: the page under the bar is wider than the others (--live-width), and the bar lines up with it.
export function NavBar({ label, items, isWide = false }: { label: string; items: NavBarItem[]; isWide?: boolean }) {
  return (
    <nav className={styles.nav} aria-label={label}>
      <ul className={isWide ? `${styles.list} ${styles.wide}` : styles.list}>
        {items.map((item) => (
          <li key={item.label}>
            {/* `end`: an item is current on its own path only; NavLink sets aria-current="page" on it. */}
            <NavLink className={styles.link} to={item.to} end>
              <span className={styles.label}>{item.label}</span>
              {item.badges?.map((badge) => (
                <Badge key={badge.label} tone={badge.tone}>
                  <span aria-hidden="true">{badge.count}</span>
                  <span className={styles.srOnly}>{badge.label}</span>
                </Badge>
              ))}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
