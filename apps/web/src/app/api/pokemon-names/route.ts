import { NextResponse } from 'next/server';
import { readFileSync } from 'fs';
import path from 'path';

export async function GET() {
  try {
    const dataPath = path.join(process.cwd(), '..', '..', 'data', 'pokemon_names.json');
    const raw = readFileSync(dataPath, 'utf-8');
    const data = JSON.parse(raw);
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ error: 'Failed to load pokemon names' }, { status: 500 });
  }
}
