declare namespace NodeJS {
  interface ProcessEnv {
    // Paynow
    PAYNOW_INTEGRATION_ID?: string;
    PAYNOW_INTEGRATION_KEY?: string;
    PAYNOW_MERCHANT_EMAIL?: string;
    PAYNOW_API_URL?: string;
    PAYNOW_STATUS_URL?: string;
    PAYNOW_RESULT_URL?: string;
    PAYNOW_RETURN_URL?: string;

    // Yellow Card
    YELLOWCARD_API_KEY?: string;
    YELLOWCARD_API_URL?: string;

    // Hosting Africa
    HOSTING_AFRICA_API_KEY?: string;
    HOSTING_AFRICA_API_URL?: string;
    HOSTING_AFRICA_REGION?: string;

    // Celo / Blockchain
    NEXT_PUBLIC_CELO_RPC_URL?: string;
    NEXT_PUBLIC_CELO_NETWORK?: string;
    NEXT_PUBLIC_WC_PROJECT_ID?: string;

    // App
    NEXT_PUBLIC_APP_URL?: string;
    NEXT_PUBLIC_APP_ENVIRONMENT?: string;
  }
}
