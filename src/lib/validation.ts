interface ValidationRule {
  min?: number;
  max?: number;
  pattern?: RegExp;
  required?: boolean;
  custom?: (value: string) => string | null;
}

interface ValidationResult {
  isValid: boolean;
  error?: string;
}

function validateField(value: string, rules: ValidationRule): ValidationResult {
  // Check required
  if (rules.required && !value.trim()) {
    return { isValid: false, error: "This field is required" };
  }

  // Check min length
  if (rules.min && value.length < rules.min) {
    return {
      isValid: false,
      error: `Minimum ${rules.min} characters required`,
    };
  }

  // Check max length
  if (rules.max && value.length > rules.max) {
    return {
      isValid: false,
      error: `Maximum ${rules.max} characters allowed`,
    };
  }

  // Check pattern
  if (rules.pattern && value && !rules.pattern.test(value)) {
    return { isValid: false, error: "Invalid format" };
  }

  // Custom validation
  if (rules.custom) {
    const customError = rules.custom(value);
    if (customError) {
      return { isValid: false, error: customError };
    }
  }

  return { isValid: true };
}

export function getCharacterCountColor(current: number, max: number): string {
  const percentage = (current / max) * 100;
  if (percentage >= 95) return "var(--danger)";
  if (percentage >= 80) return "var(--warning)";
  return "var(--text-dim)";
}

const commonRules = {
  username: {
    min: 3,
    max: 20,
    pattern: /^[a-zA-Z0-9_-]+$/,
    required: true,
  } as ValidationRule,
  bio: {
    max: 1000,
  } as ValidationRule,
  pronouns: {
    max: 50,
  } as ValidationRule,
  serverName: {
    min: 1,
    max: 100,
    required: true,
  } as ValidationRule,
  serverUrl: {
    min: 3,
    max: 200,
    custom: (value) => {
      try {
        new URL(value.includes("://") ? value : `https://${value}`);
        return null;
      } catch {
        return "Invalid URL format";
      }
    },
  } as ValidationRule,
};
