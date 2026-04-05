# ZimStable Integration Guide

## Overview

ZimStable is a Celo-based remittance POC integrating three key African fintech solutions:

1. **Paynow** - Fiat on-ramp via EcoCash/OneMoney (Zimbabwe)
2. **Yellow Card** - Liquidity provider for fiat↔stablecoin swaps
3. **Hosting Africa** - Data sovereignty on African infrastructure

## Architecture Flow

```
User (Australia/Zimbabwe)
    ↓
PaynowGateway (Fiat entry)
    ↓ [EcoCash/OneMoney]
Paynow API
    ↓ [Payment confirmation]
ZimStable Backend
    ↓ [Quote request]
YellowCardSwap (Liquidity)
    ↓ [Stablecoin swap]
Yellow Card API
    ↓ [cUSD/AUDD received]
Celo Network
    ↓ [MiniPay transfer]
Recipient (Zimbabwe/Africa)
```

## 1. Paynow Integration (Fiat On-Ramp)

### What it does
- Collects fiat payments via EcoCash/OneMoney
- Verifies transactions in real-time
- Triggers stablecoin issuance on Celo

### Files
- **Frontend**: `src/components/PaynowGateway.tsx`
- **API Routes**: `src/app/api/paynow/*`
- **Utils**: `src/lib/paynow.ts`

### API Endpoints

#### POST `/api/paynow/initiate`
Initiates a payment through Paynow
```json
{
  "email": "user@example.com",
  "phone": "+263776123456",
  "amount": 100,
  "currency": "USD",
  "reference": "ZIM-123456-abcde",
  "description": "ZimStable Remittance",
  "returnUrl": "https://yourapp.com/paynow/return",
  "notifyUrl": "https://yourapp.com/api/paynow/callback"
}
```

#### POST `/api/paynow/status`
Checks transaction status
```json
{
  "reference": "ZIM-123456-abcde"
}
```

#### POST `/api/paynow/callback`
Webhook endpoint - receives payment confirmation from Paynow

