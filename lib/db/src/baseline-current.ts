import { pool } from "./index";
import { adoptBaseline, getMigrationStatus } from "./migrations";

try {
  const baseline = await adoptBaseline(pool);
  const status = await getMigrationStatus(pool);
  console.log(JSON.stringify({ baseline, status }, null, 2));
} finally {
  await pool.end();
}
