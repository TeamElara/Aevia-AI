/** Shared hand-off contracts. Never attach matched values to findings or audit events. */
export type Source = 'prompt' | 'document' | 'response';
export type Action = 'allow' | 'warn' | 'mask' | 'redact' | 'quarantine' | 'deny' | 'require_approval' | 'block';
export interface User { id: string; groups: string[]; }
export interface Finding {
  category: string;
  source: Source;
  start: number;
  end: number;
  score: number;
  ruleId: string;
  via: 'raw' | 'normalised' | 'decoded';
}
export interface DetectionContext {
  source: Source;
  user: User;
  requestId: string;
  canaries: readonly string[];
}
export type DetectAll = (text: string, ctx: DetectionContext) => Finding[] | Promise<Finding[]>;
export interface Message { role: 'system' | 'user' | 'assistant'; content: string; }
export interface Chunk {
  doc_id: string;
  text: string;
  allowed_groups: string[];
  allowed_users: string[];
  classification: 'public' | 'internal' | 'confidential' | 'restricted';
  external_llm: 'allow' | 'deny' | 'approval';
  injection_score: number;
  canary?: string;
}
export type Retrieve = (user: User, query: string) => Promise<Chunk[]>;
export interface ProviderResult { content: string; model: string; }
export interface Provider {
  readonly external: boolean;
  readonly model: string;
  complete(messages: readonly Message[], onAttempt: () => void): Promise<ProviderResult>;
}
export interface Decision { action: Action; reason: string; rule_ids: string[]; }
export interface AuditEvent {
  request_id: string;
  ts: Date;
  user_pseudo: string;
  stage: string;
  categories: string[];
  counts: Record<string, number>;
  rule_ids: string[];
  policy_version: string;
  action: Action;
  model_called: boolean;
  via: Finding['via'][];
  stage_ms: Record<string, number>;
  total_ms: number;
}
export interface ApprovalContext {
  user: User;
  requestId: string;
  conversationId: string;
  policyVersion: string;
  requestHash: string;
}
/** Approval is a pause. Never call the provider directly from approve(); replay through Gateway. */
export interface ApprovalService {
  enqueue(payload: { messages: Message[]; chunks: Chunk[] }, ctx: ApprovalContext): Promise<{ id: string; expires_at: string }>;
  /** Atomically validate owner, expiry, approved state and request hash; consume once. */
  verifyAndConsume(id: string, ctx: ApprovalContext): Promise<boolean>;
}
export interface ChatResult {
  request_id: string;
  conversation_id: string;
  answer: string;
  action: Action;
  reason: string;
  findings: Finding[];
  stage_ms: Record<string, number>;
  provider_calls: number;
  policy_version: string;
  sent_to_model?: Message[];
  approval?: { id: string; expires_at: string };
}
