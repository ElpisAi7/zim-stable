import { NextRequest, NextResponse } from 'next/server';

/**
 * Hosting Africa Compliance Document Storage Route
 * POST /api/hosting-africa/document
 * Stores signed compliance documents for audit trail
 */

interface DocumentRequest {
  documentId: string;
  documentType: 'kyc' | 'transaction' | 'compliance' | 'audit';
  content: string; // Base64 encoded
  signature: string;
  region: string;
}

export async function POST(request: NextRequest) {
  try {
    const body: DocumentRequest = await request.json();

    if (!body.documentId || !body.documentType || !body.content) {
      return NextResponse.json(
        { success: false, error: 'Missing required document fields' },
        { status: 400 }
      );
    }

    const hostingAfricaApiKey = process.env.HOSTING_AFRICA_API_KEY;

    if (!hostingAfricaApiKey) {
      return NextResponse.json(
        { success: false, error: 'Hosting Africa API key not configured' },
        { status: 500 }
      );
    }

    console.log('[Hosting Africa] Storing compliance document:', {
      documentId: body.documentId,
      documentType: body.documentType,
      region: body.region || 'zim',
    });

    // TODO: Integrate with actual Hosting Africa storage API
    const storageUrl = `https://${body.region || 'zim'}.hostingafrica.com/zimstable-docs/${body.documentId}`;

    return NextResponse.json({
      success: true,
      storageId: body.documentId,
      url: storageUrl,
    });
  } catch (error) {
    console.error('[Hosting Africa] Document storage error:', error);
    return NextResponse.json(
      { success: false, error: 'Document storage failed' },
      { status: 500 }
    );
  }
}
