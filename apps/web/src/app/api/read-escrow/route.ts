import { NextRequest, NextResponse } from 'next/server';
import { createPublicClient, http } from 'viem';
import { celoSepolia } from 'viem/chains';
import { ZIM_ESCROW_ADDRESS, ZIM_ESCROW_ABI } from '@/lib/contracts';

const client = createPublicClient({
  chain: celoSepolia,
  transport: http(),
});

// Utility to convert BigInt to string in nested objects
function serializeBigInt(obj: any): any {
  if (obj === null || obj === undefined) return obj;
  
  if (typeof obj === 'bigint') {
    return obj.toString();
  }
  
  if (Array.isArray(obj)) {
    return obj.map(item => serializeBigInt(item));
  }
  
  if (typeof obj === 'object') {
    const result: any = {};
    for (const [key, value] of Object.entries(obj)) {
      result[key] = serializeBigInt(value);
    }
    return result;
  }
  
  return obj;
}

export async function POST(request: NextRequest) {
  try {
    const { escrowId } = await request.json();

    if (typeof escrowId !== 'number') {
      return NextResponse.json({ error: 'Invalid escrow ID' }, { status: 400 });
    }

    console.log('[API] read-escrow: Reading escrow', escrowId, 'from contract', ZIM_ESCROW_ADDRESS);

    const escrow = await client.readContract({
      address: ZIM_ESCROW_ADDRESS,
      abi: ZIM_ESCROW_ABI,
      functionName: 'getEscrow',
      args: [BigInt(escrowId)],
    });

    // Convert BigInt values to strings for JSON serialization
    const serializedEscrow = serializeBigInt(escrow);
    
    console.log('[API] read-escrow: Successfully read escrow', escrowId, serializedEscrow);
    return NextResponse.json(serializedEscrow);
  } catch (error) {
    console.error('[API] read-escrow: Error reading escrow:', error);
    return NextResponse.json({ 
      error: 'Failed to read escrow',
      details: error instanceof Error ? error.message : String(error)
    }, { status: 500 });
  }
}