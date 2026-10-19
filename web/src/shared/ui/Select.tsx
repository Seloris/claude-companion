import type { ComponentProps } from "react";
import styles from "./Select.module.css";

export function Select(props: Omit<ComponentProps<"select">, "className">) {
  return (
    <div className={styles.selectWrap}>
      <select className={styles.select} {...props} />
    </div>
  );
}
