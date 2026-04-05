# ZimStable Integration Checklist

## Pre-Launch Setup

### 1. Paynow Integration ✓
- [ ] Sign up for [Paynow](https://www.paynow.co.zw/) merchant account
- [ ] Verify email and business details
- [ ] Get Integration Key from Paynow dashboard
- [ ] Test API in sandbox mode
- [ ] Configure webhook URL: `https://vm952cali.yourlocaldomain.com/api/paynow/callback`
- [ ] Set `PAYNOW_INTEGRATION_KEY` in `.env.local`
- [ ] Test payment flow end-to-end
- [ ] Move to production mode in Paynow dashboard
- [ ] Monitor first transactions

### 2. Yellow Card Integration ✓
- [ ] Create [Yellow Card](https://yellowcard.io/) business account
- [ ] Complete KYC verification
- [ ] Get API Key from dashboard
- [ ] Whitelist domain in CORS settings
- [ ] Set `YELLOWCARD_API_KEY` in `.env.local`
- [ ] Test quote endpoint
- [ ] Test swap execution
- [ ] Verify liquidity pool has sufficient funds (ZWL↔cUSD, USD↔AUDD)
- [ ] Set up monitoring for swap failures
- [ ] Enable production API access

### 3. Hosting Africa Integration ✓
- [ ] Sign up for [Hosting Africa](https://hostingafrica.com/)
- [ ] Create S3-compatible storage buckets:
  - [ ] `zimstable-users` (for KYC/user data)
  - [ ] `zimstable-docs` (for compliance documents)
- [ ] Get API credentials
- [ ] Set encryption keys
- [ ] Set `HOSTING_AFRICA_API_KEY` and `HOSTING_AFRICA_REGION=zim`
- [ ] Test data storage and retrieval
- [ ] Verify encryption works
- [ ] Set up access logging
- [ ] Configure backup policy (30 days min retention)
- [ ] Document data residency location (Zimbabwe server, IP whitelist)

### 4. Celo Network Setup ✓
- [ ] Configure Celo Sepolia testnet
- [ ] Deploy ZimEscrow contract
- [ ] Deploy MockUSDC for testing
- [ ] Deploy MockPriceOracle
- [ ] Verify all addresses in `lib/contracts.ts`
- [ ] Fund testnet wallet with Celo
- [ ] Test escrow deposit flow

### 5. Frontend Components ✓
- [ ] Install dependencies: `pnpm install`
- [ ] Create PaynowGateway component
- [ ] Create YellowCardSwap component
- [ ] Integrate into P2PGateway
- [ ] Add UI for payment status tracking
- [ ] Add error handling and retry logic
- [ ] Test responsive design (mobile-first)

### 6. Backend API Routes ✓
- [ ] Create `/api/paynow/initiate`
- [ ] Create `/api/paynow/status`
- [ ] Create `/api/paynow/callback`
- [ ] Create `/api/yellowcard/quote`
- [ ] Create `/api/yellowcard/swap`
- [ ] Create `/api/yellowcard/status`
- [ ] Create `/api/hosting-africa/store`
- [ ] Create `/api/hosting-africa/retrieve`
- [ ] Create `/api/hosting-africa/document`
- [ ] Create `/api/hosting-africa/verify`
- [ ] Add request validation to all endpoints
- [ ] Add error logging and monitoring

### 7. Environment Configuration ✓
- [ ] Create `.env.local` from `.env.example`
- [ ] Fill in all provider API keys
- [ ] Set `HOSTING_AFRICA_REGION=zim`
- [ ] Set `NEXT_PUBLIC_APP_URL=https://vm952cali.yourlocaldomain.com`
- [ ] Set `NEXT_PUBLIC_APP_ENVIRONMENT=production`
- [ ] Verify config with `getConfig()` utility
- [ ] Document all required vars

### 8. Security & Compliance ✓
- [ ] Enable HTTPS for domain
- [ ] Configure CORS properly
- [ ] Implement rate limiting on API endpoints
- [ ] Add request signing/validation
- [ ] Encrypt API keys in `.env.local` (use `.gitignore`)
- [ ] Implement AML monitoring
- [ ] Log all transactions for audit
- [ ] Set up IP whitelisting for sensitive endpoints
- [ ] Enable WAF (Web Application Firewall)
- [ ] Regular security audits

### 9. Testing ✓
- [ ] Unit tests for paynow utility
- [ ] Unit tests for yellowcard utility
- [ ] Unit tests for hosting-africa utility
- [ ] Integration tests for API routes
- [ ] E2E test: Payment flow (Paynow → Celo)
- [ ] E2E test: Swap flow (Fiat → Stablecoin)
- [ ] E2E test: Data storage (User → Hosting Africa)
- [ ] Load testing (1000+ TPS simulation)
- [ ] Failover testing (provider downtime)

### 10. Monitoring & Logging ✓
- [ ] Set up Sentry/New Relic for error tracking
- [ ] Create CloudWatch dashboards for:
  - [ ] Paynow: Payment success rate, avg approval time
  - [ ] Yellow Card: Quote latency, swap execution time
  - [ ] Hosting Africa: Storage latency, retrieval success
- [ ] Set up alerts for:
  - [ ] API response time > 5s
  - [ ] Error rate > 1%
  - [ ] Payment failure > 5%
  - [ ] Swap failures > 2%
- [ ] Daily reconciliation report
- [ ] Weekly compliance audit report

### 11. Documentation ✓
- [ ] Create INTEGRATION_GUIDE.md
- [ ] Document API endpoints with examples
- [ ] Create troubleshooting guide
- [ ] Document security practices
- [ ] Create deployment runbook
- [ ] Record setup video/walkthrough
- [ ] Create FAQ for support team

### 12. Deployment ✓
- [ ] Build production image: `docker build -t zimstable:latest .`
- [ ] Test on staging server first
- [ ] Set up CI/CD pipeline
- [ ] Deploy to vm952cali.yourlocaldomain.com
- [ ] Verify all endpoints responding
- [ ] Run health checks
- [ ] Monitor initial traffic
- [ ] Have rollback plan ready

### 13. Go-Live ✓
- [ ] Announce to users
- [ ] Monitor for issues 24/7
- [ ] Keep support on standby
- [ ] Track key metrics (conversion rate, volume, latency)
- [ ] Weekly performance reviews
- [ ] Monthly optimization cycle

## Post-Launch Optimization

### Performance
- [ ] Optimize quote caching (avoid redundant requests)
- [ ] Implement request debouncing on frontend
- [ ] Use CDN for static assets
- [ ] Cache exchange rates (5-15 min)
- [ ] Batch document uploads to Hosting Africa

### Conversion
- [ ] A/B test payment methods (EcoCash vs OneMoney prominence)
- [ ] Optimize UX for 2G networks (common in Zimbabwe)
- [ ] Simplify form fields
- [ ] Add step-by-step wizard
- [ ] Reduce payment approval wait time

### Costs
- [ ] Monitor Paynow transaction fees
- [ ] Optimize Yellow Card swap routes
- [ ] Bulk transfer batching
- [ ] Implement fee comparison logic
- [ ] Negotiate volume discounts

### Compliance
- [ ] Regular CBZD (Reserve Bank) check-ins
- [ ] Update AML thresholds based on regulations
- [ ] Annual security audit
- [ ] Quarterly compliance review
- [ ] Document all regulatory approvals

## Issues & Support

### Common Issues

**Paynow payment stuck in "pending"**
- Check webhook configuration
- Verify callback endpoint is accessible
- Check server logs for errors
- Contact Paynow support with reference ID

**Yellow Card swap failing**
- Verify liquidity availability
- Check wallet has enough balance
- Ensure destination address is valid
- Check Yellow Card API status

**Hosting Africa storage errors**
- Verify bucket exists and permissions correct
- Check encryption key matches
- Verify region configuration
- Check available storage quota

### Support Contacts
- **Paynow**: support@paynow.co.zw
- **Yellow Card**: support@yellowcard.io
- **Hosting Africa**: support@hostingafrica.com
- **Celo**: support@celo.org

## Success Metrics

Target KPIs for MVP launch:
- [ ] 90%+ payment success rate
- [ ] < 30s payment approval time
- [ ] < 5s quote latency
- [ ] < 2min swap execution
- [ ] 99.9% uptime
- [ ] 100% data encryption compliance
- [ ] 0 data residency violations
