'use client';

import { useEffect, useState } from 'react';
import { jsPDF } from 'jspdf';
import { apiRequest, notifyGlobalError } from '../../lib/api-client';
import { AppShell } from '../../components/app-shell';

const PAGE_SIZE = 8;

const defaultForm = {
  name: '',
  description: '',
  environment: 'PRODUCTION',
  languageFrontend: '-',
  languageBackend: '-',
  frameworkFrontend: '-',
  frameworkBackend: '-',
  projectStartDate: '',
  owner: 'Security Ops',
  picId: '',
  picName: '',
  frontendUrl: '-',
  backendUrl: '-',
  dependenciesText: '',
  verificationType: 'WEB_CHECKLIST',
  verificationLabel: 'Web application verification',
  verificationUrl: '',
  lastVerificationDate: '',
  lastVerifier: '',
};

type LibrarySource = string;
type LibraryItem = { name: string; version: string; ecosystem?: string; source: LibrarySource; layer?: 'frontend' | 'backend' };
type DependencyFile = { id: string; name: string; content: string; layer: 'frontend' | 'backend' };
type LibraryDetectionState = { status: 'idle' | 'detecting' | 'detected' | 'none' | 'error'; message?: string };

type ApplicationRecord = {
  id: string;
  name: string;
  description?: string;
  organization?: string;
  language?: string;
  framework?: string;
  languageFrontend?: string;
  languageBackend?: string;
  frameworkFrontend?: string;
  frameworkBackend?: string;
  technologyStack?: string[];
  libraries?: LibraryItem[];
  projectStartDate?: string;
  owner?: string;
  picId?: string;
  picName?: string;
  frontendUrl?: string;
  backendUrl?: string;
  lastVerificationDate?: string;
  lastVerifier?: string;
  spreadsheetLinks?: Array<{ type: string; label: string; url: string }>;
  verificationDocuments?: Array<{ type: string; label: string; url: string; progress?: { percent?: number; totalPoints?: number; passPoints?: number; needToFixPoints?: number; uncheckPoints?: number; waitingForReviewPoints?: number; checkingPercent?: number; pendingVerificationPercent?: number; lastUpdated?: string; lastVerificationDate?: string; lastVerifier?: string; notes?: string } }>;
  verificationProgress?: { percent?: number; status?: string; totalPoints?: number; passPoints?: number; needToFixPoints?: number; uncheckPoints?: number; waitingForReviewPoints?: number; checkingPercent?: number; pendingVerificationPercent?: number; lastUpdated?: string; lastVerificationDate?: string; lastVerifier?: string; notes?: string };
};
type MeetingResult = { id: string; meeting: { id: string; startAt: string; endAt: string; status: string }; phase: string; capturedAt: string; progressPercent: number };

type PicUser = { id: string; email: string; firstName?: string; lastName?: string; role?: string };
type SortKey = 'name' | 'progress' | 'pending' | 'lastVerification';
type SortDirection = 'asc' | 'desc' | null;

type SpreadsheetData = {
  applicationName?: string;
  owner?: string;
  frontendUrl?: string;
  backendUrl?: string;
  projectStartDate?: string;
  lastVerificationDate?: string;
  lastVerifier?: string;
  description?: string;
  picName?: string;
  languageFrontend?: string;
  frameworkFrontend?: string;
  languageBackend?: string;
  frameworkBackend?: string;
};

const compatibleFrameworks: Record<string, string[]> = {
  TypeScript: ['Next.js', 'React', 'Vite', 'NestJS', 'Express', 'Angular', 'Vue'],
  JavaScript: ['Next.js', 'React', 'Vite', 'Express', 'Angular', 'Vue'],
  Go: ['Gin', 'Fiber'],
  Java: ['Spring Boot', 'Quarkus'],
  'C#': ['ASP.NET Core'],
  Python: ['Django', 'FastAPI'],
  PHP: ['Laravel'],
  Ruby: ['Rails'],
  Kotlin: ['Spring Boot'],
  Swift: ['Vapor'],
};

function formatProgressValue(value: number | undefined) {
  const numericValue = Number(value ?? 0);
  const percentage = numericValue >= 0 && numericValue <= 1 ? numericValue * 100 : numericValue;
  return `${percentage.toFixed(2)}%`;
}

function formatStatusPercent(value: number | undefined, total: number) {
  return formatProgressValue(total > 0 ? (Number(value ?? 0) / total) * 100 : 0);
}

