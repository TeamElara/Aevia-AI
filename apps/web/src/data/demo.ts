// Seeded demo users (PLAN.md §7) and the three hero scenes shown before the
// chat is wired to the gateway. All values are synthetic.

export type DemoUser = { id: string; name: string; role: string }

export const users: DemoUser[] = [
  { id: 'asha', name: 'Asha Rao', role: 'Employee' },
  { id: 'ravi', name: 'Ravi Menon', role: 'HR' },
  { id: 'meera', name: 'Meera Iyer', role: 'Engineering' },
  { id: 'ceo', name: 'CEO', role: 'Executive' },
  { id: 'admin', name: 'Admin', role: 'Dashboard only' },
]

export type Scene = {
  user: string
  action: 'MASKED' | 'BLOCKED' | 'QUARANTINED'
  typed: string
  sent: string
  reply: string
  providerCalls: number
  stages: [string, number][]
}

export const scenes: Scene[] = [
  {
    user: 'asha',
    action: 'MASKED',
    typed: 'KYC letter for Aadhaar 2345 6789 0124, PAN ABCPE1234F',
    sent: 'KYC letter for Aadhaar [AADHAAR_K7Q2], PAN [PAN_3XJM]',
    reply: 'Dear customer, Aadhaar 2345 6789 0124 is verified…',
    providerCalls: 1,
    stages: [['PII', 3], ['Inject', 41], ['ACL', 2], ['LLM', 620], ['Out', 4]],
  },
  {
    user: 'meera',
    action: 'BLOCKED',
    typed: 'Why does this fail? AWS_KEY=AKIAIOSFODNN7EXAMPLE',
    sent: 'Nothing. The request stopped at stage 02.',
    reply: 'Remove the secret and retry, or send it as [SECRET_9QF4].',
    providerCalls: 0,
    stages: [['PII', 2], ['Secret', 1]],
  },
  {
    user: 'asha',
    action: 'QUARANTINED',
    typed: 'What are our vendor payment terms?',
    sent: 'Context: Leave policy, IT policy. Vendor FAQ withheld.',
    reply: 'Payment terms are net 45… (from clean documents only)',
    providerCalls: 1,
    stages: [['Inject', 38], ['ACL', 2], ['Chunks', 5], ['LLM', 580], ['Out', 3]],
  },
]

export const pipeline = [
  '01 auth',
  '02 inspect',
  '03 retrieve',
  '04 chunks',
  '05 outbound',
  '06 response',
  '07 release',
]
