/** Shared access contracts for the gateway integrator. Implementations are ESM JS. */
export interface AccessPrincipal {
  id: string;
  groups: string[];
  roles: string[];
}
export type ExternalPermission = 'allow' | 'approval' | 'deny';
export interface AccessChunk {
  _id: string;
  document_id: string;
  title: string;
  text: string;
  allowed_groups: string[];
  allowed_users: string[];
  classification: string;
  external_llm: ExternalPermission;
  injection_score: number;
  quarantined: boolean;
  content_hash: string;
  fingerprints?: string[];
  reasons: string[];
}
export interface AccessRequest {
  prompt: string;
  history?: string[];
  attached_doc?: string;
  conversation_id?: string;
}
export interface ApprovalReference {
  id: string;
  expires_at: string;
}
export interface AccessOptions {
  external?: boolean;
  approved?: boolean;
  limit?: number;
}
