import ReactMarkdown, { type Components, type Options } from "react-markdown";
import remarkGfm from "remark-gfm";
import { t } from "../../../shared/lib/i18n/index.ts";
import { Checkbox } from "../../../shared/ui/Checkbox.tsx";
import styles from "./PlanMarkdown.module.css";

// A plan's Markdown (factory-board FR-34), GFM for its tables and task lists. No rehype-raw: raw HTML shows as text,
// never injected. Links render as text (a plan's relative links would route into the app) and images as their alt text
// (a plan's images are a spec non-goal). Fenced code, Mermaid included, stays a code block. The plan's headings sit one
// level below the recap's "Plan" heading, and its task-list boxes are the app's checkbox, read only.
const components: Components = {
  a: ({ children }) => <span className={styles.link}>{children}</span>,
  img: ({ alt }) => (alt ? <span>[{alt}]</span> : null),
  h1: ({ children }) => <h3 className={styles.h1}>{children}</h3>,
  h2: ({ children }) => <h4 className={styles.h2}>{children}</h4>,
  h3: ({ children }) => <h5 className={styles.h3}>{children}</h5>,
  h4: ({ children }) => <h6 className={styles.h3}>{children}</h6>,
  h5: ({ children }) => <h6 className={styles.h3}>{children}</h6>,
  h6: ({ children }) => <h6 className={styles.h3}>{children}</h6>,
  input: ({ type, checked }) =>
    type === "checkbox" ? (
      <span className={styles.task}>
        <Checkbox checked={checked ?? false} disabled readOnly />
      </span>
    ) : null,
};

// GFM footnotes: their heading and back links in French.
const remarkRehypeOptions: Options["remarkRehypeOptions"] = {
  footnoteLabel: t("factory.plan.footnotes"),
  footnoteBackLabel: (referenceIndex) => t("factory.plan.footnoteBack", { reference: referenceIndex + 1 }),
};

export function PlanMarkdown({ content }: { content: string }) {
  return (
    <div className={styles.markdown}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} remarkRehypeOptions={remarkRehypeOptions} components={components}>
        {content}
      </ReactMarkdown>
    </div>
  );
}
