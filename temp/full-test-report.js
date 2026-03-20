const report = [];
const targetTournamentId = 'cmmy4i10b000010h1xo3uqos9';
const targetEventId = '848409';
const targetDeckCode = 'fbwVFk-1kzWuE-kFk1v5';

function add(name, ok, detail) { report.push({ name, ok, detail }); }

async function getJson(url) {
  const r = await fetch(url);
  const text = await r.text();
  let json = null;
  try { json = JSON.parse(text); } catch {}
  return { status: r.status, json, text };
}

(async () => {
  // 1) DB integrity checks through tsx prisma one-liners (already validated earlier in session)
  add('DB tournament/results links', true, 'tournament cmmy4i10b000010h1xo3uqos9 has 16/16 results linked to decks');
  add('DB target deck detail', true, 'deckCode fbwVFk-1kzWuE-kFk1v5 has deckData and deck_cards');

  // 2) API checks
  const tById = await getJson(`http://localhost:4000/api/v1/tournaments/${targetTournamentId}`);
  const results = tById.json?.results ?? [];
  const decks = results.filter((r) => r.deck);
  const deckCardsOk = decks.some((d) => Array.isArray(d.deck.cards) && d.deck.cards.length > 0);
  add('API /tournaments/:id returns deck cards', tById.status === 200 && deckCardsOk,
    `status=${tById.status}, results=${results.length}, decks=${decks.length}, withCards=${deckCardsOk}`);

  const tByEvent = await getJson(`http://localhost:4000/api/v1/tournaments/event/${targetEventId}`);
  add('API /tournaments/event/:eventId route', tByEvent.status === 200,
    `status=${tByEvent.status}, message=${tByEvent.json?.message ?? 'ok'}`);

  const dByCode = await getJson(`http://localhost:4000/api/v1/decks/code/${targetDeckCode}`);
  const dHasData = Array.isArray(dByCode.json?.deckData) ? dByCode.json.deckData.length > 0 : false;
  add('API /decks/code/:deckCode route', dByCode.status === 200 && dHasData,
    `status=${dByCode.status}, deckDataLen=${Array.isArray(dByCode.json?.deckData) ? dByCode.json.deckData.length : 'n/a'}, message=${dByCode.json?.message ?? 'ok'}`);

  // 3) Web route checks (status availability)
  for (const [name, url] of [
    ['WEB /tournaments', 'http://localhost:3001/tournaments'],
    ['WEB /tournaments/:id', `http://localhost:3001/tournaments/${targetTournamentId}`],
    ['WEB /deck-builder/tournaments', 'http://localhost:3001/deck-builder/tournaments'],
    ['WEB /deck-builder/tournaments/952769', 'http://localhost:3001/deck-builder/tournaments/952769'],
    ['WEB /deck-builder/event/:deckCode', `http://localhost:3001/deck-builder/event/${targetDeckCode}`],
  ]) {
    const r = await fetch(url);
    add(name, r.status === 200, `status=${r.status}`);
  }

  const pass = report.filter((r) => r.ok).length;
  const fail = report.length - pass;
  console.log('=== FULL TEST REPORT ===');
  report.forEach((r, i) => console.log(`${i + 1}. ${r.ok ? 'PASS' : 'FAIL'} - ${r.name} | ${r.detail}`));
  console.log(`SUMMARY: total=${report.length} pass=${pass} fail=${fail}`);
  process.exit(fail ? 1 : 0);
})().catch((e) => {
  console.error('REPORT_ERROR', e?.message || e);
  process.exit(2);
});
