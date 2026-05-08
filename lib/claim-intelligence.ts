export type ClaimType =
  | "funding"
  | "performance"
  | "product"
  | "market"
  | "identity"
  | "news"
  | "general";

export type ClaimSignal = {
  isLikelyClaim: boolean;
  confidence: number;
  claimType: ClaimType;
  primaryEntity: string;
  keyNumbers: string[];
  searchableTerms: string[];
  reason: string;
};

export type SourceRank = {
  tier: 1 | 2 | 3 | 4;
  label: string;
  host: string;
  blocked: boolean;
};

export type PersonaSource = {
  title: string;
  url: string;
};

const TIER_1_DOMAINS = [
  "sec.gov",
  "bls.gov",
  "fred.stlouisfed.org",
  "reuters.com",
  "apnews.com",
  "bloomberg.com",
  "wsj.com",
  "nytimes.com",
  "techcrunch.com",
  "openai.com",
  "platform.openai.com",
  "developers.openai.com",
  "anthropic.com"
];

const TIER_2_DOMAINS = [
  "crunchbase.com",
  "pitchbook.com",
  "theinformation.com",
  "axios.com",
  "theverge.com",
  "theatlantic.com",
  "hbr.org",
  "harvardbusiness.org",
  "ft.com",
  "economist.com",
  "wired.com",
  "nvca.org",
  "cbinsights.com",
  "carta.com",
  "saastr.com",
  "arstechnica.com",
  "wikipedia.org"
];

const BLOCKED_SOURCE_DOMAINS = [
  "reddit.com",
  "old.reddit.com",
  "quora.com",
  "medium.com",
  "tumblr.com",
  "seekingalpha.com"
];

const RELATIONSHIP_KEYWORDS = [
  "ownership",
  "owns",
  "stake",
  "valuation",
  "valued",
  "acquisition",
  "acquired",
  "funding",
  "raised",
  "revenue",
  "arr",
  "mrr",
  "profit",
  "margin",
  "launched",
  "released",
  "announced",
  "approved",
  "blocked",
  "banned",
  "partnership",
  "customers",
  "users",
  "developers",
  "market",
  "growth"
];

const GENERIC_ENTITIES = [
  "ai",
  "vc",
  "the market",
  "the industry",
  "startups",
  "founders",
  "investors",
  "companies",
  "people",
  "the company",
  "this company",
  "speaker"
];

const COMMON_SPEAKER_NAMES = new Set([
  "alex",
  "jason",
  "molly",
  "lon",
  "jacqui",
  "gary",
  "robin",
  "fred",
  "jackie"
]);

const STOPWORD_CAPS = new Set([
  "I",
  "We",
  "They",
  "It",
  "The",
  "A",
  "An",
  "And",
  "But",
  "Or",
  "So",
  "If",
  "This",
  "That",
  "These",
  "Those",
  "Host",
  "Guest",
  "Speaker",
  "Live",
  "Transcript"
]);

export const SOURCE_POLICY_SUMMARY = {
  tiers: [
    {
      tier: 1,
      label: "Primary or high-trust",
      examples: TIER_1_DOMAINS
    },
    {
      tier: 2,
      label: "Credible context",
      examples: TIER_2_DOMAINS
    },
    {
      tier: 3,
      label: "Usable only with caution",
      examples: ["other reputable sites, official company pages not otherwise ranked"]
    },
    {
      tier: 4,
      label: "Blocked for citations",
      examples: BLOCKED_SOURCE_DOMAINS
    }
  ],
  rules: [
    "Prefer Tier 1 or Tier 2 sources for fact and news cards.",
    "Never emit blocked Tier 4 sources as citations.",
    "If no source verifies a fact/news claim, label it as a verification cue or omit that card.",
    "Do not invent URLs, titles, dates, numbers, or attribution."
  ]
} as const;

