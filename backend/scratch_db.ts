import { db } from './src/config/database';

async function main() {
  try {
    const res = await db.raw("SELECT column_name FROM information_schema.columns WHERE table_name = 'leads'");
    console.log(res.rows.map((r: any) => r.column_name));
  } catch (err) {
    console.error(err);
  } finally {
    process.exit(0);
  }
}
main();
