import { db, pool } from "./index";
import { getMigrationStatus, migrateDatabase } from "./migrations";

try {
  const before = await getMigrationStatus(pool);
  await migrateDatabase(db);
  const after = await getMigrationStatus(pool);
  console.log(JSON.stringify({ before, after }, null, 2));
} finally {
  await pool.end();
}
