const { PrismaClient } = require('../packages/database/node_modules/.prisma/client');

(async () => {
  const prisma = new PrismaClient();
  try {
    const logs = await prisma.battleLog.findMany({ select: { id: true } });
    console.log(`Found ${logs.length} battle logs to reparse.`);

    const results = [];
    // Sequential with small delay to avoid overwhelming local API
    for (let i = 0; i < logs.length; i++) {
      const id = logs[i].id;
      process.stdout.write(`Reparsing ${i + 1}/${logs.length}: ${id} ... `);
      try {
        const res = await fetch(`http://localhost:4000/api/v1/battles/${id}/reparse`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          // no body required
        });
        const txt = await res.text();
        if (res.ok) {
          console.log('OK');
          results.push({ id, ok: true, status: res.status });
        } else {
          console.log(`FAIL (${res.status})`);
          results.push({ id, ok: false, status: res.status, body: txt });
        }
      } catch (err) {
        console.log(`ERROR: ${err.message}`);
        results.push({ id, ok: false, error: err.message });
      }
      // small delay (100ms)
      await new Promise((r) => setTimeout(r, 100));
    }

    const outPath = 'scripts/reparse-all-results.json';
    require('fs').writeFileSync(outPath, JSON.stringify(results, null, 2));
    const successCount = results.filter(r => r.ok).length;
    console.log(`\nReparse complete: ${successCount}/${results.length} succeeded. Results written to ${outPath}`);
  } catch (err) {
    console.error('Fatal error during reparse-all:', err);
  } finally {
    await prisma.$disconnect();
  }
})();
