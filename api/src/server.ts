import { createApp } from "./app.js";
import { readConfig } from "./config.js";
import { migrateDatabase, openDatabase } from "./db/client.js";
import { systemClock } from "./shared/clock.js";

const config = readConfig();
const db = openDatabase(config.PGLITE_DIR);
await migrateDatabase(db);
createApp({ db, clock: systemClock }).listen(config.PORT, () => {
  console.log(`api listening on http://localhost:${config.PORT}`);
});
