const env = {
  adminPassword: process.env.ADMIN_PASSWORD ?? "admin1234",
  sessionSecret:
    process.env.SESSION_SECRET ?? process.env.ADMIN_PASSWORD ?? "ncstore-dev-secret",
  googleServiceAccountEmail: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
  googlePrivateKey: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
  googleSpreadsheetId: process.env.GOOGLE_SHEETS_SPREADSHEET_ID,
  googleSheetsApiKey: process.env.GOOGLE_SHEETS_API_KEY,
  defaultMemberPin: process.env.DEFAULT_MEMBER_PIN ?? "0000",
  publicAppName: process.env.NEXT_PUBLIC_APP_NAME ?? "NCS Snack Kiosk",
  publicAppUrl: process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
  solapiApiKey: process.env.SOLAPI_API_KEY,
  solapiApiSecret: process.env.SOLAPI_API_SECRET,
  solapiSender: process.env.SOLAPI_SENDER,
};

export function getEnv() {
  return env;
}

export function hasGoogleSheetsConfig() {
  return Boolean(
    env.googleSpreadsheetId &&
      ((env.googleServiceAccountEmail && env.googlePrivateKey) || env.googleSheetsApiKey),
  );
}

export function hasGoogleSheetsWriteConfig() {
  return Boolean(env.googleServiceAccountEmail && env.googlePrivateKey && env.googleSpreadsheetId);
}

export function hasSolapiConfig() {
  return Boolean(env.solapiApiKey && env.solapiApiSecret && env.solapiSender);
}
