import { BattleLogParser } from '../battle-log-parser';
import { PrismaService } from '../../common/prisma.service';
import * as fs from 'fs';

describe('BattleLogParser', () => {
  it('parses sample battle log and extracts expected actions', async () => {
    const path = require('path');
    const sample = fs.readFileSync(path.join(__dirname, '..', '..', '..', 'sample-battle-log-2.txt'), 'utf8');

    const mockPrisma = {
      card: {
        findFirst: jest.fn().mockImplementation(({ where }) => {
          // Return a fake card with HP for Pokemon names
          if (where.name?.contains?.toLowerCase().includes('charizard')) {
            return Promise.resolve({ webCardId: 'hk-charizard-001', hp: 270 });
          }
          if (where.name?.contains?.toLowerCase().includes('moltres')) {
            return Promise.resolve({ webCardId: 'hk-moltres-001', hp: 120 });
          }
          return Promise.resolve(null);
        })
      }
    };

    const parser = new BattleLogParser(mockPrisma as unknown as PrismaService);
    const result = await parser.parseLogText(sample);

    expect(result.metadata.player1Name).toBeTruthy();
    expect(result.actions.some(a => a.actionType === 'MULLIGAN')).toBe(true);
    expect(result.actions.some(a => a.actionType === 'ATTACK' && a.metadata?.damageBreakdown)).toBe(true);
    expect(result.actions.some(a => a.actionType === 'KNOCKOUT')).toBe(true);
    // After KNOCKOUT a DISCARD should be created for the KO'd Pokemon
    const koAction = result.actions.find(a => a.actionType === 'KNOCKOUT');
    expect(koAction).toBeDefined();
    const discardAfter = result.actions.find(a => a.actionType === 'DISCARD' && a.metadata?.from === 'KNOCKOUT');
    expect(discardAfter).toBeDefined();

    // Verify draw+played-to-bench is parsed
    const drawPlay = result.actions.find(a => a.actionType === 'DRAW' && a.metadata?.playedTo === 'bench');
    expect(drawPlay).toBeDefined();
    expect(drawPlay?.metadata?.cardNames).toBeDefined();
    expect(drawPlay?.metadata?.cardNames).toContain('Dunsparce');
  }, 20000);

  it('flags turn starts missing active pokemon', async () => {
    const sample = `Bob won the coin toss\nAlice chose heads\nSetup\nBob played Dunsparce to the Bench.\nAlice's Turn\nAlice drew 2 cards and played them to the Bench.`;

    const mockPrisma = { card: { findFirst: jest.fn().mockResolvedValue(null) } };
    const parser = new BattleLogParser(mockPrisma as unknown as PrismaService);
    const result = await parser.parseLogText(sample);

    const turnStarts = result.actions.filter(a => a.actionType === 'TURN_START');
    expect(turnStarts.length).toBeGreaterThan(0);

    // There should be a TURN_START corresponding to Alice's turn and it should flag missing active
    const aliceTurn = turnStarts.find(ts => ts.details?.includes("Alice's Turn"));
    expect(aliceTurn).toBeDefined();
    expect(aliceTurn?.metadata?.missingActive).toBe(true);
  }, 5000);
});