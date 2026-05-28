import { db } from '../lib/db/client.ts';
import { sql } from 'drizzle-orm';

const res = await db.execute(sql.raw("SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename")) as Array<{ tablename: string }>;
const names = res.map((r) => r.tablename);
console.log('All tables:\n' + names.join('\n'));
process.exit(0);