function daysSince(value: string | undefined) {
  if (!value) return undefined;
  const normalized = value.match(/^(\d{1,2})[-/]?(\d{1,2})[-/]?(\d{4})$/);
  const [, month = '', day = '', year = ''] = normalized ?? [];
  const dateValue = normalized ? `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}` : value.slice(0, 10);
  const date = new Date(`${dateValue}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return undefined;
  return Math.max(0, Math.floor((Date.now() - date.getTime()) / 86400000));
}

function formatAge(days: number | undefined) {
  if (days === undefined) return 'Not recorded';
  if (days === 0) return 'Today';
  if (days === 1) return '1 day';
  return `${days} days`;
}

function sortMarker(active: boolean, direction: SortDirection) {
  if (!active || !direction) return null;
  return <span className="ml-1 text-cyan-300">{direction === 'asc' ? '↑' : '↓'}</span>;
}

function percentageTone(value: number, favorable: boolean) {
  const good = favorable ? value >= 80 : value <= 20;
  const caution = favorable ? value >= 50 : value <= 50;
  return good ? 'bg-emerald-300' : caution ? 'bg-amber-300' : 'bg-rose-300';
}

function percentageTextTone(value: number, favorable: boolean) {
  const good = favorable ? value >= 80 : value <= 20;
  const caution = favorable ? value >= 50 : value <= 50;
  return good ? 'text-emerald-200' : caution ? 'text-amber-200' : 'text-rose-200';
}

function progressBarWidth(value: number) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return 0;
  return Math.min(100, numeric);
}

function getCompatibleFrameworkOptions(language: string, frameworks: string[]) {
  if (language === '-') return ['-'];
  const options = compatibleFrameworks[language];
  if (!options) return ['-', ...frameworks];
  return ['-', ...options.filter((framework) => frameworks.length === 0 || frameworks.includes(framework))];
}

function formatTechnologyLabel(value: string) {
  return value
    .replace(/\.js$/i, ' JS')
    .replace(/\.net\s*core$/i, ' .NET Core')
    .replace(/\bNestJS\b/g, 'Nest JS')
    .replace(/\bASP\.NET\b/g, 'ASP.NET');
}

function libraryFromEntry(name: string, version: unknown, source: LibrarySource): LibraryItem | undefined {
  const normalizedName = name.trim().replace(/^['"]|['"]$/g, '');
  const normalizedVersion = String(version ?? '').replace(/^[=~^><*\s]+/, '').trim();
  if (!normalizedName || normalizedName.startsWith('#') || !normalizedVersion) return undefined;
  return { name: normalizedName, version: normalizedVersion, source };
}

function parseYamlLockfile(fileText: string, source: 'pnpm-lock.yaml' | 'bun.lock'): LibraryItem[] {
  const items: LibraryItem[] = [];
  const lines = fileText.split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? '';
    const packageLine = line.match(/^\s{2,}(?:['"])?\/?((?:@[^@/'"]+\/)?[^@:'"\s]+)@([^:'"\s(]+)(?:['"])?\s*:/);
    if (!packageLine) continue;
    const item = libraryFromEntry(packageLine[1] ?? '', packageLine[2] ?? '', source);
    if (item) items.push(item);
  }
  return items;
}

function parseYarnLock(fileText: string): LibraryItem[] {
  const items: LibraryItem[] = [];
  const lines = fileText.split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? '';
    const selector = line.match(/^(?:"?)((?:@[^@/]+\/)?[^@" ]+)@[^:]+(?:"?)\s*:/);
    if (!selector) continue;
    const version = lines.slice(index + 1, index + 5).map((line) => line.match(/^\s+version\s+["']([^"']+)["']/)?.[1]).find(Boolean);
    const item = libraryFromEntry((selector[1] ?? '').replace(/^npm:/, ''), version, 'yarn.lock');
    if (item) items.push(item);
  }
  return items;
}

function parsePackageFileText(fileText: string, fileName: string): LibraryItem[] {
  try {
    const normalizedName = fileName.toLowerCase();
    if (normalizedName === 'yarn.lock') return mergeLibraryItems(parseYarnLock(fileText));
    if (normalizedName === 'pnpm-lock.yaml') return mergeLibraryItems(parseYamlLockfile(fileText, 'pnpm-lock.yaml'));
    if (normalizedName === 'bun.lock') {
      try {
        const parsed = JSON.parse(fileText) as { packages?: Record<string, unknown> };
        const items = Object.entries(parsed.packages ?? {}).map(([name, value]) => libraryFromEntry(name, Array.isArray(value) ? value[0] : value, 'bun.lock')).filter((item): item is LibraryItem => Boolean(item));
        if (items.length > 0) return mergeLibraryItems(items);
      } catch {
        return mergeLibraryItems(parseYamlLockfile(fileText, 'bun.lock'));
      }
    }
    const parsed = JSON.parse(fileText) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
      packages?: Record<string, { name?: string; version?: string }>;
    };

    if (/^package-lock(?:-.+)?\.json$/.test(normalizedName)) {
      const packageEntries = Object.entries(parsed.packages ?? {})
        .filter(([path, packageInfo]) => path !== '' && Boolean(packageInfo?.version))
        .map(([path, packageInfo]): LibraryItem => ({
          name: packageInfo.name ?? path.split('node_modules/').pop() ?? path,
          version: packageInfo.version ?? 'unknown',
          source: 'package-lock.json',
        }));

      return Array.from(new Map(packageEntries.map((item) => [item.name, item])).values());
    }

    const dependencies = { ...(parsed.dependencies ?? {}), ...(parsed.devDependencies ?? {}) };
    return Object.entries(dependencies).map(([name, version]) => libraryFromEntry(name, version, 'package.json')).filter((item): item is LibraryItem => Boolean(item));
  } catch {
    return [];
  }
}

function mergeLibraryItems(items: LibraryItem[]) {
  return Array.from(new Map(items.map((item) => [`${item.layer ?? 'backend'}:${item.name}@${item.version}`, item])).values());
}

async function fetchPage(page: number, search = '', sort?: { key: SortKey; direction: SortDirection }) {
  const params = new URLSearchParams({ page: String(page) });
  if (search.trim()) params.set('search', search.trim());
  if (sort?.direction) {
    params.set('sortBy', sort.key);
    params.set('sortOrder', sort.direction);
  }
  return apiRequest<{ items: ApplicationRecord[]; page: number; limit: number; totalPages: number; total: number }>(`/applications?${params.toString()}`);
}

async function fetchPicUsers(page: number, limit = 10): Promise<{ items: PicUser[]; page: number; totalPages: number; total: number }> {
  const data = await apiRequest<{ items: PicUser[]; page: number; totalPages: number; total: number }>(`/auth/users?role=PIC&page=${page}&limit=${limit}`);

  return {
    items: Array.isArray(data?.items) ? data.items : [],
    page: Number(data?.page ?? page),
    totalPages: Number(data?.totalPages ?? 1),
    total: Number(data?.total ?? 0),
  };
}

async function fetchMetadata(endpoint: string): Promise<string[]> {
  const payload = await apiRequest<string[]>(endpoint);
  return Array.isArray(payload) ? payload : [];
}

function currentDateValue() {
  return new Date().toISOString().slice(0, 10);
}

export default function ApplicationsPage() {
  const [hydrated, setHydrated] = useState(false);
  const [page, setPage] = useState(1);
  const [applications, setApplications] = useState<{ items: ApplicationRecord[]; page: number; totalPages: number; total: number }>({
    items: [],
    page: 1,
    totalPages: 1,
    total: 0,
  });
  const [selectedApp, setSelectedApp] = useState<ApplicationRecord | null>(null);
  const [meetingResults, setMeetingResults] = useState<MeetingResult[]>([]);
  const [meetingProgressOpen, setMeetingProgressOpen] = useState(false);
  const [hoveredMeetingId, setHoveredMeetingId] = useState<string | null>(null);
  const [techStackOpen, setTechStackOpen] = useState(false);
  const [selectedLoading, setSelectedLoading] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [currentUserRole, setCurrentUserRole] = useState<string | undefined>();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [showDeletePassword, setShowDeletePassword] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<{ key: SortKey; direction: SortDirection }>({ key: 'name', direction: null });
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(defaultForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [picUsers, setPicUsers] = useState<PicUser[]>([]);
  const [picPage, setPicPage] = useState(1);
  const [picTotalPages, setPicTotalPages] = useState(1);
  const [languages, setLanguages] = useState<string[]>([]);
  const [frameworks, setFrameworks] = useState<string[]>([]);
  const [frontendLibraryItems, setFrontendLibraryItems] = useState<LibraryItem[]>([]);
  const [backendLibraryItems, setBackendLibraryItems] = useState<LibraryItem[]>([]);
  const [frontendDependencyFiles, setFrontendDependencyFiles] = useState<DependencyFile[]>([]);
  const [backendDependencyFiles, setBackendDependencyFiles] = useState<DependencyFile[]>([]);
  const [frontendLibraryDetection, setFrontendLibraryDetection] = useState<LibraryDetectionState>({ status: 'idle' });
  const [backendLibraryDetection, setBackendLibraryDetection] = useState<LibraryDetectionState>({ status: 'idle' });
  const [preview, setPreview] = useState<{ values: number[]; source: string; spreadsheetData?: SpreadsheetData; percent?: number; progress?: number; status: string; totalPoints?: number; uncheckPoints?: number; waitingForReviewPoints?: number; checkingPercent?: number; pendingVerificationPercent?: number; error?: string } | null>(null);
  const [previewing, setPreviewing] = useState(false);

  useEffect(() => {
    setHydrated(true);
  }, []);

  async function reloadApplications(targetPage: number) {
    const data = await fetchPage(targetPage, search, sort);
    setApplications({
      items: Array.isArray(data?.items) ? data.items : [],
      page: Number(data?.page ?? targetPage),
      totalPages: Number(data?.totalPages ?? 1),
      total: Number(data?.total ?? 0),
    });
  }

  async function toggleApplicationDetails(application: ApplicationRecord) {
    if (selectedApp?.id === application.id) {
      setDetailsOpen(false);
      window.setTimeout(() => setSelectedApp(null), 500);
      return;
    }

    setSelectedLoading(true);
    setSelectedApp(null);
    try {
      const loadedApplication = await apiRequest<ApplicationRecord>(`/applications/${application.id}`);
      const hasChecklist = loadedApplication?.verificationDocuments?.some((document: { type?: string; url?: string }) => document.type === 'WEB_CHECKLIST' && document.url);
      if (hasChecklist) {
        try {
          setSelectedApp(await apiRequest<ApplicationRecord>(`/applications/${application.id}/verification-progress`));
          setDetailsOpen(true);
          return;
        } catch {
          // Show the stored application when the live spreadsheet is unavailable.
        }
      }
      setSelectedApp(loadedApplication);
      setDetailsOpen(true);
    } catch (detailError) {
      notifyGlobalError(detailError instanceof Error ? detailError.message : 'Unable to load application details.');
    } finally {
      setSelectedLoading(false);
    }
  }

  async function toggleMeetingProgress(applicationId: string) {
    if (meetingProgressOpen) {
      setMeetingProgressOpen(false);
      return;
    }
    try {
      setMeetingResults(await apiRequest<MeetingResult[]>(`/meetings/application/${applicationId}/results`));
      setHoveredMeetingId(null);
      setMeetingProgressOpen(true);
    } catch (progressError) {
      notifyGlobalError(progressError instanceof Error ? progressError.message : 'Unable to load meeting progress.');
    }
  }

  async function downloadApplicationPdf() {
    if (!selectedApp) return;
    try {
      const results = meetingResults.length
        ? meetingResults
        : await apiRequest<MeetingResult[]>(`/meetings/application/${selectedApp.id}/results`);
      const pdf = new jsPDF({ unit: 'pt', format: 'a4', orientation: 'landscape', compress: true });
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const margin = 38;
      const contentWidth = pageWidth - margin * 2;
      let cursorY = margin;

      const paintPage = () => {
        pdf.setFillColor(5, 12, 20);
        pdf.rect(0, 0, pageWidth, pageHeight, 'F');
      };

      const ensureSpace = (height: number) => {
        if (cursorY + height <= pageHeight - margin) return;
        pdf.addPage();
        paintPage();
        cursorY = margin;
      };
      const wrappedLines = (value: string, width = contentWidth) => pdf.splitTextToSize(value || '-', width) as string[];
      const drawText = (value: string, x: number, y: number, width = contentWidth, color: [number, number, number] = [226, 232, 240]) => {
        pdf.setTextColor(...color);
        const lines = wrappedLines(value, width);
        pdf.text(lines, x, y);
        return lines.length * 14;
      };
      const section = (title: string) => {
        ensureSpace(32);
        pdf.setFillColor(9, 25, 38);
        pdf.rect(margin, cursorY - 15, contentWidth, 24, 'F');
        pdf.setTextColor(103, 232, 249);
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(9);
        pdf.text(title.toUpperCase(), margin + 10, cursorY);
        cursorY += 29;
        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(10);
      };
      const grouped = new Map<string, { meeting: MeetingResult['meeting']; start?: MeetingResult; finish?: MeetingResult }>();
      results.forEach((result) => {
        const current = grouped.get(result.meeting.id) ?? { meeting: result.meeting };
        current[result.phase === 'START' ? 'start' : 'finish'] = result;
        grouped.set(result.meeting.id, current);
      });
      const meetings = [...grouped.values()].sort((left, right) => new Date(left.meeting.startAt).getTime() - new Date(right.meeting.startAt).getTime());

      paintPage();
      pdf.setFillColor(103, 232, 249);
      pdf.rect(margin, cursorY, 3, 46, 'F');
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(20);
      pdf.setTextColor(248, 250, 252);
      pdf.text(selectedApp.name, margin + 14, cursorY + 20);
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(9);
      pdf.setTextColor(148, 163, 184);
      pdf.text('APPLICATION DETAILS / VERIFICATION REPORT', margin + 14, cursorY + 37);
      cursorY += 68;

      const overviewLeft = [
        ['Owner', selectedApp.owner ?? 'Unassigned'],
        ['Project start', selectedApp.projectStartDate ?? '-'],
        ['PIC', selectedApp.picName ?? selectedApp.owner ?? 'Unassigned'],
        ['Last verifier', lastVerifier ?? 'Not recorded'],
        ['Last verification', lastVerificationDate ?? 'Not recorded'],
      ];
      const overviewRight = [
        ['Frontend', `${selectedApp.languageFrontend ?? selectedApp.language ?? '-'} / ${selectedApp.frameworkFrontend ?? selectedApp.framework ?? '-'}`],
        ['Backend', `${selectedApp.languageBackend ?? selectedApp.language ?? '-'} / ${selectedApp.frameworkBackend ?? selectedApp.framework ?? '-'}`],
        ['Frontend URL', selectedApp.frontendUrl ?? '-'],
        ['Backend URL', selectedApp.backendUrl ?? '-'],
        ['Description', selectedApp.description ?? '-'],
      ];
      const overviewColumnWidth = contentWidth / 2 - 12;
      const overviewLabelWidth = 92;
      const overviewRowHeights = [] as number[];
      for (let index = 0; index < Math.max(overviewLeft.length, overviewRight.length); index += 1) {
        const leftLines = wrappedLines(String(overviewLeft[index]?.[1] ?? '-'), overviewColumnWidth - overviewLabelWidth);
        const rightLines = wrappedLines(String(overviewRight[index]?.[1] ?? '-'), overviewColumnWidth - overviewLabelWidth);
        overviewRowHeights.push(Math.max(24, Math.max(leftLines.length, rightLines.length) * 12 + 9));
      }
      ensureSpace(29 + overviewRowHeights.reduce((sum, height) => sum + height, 0) + 48);
      section('Overview');
      pdf.setFontSize(10);
      for (let index = 0; index < Math.max(overviewLeft.length, overviewRight.length); index += 1) {
        const left = overviewLeft[index];
        const right = overviewRight[index];
        const labelWidth = overviewLabelWidth;
        const leftLines = wrappedLines(String(left?.[1] ?? '-'), overviewColumnWidth - labelWidth);
        const rightLines = wrappedLines(String(right?.[1] ?? '-'), overviewColumnWidth - labelWidth);
        const rowHeight = overviewRowHeights[index] ?? 24;
        [[left, leftLines, margin], [right, rightLines, margin + contentWidth / 2]].forEach(([entry, lines, x]) => {
          if (!entry) return;
          const [label] = entry as string[];
          pdf.setFont('helvetica', 'bold');
          pdf.setFontSize(9);
          pdf.setTextColor(148, 163, 184);
          pdf.text(`${label}:`, Number(x), cursorY);
          pdf.setFont('helvetica', 'normal');
          pdf.setTextColor(226, 232, 240);
          pdf.text(lines as string[], Number(x) + labelWidth, cursorY);
        });
        cursorY += rowHeight;
      }
      cursorY += 48;

      if (detailProgress) {
        section('Verification progress');
        const progressMetrics = {
          overall: ['Overall', Number(detailProgress.percent ?? 0), [244, 114, 182]] as const,
          checking: ['Checking', Number(detailProgress.checkingPercent ?? 0), [103, 232, 249]] as const,
          pending: ['Pending Verification', Number(detailProgress.pendingVerificationPercent ?? 0), [252, 211, 77]] as const,
          pass: ['Pass', totalPoints > 0 ? (Number(detailProgress.passPoints ?? 0) / totalPoints) * 100 : 0, [110, 231, 183]] as const,
          waiting: ['Waiting for Review', totalPoints > 0 ? (Number(detailProgress.waitingForReviewPoints ?? 0) / totalPoints) * 100 : 0, [252, 211, 77]] as const,
          needToFix: ['Need to Fix', totalPoints > 0 ? (Number(detailProgress.needToFixPoints ?? 0) / totalPoints) * 100 : 0, [251, 113, 133]] as const,
          uncheck: ['Uncheck', totalPoints > 0 ? (Number(detailProgress.uncheckPoints ?? 0) / totalPoints) * 100 : 0, [226, 232, 240]] as const,
        };
        const drawProgressMetric = (metric: readonly [string, number, readonly [number, number, number]], x: number, y: number, width: number) => {
          const [label, value, color] = metric;
          const numericValue = Math.min(100, Math.max(0, Number(value)));
          pdf.setFont('helvetica', 'bold');
          pdf.setFontSize(9);
          pdf.setTextColor(148, 163, 184);
          pdf.text(`${label}:`, x, y);
          pdf.setFont('helvetica', 'normal');
          pdf.setTextColor(...color);
          pdf.text(`${numericValue.toFixed(2)}%`, x + width - 70, y);
          pdf.setFillColor(30, 41, 59);
          pdf.rect(x, y + 7, width, 6, 'F');
          pdf.setFillColor(...color);
          pdf.rect(x, y + 7, width * (numericValue / 100), 6, 'F');
        };
        const fullMetricWidth = contentWidth - 24;
        [progressMetrics.overall, progressMetrics.checking, progressMetrics.pending].forEach((metric) => {
          ensureSpace(36);
          drawProgressMetric(metric, margin, cursorY, fullMetricWidth);
          cursorY += 34;
        });
        cursorY += 8;
        const drawPairedMetricRow = (left: readonly [string, number, readonly [number, number, number]], right: readonly [string, number, readonly [number, number, number]]) => {
          ensureSpace(36);
          const columnWidth = contentWidth / 2 - 12;
          drawProgressMetric(left, margin, cursorY, columnWidth);
          drawProgressMetric(right, margin + contentWidth / 2, cursorY, columnWidth);
          cursorY += 34;
        };
        drawPairedMetricRow(progressMetrics.pass, progressMetrics.waiting);
        drawPairedMetricRow(progressMetrics.needToFix, progressMetrics.uncheck);
        cursorY += 48;
      }

      ensureSpace(32 + 205 + (meetings.length ? 106 : 30));
      section('Meeting progress / start to finish');
      if (!meetings.length) {
        cursorY += drawText('No meeting snapshots recorded for this application yet.', margin, cursorY, contentWidth, [148, 163, 184]);
      } else {
        const completeMeetings = meetings.filter((item): item is { meeting: MeetingResult['meeting']; start: MeetingResult; finish: MeetingResult } => Boolean(item.start && item.finish));
        const deltas = completeMeetings.map((item) => Number(item.finish.progressPercent ?? 0) - Number(item.start.progressPercent ?? 0));
        const chartTop = cursorY;
        const chartHeight = 180;
        const chartX = margin + 36;
        const chartWidth = contentWidth - 56;
        const chartY = chartTop + 32;
        const maxDelta = Math.max(1, ...deltas, 0);
        const minDelta = Math.min(-1, ...deltas, 0);
        const deltaRange = Math.max(1, maxDelta - minDelta);
        const chartPoint = (value: number, index: number) => ({
          x: chartX + (index / Math.max(1, completeMeetings.length - 1)) * chartWidth,
          y: chartY + chartHeight - ((value - minDelta) / deltaRange) * chartHeight,
        });
        pdf.setFillColor(8, 20, 31);
        pdf.setDrawColor(30, 58, 72);
        pdf.roundedRect(margin, chartTop - 12, contentWidth, chartHeight + 55, 3, 3, 'FD');
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(9);
        pdf.setTextColor(110, 231, 183);
        pdf.text('MEETING PROGRESS DELTA DIAGRAM', margin + 12, chartTop + 6);
        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(8);
        pdf.setTextColor(148, 163, 184);
        pdf.text('FINISH - START (%)', margin + 12, chartTop + 20);
        const zeroPoint = chartPoint(0, 0).y;
        pdf.setDrawColor(71, 85, 105);
        pdf.setLineDashPattern([2, 2], 0);
        pdf.line(chartX, zeroPoint, chartX + chartWidth, zeroPoint);
        pdf.setLineDashPattern([], 0);
        if (completeMeetings.length) {
          const chartPoints = completeMeetings.map((item, index) => chartPoint(Number(item.finish.progressPercent ?? 0) - Number(item.start.progressPercent ?? 0), index));
          pdf.setDrawColor(110, 231, 183);
          pdf.setLineWidth(1.5);
          chartPoints.slice(1).forEach((point, index) => {
            const previous = chartPoints[index];
            if (previous) pdf.line(previous.x, previous.y, point.x, point.y);
          });
          chartPoints.forEach((point, index) => {
            pdf.setFillColor(103, 232, 249);
            pdf.circle(point.x, point.y, 3, 'F');
            pdf.setFontSize(7);
            pdf.setTextColor(203, 213, 225);
            pdf.text(`M${index + 1}`, point.x - 6, chartY + chartHeight + 14);
          });
        } else {
          pdf.setFontSize(9);
          pdf.setTextColor(148, 163, 184);
          pdf.text('No complete START and FINISH pair is available for the diagram.', chartX, chartY + chartHeight / 2);
        }
        cursorY += chartHeight + 83;

        meetings.forEach((item, index) => {
          ensureSpace(72);
          const start = Number(item.start?.progressPercent ?? 0);
          const finish = Number(item.finish?.progressPercent ?? 0);
          const delta = item.start && item.finish ? finish - start : undefined;
          pdf.setFillColor(8, 20, 31);
          pdf.setDrawColor(30, 58, 72);
          pdf.roundedRect(margin, cursorY - 13, contentWidth, 58, 3, 3, 'FD');
          pdf.setFont('helvetica', 'bold');
          pdf.setFontSize(10);
          pdf.setTextColor(226, 232, 240);
          pdf.text(`Meeting ${index + 1}`, margin + 10, cursorY + 2);
          pdf.setFont('helvetica', 'normal');
          pdf.setFontSize(9);
          pdf.setTextColor(148, 163, 184);
          pdf.text(`${new Date(item.meeting.startAt).toLocaleString()} - ${new Date(item.meeting.endAt).toLocaleString()}`, margin + 82, cursorY + 2);
          pdf.setTextColor(203, 213, 225);
          pdf.text(`START ${start.toFixed(2)}%`, margin + 10, cursorY + 25);
          pdf.text(`FINISH ${item.finish ? finish.toFixed(2) : '—'}%`, margin + 125, cursorY + 25);
          pdf.setFont('helvetica', 'bold');
          pdf.setTextColor(delta === undefined ? 251 : delta >= 0 ? 110 : 251, delta === undefined ? 191 : delta >= 0 ? 231 : 113, delta === undefined ? 36 : delta >= 0 ? 183 : 133);
          pdf.text(delta === undefined ? 'INCOMPLETE SNAPSHOT PAIR' : `${delta >= 0 ? '+' : ''}${delta.toFixed(2)}% CHANGE`, pageWidth - margin - 150, cursorY + 25);
          cursorY += 72;
        });
      }

      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(8);
      pdf.setTextColor(100, 116, 139);
      ensureSpace(18);
      pdf.text(`Generated ${new Date().toLocaleString()} · JAMUS KALIMASADA`, margin, cursorY);
      const applicationFileName = selectedApp.name.replace(/[\\/:*?"<>|]+/g, '-').trim() || 'Application';
      const currentDate = new Date().toISOString().slice(0, 10);
      pdf.save(`Details and Progress ${applicationFileName} - ${currentDate}.pdf`);
    } catch (downloadError) {
      notifyGlobalError(downloadError instanceof Error ? downloadError.message : 'Unable to generate application PDF.');
    }
  }

  useEffect(() => {
    let active = true;

    async function load() {
      setLoading(true);
      try {
        const data = await fetchPage(page, search, sort);
        if (active) {
          setApplications({
            items: Array.isArray(data?.items) ? data.items : [],
            page: Number(data?.page ?? page),
            totalPages: Number(data?.totalPages ?? 1),
            total: Number(data?.total ?? 0),
          });
        }
      } catch (loadError) {
        if (active) {
          notifyGlobalError(loadError instanceof Error ? loadError.message : 'Unable to load applications.');
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    load();
    return () => {
      active = false;
    };
  }, [page, search, sort]);

  useEffect(() => {
    apiRequest<{ role?: string }>('/auth/me')
      .then((payload) => setCurrentUserRole(payload?.role))
      .catch(() => setCurrentUserRole(undefined));
  }, []);

  async function deleteApplication() {
    if (!selectedApp || !deletePassword) return;
    setDeleting(true);
    try {
      await apiRequest(`/applications/${selectedApp.id}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: deletePassword }),
      });
      setDeleteOpen(false);
      setDeletePassword('');
      setDetailsOpen(false);
      setSelectedApp(null);
      await reloadApplications(page);
    } catch (deleteError) {
      notifyGlobalError(deleteError instanceof Error ? deleteError.message : 'Unable to delete application.');
    } finally {
      setDeleting(false);
    }
  }

  useEffect(() => {
    let active = true;

    async function loadMetadata() {
      try {
        const [languageData, frameworkData] = await Promise.all([
          fetchMetadata('/applications/metadata/languages'),
          fetchMetadata('/applications/metadata/frameworks'),
        ]);

        if (!active) return;
        setLanguages(Array.isArray(languageData) ? languageData : []);
        setFrameworks(Array.isArray(frameworkData) ? frameworkData : []);
      } catch (metadataError) {
        if (!active) return;
        console.warn('[applications] metadata load failed; continuing with empty metadata', metadataError);
        setLanguages([]);
        setFrameworks([]);
      }
    }

    void loadMetadata();
    return () => {
      active = false;
    };
  }, []);

  async function handlePackageFileSelect(event: React.ChangeEvent<HTMLInputElement>, target: 'frontend' | 'backend') {
    const files = Array.from(event.target.files ?? []);
    if (files.length === 0) return;

    const encodedFiles = await Promise.all(files.map((file) => new Promise<DependencyFile>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve({ id: crypto.randomUUID(), name: file.name, content: String(reader.result ?? ''), layer: target });
      reader.onerror = () => resolve({ id: crypto.randomUUID(), name: file.name, content: '', layer: target });
      reader.readAsDataURL(file);
    })));
    const updateFiles = target === 'frontend' ? setFrontendDependencyFiles : setBackendDependencyFiles;
    const updateLibraries = target === 'frontend' ? setFrontendLibraryItems : setBackendLibraryItems;
    const setDetection = target === 'frontend' ? setFrontendLibraryDetection : setBackendLibraryDetection;
    updateFiles(encodedFiles);
    setDetection({ status: 'detecting', message: 'Detecting libraries...' });
    try {
      const result = await apiRequest<{ detected: boolean; libraries: LibraryItem[] }>('/applications/detect-libraries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ files: encodedFiles.map(({ name, content, layer }) => ({ name, content, layer })) }),
      });
      const libraries = Array.isArray(result?.libraries) ? result.libraries : [];
      updateLibraries(mergeLibraryItems(libraries));
      setDetection(result?.detected && libraries.length > 0
        ? { status: 'detected', message: `${libraries.length} libraries detected.` }
        : { status: 'none', message: 'No libraries detected in the selected file.' });
    } catch (detectionError) {
      setDetection({ status: 'error', message: detectionError instanceof Error ? detectionError.message : 'Library detection failed.' });
    }
    event.target.value = '';
  }

  function openEdit(application: ApplicationRecord) {
    const document = application.verificationDocuments?.[0];
    const existingLibraries = application.libraries ?? [];
    setEditingId(application.id);
    setFrontendLibraryItems(existingLibraries.filter((library) => library.layer === 'frontend'));
    setBackendLibraryItems(existingLibraries.filter((library) => library.layer !== 'frontend'));
    setFrontendDependencyFiles([]);
    setBackendDependencyFiles([]);
    setFrontendLibraryDetection({ status: 'idle' });
    setBackendLibraryDetection({ status: 'idle' });
    setForm((current) => ({
      ...current,
      name: application.name,
      description: application.description ?? '',
      languageFrontend: application.languageFrontend ?? application.language ?? '-',
      languageBackend: application.languageBackend ?? application.language ?? '-',
      frameworkFrontend: application.frameworkFrontend ?? application.framework ?? '-',
      frameworkBackend: application.frameworkBackend ?? application.framework ?? '-',
      projectStartDate: application.projectStartDate ?? current.projectStartDate,
      owner: application.owner ?? current.owner,
      picId: application.picId ?? '',
      picName: application.picName ?? '',
      frontendUrl: application.frontendUrl ?? '-',
      backendUrl: application.backendUrl ?? '-',
      verificationType: document?.type ?? current.verificationType,
      verificationLabel: document?.label ?? current.verificationLabel,
      verificationUrl: document?.url ?? '',
    }));
    setPreview(null);
    setIsCreateOpen(true);
  }

  async function previewVerification() {
    setPreviewing(true);
    setPreview(null);
    try {
      const payload = await apiRequest<{ values: number[]; source: string; spreadsheetData?: SpreadsheetData; percent?: number; status: string }>(`/applications/verification-preview`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: form.verificationType,
          label: form.verificationLabel,
          url: form.verificationUrl,
        }),
      });
      setPreview(payload);
      const spreadsheetData = payload.spreadsheetData;
      if (['WEB_CHECKLIST', 'NEW_FEATURE_BUG_FIXING'].includes(form.verificationType) && spreadsheetData) {
        setForm((current) => ({
          ...current,
          name: spreadsheetData.applicationName || current.name,
          description: spreadsheetData.description || current.description,
          owner: spreadsheetData.owner || current.owner,
          projectStartDate: spreadsheetData.projectStartDate || current.projectStartDate,
          lastVerificationDate: spreadsheetData.lastVerificationDate || current.lastVerificationDate,
          lastVerifier: spreadsheetData.lastVerifier || current.lastVerifier,
          frontendUrl: spreadsheetData.frontendUrl || current.frontendUrl,
          backendUrl: spreadsheetData.backendUrl || current.backendUrl,
          picName: spreadsheetData.picName || current.picName,
          languageFrontend: spreadsheetData.languageFrontend || current.languageFrontend,
          frameworkFrontend: spreadsheetData.frameworkFrontend || current.frameworkFrontend,
          languageBackend: spreadsheetData.languageBackend || current.languageBackend,
          frameworkBackend: spreadsheetData.frameworkBackend || current.frameworkBackend,
        }));
      }
    } catch (previewError) {
      setPreview({ values: [], source: 'error', percent: 0, status: 'ERROR', error: previewError instanceof Error ? previewError.message : 'Google Sheets preview failed.' });
    } finally {
      setPreviewing(false);
    }
  }

  async function handleCreate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);

    try {
      const libraries = mergeLibraryItems([...frontendLibraryItems, ...backendLibraryItems]);
      const dependencyFiles = [...frontendDependencyFiles, ...backendDependencyFiles];

      const payload = {
        name: form.name,
        description: form.description,
        environment: 'STAGING',
        languageFrontend: form.languageFrontend,
        languageBackend: form.languageBackend,
        frameworkFrontend: form.frameworkFrontend,
        frameworkBackend: form.frameworkBackend,
        technologyStack: libraries.map((item) => item.name),
        libraries,
        ...(dependencyFiles.length > 0 ? { dependencyFiles: dependencyFiles.map(({ name, content, layer }) => ({ name, content, layer })) } : {}),
        projectStartDate: form.projectStartDate,
        owner: form.owner,
        picId: form.picId || undefined,
        picName: form.picName || undefined,
        developerIds: [],
        spreadsheetLinks: [],
        verificationDocuments: form.verificationUrl ? [{
          type: form.verificationType,
          label: form.verificationLabel,
          url: form.verificationUrl,
        }] : [],
        frontendUrl: form.frontendUrl.startsWith('http') ? form.frontendUrl : undefined,
        backendUrl: form.backendUrl.startsWith('http') ? form.backendUrl : undefined,
        lastVerificationDate: form.lastVerificationDate || undefined,
        lastVerifier: form.lastVerifier || undefined,
      };

      const createdApplication = await apiRequest<ApplicationRecord>(editingId ? `/applications/${editingId}` : '/applications', {
        method: editingId ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      let refreshedApplication = createdApplication;
      if (createdApplication?.id && form.verificationUrl) {
        try {
          refreshedApplication = await apiRequest<ApplicationRecord>(`/applications/${createdApplication.id}/verification-progress`);
        } catch {
          notifyGlobalError('Application was created, but Google Sheets could not be read. Confirm the sheet is shared and the cell mapping is correct.');
        }
      }
      setPage(1);
      await reloadApplications(1);
      setSelectedApp(refreshedApplication ?? null);
      setDetailsOpen(Boolean(refreshedApplication));
      setIsCreateOpen(false);
      setEditingId(null);
      setForm(defaultForm);
      setFrontendLibraryItems([]);
      setBackendLibraryItems([]);
      setFrontendDependencyFiles([]);
      setBackendDependencyFiles([]);
      setFrontendLibraryDetection({ status: 'idle' });
      setBackendLibraryDetection({ status: 'idle' });
    } catch (createError) {
      notifyGlobalError(createError instanceof Error ? createError.message : 'Unable to save application.');
    } finally {
      setSaving(false);
    }
  }

  const detailProgress = selectedApp?.verificationProgress ?? selectedApp?.verificationDocuments?.[0]?.progress;
  const totalPoints = Number(detailProgress?.totalPoints ?? 0);
  const uncheckPoints = Number(detailProgress?.uncheckPoints ?? 0);
  const waitingForReviewPoints = Number(detailProgress?.waitingForReviewPoints ?? 0);
  const lastVerificationDate = selectedApp?.lastVerificationDate ?? detailProgress?.lastVerificationDate;
  const lastVerifier = selectedApp?.lastVerifier ?? detailProgress?.lastVerifier;
  const verificationAge = daysSince(lastVerificationDate);
  const developmentAge = daysSince(selectedApp?.projectStartDate);
  const visibleApplications = applications.items;

  function cycleSort(key: SortKey) {
    setSort((current) => {
      if (current.key !== key) return { key, direction: 'asc' };
      if (current.direction === null) return { key, direction: 'asc' };
      if (current.direction === 'asc') return { key, direction: 'desc' };
      return { key, direction: null };
    });
  }

  if (!hydrated) {
    return (
      <AppShell>
        <main className="min-h-screen bg-slate-950 p-6 text-slate-100 md:p-10">
          <div className="mx-auto max-w-7xl text-sm text-slate-400">Loading applications...</div>
        </main>
      </AppShell>
    );
  }

  return (
    <AppShell>
    <main className="cyber-page cyber-applications min-h-screen bg-slate-950 p-6 text-slate-100 md:p-10">
      <div className="mx-auto max-w-7xl">
        <header className="mb-8 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-cyan-300">Applications</p>
            <h1 className="mt-2 text-3xl font-semibold text-white">Progress Overview</h1>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button type="button" onClick={() => { setEditingId(null); setForm({ ...defaultForm, projectStartDate: currentDateValue() }); setFrontendLibraryItems([]); setBackendLibraryItems([]); setFrontendDependencyFiles([]); setBackendDependencyFiles([]); setFrontendLibraryDetection({ status: 'idle' }); setBackendLibraryDetection({ status: 'idle' }); setPreview(null); setIsCreateOpen(true); }} className="rounded-xl bg-cyan-500 px-4 py-2 text-sm font-semibold text-slate-950 shadow-[0_0_28px_rgba(34,211,238,0.35)] transition hover:bg-cyan-400">
              New application
            </button>
          </div>
        </header>

        <div className={`grid gap-6 transition-[grid-template-columns] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] ${selectedApp || selectedLoading ? 'xl:grid-cols-[minmax(0,1fr)_minmax(26rem,1.45fr)]' : 'xl:grid-cols-1'}`}>
          <section className="cyber-panel overflow-hidden rounded-2xl">
            <div className="flex flex-col gap-3 border-b border-slate-800 bg-slate-950/50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="text-xs uppercase tracking-[0.18em] text-slate-400">Application registry</div>
              <div className="flex flex-wrap gap-2">
                <input value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder="Search applications..." className="field-input max-w-xs" aria-label="Search applications" />
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="applications-table min-w-full text-left text-sm">
                <thead className="bg-transparent text-slate-300">
                  <tr>
                    <th className="px-4 py-3"><button type="button" onClick={() => cycleSort('name')} className="appearance-none bg-transparent font-semibold text-slate-300 transition focus:outline-none">Application {sortMarker(sort.key === 'name', sort.direction)}</button></th>
                    <th className="px-4 py-3"><button type="button" onClick={() => cycleSort('progress')} className="appearance-none bg-transparent font-semibold text-slate-300 transition focus:outline-none">Verification progress {sortMarker(sort.key === 'progress', sort.direction)}</button></th>
                    <th className="px-4 py-3"><button type="button" onClick={() => cycleSort('pending')} className="appearance-none bg-transparent font-semibold text-slate-300 transition focus:outline-none">Pending verification {sortMarker(sort.key === 'pending', sort.direction)}</button></th>
                    <th className="px-4 py-3"><button type="button" onClick={() => cycleSort('lastVerification')} className="appearance-none bg-transparent font-semibold text-slate-300 transition focus:outline-none">Last verification {sortMarker(sort.key === 'lastVerification', sort.direction)}</button></th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan={4} className="px-4 py-10 text-center text-slate-400">Loading applications…</td>
                    </tr>
                  ) : visibleApplications.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-4 py-10 text-center text-slate-400">No applications found.</td>
                    </tr>
                  ) : (
                    visibleApplications.map((app) => (
                      <tr key={app.id} onClick={() => toggleApplicationDetails(app)} className={`cursor-pointer border-t border-slate-800/80 align-top transition hover:bg-cyan-400/[0.04] ${selectedApp?.id === app.id ? 'bg-cyan-400/[0.08]' : ''}`} aria-selected={selectedApp?.id === app.id}>
                        <td className="px-4 py-4">
                          <div className="font-medium text-white">{app.name}</div>
                          <div className="mt-1 text-xs text-slate-400">{app.owner ?? 'Unassigned'}</div>
                        </td>
                        <td className="px-4 py-4">
                          <div className="min-w-40">
                            <div className={`flex items-center justify-between text-xs ${percentageTextTone(Number(app.verificationProgress?.percent ?? 0), true)}`}><span>{Number(app.verificationProgress?.percent ?? 0).toFixed(2)}%</span><span className="text-slate-500">{app.verificationProgress?.status ?? 'NOT_STARTED'}</span></div>
                            <div className="mt-2 h-1.5 overflow-hidden bg-slate-800"><div className={`h-full ${percentageTone(Number(app.verificationProgress?.percent ?? 0), true)}`} style={{ width: `${progressBarWidth(Number(app.verificationProgress?.percent ?? 0))}%` }} /></div>
                          </div>
                        </td>
                        <td className="px-4 py-4">
                          <div className="min-w-40">
                            <div className={`flex items-center justify-between text-xs ${percentageTextTone(Number(app.verificationProgress?.pendingVerificationPercent ?? 0), false)}`}><span>{Number(app.verificationProgress?.pendingVerificationPercent ?? 0).toFixed(2)}%</span><span className="text-slate-500">pending</span></div>
                            <div className="mt-2 h-1.5 overflow-hidden bg-slate-800"><div className={`h-full ${percentageTone(Number(app.verificationProgress?.pendingVerificationPercent ?? 0), false)}`} style={{ width: `${progressBarWidth(Number(app.verificationProgress?.pendingVerificationPercent ?? 0))}%` }} /></div>
                          </div>
                        </td>
                        <td className="px-4 py-4 text-slate-300">{app.lastVerificationDate ?? app.verificationProgress?.lastVerificationDate ?? 'Not recorded'}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

              <div className="flex items-center justify-between border-t border-slate-800 bg-slate-950/70 px-4 py-3">
              <div className="text-xs uppercase tracking-[0.18em] text-slate-400">
                Page {applications.page} / {applications.totalPages}
              </div>
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => { if (page > 1) setPage((curr) => curr - 1); }} aria-disabled={page <= 1} className={`rounded-lg border border-slate-700 px-3 py-2 text-xs font-medium text-slate-200 ${page <= 1 ? 'cursor-not-allowed opacity-40' : ''}`}>
                  Prev
                </button>
                <button type="button" onClick={() => { if (page < applications.totalPages) setPage((curr) => curr + 1); }} aria-disabled={page >= applications.totalPages} className={`rounded-lg border border-slate-700 px-3 py-2 text-xs font-medium text-slate-200 ${page >= applications.totalPages ? 'cursor-not-allowed opacity-40' : ''}`}>
                  Next
                </button>
              </div>
            </div>
          </section>

          {selectedApp || selectedLoading ? <aside className={`cyber-panel rounded-2xl p-6 xl:p-8 ${detailsOpen ? 'details-panel-enter' : 'details-panel-exit'}`}>
            {selectedLoading ? (
              <div className="flex h-full min-h-[300px] items-center justify-center text-center text-sm text-slate-400">Loading application details…</div>
            ) : selectedApp ? (
              <div className="space-y-6">
                <div className="border-b border-slate-800/80 pb-5">
                  <p className="text-[10px] uppercase tracking-[0.22em] text-cyan-300">Application details</p>
                  <h2 className="mt-2 text-2xl font-semibold text-white">{selectedApp.name}</h2>
                  <p className="mt-2 text-sm text-cyan-200">{selectedApp.owner ?? 'Unassigned'}</p>
                  <div className="mt-3 flex gap-2"><button type="button" title="Open document" aria-label="Open document" disabled={!selectedApp.verificationDocuments?.[0]?.url} onClick={() => { const documentUrl = selectedApp.verificationDocuments?.[0]?.url; if (documentUrl) window.open(documentUrl, '_blank', 'noopener,noreferrer'); }} className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-pink-400/30 bg-pink-400/5 text-lg text-pink-200 transition hover:border-pink-300 hover:bg-pink-400/15 disabled:cursor-not-allowed disabled:opacity-30">↗</button><button type="button" title="Edit application" aria-label="Edit application" onClick={() => openEdit(selectedApp)} className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-cyan-400/30 bg-cyan-400/5 text-lg text-cyan-200 transition hover:border-cyan-300 hover:bg-cyan-400/15">✎</button><button type="button" title="View meeting progress" aria-label="View meeting progress" onClick={() => toggleMeetingProgress(selectedApp.id)} className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-emerald-400/30 bg-emerald-400/5 text-sm text-emerald-200 transition hover:border-emerald-300 hover:bg-emerald-400/15">◔</button><button type="button" title="Download application PDF" aria-label="Download application PDF" onClick={() => void downloadApplicationPdf()} className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-amber-400/30 bg-amber-400/5 text-sm text-amber-200 transition hover:border-amber-300 hover:bg-amber-400/15">↓</button>{currentUserRole === 'SUPERADMIN' || currentUserRole === 'OVERSEER' ? <button type="button" title="Delete application" aria-label="Delete application" onClick={() => setDeleteOpen(true)} className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-rose-400/30 bg-rose-400/5 text-lg text-rose-200 transition hover:border-rose-300 hover:bg-rose-400/15">⌫</button> : null}</div>
                </div>

                <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-5">
                  <div className="mb-4 text-xs uppercase tracking-[0.18em] text-slate-400">Overview</div>
                  <ul className="grid gap-x-8 gap-y-3 text-sm text-slate-200 md:grid-cols-2">
                    <li><span className="text-slate-400">Frontend:</span> {selectedApp.languageFrontend ?? selectedApp.language ?? '-'} / {selectedApp.frameworkFrontend ?? selectedApp.framework ?? '-'}</li>
                    <li><span className="text-slate-400">Backend:</span> {selectedApp.languageBackend ?? selectedApp.language ?? '-'} / {selectedApp.frameworkBackend ?? selectedApp.framework ?? '-'}</li>
                    <li><span className="text-slate-400">Project start:</span> {selectedApp.projectStartDate ?? '-'}</li>
                    <li><span className="text-slate-400">Development duration:</span> {formatAge(developmentAge)}</li>
                    <li><span className="text-slate-400">Last verification:</span> {lastVerificationDate ?? 'Not recorded'}</li>
                    <li><span className="text-slate-400">Since last verification:</span> {formatAge(verificationAge)}</li>
                    <li><span className="text-slate-400">Last verifier:</span> {lastVerifier ?? 'Not recorded'}</li>
                    <li><span className="text-slate-400">PIC:</span> {selectedApp.picName ?? selectedApp.owner ?? 'Unassigned'}</li>
                    <li><span className="text-slate-400">Frontend URL:</span> {selectedApp.frontendUrl ? <a href={selectedApp.frontendUrl} target="_blank" rel="noreferrer" className="text-cyan-300 underline">Open</a> : '-'}</li>
                    <li><span className="text-slate-400">Backend URL:</span> {selectedApp.backendUrl ? <a href={selectedApp.backendUrl} target="_blank" rel="noreferrer" className="text-cyan-300 underline">Open</a> : '-'}</li>
                  </ul>
                </div>

                {selectedApp.description ? (
                  <div>
                    <div className="mb-2 text-xs uppercase tracking-[0.18em] text-slate-400">Description</div>
                    <p className="text-sm leading-6 text-slate-300">{selectedApp.description}</p>
                  </div>
                ) : null}
                {detailProgress ? (
                  <div className="space-y-3">
                    <div className="rounded-xl border border-pink-400/20 bg-pink-400/[0.04] p-3">
                    <div className="flex items-center justify-between text-xs uppercase tracking-[0.14em] text-slate-400"><span>Verification progress</span><span className="font-semibold text-pink-200">{Number(detailProgress.percent ?? 0).toFixed(2)}%</span></div>
                    <div className="mt-2 h-1.5 overflow-hidden bg-slate-800"><div className="h-full bg-pink-300" style={{ width: `${progressBarWidth(Number(detailProgress.percent ?? 0))}%` }} /></div>
                    </div>
                    <div className="grid gap-2 sm:grid-cols-2">
                      <div className="rounded-xl border border-emerald-400/20 bg-emerald-400/[0.04] p-3"><div className="text-xs uppercase tracking-[0.14em] text-slate-400">Pass</div><div className="mt-1 text-lg font-semibold text-emerald-200">{formatStatusPercent(detailProgress.passPoints, totalPoints)}</div></div>
                      <div className="rounded-xl border border-rose-400/20 bg-rose-400/[0.04] p-3"><div className="text-xs uppercase tracking-[0.14em] text-slate-400">Need to Fix</div><div className="mt-1 text-lg font-semibold text-rose-200">{formatStatusPercent(detailProgress.needToFixPoints, totalPoints)}</div></div>
                      <div className="rounded-xl border border-amber-400/20 bg-amber-400/[0.04] p-3"><div className="text-xs uppercase tracking-[0.14em] text-slate-400">Waiting for Review</div><div className="mt-1 text-lg font-semibold text-amber-200">{formatStatusPercent(detailProgress.waitingForReviewPoints, totalPoints)}</div></div>
                      <div className="rounded-xl border border-slate-400/20 bg-slate-400/[0.04] p-3"><div className="text-xs uppercase tracking-[0.14em] text-slate-400">Uncheck</div><div className="mt-1 text-lg font-semibold text-slate-200">{formatStatusPercent(detailProgress.uncheckPoints, totalPoints)}</div></div>
                    </div>
                    <div className="rounded-xl border border-cyan-400/20 bg-cyan-400/[0.04] p-3"><div className="flex items-center justify-between text-xs uppercase tracking-[0.14em] text-slate-400"><span>Checking Progress</span><span className="font-semibold text-cyan-200">{Number(detailProgress.checkingPercent ?? 0).toFixed(2)}%</span></div><div className="mt-2 h-1.5 overflow-hidden bg-slate-800"><div className="h-full bg-cyan-300" style={{ width: `${progressBarWidth(Number(detailProgress.checkingPercent ?? 0))}%` }} /></div><div className="mt-2 text-xs text-slate-400">{Math.max(0, totalPoints - uncheckPoints)} of {totalPoints} points checked</div></div>
                    <div className="rounded-xl border border-amber-400/20 bg-amber-400/[0.04] p-3"><div className="flex items-center justify-between text-xs uppercase tracking-[0.14em] text-slate-400"><span>Pending Verification</span><span className="font-semibold text-amber-200">{Number(detailProgress.pendingVerificationPercent ?? 0).toFixed(2)}%</span></div><div className="mt-2 h-1.5 overflow-hidden bg-slate-800"><div className="h-full bg-amber-300" style={{ width: `${progressBarWidth(Number(detailProgress.pendingVerificationPercent ?? 0))}%` }} /></div><div className="mt-2 text-xs text-slate-400">{uncheckPoints + waitingForReviewPoints} of {totalPoints} points pending</div></div>
                    <div className="flex items-center justify-between border-t border-slate-800 pt-3"><div className="text-xs uppercase tracking-[0.18em] text-slate-400">Tech stack & libraries</div><button type="button" title="Open tech stack and libraries" aria-label="Open tech stack and libraries" onClick={() => setTechStackOpen(true)} className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-cyan-400/30 bg-cyan-400/5 text-sm text-cyan-200 transition hover:border-cyan-300 hover:bg-cyan-400/15">⌘</button></div>
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="flex h-full min-h-[300px] items-center justify-center text-center text-sm text-slate-400">
                Select an application to inspect its technology stack, URLs, framework, and library inventory.
              </div>
            )}
          </aside> : null}
        </div>
      </div>

      {isCreateOpen ? (
        <div className="cyber-modal-backdrop fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/85 p-3 backdrop-blur-md sm:items-center sm:p-6">
          <div className="cyber-modal my-3 flex max-h-[calc(100vh-1.5rem)] w-full max-w-4xl flex-col overflow-hidden border border-cyan-400/20 bg-[#07111f] shadow-[0_0_0_1px_rgba(167,139,250,0.08),0_24px_80px_rgba(0,0,0,0.65)] sm:my-6 sm:max-h-[calc(100vh-3rem)]">
            <div className="flex shrink-0 items-start justify-between border-b border-slate-800/90 px-5 py-4 sm:px-7">
              <div>
                <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.24em] text-cyan-300"><span className="h-1.5 w-1.5 rounded-full bg-cyan-300 shadow-[0_0_10px_rgba(103,232,249,0.9)]" /> Application registry</div>
                <h3 className="mt-1.5 text-xl font-semibold text-white sm:text-2xl">{editingId ? 'Edit application' : 'Create application'}</h3>
                <p className="mt-1 text-xs text-slate-400">Register ownership, technology, and verification sources.</p>
              </div>
              <button type="button" aria-label="Close create application dialog" onClick={() => setIsCreateOpen(false)} className="rounded-lg border border-slate-700 px-3 py-1.5 text-sm text-slate-300 transition hover:border-cyan-400/50 hover:text-cyan-200">Close</button>
            </div>

            <form onSubmit={handleCreate} className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-7">
              <div className="space-y-5">
                <section>
                  <div className="mb-3 flex items-center gap-3"><span className="text-xs font-semibold text-cyan-300">01</span><h4 className="text-sm font-semibold uppercase tracking-[0.16em] text-white">Document Link</h4><div className="h-px flex-1 bg-gradient-to-r from-cyan-400/40 to-transparent" /></div>
                  <div className="grid gap-3 md:grid-cols-2">
                    <label><span className="field-label">Document type</span><select value={form.verificationType} onChange={(event) => { const type = event.target.value; setPreview(null); setForm((current) => ({ ...current, verificationType: type, verificationLabel: type === 'WEB_CHECKLIST' ? 'Web application verification' : 'New feature and bug fixing' })); }} className="field-input"><option value="WEB_CHECKLIST">Web Application Checklist</option><option value="NEW_FEATURE_BUG_FIXING">New Feature and Bug Fixing</option></select></label>
                    <label><span className="field-label">Google Spreadsheet URL</span><input type="url" value={form.verificationUrl} onChange={(event) => { setPreview(null); setForm((current) => ({ ...current, verificationUrl: event.target.value })); }} required className="field-input" placeholder="https://docs.google.com/spreadsheets/d/..." /></label>
                    <div className="md:col-span-2 flex flex-wrap items-center gap-3 pt-1"><button type="button" onClick={previewVerification} disabled={previewing || !form.verificationUrl} className="rounded-lg border border-pink-300/40 px-3 py-2 text-xs font-semibold text-pink-100 transition hover:bg-pink-300/10 disabled:cursor-not-allowed disabled:opacity-40">{previewing ? 'Connecting…' : 'Connect with Spreadsheet Link'}</button>{preview ? <div className={`text-xs ${preview.error ? 'text-rose-300' : 'text-emerald-300'}`}>{preview.error ? preview.error : `Source: ${preview.source} · Pass ${formatProgressValue(preview.values[0])} · Need to Fix ${formatProgressValue(preview.values[1])} · Waiting ${formatProgressValue(preview.values[2])} · Uncheck ${formatProgressValue(preview.values[3])}`}</div> : null}</div>
                  </div>
                </section>

                {preview && !preview.error ? <>
                <section>
                  <div className="mb-3 flex items-center gap-3"><span className="text-xs font-semibold text-violet-300">02</span><h4 className="text-sm font-semibold uppercase tracking-[0.16em] text-white">Application Details</h4><div className="h-px flex-1 bg-gradient-to-r from-violet-400/40 to-transparent" /></div>
                  <div className="grid gap-3 md:grid-cols-2">
                    <label className="md:col-span-2"><span className="field-label">Application name</span><input value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} required className="field-input" placeholder="e.g. Customer Portal" /></label>
                    <label className="md:col-span-2"><span className="field-label">Description</span><textarea value={form.description} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} rows={2} className="field-input resize-none" placeholder="What does this application do?" /></label>
                    <label><span className="field-label">PIC</span><div className="flex gap-2"><select value={form.picId} onChange={(event) => { const selected = picUsers.find((user) => user.id === event.target.value); setForm((current) => ({ ...current, picId: event.target.value, picName: selected ? `${selected.firstName ?? ''} ${selected.lastName ?? ''}`.trim() || selected.email : '' })); }} className="field-input min-w-0 flex-1"><option value="">Select PIC</option>{picUsers.map((user) => <option key={user.id} value={user.id}>{user.firstName || user.email} {user.lastName || ''}</option>)}</select><button type="button" title="Previous PIC page" onClick={() => setPicPage((pageNumber) => Math.max(1, pageNumber - 1))} disabled={picPage <= 1} className="pager-button">‹</button><button type="button" title="Next PIC page" onClick={() => setPicPage((pageNumber) => Math.min(picTotalPages, pageNumber + 1))} disabled={picPage >= picTotalPages} className="pager-button">›</button></div></label>
                  </div>
                </section>

                <section>
                  <div className="mb-3 flex items-center gap-3"><span className="text-xs font-semibold text-pink-300">03</span><h4 className="text-sm font-semibold uppercase tracking-[0.16em] text-white">Technology</h4><div className="h-px flex-1 bg-gradient-to-r from-pink-400/40 to-transparent" /></div>
                  <div className="grid gap-3 md:grid-cols-2">
                    <label><span className="field-label">Frontend language</span><select value={form.languageFrontend} onChange={(event) => { const language = event.target.value; const options = getCompatibleFrameworkOptions(language, frameworks); setForm((current) => ({ ...current, languageFrontend: language, frameworkFrontend: options.includes(current.frameworkFrontend) ? current.frameworkFrontend : options[0] ?? '-' })); }} className="field-input">{['-', ...(languages.length > 0 ? languages : ['TypeScript'])].map((language, index, options) => <option key={`${language}-${index}`} value={language}>{formatTechnologyLabel(language)}</option>)}</select></label>
                    <label><span className="field-label">Backend language</span><select value={form.languageBackend} onChange={(event) => { const language = event.target.value; const options = getCompatibleFrameworkOptions(language, frameworks); setForm((current) => ({ ...current, languageBackend: language, frameworkBackend: options.includes(current.frameworkBackend) ? current.frameworkBackend : options[0] ?? '-' })); }} className="field-input">{['-', ...(languages.length > 0 ? languages : ['TypeScript'])].map((language, index) => <option key={`${language}-${index}`} value={language}>{formatTechnologyLabel(language)}</option>)}</select></label>
                    <label><span className="field-label">Frontend framework</span><select value={form.frameworkFrontend} onChange={(event) => setForm((current) => ({ ...current, frameworkFrontend: event.target.value }))} className="field-input">{getCompatibleFrameworkOptions(form.languageFrontend, frameworks.length > 0 ? frameworks : ['Next.js', 'React', 'Vite', 'NestJS', 'Express', 'Angular', 'Vue']).map((framework) => <option key={framework} value={framework}>{formatTechnologyLabel(framework)}</option>)}</select></label>
                    <label><span className="field-label">Backend framework</span><select value={form.frameworkBackend} onChange={(event) => setForm((current) => ({ ...current, frameworkBackend: event.target.value }))} className="field-input">{getCompatibleFrameworkOptions(form.languageBackend, frameworks.length > 0 ? frameworks : ['Next.js', 'React', 'Vite', 'NestJS', 'Express', 'Spring Boot', 'Quarkus', 'Django', 'FastAPI', 'Laravel']).map((framework) => <option key={framework} value={framework}>{formatTechnologyLabel(framework)}</option>)}</select></label>
                    <label><span className="field-label">Frontend package files</span><input type="file" multiple accept=".json,.lock,.yaml,.yml,.lockb,application/json,text/plain" disabled={form.languageFrontend === '-' || form.frameworkFrontend === '-'} onChange={(event) => handlePackageFileSelect(event, 'frontend')} className="field-input file:mr-3 file:rounded-md file:border-0 file:bg-cyan-300/10 file:px-3 file:py-1 file:text-xs file:font-medium file:text-cyan-200 disabled:cursor-not-allowed disabled:opacity-40" />{frontendDependencyFiles.length > 0 ? <div className="mt-2 flex max-h-20 flex-wrap gap-1.5 overflow-y-auto">{frontendDependencyFiles.map((file) => <span key={file.id} className="rounded-md border border-cyan-400/20 bg-cyan-400/5 px-2 py-1 text-[10px] text-cyan-200">{file.name}</span>)}</div> : null}{frontendLibraryDetection.message ? <div className={`mt-2 text-xs ${frontendLibraryDetection.status === 'error' || frontendLibraryDetection.status === 'none' ? 'text-amber-300' : 'text-emerald-300'}`}>{frontendLibraryDetection.message}</div> : null}</label>
                    <label><span className="field-label">Backend package files</span><input type="file" multiple accept=".json,.lock,.yaml,.yml,.lockb,application/json,text/plain" disabled={form.languageBackend === '-' || form.frameworkBackend === '-'} onChange={(event) => handlePackageFileSelect(event, 'backend')} className="field-input file:mr-3 file:rounded-md file:border-0 file:bg-cyan-300/10 file:px-3 file:py-1 file:text-xs file:font-medium file:text-cyan-200 disabled:cursor-not-allowed disabled:opacity-40" />{backendDependencyFiles.length > 0 ? <div className="mt-2 flex max-h-20 flex-wrap gap-1.5 overflow-y-auto">{backendDependencyFiles.map((file) => <span key={file.id} className="rounded-md border border-cyan-400/20 bg-cyan-400/5 px-2 py-1 text-[10px] text-cyan-200">{file.name}</span>)}</div> : null}{backendLibraryDetection.message ? <div className={`mt-2 text-xs ${backendLibraryDetection.status === 'error' || backendLibraryDetection.status === 'none' ? 'text-amber-300' : 'text-emerald-300'}`}>{backendLibraryDetection.message}</div> : null}</label>
                  </div>
                </section>

                </> : null}

              </div>

              <div className="mt-6 flex shrink-0 justify-end gap-2 border-t border-slate-800/90 pt-4"><button type="button" onClick={() => { setIsCreateOpen(false); setEditingId(null); }} className="rounded-lg border border-slate-700 px-4 py-2 text-sm font-medium text-slate-300 transition hover:border-slate-500">Cancel</button><button type="submit" disabled={saving} className="rounded-lg border border-cyan-300/40 bg-cyan-300 px-4 py-2 text-sm font-semibold text-slate-950 shadow-[0_0_20px_rgba(103,232,249,0.18)] transition hover:bg-cyan-200 disabled:cursor-not-allowed disabled:opacity-60">{saving ? 'Saving…' : editingId ? 'Save changes' : 'Register application'}</button></div>
            </form>
          </div>
        </div>
      ) : null}

      {meetingProgressOpen && selectedApp ? (
        <div className="cyber-modal-backdrop fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm">
          <div className="cyber-modal flex max-h-[88vh] w-full max-w-3xl flex-col border border-emerald-400/20 bg-[#06131d] p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[10px] uppercase tracking-[0.22em] text-emerald-300">Meeting progress</p>
                <h3 className="mt-2 text-2xl font-semibold text-white">{selectedApp.name}</h3>
              </div>
              <button type="button" onClick={() => setMeetingProgressOpen(false)} className="rounded-lg border border-slate-700 px-3 py-1.5 text-sm text-slate-300">Close</button>
            </div>
            <div className="cyber-scrollbar mt-6 min-h-0 max-h-[calc(88vh-8rem)] overflow-y-auto pr-2">
              {meetingResults.length === 0 ? (
                <p className="text-sm text-slate-400">No meeting snapshots recorded for this application yet.</p>
              ) : (() => {
                const grouped = new Map<string, { meeting: MeetingResult['meeting']; start?: MeetingResult; finish?: MeetingResult }>();
                meetingResults.forEach((result) => {
                  const current = grouped.get(result.meeting.id) ?? { meeting: result.meeting };
                  current[result.phase === 'START' ? 'start' : 'finish'] = result;
                  grouped.set(result.meeting.id, current);
                });
                const incomplete = [...grouped.values()].filter((item) => !item.start || !item.finish);
                const pairs = [...grouped.values()]
                  .filter((item): item is { meeting: MeetingResult['meeting']; start: MeetingResult; finish: MeetingResult } => Boolean(item.start && item.finish))
                  .sort((left, right) => new Date(left.meeting.startAt).getTime() - new Date(right.meeting.startAt).getTime())
                  .map((item) => ({ ...item, delta: Number(item.finish.progressPercent ?? 0) - Number(item.start.progressPercent ?? 0) }));
                const values = pairs.map((item) => item.delta);
                const max = Math.max(1, ...values, 0);
                const min = Math.min(-1, ...values, 0);
                const range = Math.max(1, max - min);
                const pointFor = (value: number, index: number) => ({ x: (index / Math.max(1, pairs.length - 1)) * 100, y: 100 - ((value - min) / range) * 100 });
                const points = pairs.map((item, index) => pointFor(item.delta, index));
                const average = values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
                const selected = pairs.find((item) => item.meeting.id === hoveredMeetingId);
                return (
                  <div className="space-y-5">
                    <div className="border border-emerald-400/20 bg-emerald-400/[0.03] p-4">
                      <div className="flex items-center justify-between gap-3"><div><div className="text-xs uppercase tracking-[0.16em] text-emerald-300">Start to finish delta</div><div className="mt-1 text-xs text-slate-500">Progress change recorded during each meeting</div></div><span className="text-xs text-slate-400">{pairs.length} meetings</span></div>
                      {pairs.length ? <svg viewBox="0 0 100 100" className="mt-4 h-44 w-full overflow-visible" role="img" aria-label="Meeting progress difference line chart">
                        <line x1="0" x2="100" y1={pointFor(0, 0).y} y2={pointFor(0, 0).y} stroke="rgb(71 85 105)" strokeDasharray="1 2" strokeWidth="0.6" vectorEffect="non-scaling-stroke" />
                        <polyline points={points.map((point) => `${point.x},${point.y}`).join(' ')} fill="none" stroke="rgb(110 231 183)" strokeWidth="1.2" vectorEffect="non-scaling-stroke" />
                        {pairs.map((item, index) => {
                          const point = points[index] ?? pointFor(item.delta, index);
                          const previous = index > 0 ? pointFor(pairs[index - 1]?.delta ?? item.delta, index - 1) : point;
                          const highlighted = hoveredMeetingId === item.meeting.id;
                          return <g key={item.meeting.id} onMouseEnter={() => setHoveredMeetingId(item.meeting.id)} onMouseLeave={() => setHoveredMeetingId(null)}>
                            {index > 0 ? <line x1={previous.x} y1={previous.y} x2={point.x} y2={point.y} stroke="transparent" strokeWidth="10" vectorEffect="non-scaling-stroke" /> : null}
                            <circle cx={point.x} cy={point.y} r={highlighted ? '3' : '1.8'} fill={highlighted ? 'rgb(251 191 36)' : 'rgb(103 232 249)'} stroke={highlighted ? 'rgb(255 255 255)' : 'none'} strokeWidth="0.7" vectorEffect="non-scaling-stroke"><title>{`${new Date(item.meeting.startAt).toLocaleDateString()} to ${new Date(item.meeting.endAt).toLocaleDateString()}: ${item.delta >= 0 ? '+' : ''}${item.delta.toFixed(2)}%`}</title></circle>
                          </g>;
                        })}
                      </svg> : <p className="mt-5 text-sm text-slate-500">Complete START and FINISH snapshots are required to calculate meeting differences.</p>}
                      <div className="mt-2 min-h-5 text-xs text-amber-200">{selected ? `Period: ${new Date(selected.meeting.startAt).toLocaleString()} - ${new Date(selected.meeting.endAt).toLocaleString()} / ${selected.delta >= 0 ? '+' : ''}${selected.delta.toFixed(2)}%` : 'Hover a point or line to inspect its meeting period.'}</div>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-3">
                      <div className="border border-slate-800 bg-slate-950/60 p-3"><div className="text-[10px] uppercase tracking-[0.16em] text-slate-400">Average change</div><div className="mt-2 text-xl font-semibold text-emerald-200">{average >= 0 ? '+' : ''}{average.toFixed(2)}%</div></div>
                      <div className="border border-slate-800 bg-slate-950/60 p-3"><div className="text-[10px] uppercase tracking-[0.16em] text-slate-400">Max increase</div><div className="mt-2 text-xl font-semibold text-emerald-200">{(values.length ? Math.max(...values) : 0).toFixed(2)}%</div></div>
                      <div className="border border-slate-800 bg-slate-950/60 p-3"><div className="text-[10px] uppercase tracking-[0.16em] text-slate-400">Max decrease</div><div className="mt-2 text-xl font-semibold text-rose-300">{(values.length ? Math.min(...values) : 0).toFixed(2)}%</div></div>
                    </div>
                    <div className="space-y-2">
                      {pairs.map((item) => {
                        const highlighted = hoveredMeetingId === item.meeting.id;
                        return <div key={item.meeting.id} onMouseEnter={() => setHoveredMeetingId(item.meeting.id)} onMouseLeave={() => setHoveredMeetingId(null)} className={`flex items-center justify-between border px-3 py-2 text-sm transition-colors ${highlighted ? 'border-amber-300/70 bg-amber-300/[0.08]' : 'border-slate-800 bg-slate-950/40'}`}>
                          <div><div className="font-medium text-white">{new Date(item.meeting.startAt).toLocaleDateString()} meeting</div><div className="text-xs text-slate-400">{new Date(item.meeting.startAt).toLocaleTimeString()} - {new Date(item.meeting.endAt).toLocaleTimeString()}</div></div>
                          <div className={`font-semibold ${item.delta >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>{item.delta >= 0 ? '+' : ''}{item.delta.toFixed(2)}%</div>
                        </div>;
                      })}
                    </div>
                    {incomplete.length ? <p className="border-l border-amber-300/50 pl-3 text-xs text-amber-200">{incomplete.length} meeting snapshot pair{incomplete.length === 1 ? '' : 's'} are incomplete and excluded from the difference chart.</p> : null}
                  </div>
                );
              })()}
            </div>
          </div>
        </div>
      ) : null}

      {techStackOpen && selectedApp ? (
        <div className="cyber-modal-backdrop fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm">
          <div className="cyber-modal w-full max-w-2xl border border-cyan-400/30 bg-[#07111f] p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[10px] uppercase tracking-[0.22em] text-cyan-300">Application stack</p>
                <h3 className="mt-2 text-xl font-semibold text-white">Tech stack & libraries</h3>
                <p className="mt-1 text-sm text-slate-400">{selectedApp.name}</p>
              </div>
              <button type="button" aria-label="Close tech stack modal" onClick={() => setTechStackOpen(false)} className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-700 text-lg text-slate-300 transition hover:border-cyan-400/50 hover:text-cyan-200">×</button>
            </div>
            <div className="mt-6 flex max-h-[55vh] flex-wrap content-start gap-2 overflow-y-auto">
              {(selectedApp.libraries?.length
                ? selectedApp.libraries
                : (selectedApp.technologyStack ?? []).map((name) => ({ name, version: '—', source: 'manual' as const })))
                .map((library, index) => (
                  <span key={`${selectedApp.id}-${library.name}-${library.version}-${index}`} className="rounded-full border border-slate-700 bg-slate-900 px-3 py-2 text-[10px] uppercase tracking-[0.1em] text-cyan-200">
                    {library.name} <span className="normal-case text-slate-400">v{library.version}</span>
                  </span>
                ))}
              {!selectedApp.libraries?.length && !selectedApp.technologyStack?.length ? <p className="text-sm text-slate-500">No technology or library data recorded.</p> : null}
            </div>
            <div className="mt-6 flex justify-end border-t border-slate-800 pt-4"><button type="button" onClick={() => setTechStackOpen(false)} className="rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-300 transition hover:border-cyan-400/50 hover:text-cyan-200">Close</button></div>
          </div>
        </div>
      ) : null}

      {deleteOpen && selectedApp ? (
        <div className="cyber-modal-backdrop fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm">
          <div className="cyber-modal w-full max-w-md border border-rose-400/30 bg-[#07111f] p-6 shadow-2xl">
            <h3 className="text-lg font-semibold text-white">Delete application?</h3>
            <p className="mt-2 text-sm text-slate-400">This permanently removes {selectedApp.name}. Confirm your password to continue.</p>
            <div className="relative mt-5"><input type={showDeletePassword ? 'text' : 'password'} value={deletePassword} onChange={(event) => setDeletePassword(event.target.value)} onPaste={(event) => event.preventDefault()} placeholder="Your password" minLength={12} required className="field-input w-full pr-16" /><button type="button" onClick={() => setShowDeletePassword((visible) => !visible)} aria-label={showDeletePassword ? 'Hide password' : 'Show password'} title={showDeletePassword ? 'Hide password' : 'Show password'} className="absolute inset-y-0 right-2 my-1 border-l border-slate-700 px-3 text-xs uppercase tracking-[0.12em] text-rose-200 transition hover:text-rose-100">{showDeletePassword ? 'Hide' : 'Show'}</button></div>
            <div className="mt-5 flex justify-end gap-2"><button type="button" onClick={() => { setDeleteOpen(false); setDeletePassword(''); }} className="rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-300">Cancel</button><button type="button" onClick={deleteApplication} disabled={deleting || deletePassword.length < 12} className="rounded-lg bg-rose-500 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50">{deleting ? 'Deleting...' : 'Delete permanently'}</button></div>
          </div>
        </div>
      ) : null}
    </main>
    </AppShell>
  );
}
