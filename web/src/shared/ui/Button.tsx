import type { ComponentProps } from "react";
import styles from "./Button.module.css";

export function Button({
  variant = "quiet",
  type = "button",
  ...props
}: { variant?: "primary" | "danger" | "quiet" | "ghost" } & Omit<ComponentProps<"button">, "className">) {
  return <button type={type} className={`${styles.btn} ${styles[variant]}`} {...props} />;
}
