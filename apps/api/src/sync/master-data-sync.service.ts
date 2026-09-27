import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { google, sheets_v4 } from 'googleapis';
import { PrismaService } from '../prisma.service';
import { startOfDayInJakarta, toJakartaDateString } from '../common/timezone';

const MASTER_SPREADSHEET_ID = '1tsH9kWkpctBcobBybDc5xJMZrJnAAQ2zvQLpheXCgpA';
const MASTER_SHEET = 'RESUME HARIAN';
const PROGRESS_SHEET_NAME = 'PROGRES VERIFIKASI';
export const PROGRESS_DATA_START_ROW = 1;
const FIRST_DATA_ROW = 465;

export type ProgressVerificationRowInput = {
  documentType?: string;
  applicationName?: string;
  owner?: string;
  status?: string;
  pass?: number;
  needToFix?: number;
  waitingForReview?: number;
  uncheck?: number;
  checkingTotal?: number;
  pendingVerification?: number;
  totalMeetings?: number;
  lastVerifier?: string;
  primaryVerificator?: string;
  firstMeeting?: string;
  lastMeeting?: string;
  daysSinceLastMeeting?: number;
  area?: string;
};

export function buildProgressVerificationHeader(): string[] {
  return [
    'No',
    'Nama Aplikasi',
    'Jenis Verifikasi',
    'Pertemuan Pertama',
    'Tanggal Terakhir Pertemuan',
    'Selisih Hari ini dengan pertemuan terakhir',
    'Status',
    'Pass',
    'Need to Fix',
    'Waiting for Review',
    'Uncheck',
    'Total Pengecekan',
    'Verifikasi Tertahan',
    'Total Pertemuan',
    'Verifikator Terakhir',
    'Verifikator Utama',
    'Bidang / Sub Bidang',
  ];
}

