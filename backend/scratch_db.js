require('dotenv').config();
const { Client } = require('pg');
const client = new Client({ connectionString: process.env.DATABASE_URL });
client.connect()
  .then(() => client.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'leads'"))
  .then(res => {
    console.log(res.rows.map(r => r.column_name));
    client.end();
  })
  .catch(err => {
    console.error(err);
    client.end();
  });
