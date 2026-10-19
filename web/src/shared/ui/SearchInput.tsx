import type { ComponentProps } from "react";
import { SearchIcon } from "./icons.tsx";
import styles from "./SearchInput.module.css";

export function SearchInput(props: Omit<ComponentProps<"input">, "className" | "type">) {
  return (
    <div className={styles.search}>
      <SearchIcon />
      <input type="search" className={styles.input} {...props} />
    </div>
  );
}
