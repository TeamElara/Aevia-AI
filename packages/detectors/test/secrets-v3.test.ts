import { describe, expect, it } from 'vitest';
import { detectAll } from '../src';

// Detection v3 secret formats. Values are synthetic and assembled at runtime so that repository secret
// scanning does not treat this file as a leak. Each format has a benign lookalike.
const found = (text: string) => detectAll(text, { source: 'prompt' }).filter((f) => f.category === 'SECRET' || f.category === 'PRIVATE_KEY');
const rnd = (n: number, alphabet = 'aZ3kP9qL2mX7vB4nR8tY1wC6dF0gH5jKe') => Array.from({ length: n }, (_, i) => alphabet[(i * 7 + 3) % alphabet.length]).join('');
const hex = (n: number) => Array.from({ length: n }, (_, i) => '0123456789abcdef'[(i * 5 + 1) % 16]).join('');

describe('known formats', () => {
  const hits: Array<[string, string, string]> = [
    ['GitHub token', `token ${'gh' + 'p_'}${rnd(36)}`, 'secret.github_token'],
    ['GitHub fine-grained PAT', `${'github' + '_pat_'}${rnd(22)}_${rnd(59)}`, 'secret.github_pat'],
    ['Slack bot token', `${'xo' + 'xb-'}1234567890-${rnd(24)}`, 'secret.slack_token'],
    ['Slack app token', `${'xa' + 'pp-'}1-A0123456789-1234567890123-${hex(64)}`, 'secret.slack_app_token'],
    ['Stripe live key', `${'sk_' + 'live_'}${rnd(24)}`, 'secret.stripe_live'],
    ['Stripe test key', `${'sk_' + 'test_'}${rnd(24)}`, 'secret.stripe_test'],
    ['Stripe webhook secret', `${'wh' + 'sec_'}${rnd(32)}`, 'secret.stripe_webhook'],
    ['JWT', `${'ey' + 'J'}${rnd(20)}.${'ey' + 'J'}${rnd(30)}.${rnd(30)}`, 'secret.jwt'],
    ['PEM private key', `-----BEGIN ${'PRIVATE'} KEY-----\nMIIE${rnd(60)}\n-----END ${'PRIVATE'} KEY-----`, 'secret.private_key'],
    ['GCP service account', `{"type": "service_account", "private_key_id": "${hex(40)}", "client_email": "bot@proj.iam.gserviceaccount.com"}`, 'secret.gcp_service_account'],
    ['Azure storage', `DefaultEndpointsProtocol=https;AccountName=acme;AccountKey=${rnd(64)}==;EndpointSuffix=core.windows.net`, 'secret.azure_storage'],
    ['Azure Service Bus', `Endpoint=sb://acme.servicebus.windows.net/;SharedAccessKeyName=root;SharedAccessKey=${rnd(44)}=`, 'secret.azure_shared_access_key'],
    ['Azure SAS URL', `https://acme.blob.core.windows.net/c/f.csv?sv=2022-11-02&se=2026-12-01&sp=r&sig=${rnd(43)}%3D`, 'secret.azure_sas'],
    ['SQL connection string', `Server=tcp:db.acme.in;Database=hr;User ID=app;Password=${rnd(16)};`, 'secret.connection_string_password'],
    ['JDBC URL', `jdbc:postgresql://db.acme.in:5432/hr?user=app&password=${rnd(14)}`, 'secret.connection_string_password'],
    ['Postgres URL', `postgres://app:${rnd(14)}@db.acme.in:5432/hr`, 'secret.db_uri'],
    ['Redis TLS URL', `rediss://default:${rnd(20)}@cache.acme.in:6380`, 'secret.db_uri'],
    ['Bearer token (entropy)', `Authorization: Bearer ${rnd(40)}`, 'secret.entropy.ctx'],
    ['Unknown vendor key (entropy)', `the billing service key is ${rnd(32)}`, 'secret.entropy.ctx'],
  ];
  for (const [name, text, rule] of hits) {
    it(name, () => expect(found(text).map((f) => f.ruleId)).toContain(rule));
  }
});

describe('benign lookalikes are not secrets', () => {
  const benign: Array<[string, string]> = [
    ['git commit hash', `Revert commit ${hex(40)} before the release`],
    ['sha256 near "key"', `The key file checksum is ${hex(64)}`],
    ['UUID near "token"', 'token id 123e4567-e89b-12d3-a456-426614174000 is in the audit log'],
    ['base64 of plain text near "secret"', `secret santa note: ${btoa('Remember to bring the gifts on Friday evening')}`],
    ['docs URL near "API key"', 'API key rotation guide: https://docs.acme.in/security/rotating-keys-quarterly-2026'],
    ['placeholder token', 'Authorization: Bearer YOUR_ACCESS_TOKEN_HERE_REPLACE_ME'],
    ['identifier near "key"', 'Primary key column is customer_reference_identifier_v2'],
    ['long word without digits', 'the secret to good onboarding is Supercalifragilisticexpialidocious'],
    ['connection string placeholder', 'Server=db;User ID=app;Password=changeme;'],
    ['DB URL placeholder', 'postgres://app:your-password-here@localhost:5432/hr'],
    ['Stripe docs prefix only', 'Stripe test keys start with sk_test_ and live keys with sk_live_.'],
    ['random id without key context', `Build artefact ${rnd(32)} uploaded`],
  ];
  for (const [name, text] of benign) {
    it(name, () => expect(found(text)).toEqual([]));
  }
});
