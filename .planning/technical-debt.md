# Technical debt

A flat list, no sections, priorities or metadata, new items appended at the bottom. Format: `- **<Short title> (<scope>):** <One sentence stating what is wrong or missing, not how to fix it>. See [<File>](<relative-path>).`
- **Copied sessions counted twice (api, session-ingestion, session-activity):** A session copied from another one (fork, resume) rewrites the `sessionId` of every copied line, so its tokens, prompts, tool calls, skill calls and agent runs are counted in both sessions, and its agent calls whose logs stay in the original session folder become missing-log subagents (29 of 213 locally). See [ingestion.parser.ts](../api/src/features/ingestion/ingestion.parser.ts).
