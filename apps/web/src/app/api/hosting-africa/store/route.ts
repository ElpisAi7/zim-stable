import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

/**
 * Hosting Africa User Data Storage Route
 * POST /api/hosting-africa/store
 * Stores encrypted user data on Hosting Africa infrastructure (data sovereignty)
 */

interface StorageRequest {
  userData: {
    userId: string;
    walletAddress: string;
    phoneNumber: string;
    kycStatus: string;
    dataHash: string;
    timestamp: number;
  };
  config?: {
    bucket: string;
    region: string;
    encryption: string;
    retention: number;
  };
}

export async function POST(request: NextRequest) {
  try {
    const body: StorageRequest = await request.json();

    if (!body.userData.userId || !body.userData.walletAddress) {
      return NextResponse.json(
        { success: false, error: 'Missing required user data fields' },
        { status: 400 }
      );
    }

    const hostingAfricaApiKey = process.env.HOSTING_AFRICA_API_KEY;
    const hostingAfricaBaseUrl = process.env.HOSTING_AFRICA_API_URL || 'https://api.hostingafrica.com/v1';
    const hostingAfricaRegion = process.env.HOSTING_AFRICA_REGION || 'zim';

    if (!hostingAfricaApiKey) {
      return NextResponse.json(
        { success: false, error: 'Hosting Africa API key not configured' },
        { status: 500 }
      );
    }

    // Encrypt sensitive data before sending
    const encryptedData = encryptData(JSON.stringify(body.userData), hostingAfricaApiKey);

    // Store on Hosting Africa
    const storageId = `zimstable-${body.userData.userId}-${Date.now()}`;

    console.log('[Hosting Africa] Storing user data:', {
      storageId,
      userId: body.userData.userId,
      region: hostingAfricaRegion,
    });

    // TODO: Integrate with actual Hosting Africa S3-compatible API
    // This is a mock implementation
    const mockStorageUrl = `https://${hostingAfricaRegion}.hostingafrica.com/zimstable/${storageId}`;

    return NextResponse.json({
      success: true,
      storageId,
      url: mockStorageUrl,
    });
  } catch (error) {
    console.error('[Hosting Africa] Storage error:', error);
    return NextResponse.json(
      { success: false, error: 'Data storage failed' },
      { status: 500 }
    );
  }
}

/**
 * Encrypt sensitive data
 */
function encryptData(data: string, key: string): string {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(key.padEnd(32, '0').slice(0, 32)), iv);
  let encrypted = cipher.update(data, 'utf-8', 'hex');
  encrypted += cipher.final('hex');
  return iv.toString('hex') + ':' + encrypted;
}