export function analyzeTranscriptWindow(transcriptWindow: string): ClaimSignal {
  const text = normalizeWhitespace(transcriptWindow);
  if (!text) {
    return emptySignal("No transcript text.");
  }

  const keyNumbers = extractKeyNumbers(text);
  const entities = extractEntityPhrases(text);
  const relationships = extractRelationshipTerms(text);
  const primaryEntity = pickPrimaryEntity(entities, text);
  const claimType = inferClaimType(text, relationships);
  const hasQuestion = /\?/.test(text);
  const hasAssertiveVerb =
    /\b(is|are|was|were|has|have|had|will|would|can|could|raised|grew|launched|released|announced|acquired|sold|owns|valued|hit|reached|claims|said|says)\b/i.test(
      text
    );
  const hasSuperlative = /\b(first|only|largest|smallest|fastest|best|worst|most|least|record|all-time)\b/i.test(text);

  let confidence = 0.18;
  if (primaryEntity) confidence += 0.22;
  if (keyNumbers.length > 0) confidence += 0.22;
  if (relationships.length > 0) confidence += 0.16;
  if (hasAssertiveVerb) confidence += 0.14;
  if (hasSuperlative) confidence += 0.1;
  if (hasQuestion && !hasAssertiveVerb && keyNumbers.length === 0) confidence -= 0.1;
  if (text.split(/\s+/).length < 7) confidence -= 0.12;

  confidence = clamp(confidence, 0, 0.95);
  const isLikelyClaim = confidence >= 0.55 && Boolean(primaryEntity || keyNumbers.length > 0);
  const searchableTerms = dedupe([
    primaryEntity,
    ...entities.filter((entity) => entity !== primaryEntity).slice(0, 3),
    ...relationships.slice(0, 4),
    ...keyNumbers.slice(0, 3)
  ].filter(Boolean));

  return {
    isLikelyClaim,
    confidence,
    claimType,
    primaryEntity,
    keyNumbers,
    searchableTerms,
    reason: buildReason({
      isLikelyClaim,
      primaryEntity,
      keyNumbers,
      relationships,
      hasAssertiveVerb,
      hasSuperlative
    })
  };
}

export function buildClaimPolicyPrompt(signal: ClaimSignal) {
  const entity = signal.primaryEntity || "none detected";
  const numbers = signal.keyNumbers.length ? signal.keyNumbers.join(", ") : "none detected";
  const terms = signal.searchableTerms.length ? signal.searchableTerms.join(", ") : "none detected";

  return `Claim signal:
- Strength: ${signal.isLikelyClaim ? "likely verifiable claim" : "weak or conversational"}
- Confidence: ${Math.round(signal.confidence * 100)}%
- Type: ${signal.claimType}
- Primary entity: ${entity}
- Key numbers: ${numbers}
- Search terms: ${terms}
- Reason: ${signal.reason}

Source policy:
- Fact/news cards should prefer Tier 1 or Tier 2 sources: government/filings, official docs, Reuters/AP/Bloomberg/WSJ/NYT/TechCrunch, reputable business databases, or established tech/business press.
- Do not cite Reddit, Quora, Medium, Tumblr, Seeking Alpha, SEO summaries, or uncited social posts as sources.
- If sources do not verify the specific number/date/name, write a verification cue or PARTIAL-style context instead of pretending it is proven.
- If this is a weak conversational window, comedy/cynic can react, but fact/news should stay silent or ask for a stronger named claim.`;
}

export function rankSource(url: string): SourceRank {
  let host = "";
  try {
    host = new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return {
      tier: 4,
      label: "Invalid URL",
      host: "",
      blocked: true
    };
  }

  if (matchesDomain(host, BLOCKED_SOURCE_DOMAINS)) {
    return {
      tier: 4,
      label: "Blocked low-trust source",
      host,
      blocked: true
    };
  }

  if (
    matchesDomain(host, TIER_1_DOMAINS) ||
    host.endsWith(".gov") ||
    /^(ir|investors)\./.test(host)
  ) {
    return {
      tier: 1,
      label: "Tier 1 source",
      host,
      blocked: false
    };
  }

  if (matchesDomain(host, TIER_2_DOMAINS) || host.endsWith(".wikipedia.org")) {
    return {
      tier: 2,
      label: "Tier 2 source",
      host,
      blocked: false
    };
  }

  return {
    tier: 3,
    label: "Tier 3 source",
    host,
    blocked: false
  };
}

export function normalizePersonaSources(sources: PersonaSource[]) {
  const byUrl = new Map<string, PersonaSource & { rank: SourceRank }>();

  for (const source of sources) {
    const title = normalizeWhitespace(source.title).slice(0, 120);
    const url = source.url.trim();
    if (!title || !/^https?:\/\//.test(url)) continue;

    const rank = rankSource(url);
    if (rank.blocked) continue;
    if (!byUrl.has(url)) {
      byUrl.set(url, { title, url, rank });
    }
  }

  return [...byUrl.values()]
    .sort((a, b) => a.rank.tier - b.rank.tier || a.title.localeCompare(b.title))
    .slice(0, 3)
    .map(({ title, url }) => ({ title, url }));
}

function emptySignal(reason: string): ClaimSignal {
  return {
    isLikelyClaim: false,
    confidence: 0,
    claimType: "general",
    primaryEntity: "",
    keyNumbers: [],
    searchableTerms: [],
    reason
  };
}

function extractKeyNumbers(text: string) {
  const matches = text.match(
    /\$?\b\d[\d,.]*(?:\.\d+)?\s?(?:%|percent|percentage|k|m|b|million|billion|trillion|x|times|users|customers|developers|arr|mrr|years?|months?|days?)?\b/gi
  );
  return dedupe((matches ?? []).map((match) => normalizeWhitespace(match)).filter(Boolean)).slice(0, 5);
}

function extractEntityPhrases(text: string) {
  const matches = text.match(
    /\b[A-Z][a-zA-Z0-9&'.-]*(?:\s+(?:[A-Z][a-zA-Z0-9&'.-]*|AI|API|VC|CEO|CFO|CTO|ARR|MRR|SaaS)){0,5}\b/g
  );

  return dedupe((matches ?? [])
    .map((match) => normalizeWhitespace(match))
    .filter((match) => {
      const lower = normalizeEntity(match);
      if (!lower || GENERIC_ENTITIES.includes(lower)) return false;
      if (STOPWORD_CAPS.has(match)) return false;
      if (/^speaker\s+\d+$/i.test(match)) return false;
      return match.length > 1;
    }))
    .slice(0, 6);
}

