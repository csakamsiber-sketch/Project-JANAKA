export interface MeetingSlot {
  id?: string;
  verificatorId: string;
  startAt: Date;
  endAt: Date;
  status?: string;
}

export function validateMeetingDuration(startAt: Date, endAt: Date): void {
  if (Number.isNaN(startAt.getTime()) || Number.isNaN(endAt.getTime())) {
    throw new Error('Meeting time is invalid.');
  }

  if (startAt >= endAt) {
    throw new Error('Meeting must have a positive duration.');
  }
}

export function hasOverlap(existing: MeetingSlot, candidate: MeetingSlot): boolean {
  return candidate.startAt < existing.endAt && candidate.endAt > existing.startAt;
}

export function getMeetingSortPriority(slot: MeetingSlot, now = new Date()): number {
  if (slot.status === 'IN_PROGRESS') return 0;
  const startAt = new Date(slot.startAt);
  const endAt = new Date(slot.endAt);
  if (startAt <= now && endAt > now) return 0;
  if (endAt < now) return 2;
  return 1;
}

export function sortMeetingSlots<T extends MeetingSlot>(left: T, right: T): number {
  const leftStart = new Date(left.startAt).getTime();
  const rightStart = new Date(right.startAt).getTime();
  if (leftStart !== rightStart) return rightStart - leftStart;
  return new Date(right.endAt).getTime() - new Date(left.endAt).getTime();
}

export function ensureNoOverlap(existingMeetings: MeetingSlot[], candidate: MeetingSlot): void {
  validateMeetingDuration(candidate.startAt, candidate.endAt);

  for (const existing of existingMeetings) {
    if (existing.id && candidate.id && existing.id === candidate.id) {
      continue;
    }

    if (existing.verificatorId !== candidate.verificatorId) {
      continue;
    }

    if (hasOverlap(existing, candidate)) {
      throw new Error('Meeting overlap is not allowed for the same verificator.');
    }
  }
}
