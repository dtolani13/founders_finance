import { pool } from "./index";
import { getMigrationStatus } from "./migrations";

try {
  console.log(JSON.stringify(await getMigrationStatus(pool), null, 2));
} finally {
  await pool.end();
}
