// Test hasAbilities filter
const https = require('http');

async function testFilter(hasAbilities) {
  return new Promise((resolve, reject) => {
    const url = `http://localhost:4000/api/v1/cards?supertype=POKEMON&hasAbilities=${hasAbilities}&take=1`;
    https.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(JSON.parse(data)));
    }).on('error', reject);
  });
}

(async () => {
  try {
    console.log('\n测试特性过滤器...\n');
    
    const withAbilities = await testFilter('true');
    const withoutAbilities = await testFilter('false');
    
    console.log('有特性 (With abilities):');
    console.log(`  Total: ${withAbilities.pagination.total}`);
    if (withAbilities.data.length > 0) {
      console.log(`  Sample: ${withAbilities.data[0].webCardId} - ${withAbilities.data[0].name}`);
      console.log(`  Abilities: ${JSON.stringify(withAbilities.data[0].abilities)}`);
    }
    
    console.log('\n無特性 (Without abilities):');
    console.log(`  Total: ${withoutAbilities.pagination.total}`);
    if (withoutAbilities.data.length > 0) {
      console.log(`  Sample: ${withoutAbilities.data[0].webCardId} - ${withoutAbilities.data[0].name}`);
      console.log(`  Abilities: ${JSON.stringify(withoutAbilities.data[0].abilities)}`);
    }
    
    console.log('\nExpected:');
    console.log('  With abilities: ~3,062');
    console.log('  Without abilities: ~11,069');
    console.log('  Total: ~14,131\n');
    
  } catch (err) {
    console.error('Error:', err.message);
  }
})();
