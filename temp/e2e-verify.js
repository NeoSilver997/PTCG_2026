const checks = [];

async function checkJson(url, validate, name) {
  const r = await fetch(url);
  const text = await r.text();
  let json = null;
  try { json = JSON.parse(text); } catch {}
  const ok = r.status === 200 && validate(json);
  checks.push({ name, url, status: r.status, ok, detail: ok ? 'PASS' : (json?.message || text.slice(0, 120)) });
  return json;
}

async function checkPage(url, markers, name) {
  const r = await fetch(url);
  const html = await r.text();
  const missing = markers.filter((m) => !html.includes(m));
  const ok = r.status === 200 && missing.length === 0;
  checks.push({ name, url, status: r.status, ok, detail: ok ? 'PASS' : `Missing markers: ${missing.join(', ')}` });
}

(async () => {
  const tId = 'cmmy4i10b000010h1xo3uqos9';
  const eventId = '952769';
  const deckCode = 'fbwVFk-1kzWuE-kFk1v5';

  await checkJson(
    `http://localhost:4000/api/v1/tournaments/${tId}`,
    (j) => !!j?.id && Array.isArray(j?.results) && j.results.length > 0 && j.results.some((r) => r.deck && Array.isArray(r.deck.deckData) && r.deck.deckData.length > 0),
    'API tournament by id has deck data'
  );

  await checkJson(
    `http://localhost:4000/api/v1/tournaments/event/${eventId}`,
    (j) => !!j?.eventId && Array.isArray(j?.results) && j.results.length > 0,
    'API tournament by eventId'
  );

  await checkJson(
    `http://localhost:4000/api/v1/decks/code/${deckCode}`,
    (j) => !!j?.deckCode && Array.isArray(j?.deckData) && j.deckData.length > 0,
    'API deck by deckCode'
  );

  await checkPage('http://localhost:3001/tournaments', ['Tournaments'], 'WEB tournaments list page');
  await checkPage(`http://localhost:3001/tournaments/${tId}`, ['Loading tournament'], 'WEB tournament detail route');
  await checkPage('http://localhost:3001/deck-builder/tournaments', ['Deck Builder'], 'WEB deck-builder tournaments page');
  await checkPage('http://localhost:3001/deck-builder/tournaments/952769', ['Loading tournament'], 'WEB deck-builder event page route');
  await checkPage(`http://localhost:3001/deck-builder/event/${deckCode}`, ['Loading deck'], 'WEB deck-builder deck-code page route');

  const fail = checks.filter((c) => !c.ok);
  console.log('--- TEST REPORT ---');
  for (const c of checks) {
    console.log(`${c.ok ? 'PASS' : 'FAIL'} | ${c.name} | ${c.status} | ${c.url}`);
    if (!c.ok) console.log(`  -> ${c.detail}`);
  }
  console.log(`SUMMARY: total=${checks.length} pass=${checks.length - fail.length} fail=${fail.length}`);
  process.exit(fail.length ? 1 : 0);
})().catch((e) => {
  console.error('TEST_RUN_ERROR', e?.message || e);
  process.exit(2);
});
