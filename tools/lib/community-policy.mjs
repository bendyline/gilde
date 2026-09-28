/**
 * Content policy for the bot-managed community tier (data/community/).
 *
 * The community tier is imported automatically from the public MCP registry,
 * and gezel lists it beside the curated catalog with an Install button. The
 * registry vets nothing, so the tier had picked up a self-described research
 * honeypot that "injects instructions", an adult-site search tool, real-money
 * gambling, and ~240 crypto tools that ask for a wallet's private key, plus
 * template and placeholder servers and entries with garbled text.
 *
 * Deleting those files by hand does not last: the next import writes them
 * back. So the policy lives here as code, and three places enforce it:
 *
 *   - gezel's importer (packages/catalog/scripts/import-mcp-registry.ts)
 *     loads this module from the gilde checkout and never writes a match;
 *   - `npm run prune-community` (part of `npm run fix`) removes any match
 *     already on disk;
 *   - `validate.mjs` fails CI on a community entry that matches.
 *
 * Every rule is written against false positives first. Crypto tools that
 * CHECK for honeypots, sex-offender registries, labour statistics broken down
 * by sex, sprint-planning poker, GitHub App and SSH private keys, and
 * placeholder-text generators all stay. When a rule cannot be narrowed enough,
 * name the id in DENIED_TOOLSET_IDS instead of widening the pattern.
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Exact ids to exclude, with the reason. The last rule consulted, so an entry
 * is reported under the pattern that describes it when one does; an id here
 * also keeps an entry out if its upstream text is later edited to evade the
 * patterns.
 */
export const DENIED_TOOLSET_IDS = new Map([
  [
    'brian-mitchell-sec-workspace-tools',
    'self-described research honeypot that logs tool arguments and injects instructions',
  ],
  ['smeet666-mcp-rule34', 'adult-site search'],
]);

const SECURITY_BAIT = [
  /\bresearch honeypot\b/i,
  /\binjects?\s+(?:instructions|prompts)\b/i,
  /\bPoC\b[^.]*\b(?:hijack\w*|supply[- ]chain|security research)\b/i,
  /\b(?:hijack\w*|supply[- ]chain)\b[^.]*\bPoC\b/i,
];

const ADULT =
  /\b(?:porn\w*|nsfw|hentai|rule ?34|onlyfans|erotic\w*|xvideos|xhamster|pornhub|camgirls?|e621|adult[- ](?:content|sites?|videos?|entertainment|industry|toys?)|sex[- ]?(?:chat|cams?|toys?|work|workers?|dating))\b/i;
/** A tool that detects or filters adult content is a safety tool. */
const ADULT_SAFETY = /\b(?:detect\w*|filter\w*|block\w*|moderat\w*|classif\w*|safety|safe)\b/i;

const GAMBLING =
  /\b(?:casinos?|gambl\w*|sportsbooks?|sports[- ]?betting|betting|bookmakers?|slot machines?|wager\w*|lotter(?:y|ies)|lotto|jackpots?|roulette|blackjack|baccarat|for real money)\b/i;
/** Help for people with a gambling problem is not gambling. */
const GAMBLING_HELP = /\b(?:addiction|problem gambling|responsible gambling|self[- ]exclusion)\b/i;

/** Env var / config ids that carry a signing key or its seed. */
const KEY_ID = /(?:PRIVATE_?KEY|PRIV_?KEY|MNEMONIC|SEED_?PHRASE|SECRET_?PHRASE|RECOVERY_?PHRASE|WALLET_?(?:KEY|SECRET|SEED))/i;
/** Crypto context. Deliberately narrow: `token`, `trading` and `payments` alone also describe API keys and banks. */
const CRYPTO =
  /\b(?:wallets?|crypto\w*|blockchains?|web3|on-?chain|defi|dex|ethereum|evm|solana|bitcoin|btc|usdc|usdt|stablecoins?|x402|nfts?|polygon|arbitrum|bsc|tron|sui|aptos|hyperliquid|polymarket|erc-?20|spl|lightning|eth|base (?:chain|mainnet|sepolia|network)|on base)\b/i;