function extractRelationshipTerms(text: string) {
  const lower = text.toLowerCase();
  return RELATIONSHIP_KEYWORDS.filter((keyword) =>
    new RegExp(`\\b${escapeRegExp(keyword)}\\b`, "i").test(lower)
  ).slice(0, 6);
}

function pickPrimaryEntity(entities: string[], text: string) {
  if (entities.length === 0) return "";
  if (entities.length === 1) return entities[0];

  const lower = text.toLowerCase();
  const scores = entities.map((entity, index) => {
    const entityLower = entity.toLowerCase();
    const entityIndex = lower.indexOf(entityLower);
    const after = entityIndex >= 0 ? lower.slice(entityIndex + entity.length, entityIndex + entity.length + 80) : "";
    const around = entityIndex >= 0
      ? lower.slice(Math.max(0, entityIndex - 80), entityIndex + entity.length + 120)
      : lower;
    let score = 0;

    if (entity.split(/\s+/).length > 1) score += 2.2;
    if (/\b(ai|api|github|mit|openai|saas|twist)\b/i.test(entity)) score += 0.7;
    if (/\d|%|\$|million|billion|users|customers|developers|stars|license/.test(around)) score += 1.8;
    if (RELATIONSHIP_KEYWORDS.some((keyword) => around.includes(keyword))) score += 1.3;
    if (/^\s*(says|said|asks|asked|notes|noted|mentions|mentioned|claims|claimed)\b/.test(after)) {
      score -= 2.6;
    }
    if (COMMON_SPEAKER_NAMES.has(entityLower) && entities.length > 1) score -= 1.8;

    // Later entities often carry the claim after a host attribution like
    // "Jason says Open Granola..."; keep this tiny so real leading entities
    // still win when they have evidence around them.
    score += index * 0.05;

    return { entity, score };
  });

  return scores.sort((a, b) => b.score - a.score)[0]?.entity ?? entities[0];
}

function inferClaimType(text: string, relationships: string[]): ClaimType {
  const lower = text.toLowerCase();
  const rel = relationships.join(" ");
  if (/\b(series|funding|raised|valuation|valued|investor|round)\b/.test(`${lower} ${rel}`)) return "funding";
  if (/\b(revenue|arr|mrr|margin|profit|growth|churn|cac|ltv)\b/.test(`${lower} ${rel}`)) return "performance";
  if (/\b(launched|released|available|app store|google play|product|feature)\b/.test(`${lower} ${rel}`)) return "product";
  if (/\b(market|industry|users|customers|developers|adoption|share)\b/.test(`${lower} ${rel}`)) return "market";
  if (/\b(ceo|founder|owner|owns|board|partner|acquired)\b/.test(`${lower} ${rel}`)) return "identity";
  if (/\b(today|yesterday|breaking|current|latest|announced|reported)\b/.test(lower)) return "news";
  return "general";
}

function buildReason(input: {
  isLikelyClaim: boolean;
  primaryEntity: string;
  keyNumbers: string[];
  relationships: string[];
  hasAssertiveVerb: boolean;
  hasSuperlative: boolean;
}) {
  if (!input.isLikelyClaim) {
    return "No strong named claim, number, or sourceable assertion yet.";
  }

  const parts = [
    input.primaryEntity ? `entity=${input.primaryEntity}` : "",
    input.keyNumbers.length ? `numbers=${input.keyNumbers.join(", ")}` : "",
    input.relationships.length ? `relations=${input.relationships.join(", ")}` : "",
    input.hasAssertiveVerb ? "assertive wording" : "",
    input.hasSuperlative ? "superlative wording" : ""
  ].filter(Boolean);

  return parts.join("; ");
}

function matchesDomain(host: string, domains: string[]) {
  return domains.some((domain) => host === domain || host.endsWith(`.${domain}`));
}

function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function normalizeEntity(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function dedupe(values: string[]) {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const key = value.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(value);
  }
  return out;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
