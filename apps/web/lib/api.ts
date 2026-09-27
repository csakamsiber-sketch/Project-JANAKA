import { apiRequest } from './api-client';
import { cookies } from 'next/headers';

type DashboardSummary = {
  totalApplications: number;
  activeApplications: number;
  pendingApplications: number;
  cveFindings: number;
  criticalFindings: number;
  verificationSLA: number;
  meetingsThisMonth: number;
  ctiAlerts: number;
  libraryExposure: number;
  upcomingMeetings: Array<{ id: string; application: string; startAt: string; endAt: string; verificator: string }>;
  topCveFindings: Array<{ id: string; cve: string; library: string; version: string; severity: string; summary: string }>;
  pendingVerificationApplications: Array<{ id: string; name: string; percent: number; lastVerificationDate?: string }>;
  longestVerificationElapsed: Array<{ id: string; name: string; lastVerificationDate?: string; elapsedDays: number }>;
};

const fallbackDashboard: DashboardSummary = {
  totalApplications: 18,
  activeApplications: 12,
  pendingApplications: 4,
  cveFindings: 18,
  criticalFindings: 7,
  verificationSLA: 96.4,
  meetingsThisMonth: 11,
  ctiAlerts: 23,
  libraryExposure: 5,
  upcomingMeetings: [],
  topCveFindings: [],
  pendingVerificationApplications: [],
  longestVerificationElapsed: [],
};

const fallbackApplicationsPage = {
  items: [
  {
    id: 'APP-001',
    name: 'KASM Core',
    description: 'Main secure application access and identity gateway.',
    organization: 'PT Kalimasada',
    language: 'TypeScript',
    framework: 'Next.js',
    technologyStack: ['Next.js', 'NestJS', 'PostgreSQL', 'Redis'],
    projectStartDate: '2025-01-18',
    owner: 'Security Ops',
    picId: 'pic-101',
    picName: 'Ayu Prasetyo',
    environment: 'PRODUCTION',
    status: 'ACTIVE',
    spreadsheetLinks: [
      { type: 'WEB_FE', label: 'FE Sheet', url: 'https://docs.google.com/spreadsheets/d/FE-001' },
      { type: 'WEB_BE', label: 'BE Sheet', url: 'https://docs.google.com/spreadsheets/d/BE-001' },
      { type: 'CR_UPDATE', label: 'CR Update Sheet', url: 'https://docs.google.com/spreadsheets/d/CR-001' },
    ],
    verificationProgress: {
      percent: 92,
      lastUpdated: '2026-09-12T10:00:00Z',
      lastVerifier: 'Rizky Wijaya',
      status: 'APPROVED',
    },
  },
  {
    id: 'APP-002',
    name: 'Touchpoint Portal',
    description: 'Public-facing service for internal touchpoint management.',
    organization: 'PT Kalimasada',
    language: 'React',
    framework: 'Vite',
    technologyStack: ['React', 'Node.js', 'MongoDB', 'Kafka'],
    projectStartDate: '2025-06-02',
    owner: 'PIC Lead',
    picId: 'pic-202',
    picName: 'Bimo Putra',
    environment: 'STAGING',
    status: 'MONITORING',
    spreadsheetLinks: [
      { type: 'WEB_FE', label: 'FE Sheet', url: 'https://docs.google.com/spreadsheets/d/FE-002' },
      { type: 'WEB_BE', label: 'BE Sheet', url: 'https://docs.google.com/spreadsheets/d/BE-002' },
      { type: 'MOBILE', label: 'Mobile Sheet', url: 'https://docs.google.com/spreadsheets/d/MOBILE-002' },
    ],
    verificationProgress: {
      percent: 68,
      lastUpdated: '2026-09-10T08:30:00Z',
      lastVerifier: 'Nadya Sari',
      status: 'IN_PROGRESS',
    },
  },
  {
    id: 'APP-003',
    name: 'Data Exchange',
    description: 'Secure integration layer for internal and external data exchange.',
    organization: 'PT Kalimasada',
    language: 'Java',
    framework: 'Spring Boot',
    technologyStack: ['Spring Boot', 'Oracle DB', 'RabbitMQ', 'Kubernetes'],
    projectStartDate: '2024-09-14',
    owner: 'Audit Team',
    picId: 'pic-303',
    picName: 'Candra Kusuma',
    environment: 'PRODUCTION',
    status: 'REVIEW',
    spreadsheetLinks: [
      { type: 'WEB_BE', label: 'Backend Sheet', url: 'https://docs.google.com/spreadsheets/d/BE-003' },
      { type: 'CR_UPDATE', label: 'CR Update Sheet', url: 'https://docs.google.com/spreadsheets/d/CR-003' },
    ],
    verificationProgress: {
      percent: 45,
      lastUpdated: '2026-09-08T13:45:00Z',
      lastVerifier: 'Rohmat Hidayat',
      status: 'IN_PROGRESS',
    },
  },
  ],
  page: 1,
  limit: 8,
  total: 3,
  totalPages: 1,
};

