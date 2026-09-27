import { buildProgressVerificationHeader, buildProgressVerificationSheet, formatSheetDate, getLatestDateFromColumnB, normalizePercentForSheet, normalizeSpreadsheetDate, PROGRESS_DATA_START_ROW } from './master-data-sync.service';

describe('MasterDataSyncService', () => {
  it('builds the required PROGRES VERIFIKASI header in the requested column order', () => {
    expect(buildProgressVerificationHeader()).toEqual([
      'NO',
      'APPLICATION',
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
      'Verifikator Terakhir',
      'Verifikator Utama',
      'Bidang / Sub Bidang',
    ]);
  });

  it('keeps a single row per application and document type in the generated sheet data', () => {
    const rows = buildProgressVerificationSheet([
      { documentType: 'WEB_CHECKLIST', applicationName: 'Portal', owner: 'Ops', status: 'ACTIVE', pass: 72.83, needToFix: 8.21, waitingForReview: 5.12, uncheck: 13.84, checkingTotal: 86.34, pendingVerification: 7.45, totalMeetings: 4, lastVerifier: 'Jane', primaryVerificator: 'Bob', firstMeeting: '2026-01-01', lastMeeting: '2026-01-10' },
      { documentType: 'WEB_CHECKLIST', applicationName: 'Portal', owner: 'Ops', status: 'ACTIVE', pass: 72.83, needToFix: 8.21, waitingForReview: 5.12, uncheck: 13.84, checkingTotal: 86.34, pendingVerification: 7.45, totalMeetings: 4, lastVerifier: 'Jane', primaryVerificator: 'Bob', firstMeeting: '2026-01-01', lastMeeting: '2026-01-10' },
      { documentType: 'MOBILE_CHECKLIST', applicationName: 'Portal', owner: 'Ops', status: 'ACTIVE', pass: 66, needToFix: 9, waitingForReview: 5, uncheck: 20, checkingTotal: 80, pendingVerification: 10, totalMeetings: 5, lastVerifier: 'Jill', primaryVerificator: 'Brett', firstMeeting: '2026-02-01', lastMeeting: '2026-02-18' },
    ]) as Array<Array<number | string>>;

    expect(rows).toHaveLength(3);
    expect(rows[0]?.[0]).toBe(1);
    expect(rows[0]?.[1]).toBe('Portal');
    expect(rows[0]?.[2]).toBe('WEB_CHECKLIST');
    expect(rows[0]?.[3]).toBe('01/01/2026');
    expect(rows[0]?.[7]).toBe(72.83);
    expect(rows[0]?.[11]).toBe(86.34);
    expect(rows[0]?.[16]).toBe('Ops');
    expect(rows[2]?.[2]).toBe('MOBILE_CHECKLIST');
  });

  it('reads MM/DD/YYYY dates and stores percentage values as decimal ratios for Excel percentage cells', () => {
    expect(PROGRESS_DATA_START_ROW).toBe(1);
    expect(getLatestDateFromColumnB([
      ['', '09/22/2026', 'x'],
      ['', '09/26/2026', 'y'],
      ['', '09/24/2026', 'z'],
    ])).toBe('2026-09-26');
    expect(normalizeSpreadsheetDate('09/26/2026')).toBe('2026-09-26');
    expect(formatSheetDate('2026-09-26')).toBe('09/26/2026');
    expect(normalizePercentForSheet(92.9)).toBe(0.929);
    expect(normalizePercentForSheet(0.929)).toBe(0.929);
    expect(normalizePercentForSheet(51)).toBe(0.51);
    expect(normalizePercentForSheet(0.51)).toBe(0.51);
  });
});
