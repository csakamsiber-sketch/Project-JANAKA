# JAMUS-KALIMASADA-Project

## Restricted Google Sheets

The API can read private verification spreadsheets with a Google service account.

1. In Google Cloud Console, enable the Google Sheets API and create a service account.
2. Copy the service account email and private key into `apps/api/.env` using `apps/api/.env.example` as a template.
3. Share each verification spreadsheet with the service account email as **Viewer**.
4. Start the API with `npm start` and use the spreadsheet URL in the application form.

The service account is used only by the backend. The browser never receives the private key. Without these credentials, public Google Sheets continue to use the existing GViz fallback.