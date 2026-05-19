import { config } from "dotenv";
import path from "node:path";

/**
 * Global setup: load .env.local before any test modules are imported.
 * This ensures DATABASE_URL is available when lib/db/client.ts is collected.
 */
export function setup() {
  config({ path: path.resolve(process.cwd(), ".env.local") });
  config({ path: path.resolve(process.cwd(), ".env") });
}