### Setup
1. Get API credentials from [Paynow](https://www.paynow.co.zw/)
2. Set `PAYNOW_INTEGRATION_KEY` in `.env.local`
3. Configure webhook URL in Paynow dashboard

### Usage
```typescript
import { initiatePaynowPayment } from '@/lib/paynow';

const result = await initiatePaynowPayment({
  email: 'user@example.com',
  phone: '+263776123456',
  amount: 100,
  currency: 'USD',
  reference: 'ZIM-123456-abcde',
  description: 'Remittance',
  returnUrl: 'https://yourapp.com/return',
  notifyUrl: 'https://yourapp.com/api/paynow/callback',
});

if (result.success) {
  window.location.href = result.redirectUrl;
}
```

## 2. Yellow Card Integration (Liquidity & Off-Ramp)

### What it does
- Provides real-time quotes for fiat↔stablecoin swaps
- Executes swaps and deposits to wallet
- Handles off-ramp to Celo/AUDD

### Files
- **Frontend**: `src/components/YellowCardSwap.tsx`
- **API Routes**: `src/app/api/yellowcard/*`
- **Utils**: `src/lib/yellowcard.ts`

### API Endpoints

#### POST `/api/yellowcard/quote`
Gets real-time exchange rate
```json
{
  "fromCurrency": "ZWL",
  "toCurrency": "cUSD",
  "amount": 1000,
  "paymentMethod": "ecocash"
}
```

#### POST `/api/yellowcard/swap`
Executes the swap
```json
{
  "quoteId": "quote-xyz-123",
  "toAddress": "0x...",
  "destinationTag": "optional-tag"
}
```

#### POST `/api/yellowcard/status`
Checks swap status
```json
{
  "transactionId": "swap-abc-456"
}
```

### Setup
1. Get API credentials from [Yellow Card](https://yellowcard.io/)
2. Set `YELLOWCARD_API_KEY` in `.env.local`
3. Whitelist your domain in Yellow Card dashboard

### Usage
```typescript
import { getYellowCardQuote, executeYellowCardSwap } from '@/lib/yellowcard';

// Get quote
const quote = await getYellowCardQuote({
  fromCurrency: 'ZWL',
  toCurrency: 'cUSD',
  amount: 1000,
});

// Execute swap
const swap = await executeYellowCardSwap({
  quoteId: quote.quoteId,
  toAddress: walletAddress,
});
```

## 3. Hosting Africa Integration (Data Sovereignty)

### What it does
- Stores user KYC/compliance data on African infrastructure
- Ensures data residency in Zimbabwe/South Africa
- Maintains encrypted audit trails

### Files
- **API Routes**: `src/app/api/hosting-africa/*`
- **Utils**: `src/lib/hosting-africa.ts`

### API Endpoints

#### POST `/api/hosting-africa/store`
Stores encrypted user data
```json
{
  "userData": {
    "userId": "user-123",
    "walletAddress": "0x...",
    "phoneNumber": "+263776123456",
    "kycStatus": "verified",
    "dataHash": "hash123",
    "timestamp": 1699999999
  },
  "config": {
    "bucket": "zimstable-users",
    "region": "zim",
    "encryption": "aes256",
    "retention": 365
  }
}
```

#### POST `/api/hosting-africa/retrieve`
Retrieves user data
```json
{
  "userId": "user-123"
}
```

#### POST `/api/hosting-africa/document`
Stores compliance documents
```json
{
  "documentId": "doc-456",
  "documentType": "kyc",
  "content": "base64-encoded-content",
  "signature": "digital-signature",
  "region": "zim"
}
```

#### POST `/api/hosting-africa/verify`
Verifies data integrity
```json
{
  "storageId": "zimstable-user-123-xyz",
  "originalHash": "hash123"
}
```

### Setup
1. Get API credentials from [Hosting Africa](https://hostingafrica.com/)
2. Set `HOSTING_AFRICA_API_KEY` and `HOSTING_AFRICA_REGION` in `.env.local`
3. Create S3-compatible buckets (zimstable-users, zimstable-docs)

### Usage
```typescript
import { 
  storeUserDataOnHostingAfrica,
  storeComplianceDocumentOnHostingAfrica 
} from '@/lib/hosting-africa';

// Store user data
await storeUserDataOnHostingAfrica({
  userId: 'user-123',
  walletAddress: '0x...',
  phoneNumber: '+263776123456',
  kycStatus: 'verified',
  dataHash: crypto.createHash('sha256').update(userData).digest('hex'),
  timestamp: Date.now(),
});

// Store compliance document
await storeComplianceDocumentOnHostingAfrica({
  documentId: 'kyc-user-123',
  documentType: 'kyc',
  content: base64EncodedDoc,
  signature: digitalSig,
  region: 'zim',
});
```

## Environment Configuration

Create `.env.local` in `apps/web/`:

```env
# Paynow
PAYNOW_INTEGRATION_KEY=xxx
PAYNOW_API_URL=https://www.paynow.co.zw/api/initiate
PAYNOW_STATUS_URL=https://www.paynow.co.zw/api/status

# Yellow Card
YELLOWCARD_API_KEY=xxx
YELLOWCARD_API_URL=https://api.yellowcard.io/v2

# Hosting Africa
HOSTING_AFRICA_API_KEY=xxx
HOSTING_AFRICA_API_URL=https://api.hostingafrica.com/v1
HOSTING_AFRICA_REGION=zim

# Celo
NEXT_PUBLIC_CELO_RPC_URL=https://alfajores-forno.celo-testnet.org
NEXT_PUBLIC_CELO_NETWORK=celo-sepolia

# App
NEXT_PUBLIC_APP_URL=https://vm952cali.yourlocaldomain.com
NEXT_PUBLIC_APP_ENVIRONMENT=production
```

## Frontend Components

### PaynowGateway
```tsx
import PaynowGateway from '@/components/PaynowGateway';

<PaynowGateway 
  onPaymentSuccess={(ref, amount) => console.log('Paid:', ref, amount)}
  onPaymentError={(err) => console.error('Error:', err)}
/>
```

### YellowCardSwap
```tsx
import YellowCardSwap from '@/components/YellowCardSwap';

<YellowCardSwap
  initialFromCurrency="ZWL"
  initialToCurrency="cUSD"
  onSwapSuccess={(txId) => console.log('Swapped:', txId)}
  onSwapError={(err) => console.error('Error:', err)}
/>
```

## Security Best Practices

### Paynow
- ✅ HMAC-SHA512 signature verification
- ✅ Webhook validation required
- ✅ Store API key in `.env.local` (never commit)
- ✅ Use HTTPS only in production

### Yellow Card
- ✅ Bearer token authentication
- ✅ CORS configuration required
- ✅ Quote expiration check (15 min default)
- ✅ Rate limiting on quote requests

### Hosting Africa
- ✅ AES-256 encryption for sensitive data
- ✅ Data at rest encryption
- ✅ Audit logging of all access
- ✅ Regional data residency compliance
- ✅ Hash verification for integrity

## Testing

### Local Development
```bash
cd apps/web
npm install
npm run dev
```

### API Testing
```bash
# Paynow initiate
curl -X POST http://localhost:3000/api/paynow/initiate \
  -H "Content-Type: application/json" \
  -d '{"email":"test@test.com","phone":"+263...","amount":100,"currency":"USD","reference":"TEST-123","description":"Test"}'

# Yellow Card quote
curl -X POST http://localhost:3000/api/yellowcard/quote \
  -H "Content-Type: application/json" \
  -d '{"fromCurrency":"ZWL","toCurrency":"cUSD","amount":1000}'

# Hosting Africa store
curl -X POST http://localhost:3000/api/hosting-africa/store \
  -H "Content-Type: application/json" \
  -d '{"userData":{"userId":"test-123","walletAddress":"0x...","phoneNumber":"+263...","kycStatus":"verified","dataHash":"hash","timestamp":'$(date +%s)'}'
```

## Troubleshooting

### Paynow
- **Issue**: "Integration key not configured"
  - **Solution**: Check `.env.local` has `PAYNOW_INTEGRATION_KEY`
- **Issue**: Signature mismatch
  - **Solution**: Verify API key and payload structure
- **Issue**: Callback not received
  - **Solution**: Check webhook URL in Paynow dashboard

### Yellow Card
- **Issue**: "API key not configured"
  - **Solution**: Set `YELLOWCARD_API_KEY` in `.env.local`
- **Issue**: Quote expired
  - **Solution**: Quotes expire in 15 minutes - re-fetch if needed
- **Issue**: Swap fails
  - **Solution**: Verify wallet is whitelisted in Yellow Card

### Hosting Africa
- **Issue**: "API key not configured"
  - **Solution**: Set `HOSTING_AFRICA_API_KEY`
- **Issue**: Data not stored
  - **Solution**: Verify bucket permissions and region config
- **Issue**: Verification fails
  - **Solution**: Check original hash matches stored hash

## Production Deployment

1. **Generate API Credentials**
   - Paynow: Production integration key
   - Yellow Card: Production API key
   - Hosting Africa: Production credentials

2. **Update Environment**
   ```bash
   PAYNOW_INTEGRATION_KEY=prod_key_xxx
   YELLOWCARD_API_KEY=prod_key_xxx
   HOSTING_AFRICA_API_KEY=prod_key_xxx
   HOSTING_AFRICA_REGION=zim
   NEXT_PUBLIC_APP_ENVIRONMENT=production
   ```

3. **Domain Configuration**
   - Set `NEXT_PUBLIC_APP_URL=https://vm952cali.yourlocaldomain.com`
   - Update webhook URLs in each provider's dashboard
   - Enable CORS for your domain

4. **Monitoring**
   - Log all API calls (compliance requirement)
   - Monitor transaction volumes
   - Alert on failed swaps/payments
   - Track data access for audit trail

## Compliance & Regulatory

- **KYC**: Store on Hosting Africa (data sovereignty)
- **AML**: Monitor transaction patterns
- **GDPR/Privacy**: User consent for data storage
- **Audit Trail**: All operations logged and encrypted
- **Regional**: Zimbabwe compliance via Paynow + Hosting Africa

## Next Steps

1. Set up provider accounts and get API keys
2. Copy `.env.example` to `.env.local` and fill in credentials
3. Test each integration locally
4. Deploy to production at vm952cali.yourlocaldomain.com
5. Monitor and optimize conversion rates
