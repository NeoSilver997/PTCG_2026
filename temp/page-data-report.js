(async () => {
  const out = [];
  const add = (n, ok, d) => out.push({ n, ok, d });

  const eventId = '952769';
  const deckCode = 'fbwVFk-1kzWuE-kFk1v5';
  const tid = 'cmmy4i10b000010h1xo3uqos9';

  const t = await (await fetch(`http://localhost:4000/api/v1/tournaments/${tid}`)).json();
  add(
    'Page /tournaments/:id data',
    Array.isArray(t.results) && t.results.some((r) => r.deck && Array.isArray(r.deck.cards) && r.deck.cards.length > 0),
    `results=${t.results?.length ?? 0}`,
  );

  const list = await (await fetch('http://localhost:4000/api/v1/tournaments?take=100&skip=0')).json();
  const m = (list.data || []).find((x) => x.eventId === eventId);
  let evOk = false;
  let evDet = 'match=no';
  if (m) {
    const det = await (await fetch(`http://localhost:4000/api/v1/tournaments/${m.id}`)).json();
    evOk = Array.isArray(det.results) && det.results.length > 0;
    evDet = `match=yes results=${det.results?.length ?? 0}`;
  }
  add('Page /deck-builder/tournaments/:eventId fallback data', evOk, evDet);

  const map = JSON.parse(await (await fetch('http://localhost:3001/deck-code-map.json')).text());
  const dm = map.find((x) => x.deckCode === deckCode);
  let dOk = false;
  let dDet = 'map=no';
  if (dm) {
    const d = await (await fetch(`http://localhost:4000/api/v1/decks/${dm.id}`)).json();
    dOk = Array.isArray(d.cards) && d.cards.length > 0;
    dDet = `map=yes cards=${d.cards?.length ?? 0}`;
  }
  add('Page /deck-builder/event/:deckCode fallback data', dOk, dDet);

  console.log('=== PAGE DATA PATH REPORT ===');
  out.forEach((r, i) => {
    console.log(`${i + 1}. ${r.ok ? 'PASS' : 'FAIL'} - ${r.n} | ${r.d}`);
  });

  const fail = out.filter((r) => !r.ok).length;
  console.log(`SUMMARY total=${out.length} pass=${out.length - fail} fail=${fail}`);
  process.exit(fail ? 1 : 0);
})().catch((e) => {
  console.error('DATA_PATH_REPORT_ERROR', e?.message || e);
  process.exit(2);
});
