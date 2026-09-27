"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateMeetingDuration = validateMeetingDuration;
exports.hasOverlap = hasOverlap;
exports.getMeetingSortPriority = getMeetingSortPriority;
exports.sortMeetingSlots = sortMeetingSlots;
exports.ensureNoOverlap = ensureNoOverlap;
function validateMeetingDuration(startAt, endAt) {
    if (Number.isNaN(startAt.getTime()) || Number.isNaN(endAt.getTime())) {
        throw new Error('Meeting time is invalid.');
    }
    if (startAt >= endAt) {
        throw new Error('Meeting must have a positive duration.');
    }
}
function hasOverlap(existing, candidate) {
    return candidate.startAt < existing.endAt && candidate.endAt > existing.startAt;
}
function getMeetingSortPriority(slot, now = new Date()) {
    if (slot.status === 'IN_PROGRESS')
        return 0;
    const startAt = new Date(slot.startAt);
    const endAt = new Date(slot.endAt);
    if (startAt <= now && endAt > now)
        return 0;
    if (endAt < now)
        return 2;
    return 1;
}
function sortMeetingSlots(left, right) {
    const leftStart = new Date(left.startAt).getTime();
    const rightStart = new Date(right.startAt).getTime();
    if (leftStart !== rightStart)
        return rightStart - leftStart;
    return new Date(right.endAt).getTime() - new Date(left.endAt).getTime();
}
function ensureNoOverlap(existingMeetings, candidate) {
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
//# sourceMappingURL=meeting-scheduling.js.map