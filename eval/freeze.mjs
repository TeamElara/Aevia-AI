import { execFileSync } from 'node:child_process'

export const FREEZE_PATHS = ['types.ts', 'apps/gateway/src', 'apps/gateway/policy.yaml',
  'packages/detectors/src', 'seed/corpus.js', 'eval/*.mjs', 'eval/*.jsonl']

// Never move a tag or label changed inference code as frozen. Reports/docs may be added later.
export function freezeEvidence(tag, git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim()) {
  if (!tag) return { frozen: false }
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,79}$/.test(tag)) throw new Error('Invalid freeze tag')
  const commit = git('rev-parse', '--verify', `refs/tags/${tag}^{commit}`)
  git('merge-base', '--is-ancestor', commit, 'HEAD')
  git('diff', '--exit-code', '--quiet', commit, '--', ...FREEZE_PATHS)
  return { frozen: true, freeze_tag: tag, freeze_commit: commit, freeze_scope: FREEZE_PATHS }
}
