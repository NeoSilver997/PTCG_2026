const http = require('http');
http.get('http://localhost:4000/api/v1/decks/code/ySpXMp-X4ZwVP-pSyRRR', (r) => {
  let d = ''; r.on('data', c => d += c);
  r.on('end', () => {
    const deck = JSON.parse(d);
    const pokemon = (deck.cards || []).filter(c => c.card.supertype === 'POKEMON');

    console.log('--- BEFORE (old sort: HP desc) ---');
    const byHp = [...pokemon].sort((a, b) => (b.card.hp ?? 0) - (a.card.hp ?? 0));
    byHp.forEach(c => console.log(' x' + c.quantity + '  HP' + (c.card.hp ?? '?') + '  ' + c.card.name));

    console.log('\n--- AFTER (new sort: quantity desc, then HP) ---');
    const byQty = [...pokemon].sort((a, b) => {
      const qd = b.quantity - a.quantity;
      if (qd !== 0) return qd;
      return (b.card.hp ?? 0) - (a.card.hp ?? 0);
    });
    byQty.forEach(c => console.log(' x' + c.quantity + '  HP' + (c.card.hp ?? '?') + '  ' + c.card.name));
  });
}).on('error', e => console.error(e.message));
