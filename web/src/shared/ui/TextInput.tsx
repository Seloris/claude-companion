import type { ComponentProps } from "react";
import styles from "./TextInput.module.css";

export function TextInput(props: Omit<ComponentProps<"input">, "className">) {
  return <input className={styles.input} {...props} />;
}
