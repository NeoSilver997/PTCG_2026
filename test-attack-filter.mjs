#!/usr/bin/env node
/**
 * Test script for attackName filter
 * Tests the new API endpoint to search for cards by attack name
 */

const API_BASE = 'http://localhost:4000/api/v1';

async function testAttackFilter() {
  console.log('Testing attackName filter...\n');
  
  try {
    // Test 1: Get a card with attacks first to know what attack names exist
    console.log('Test 0: Getting a Pokemon card with attacks...');
    const response0 = await fetch(`${API_BASE}/cards?supertype=POKEMON&hasAttackText=true&take=1`);
    const data0 = await response0.json();
    
    if (data0.data.length > 0 && data0.data[0].attacks) {
      const sampleCard = data0.data[0];
      const sampleAttackName = sampleCard.attacks[0].name;
      console.log(`Sample card: ${sampleCard.name} (${sampleCard.webCardId})`);
      console.log(`Sample attack: "${sampleAttackName}"`);
      console.log('');
      
      // Test 1: Search for cards with this specific attack
      console.log(`Test 1: Searching for cards with "${sampleAttackName}" attack...`);
      const response1 = await fetch(`${API_BASE}/cards?attackName=${encodeURIComponent(sampleAttackName)}&take=5`);
      const data1 = await response1.json();
      
      console.log(`Found ${data1.pagination.total} cards`);
      console.log('Sample results:');
      data1.data.slice(0, 3).forEach((card, i) => {
        console.log(`  ${i + 1}. ${card.name} (${card.webCardId})`);
        if (card.attacks && Array.isArray(card.attacks)) {
          const attackNames = card.attacks.map(a => a.name).join(', ');
          console.log(`     Attacks: ${attackNames}`);
          const hasMatch = card.attacks.some(a => a.name === sampleAttackName);
          console.log(`     Has "${sampleAttackName}": ${hasMatch ? '✓' : '✗ FAIL!'}`);
        } else {
          console.log(`     ✗ FAIL: Card has no attacks array!`);
        }
      });
      console.log('');
    } else {
      console.log('No cards with attacks found for testing');
    }

    // Test 2: Verify no false positives - search for non-existent attack
    console.log('Test 2: Searching for non-existent attack "ZZZZZ"...');
    const response2 = await fetch(`${API_BASE}/cards?attackName=ZZZZZ&take=5`);
    const data2 = await response2.json();
    
    console.log(`Found ${data2.pagination.total} cards (should be 0)`);
    if (data2.pagination.total > 0) {
      console.log('✗ FAIL: Found cards when searching for non-existent attack!');
    }
    console.log('');

    console.log('✅ Tests completed');
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    process.exit(1);
  }
}

// Run tests
testAttackFilter();
