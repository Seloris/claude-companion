import type { ReactNode } from "react";
import buttonStyles from "./Button.module.css";
import styles from "./ButtonLink.module.css";

// A link with the button's look, for an action that leaves the page (a custom-scheme URL): no className, no target.
export function ButtonLink({
  href,
  variant = "quiet",
  children,
  "aria-label": ariaLabel,
}: {
  href: string;
  variant?: "quiet" | "ghost";
  children: ReactNode;
  "aria-label"?: string;
}) {
  const classes = [buttonStyles.btn, buttonStyles[variant], styles.link, variant === "ghost" ? styles.ghost : ""];
  return (
    <a href={href} className={classes.filter(Boolean).join(" ")} aria-label={ariaLabel}>
      {children}
    </a>
  );
}