const fallbackMeetings = [
  { id: 'MT-001', title: 'Risk review', requestedBy: 'Security Lead', status: 'APPROVED', proposedStart: '2026-09-14T10:00:00Z' },
  { id: 'MT-002', title: 'PIC sync', requestedBy: 'Operations Unit', status: 'PENDING', proposedStart: '2026-09-16T14:30:00Z' },
  { id: 'MT-003', title: 'Emergency verification', requestedBy: 'Auditor Team', status: 'RESCHEDULED', proposedStart: '2026-09-18T09:00:00Z' },
];

const fallbackCti = [
  { id: 'ADV-101', source: 'NVD', title: 'Critical advisory for upstream parser', severity: 'Critical' },
  { id: 'ADV-104', source: 'GHSA', title: 'Privilege bypass in auth token path', severity: 'High' },
  { id: 'ADV-107', source: 'OSV', title: 'Dependency package version drift', severity: 'Medium' },
];

const fallbackLibraryAlerts = [
  { id: 'LIB-01', library: 'axios', version: '0.21.0', severity: 'HIGH', summary: 'SSRF validation weakness in outbound request utilities.', fixedVersion: '0.21.1' },
  { id: 'LIB-02', library: 'lodash', version: '4.17.20', severity: 'CRITICAL', summary: 'Prototype pollution issue affecting deep merge flows.', fixedVersion: '4.17.21' },
];

async function fetchJson<T>(path: string, _fallback: T): Promise<T> {
  const cookieHeader = (await cookies()).toString();
  return apiRequest<T>(path, {
    cache: 'no-store',
    ...(cookieHeader ? { headers: { Cookie: cookieHeader } } : {}),
  });
}

export async function fetchDashboardSummary() {
  return fetchJson('/dashboard/summary', fallbackDashboard);
}

export async function fetchApplications(page = 1, limit = 8) {
  const data = await fetchJson(`/applications?page=${page}&limit=${limit}`, fallbackApplicationsPage);

  if (Array.isArray(data)) {
    return {
      items: data,
      page,
      limit,
      total: data.length,
      totalPages: Math.max(1, Math.ceil(data.length / limit)),
    };
  }

  return {
    items: Array.isArray(data?.items) ? data.items : [],
    page: Number(data?.page ?? page),
    limit: Number(data?.limit ?? limit),
    total: Number(data?.total ?? 0),
    totalPages: Number(data?.totalPages ?? 1),
  };
}

export async function fetchMeetings() {
  return fetchJson('/meetings/requests', fallbackMeetings);
}

export async function fetchThreatIntel() {
  return fetchJson('/cti/alerts', fallbackCti);
}

export async function fetchLibraryAlerts() {
  return fetchJson('/libraries/vulnerabilities', fallbackLibraryAlerts);
}
