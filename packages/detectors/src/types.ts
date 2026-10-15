// The detector contract shared with the gateway and the eval runner.
// Detectors only report evidence; the policy engine decides the action.
// A Finding never carries the matched value: callers slice the original text with start/end.

export type Category =
  | 'AADHAAR'
  | 'VID'
  | 'PAN'
  | 'PHONE'
  | 'CARD'
  | 'IFSC'
  | 'UPI'
  | 'BANK_ACCOUNT'
  | 'EMAIL'
  | 'SECRET'
  | 'PRIVATE_KEY'
  | 'CONFIDENTIAL'
  | 'CANARY'
  | 'INJECTION';

export type Source = 'prompt' | 'history' | 'document' | 'response';

export type Via = 'raw' | 'normalised' | 'decoded';

export interface Finding {
  category: Category;
  source: Source;
  /** Offsets into the ORIGINAL text passed to the detector, end exclusive. */
  start: number;
  end: number;
  /** 0..1. See INJECTION_BLOCK / INJECTION_WARN and the PII score notes in README. */
  score: number;
  ruleId: string;
  via: Via;
}

export interface DetectorContext {
  source: Source;
  /** Canary markers planted in the system prompt and restricted docs. */
  canaries?: string[];
  /** Protected phrases from policy.yaml, e.g. "Project Garuda". */
  protectedPhrases?: string[];
  /** Usernames of other users, for cross-user extraction rules. */
  knownUsers?: string[];
  currentUser?: string;
}

/** A detector's hit before source and via are attached. */
export interface Hit {
  category: Category;
  start: number;
  end: number;
  score: number;
  ruleId: string;
}

export type Detector = (text: string, ctx: DetectorContext) => Hit[];

export const INJECTION_BLOCK = 0.85;
export const INJECTION_WARN = 0.6;