export function normalizeSpreadsheetDate(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;

  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;

  const usDate = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!usDate) return null;

  const month = usDate[1];
  const day = usDate[2];
  const year = usDate[3];
  if (!month || !day || !year) return null;

  const parsed = new Date(`${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString().slice(0, 10) : null;
}

export function formatSheetDate(value: string | null | undefined): string {
  const normalized = normalizeSpreadsheetDate(value);
  if (!normalized) return '';
  const [year, month, day] = normalized.split('-');
  return `${month}/${day}/${year}`;
}

export function normalizePercentForSheet(value: number | string | null | undefined): number {
  const numericValue = Number(value ?? 0);
  if (!Number.isFinite(numericValue)) return 0;
  return numericValue > 1 ? numericValue / 100 : numericValue;
}

export function buildProgressVerificationSheet(rows: ProgressVerificationRowInput[]) {
  return rows.map((row, index) => [
    index + 1,
    row.applicationName ?? '',
    row.documentType ?? 'WEB_CHECKLIST',
    formatSheetDate(row.firstMeeting ?? ''),
    formatSheetDate(row.lastMeeting ?? ''),
    row.daysSinceLastMeeting ?? '',
    row.status ?? '',
    normalizePercentForSheet(row.pass ?? 0),
    normalizePercentForSheet(row.needToFix ?? 0),
    normalizePercentForSheet(row.waitingForReview ?? 0),
    normalizePercentForSheet(row.uncheck ?? 0),
    normalizePercentForSheet(row.checkingTotal ?? 0),
    normalizePercentForSheet(row.pendingVerification ?? 0),
    '',
    row.lastVerifier ?? '',
    row.primaryVerificator ?? '',
    row.area ?? row.owner ?? '',
  ]);
}

export function getLatestDateFromColumnB(rows: unknown[][]): string | null {
  const dates = rows
    .map((row) => normalizeSpreadsheetDate(String(row?.[1] ?? '')))
    .filter((value): value is string => Boolean(value))
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));

  return dates.length > 0 ? dates[dates.length - 1] ?? null : null;
}

@Injectable()
export class MasterDataSyncService {
  constructor(private readonly prisma: PrismaService) {}

  async syncDailyResume(onProgress?: (progress: number, message: string) => void) {
    onProgress?.(10, 'Loading application and meeting data.');
    const sheets = this.getSheetsClient();
    if (!sheets) throw new ServiceUnavailableException('Google Sheets write access is not configured.');

    const applications = await this.prisma.application.findMany({
      orderBy: { name: 'asc' },
      include: {
        meetingSchedules: {
          orderBy: { startAt: 'asc' },
          select: {
            startAt: true,
            status: true,
            verificator: { select: { firstName: true, lastName: true, email: true } },
          },
        },
      },
    });

    const verificationDocumentType = (application: (typeof applications)[number]) => {
      const documents = Array.isArray(application.verificationDocuments)
        ? (application.verificationDocuments as Array<{ type?: string | null }>)
        : [];
      const primaryDocument = documents.find((document) => typeof document?.type === 'string' && document.type.trim().length > 0) ?? documents[0];
      return String(primaryDocument?.type ?? 'WEB_CHECKLIST');
    };
    const firstNameOnly = (user?: { firstName?: string | null; email?: string | null }) => (user?.firstName ?? '').trim() || user?.email || '';

    const progressRows = applications.map((application) => {
      const rawProgress = (application.verificationProgress ?? {}) as Record<string, unknown>;
      const meetings = application.meetingSchedules ?? [];
      const meetingDates = meetings.map((meeting) => new Date(meeting.startAt).getTime()).filter((value) => Number.isFinite(value));
      const firstMeeting = application.projectStartDate ? application.projectStartDate : meetingDates.length ? toJakartaDateString(new Date(Math.min(...meetingDates))) : '';
      const lastMeeting = meetingDates.length ? toJakartaDateString(new Date(Math.max(...meetingDates))) : '';
      const lastKnownDate = lastMeeting ? new Date(`${lastMeeting}T00:00:00Z`) : null;
      const daysSinceLastMeeting = lastKnownDate ? Math.max(0, Math.floor((Date.now() - lastKnownDate.getTime()) / 86400000)) : 0;
      const latestMeeting = meetings.length > 0 ? meetings[meetings.length - 1] : undefined;
      const primaryVerificator = latestMeeting?.verificator ? firstNameOnly(latestMeeting.verificator) : '';
      const totalPoints = Number(rawProgress.totalPoints ?? 0);
      const passPoints = Number(rawProgress.passPoints ?? 0);
      const needToFixPoints = Number(rawProgress.needToFixPoints ?? 0);
      const waitingForReviewPoints = Number(rawProgress.waitingForReviewPoints ?? rawProgress.waitingPoints ?? 0);
      const uncheckPoints = Number(rawProgress.uncheckPoints ?? 0);
      const percentFromPoints = (points: number) => (totalPoints > 0 ? (points / totalPoints) * 100 : points);
      const pass = Number(rawProgress.percent ?? percentFromPoints(passPoints));
      const needToFix = Number(rawProgress.needToFixPercent ?? percentFromPoints(needToFixPoints));
      const waitingForReview = Number(rawProgress.waitingForReviewPercent ?? percentFromPoints(waitingForReviewPoints));
      const uncheck = Number(rawProgress.uncheckPercent ?? percentFromPoints(uncheckPoints));
      const checkingTotal = Number(rawProgress.checkingPercent ?? (totalPoints > 0 ? ((totalPoints - uncheckPoints) / totalPoints) * 100 : (pass + needToFix + waitingForReview + uncheck) || 0));
      const pendingVerification = Number(rawProgress.pendingVerificationPercent ?? (totalPoints > 0 ? ((uncheckPoints + waitingForReviewPoints) / totalPoints) * 100 : 0));

      return {
        documentType: verificationDocumentType(application),
        applicationName: application.name,
        owner: application.owner,
        status: String(application.status ?? rawProgress.status ?? 'NOT_STARTED'),
        pass,
        needToFix,
        waitingForReview,
        uncheck,
        checkingTotal,
        pendingVerification,
        lastVerifier: application.lastVerifier ?? '',
        primaryVerificator,
        firstMeeting,
        lastMeeting,
        daysSinceLastMeeting,
        area: application.owner ?? application.organization ?? '',
      };
    });

    const progressHeader = buildProgressVerificationHeader();
    await this.ensureSheetExists(sheets, PROGRESS_SHEET_NAME);
    const existingProgressResponse = await sheets.spreadsheets.values.get({
      spreadsheetId: MASTER_SPREADSHEET_ID,
      range: `'${PROGRESS_SHEET_NAME}'!A2:Z`,
      majorDimension: 'ROWS',
    });
    const existingProgressRows = existingProgressResponse.data.values ?? [];
    const appKeysInDatabase = new Set(
      applications.flatMap((application) => {
        const documents = Array.isArray(application.verificationDocuments)
          ? (application.verificationDocuments as Array<{ type?: string | null }>)
          : [];
        const types = documents
          .map((document) => String(document?.type ?? '').trim())
          .filter(Boolean);
        const candidateTypes = types.length > 0 ? types : ['WEB_CHECKLIST'];
        const appName = String(application.name ?? '').trim();
        return candidateTypes.map((documentType) => `${appName.toLowerCase()}|${documentType.toLowerCase()}`);
      }).filter(Boolean),
    );

    const preservedLegacyRows: unknown[][] = [];
    const mergedProgressRows = new Map<string, unknown[]>();

    for (const row of existingProgressRows) {
      const appName = String(row?.[1] ?? '').trim();
      const documentType = String(row?.[2] ?? '').trim();
      const key = `${appName.toLowerCase()}|${documentType.toLowerCase()}`;
      if (!appName || !documentType || !appKeysInDatabase.has(key)) {
        if (appName) preservedLegacyRows.push(row as unknown[]);
        continue;
      }
      mergedProgressRows.set(key, row as unknown[]);
    }

    for (const row of buildProgressVerificationSheet(progressRows)) {
      const appName = String(row[1] ?? '').trim();
      const documentType = String(row[2] ?? '').trim();
      const key = `${appName.toLowerCase()}|${documentType.toLowerCase()}`;
      if (!appName || !documentType) continue;
      mergedProgressRows.set(key, row as unknown[]);
    }

    const finalProgressRows = [...Array.from(mergedProgressRows.values()), ...preservedLegacyRows];
    const leftColumns = finalProgressRows.map((row) => (row as unknown[]).slice(0, 13));
    const rightColumns = finalProgressRows.map((row) => (row as unknown[]).slice(14));
    const headerLeft = progressHeader.slice(0, 13);
    const headerRight = progressHeader.slice(14);

    await sheets.spreadsheets.values.update({
      spreadsheetId: MASTER_SPREADSHEET_ID,
      range: `'${PROGRESS_SHEET_NAME}'!A${PROGRESS_DATA_START_ROW}:M${Math.max(PROGRESS_DATA_START_ROW, finalProgressRows.length + 1)}`,
      valueInputOption: 'USER_ENTERED',
      requestBody: { majorDimension: 'ROWS', values: [headerLeft, ...leftColumns] },
    });
    await sheets.spreadsheets.values.update({
      spreadsheetId: MASTER_SPREADSHEET_ID,
      range: `'${PROGRESS_SHEET_NAME}'!O${PROGRESS_DATA_START_ROW}:Q${Math.max(PROGRESS_DATA_START_ROW, finalProgressRows.length + 1)}`,
      valueInputOption: 'USER_ENTERED',
      requestBody: { majorDimension: 'ROWS', values: [headerRight, ...rightColumns] },
    });

    const meetings = await this.prisma.meetingSchedule.findMany({
      where: { status: 'FINISHED' },
      orderBy: [{ startAt: 'asc' }, { id: 'asc' }],
      include: {
        application: { select: { name: true } },
        verificator: { select: { firstName: true, lastName: true, email: true } },
        results: { where: { phase: { in: ['START', 'FINISH'] } }, orderBy: { capturedAt: 'asc' } },
      },
    });
    onProgress?.(35, `Loaded ${meetings.length} finished meeting(s).`);

    const existingResponse = await sheets.spreadsheets.values.get({
      spreadsheetId: MASTER_SPREADSHEET_ID,
      range: `'${MASTER_SHEET}'!A${FIRST_DATA_ROW}:H`,
      majorDimension: 'ROWS',
    });
    const existingRows = existingResponse.data.values ?? [];
    onProgress?.(55, 'Comparing existing master data rows.');
    const sheetMaxDate = getLatestDateFromColumnB(existingRows);
    const hasSheetCoverage = sheetMaxDate ? await this.hasDatabaseCoverageForDate(sheetMaxDate) : true;
    const existingKeys = new Set(existingRows.map((row) => this.rowKey(row)).filter(Boolean));
    const lastFilledRow = existingRows.reduce((lastRow, row, index) => row.some((cell) => String(cell ?? '').trim() !== '') ? FIRST_DATA_ROW + index : lastRow, FIRST_DATA_ROW - 1);
    let nextRow = Math.max(FIRST_DATA_ROW, lastFilledRow + 1);
    let skippedExisting = 0;
    const rows = meetings.flatMap((meeting) => {
      const start = meeting.results.find((result) => result.phase === 'START');
      const finish = meeting.results.find((result) => result.phase === 'FINISH');
      if (!start || !finish) return [];
      const meetingDate = toJakartaDateString(meeting.startAt);
      if (sheetMaxDate && meetingDate <= sheetMaxDate) {
        return [];
      }
      if (sheetMaxDate && !hasSheetCoverage && meetingDate > sheetMaxDate) {
        return [];
      }
      const verifier = firstNameOnly(meeting.verificator);
      const row = [
        nextRow,
        formatSheetDate(meetingDate),
        verifier,
        meeting.application.name,
        Number(normalizePercentForSheet(start.progressPercent ?? 0)),
        Number(normalizePercentForSheet(finish.progressPercent ?? 0)),
        '',
        meeting.meetingNotes ?? '',
      ];
      if (existingKeys.has(this.rowKey(row))) {
        skippedExisting += 1;
        return [];
      }
      existingKeys.add(this.rowKey(row));
      nextRow += 1;
      return [row];
    });

    if (rows.length) {
      onProgress?.(80, `Writing ${rows.length} new master data row(s).`);
      await sheets.spreadsheets.values.update({
        spreadsheetId: MASTER_SPREADSHEET_ID,
        range: `'${MASTER_SHEET}'!A${nextRow - rows.length}:H${nextRow - 1}`,
        valueInputOption: 'USER_ENTERED',
        requestBody: { majorDimension: 'ROWS', values: rows },
      });
    }
    onProgress?.(100, 'Master data synchronization completed.');
    return { sheet: PROGRESS_SHEET_NAME, startRow: 1, rowsWritten: progressRows.length, skippedExisting, skippedIncomplete: meetings.length - rows.length - skippedExisting };
  }

  private async ensureSheetExists(sheets: sheets_v4.Sheets, sheetName: string) {
    const response = await sheets.spreadsheets.get({
      spreadsheetId: MASTER_SPREADSHEET_ID,
      fields: 'sheets/properties/title',
    });
    const exists = response.data.sheets?.some((sheet) => sheet.properties?.title === sheetName);
    if (exists) return;
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: MASTER_SPREADSHEET_ID,
      requestBody: { requests: [{ addSheet: { properties: { title: sheetName } } }] },
    });
  }

  private async hasDatabaseCoverageForDate(date: string): Promise<boolean> {
    const targetDate = startOfDayInJakarta(new Date(`${date}T00:00:00Z`));
    if (!Number.isFinite(targetDate.getTime())) return true;

    const sameDayRow = await this.prisma.meetingSchedule.findFirst({
      where: {
        status: 'FINISHED',
        startAt: {
          gte: targetDate,
          lt: new Date(targetDate.getTime() + 24 * 60 * 60 * 1000),
        },
      },
      select: { id: true },
    });

    return Boolean(sameDayRow);
  }

  private rowKey(row: unknown[]): string {
    const normalize = (value: unknown, numeric = false) => {
      const text = String(value ?? '').replace(/\r\n/g, '\n').trim().toLowerCase();
      if (!numeric) return text;
      const number = Number(text.replace(',', '.'));
      return Number.isFinite(number) ? number.toFixed(2) : text;
    };
    return [normalize(row[1]), normalize(row[2]), normalize(row[3]), normalize(row[4], true), normalize(row[5], true)].join('|');
  }

  private getSheetsClient(): sheets_v4.Sheets | undefined {
    const jsonCredentials = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
    const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
    const privateKey = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY?.replace(/\\n/g, '\n');
    if (!jsonCredentials && (!email || !privateKey)) return undefined;
    const credentials = jsonCredentials ? JSON.parse(jsonCredentials) : { client_email: email, private_key: privateKey };
    const auth = new google.auth.GoogleAuth({ credentials, scopes: ['https://www.googleapis.com/auth/spreadsheets'] });
    return google.sheets({ version: 'v4', auth });
  }
}