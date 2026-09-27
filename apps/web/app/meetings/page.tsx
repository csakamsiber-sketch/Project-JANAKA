'use client';

import { AppShell } from '../../components/app-shell';
import { MeetingConsole } from '../../components/meeting-console';

export default function MeetingsPage() {
  return (
    <AppShell>
      <MeetingConsole />
    </AppShell>
  );
}
