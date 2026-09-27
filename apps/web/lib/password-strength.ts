export type PasswordStrength = {
  score: number;
  label: string;
  tone: string;
  percentage: number;
  message: string;
};

export function getPasswordStrength(password: string): PasswordStrength {
  const trimmed = password ?? '';

  let score = 0;
  if (trimmed.length >= 12) score += 1;
  if (trimmed.length >= 16) score += 1;
  if (/[A-Z]/.test(trimmed)) score += 1;
  if (/[a-z]/.test(trimmed)) score += 1;
  if (/[0-9]/.test(trimmed)) score += 1;
  if (/[^A-Za-z0-9]/.test(trimmed)) score += 1;

  if (!trimmed) {
    return { score: 0, label: 'Empty', tone: '#475569', percentage: 0, message: 'Add at least 12 characters.' };
  }

  if (trimmed.length < 12) {
    return { score: 1, label: 'Weak', tone: '#f43f5e', percentage: 20, message: 'Minimum length is 12 characters.' };
  }

  if (score <= 2) {
    return { score: 1, label: 'Weak', tone: '#f59e0b', percentage: 35, message: 'Use more variety and length.' };
  }

  if (score <= 4) {
    return { score: 2, label: 'Fair', tone: '#facc15', percentage: 55, message: 'Better, but still add more complexity.' };
  }

  if (score <= 5) {
    return { score: 3, label: 'Strong', tone: '#22d3ee', percentage: 80, message: 'Good balance of length and complexity.' };
  }

  return { score: 4, label: 'Elite', tone: '#34d399', percentage: 100, message: 'Excellent password strength.' };
}