/** A config field whose label says it wants a wallet key, whatever its id. */
const WALLET_KEY_TEXT =
  /\b(?:wallet|evm|solana|ethereum|bitcoin)\b[^.]{0,40}\b(?:private key|keypair|secret key|seed phrase|mnemonic|recovery phrase)\b|\b(?:private key|keypair|seed phrase|mnemonic|recovery phrase)\b[^.]{0,60}\b(?:wallet|usdc|evm|solana|on base)\b/i;

const PLACEHOLDER_NAME = /\b(?:example|examples|sample|template|quickstart|boilerplate|dummy|test|hello[- ]?world)\b/i;
const PLACEHOLDER_DESCRIPTION =
  /\b(?:example|sample|template|quickstart|boilerplate|dummy|hello world|simple mcp server|reference implementation)\b/i;

/** UTF-8 read as Latin-1/CP1252 (`â€”` for an em dash), replacement chars, and C1 controls. */
const MOJIBAKE = /Ã[\u0080-¿]|â€|Â[ -¿]|ðŸ|�|[\u0080-\u009F]/;

function text(value) {
  return typeof value === 'string' ? value : '';
}

/**
 * Decide whether a community toolset may be listed.
 *
 * @param {{ identity: object, versions?: object[] }} entry the identity
 *   manifest and any version manifests (config / envHints live there).
 * @returns {{ rule: string, detail: string } | null} the first rule the entry
 *   breaks, or null when it may stay.
 */
export function communityPolicyViolation({ identity, versions = [] }) {
  const id = text(identity?.id);
  const name = text(identity?.name);
  const description = text(identity?.description);
  const about = `${name}\n${description}`;
  const aboutWithId = `${about}\n${id}`;

  for (const pattern of SECURITY_BAIT) {
    if (pattern.test(about)) {
      return { rule: 'security-bait', detail: 'describes itself as a honeypot, injection, or attack demo' };
    }
  }

  if (ADULT.test(aboutWithId) && !ADULT_SAFETY.test(about)) {
    return { rule: 'adult', detail: `adult content (${aboutWithId.match(ADULT)[0]})` };
  }

  if (GAMBLING.test(aboutWithId) && !GAMBLING_HELP.test(about)) {
    return { rule: 'gambling', detail: `gambling (${aboutWithId.match(GAMBLING)[0]})` };
  }

  const configs = versions.flatMap((version) => (Array.isArray(version?.config) ? version.config : []));
  const envHints = versions.flatMap((version) =>
    Array.isArray(version?.runtime?.envHints) ? version.runtime.envHints : [],
  );
  const keyIds = [
    ...envHints.map(text),
    ...configs.flatMap((field) => [text(field?.id), text(field?.envVar)]),
  ].filter((value) => KEY_ID.test(value));
  const configText = configs.map((field) => `${text(field?.label)} ${text(field?.description)}`).join('\n');
  if (keyIds.length > 0 && CRYPTO.test(`${aboutWithId}\n${configText}`)) {
    return { rule: 'wallet-private-key', detail: `asks for a wallet key (${keyIds[0]})` };
  }
  if (WALLET_KEY_TEXT.test(configText)) {
    return { rule: 'wallet-private-key', detail: 'a setting asks for a wallet private key' };
  }

  if (PLACEHOLDER_NAME.test(name) && PLACEHOLDER_DESCRIPTION.test(description)) {
    return { rule: 'placeholder', detail: 'a template or example server, not a tool' };
  }

  if (MOJIBAKE.test(about)) {
    return { rule: 'mojibake', detail: 'garbled text in its name or description' };
  }

  const denied = DENIED_TOOLSET_IDS.get(id);
  if (denied) return { rule: 'denylisted', detail: denied };

  return null;
}

function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return null;
  }
}

/**
 * Identity + every version manifest of one community toolset directory, in
 * the shape `communityPolicyViolation` takes. Every version is checked, not
 * just the newest: an older folder can still be pinned by id.
 */
export function loadCommunityToolset(itemDir) {
  const identity = readJson(join(itemDir, 'manifest.json'));
  const versions = [];
  const versionsDir = join(itemDir, 'versions');
  if (existsSync(versionsDir)) {
    for (const entry of readdirSync(versionsDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const version = readJson(join(versionsDir, entry.name, 'manifest.json'));
      if (version) versions.push(version);
    }
  }
  return { identity, versions };
}
