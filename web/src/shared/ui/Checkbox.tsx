import type { ComponentProps } from "react";
import styles from "./Checkbox.module.css";

export function Checkbox(props: Omit<ComponentProps<"input">, "className" | "type">) {
  return <input type="checkbox" className={styles.check} {...props} />;
}
