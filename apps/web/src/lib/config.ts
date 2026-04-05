/**
 * ZimStable Environment Configuration
 * Centralized configuration for all integrations
 */

export interface IntegrationConfig {
  paynow: {
    integrationId: string;
    integrationKey: string;
    resultUrl: string;
    returnUrl: string;
  };
  yellowcard: {
    apiKey: string;
    apiUrl: string;
  };
  hostingafrica: {
    apiKey: string;
    apiUrl: string;
    region: 'za' | 'zim' | 'ng' | 'ke';
  };
  celo: {
    rpcUrl: string;
    network: string;
  };
  app: {
    url: string;
    environment: 'development' | 'staging' | 'production';
  };
}

/**
 * Load configuration from environment variables
 * Falls back to safe defaults in development
 */
export function getConfig(): IntegrationConfig {
  return {
    paynow: {
      integrationId: process.env.PAYNOW_INTEGRATION_ID || '',
      integrationKey: process.env.PAYNOW_INTEGRATION_KEY || '',
      resultUrl: process.env.PAYNOW_RESULT_URL || 'http://20.227.141.208:3000/api/paynow/update',
      returnUrl: process.env.PAYNOW_RETURN_URL || 'http://20.227.141.208:3000/success',
    },
    yellowcard: {
      apiKey: process.env.YELLOWCARD_API_KEY || '',
      apiUrl: process.env.YELLOWCARD_API_URL || 'https://api.yellowcard.io/v2',
    },
    hostingafrica: {
      apiKey: process.env.HOSTING_AFRICA_API_KEY || '',
      apiUrl: process.env.HOSTING_AFRICA_API_URL || 'https://api.hostingafrica.com/v1',
      region: (process.env.HOSTING_AFRICA_REGION as any) || 'zim',
    },
    celo: {
      rpcUrl: process.env.NEXT_PUBLIC_CELO_RPC_URL || 'https://alfajores-forno.celo-testnet.org',
      network: process.env.NEXT_PUBLIC_CELO_NETWORK || 'celo-sepolia',
    },
    app: {
      url: process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000',
      environment: (process.env.NEXT_PUBLIC_APP_ENVIRONMENT as any) || 'development',
    },
  };
}

/**
 * Validate that all required environment variables are set
 */
export function validateConfig(): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];
  const config = getConfig();

  if (!config.paynow.integrationKey && config.app.environment === 'production') {
    errors.push('PAYNOW_INTEGRATION_KEY is required in production');
  }

  if (!config.yellowcard.apiKey && config.app.environment === 'production') {
    errors.push('YELLOWCARD_API_KEY is required in production');
  }

  if (!config.hostingafrica.apiKey && config.app.environment === 'production') {
    errors.push('HOSTING_AFRICA_API_KEY is required in production');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Log configuration status (secrets masked)
 */
export function logConfigStatus(): void {
  const config = getConfig();
  const validation = validateConfig();

  console.log('[Config] ZimStable Integration Status:', {
    paynow: !!config.paynow.integrationKey,
    yellowcard: !!config.yellowcard.apiKey,
    hostingafrica: !!config.hostingafrica.apiKey,
    environment: config.app.environment,
    appUrl: config.app.url,
    valid: validation.valid,
    errors: validation.errors,
  });
}
