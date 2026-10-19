import type { components } from "../../../api/schema.d.ts";
import { formatElapsed } from "../../../shared/lib/format.ts";
import { t, tp } from "../../../shared/lib/i18n/index.ts";
import styles from "./RunningSubagentList.module.css";
import text from "./texts.module.css";

type RunningSubagent = components["schemas"]["RunningSubagent"];

// FR-04: what each subagent is, does and since when, so that a long review or exploration shows as such.
export function RunningSubagentList({ subagents, now }: { subagents: RunningSubagent[]; now: Date }) {
  return (
    <div className={styles.block}>
      <span className={text.label}>{tp("live.subagents.count", subagents.length)}</span>
      <ul className={styles.list}>
        {subagents.map((subagent) => (
          <li key={subagent.agentId} className={styles.item}>
            <span className={styles.type}>{subagent.agentType}</span>
            <span className={`${text.clamp} ${styles.description}`} title={subagent.description}>
              {subagent.description}
            </span>
            <span className={text.muted}>
              {subagent.currentTool === null
                ? t("live.activity.thinking")
                : t("live.activity.tool", { name: subagent.currentTool })}
              {" · "}
              {t("live.status.since", { duration: formatElapsed(subagent.since, now) })}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
