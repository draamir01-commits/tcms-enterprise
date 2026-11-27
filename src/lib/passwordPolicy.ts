export interface PasswordCheckResult {
  valid: boolean;
  score: 0 | 1 | 2 | 3 | 4;
  checks: {
    minLength: boolean;
    upper: boolean;
    lower: boolean;
    number: boolean;
    special: boolean;
  };
  failedRules: string[];
}

export function validatePasswordStrength(password: string): PasswordCheckResult {
  const value = password || '';
  const checks = {
    minLength: value.length >= 8,
    upper: /[A-Z]/.test(value),
    lower: /[a-z]/.test(value),
    number: /[0-9]/.test(value),
    special: /[^A-Za-z0-9\s]/.test(value),
  };

  const failedRules: string[] = [];
  if (!checks.minLength) failedRules.push('At least 8 characters');
  if (!checks.upper) failedRules.push('At least 1 uppercase letter');
  if (!checks.lower) failedRules.push('At least 1 lowercase letter');
  if (!checks.number) failedRules.push('At least 1 number');
  if (!checks.special) failedRules.push('At least 1 special character');

  const passedCount = Object.values(checks).filter(Boolean).length;
  let score: 0 | 1 | 2 | 3 | 4 = 0;
  if (passedCount >= 5) score = 4;
  else if (passedCount === 4) score = 3;
  else if (passedCount === 3) score = 2;
  else if (passedCount >= 1) score = 1;

  return {
    valid: failedRules.length === 0,
    score,
    checks,
    failedRules,
  };
}
