const { Client } = require('pg');
const c = new Client({ host:'localhost', port:5432, database:'ptcg_carddb', user:'postgres', password:'postgres' });
c.connect()
  .then(() => c.query("SELECT column_name, udt_name, data_type FROM information_schema.columns WHERE table_name='scraper_jobs' ORDER BY ordinal_position"))
  .then(r => { r.rows.forEach(x => console.log(x.column_name.padEnd(20), x.udt_name.padEnd(20), x.data_type)); return c.end(); })
  .catch(e => { console.error('Error:', e.message); return c.end(); });
