import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { communityPolicyViolation } from '../lib/community-policy.mjs';
import { findCommunityPolicyViolations } from '../prune-community.mjs';

function entry(name, description, { id = 'someone-tool', config = [], envHints = [] } = {}) {
  return {
    identity: { id, name, description },
    versions: [{ runtime: { kind: 'npm-package', envHints }, config }],
  };
}

function ruleOf(value) {
  return communityPolicyViolation(value)?.rule ?? null;
}

test('excludes what the release audit found', () => {
  assert.equal(
    ruleOf(
      entry(
        'Workspace Tools',
        'Research honeypot. Logs connections and tool arguments; injects instructions. Read README first.',
        { id: 'brian-mitchell-sec-workspace-tools' },
      ),
    ),
    'security-bait',
  );
  assert.equal(
    ruleOf(entry('Mcp Rule34', "Search rule34.xxx posts by tag through the site's own API.")),
    'adult',
  );
  assert.equal(
    ruleOf(entry('Mcp', 'AI agent MCP server for Suigar casino game, SweetHouse, NFT, and referral transactions.')),
    'gambling',
  );
  assert.equal(
    ruleOf(
      entry('402sentinel Mcp', 'x402 payment safety for AI agents.', {
        envHints: ['CLIENT_PRIVATE_KEY'],
        config: [{ id: 'CLIENT_PRIVATE_KEY', label: 'A Base wallet holding USDC on-chain', description: '' }],
      }),
    ),
    'wallet-private-key',
  );
  assert.equal(ruleOf(entry('Template MCP Server', 'Template MCP server example.')), 'placeholder');
  assert.equal(
    ruleOf(entry('DNS Lookup API', 'DNS record lookup â€” A, AAAA, MX, TXT, CNAME, NS via Cloudflare.')),
    'mojibake',
  );
});

test('excludes the adult catalogue and betting tools the second audit found', () => {
  // The only adult signal in this one is its setting names.
  assert.equal(
    ruleOf(
      entry('Mcp Media Index', 'Search scenes, performers, studios and tags across the public catalogues.', {
        envHints: ['STASHBOX_TPDB_KEY', 'STASHBOX_FANSDB_KEY'],
      }),
    ),
    'adult',
  );
  assert.equal(
    ruleOf(
      entry('Mcp Media Index', 'Search scenes and performers.', {
        config: [{ id: 'JAVSTASH_KEY', label: 'API key', description: '' }],
      }),
    ),
    'adult',
  );
  for (const [name, description] of [
    ['NegativeEV bet checker', 'Grade any MLB bet against 10,000 sims before you place it.'],
    ['Lumify Sports Intelligence', 'Live odds, splits & explainable AI bet confidence.'],
    ['Buzzr Sports Engine', 'Local sports math, DFS settlement, bet analytics and parlay grading.'],
    ['Baozi Mcp', 'Trade Solana prediction markets on Baozi.bet.'],
    ['Olympus Bets Analytics', 'Quant sports analytics: projections, methods, track record.'],
  ]) {
    assert.equal(ruleOf(entry(name, description)), 'gambling', name);
  }
});

test('keeps the look-alikes each rule was narrowed around', () => {
  for (const [name, description, options] of [
    ['Rugcheck Ai', 'Solana token safety for AI agents — rug-pull, honeypot & Token-2022 trap detection before you buy.'],
    ['HoneyLabs', 'Honeypot probe data: IP reputation, scanners, CVE probing, TLS and SSH fingerprints.'],
    ['AIShield Security Scanner', 'Scans MCP servers for tool poisoning, prompt injection and supply chain risks.'],
    ['Offendersearch', 'Search US sex-offender registries and criminal records, with per-source citations.'],
    ['ILO Labour Statistics', 'Labour market data from the ILO (ILOSTAT) by country, year, sex and age.'],
    ['Parabol', 'Start Parabol retrospectives, standups and sprint poker; read teams/meetings/tasks.'],
    ['NSFW Guard', 'Detect and filter NSFW images before they reach a model.'],
    ['Quantum Suitability Validator', 'AI triage for quantum computing POC proposals.'],
    ['Test', 'Auto-detects test framework (pytest, jest, vitest) and returns structured results.'],
    ['Lorem Forge Mcp', 'Generate placeholder text — lorem ipsum and alternatives'],
    ['Contract Clause Library Proposal Template Docx', 'A personal library of reusable contract clauses.'],
    [
      'Google Calendar',
      'MCP server for Google Calendar with service account support.',
      { envHints: ['GCAL_SERVICE_ACCOUNT_PRIVATE_KEY'] },
    ],
    [
      'SSH',
      'MCP server for SSH remote server management.',
      { envHints: ['SSH_PRIVATE_KEY_PATH'] },
    ],
    [
      'App Store Connect MCP',
      'App Store Connect MCP: apps, TestFlight, reviews, sales reports, and team users.',
      { envHints: ['APP_STORE_CONNECT_PRIVATE_KEY'] },
    ],
    ['Café Finder', 'Finds cafés near you — no garbled text here.'],
    ['Alphabet Soup', 'Better search across your notes, sorted alphabetically; beta features included.'],
    ['Stash Notes', 'Stash snippets and read them back later.', { envHints: ['STASH_API_KEY'] }],
    ['Content Moderator', 'Detect and filter adult images from stash-box style catalogues before display.'],
  ]) {
    assert.equal(ruleOf(entry(name, description, options)), null, name);
  }
});

test('an id on the denylist stays out even when its text is harmless', () => {
  assert.equal(
    ruleOf(entry('Workspace Tools', 'Helpful workspace tools.', { id: 'brian-mitchell-sec-workspace-tools' })),
    'denylisted',
  );
});

test('checks every version folder, not only the newest', () => {
  const value = entry('Pay Tool', 'Pays for API calls with USDC on Base.');
  value.versions.push({ runtime: { envHints: ['WALLET_PRIVATE_KEY'] }, config: [] });
  assert.equal(ruleOf(value), 'wallet-private-key');
});

test('finds violations on disk the way prune-community and validate see them', () => {
  const root = mkdtempSync(join(tmpdir(), 'gilde-community-'));
  try {
    const write = (id, identity, version) => {
      const dir = join(root, 'community', 'toolsets', id.slice(0, 2), id);
      mkdirSync(join(dir, 'versions', '1.0.0'), { recursive: true });
      writeFileSync(join(dir, 'manifest.json'), JSON.stringify({ id, ...identity }));
      writeFileSync(join(dir, 'versions', '1.0.0', 'manifest.json'), JSON.stringify(version));
    };
    write('aa-good', { name: 'Good Tool', description: 'Does a useful thing.' }, { config: [] });
    write(
      'bb-bad',
      { name: 'Lucky Spins', description: 'Provably fair slot machine for agents.' },
      { config: [] },
    );
    const found = findCommunityPolicyViolations(root);
    assert.deepEqual(
      found.map((v) => [v.id, v.rule]),
      [['bb-bad', 'gambling']],
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
