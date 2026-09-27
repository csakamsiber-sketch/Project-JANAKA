'use client';

import { AppShell } from '../../components/app-shell';
import { MeetingConsole } from '../../components/meeting-console';

export default function MySchedulePage() {
  return (
    <AppShell>
      <MeetingConsole verificatorOnly />
    </AppShell>
  );
}