# Twistroll Scan: Useful Pieces Extracted

Source reviewed: `/Users/andresg/Downloads/twistroll-main`

License found in that project: MIT. This repo did not copy its runtime architecture or dependencies; we extracted the product lessons that make sense for TWiST Glass Sidebar.

## What They Do Well

1. Claim-first routing

   Their pipeline does not ask every agent to react to every sentence. It first detects whether the transcript window contains a verifiable claim, then sends only strong claims into retrieval and synthesis.

2. Source quality tiers

   Fact/news cards are stronger when citations are ranked. Their strongest pattern is simple: prefer primary sources and credible business press, block low-quality domains, and choose silence over fake confidence.

3. Deduplication and cooldowns

   Realtime systems can spam the same topic as overlapping transcript windows arrive. Their queue uses entity overlap and cooldowns to keep the sidebar from repeating itself.

4. Cross-episode memory

   They index previous TWiST episodes and treat the show archive as useful context. Our app already has Memory Stash and Project Memory; the next step would be vector search over those attachments.

5. Citation post-processing

   They validate that citations emitted by the model actually came from retrieved sources. Our current source filter now removes blocked citation domains and lowers confidence when fact/news cards are unsourced.

6. Dashboard card linking

   Their transcript/card UX highlights the segment that produced a card. We should add this later with transcript range IDs once we expose speaker-aware turn metadata in the client.

## What We Added Now

- `lib/claim-intelligence.ts`
  - Lightweight claim detection for entity, number, claim type, search terms, confidence, and reason.
  - Source ranking for Tier 1, Tier 2, Tier 3, and blocked Tier 4 domains.
  - Source normalization that dedupes URLs and removes blocked citation domains.

- `app/api/personas/analyze/route.ts`
  - Persona models now receive a claim signal and source policy in the system prompt.
  - Fact/news cards have unsourced confidence capped so weak evidence does not look authoritative.
  - Blocked citation domains are stripped before the UI sees them.

- `lib/personas.ts`
  - Demo fallback cards now use the claim signal instead of generic filler.

- `/api/agent/brief`
  - Agents can now read the claim/source policy and understand how the app decides what is trustworthy.

## Deliberately Not Copied

- Deepgram transcription stack.
- LanceDB/Ollama embedding dependency chain.
- Tavily/xAI retrieval pipeline.
- Two-agent-only persona model.
- Dark terminal UI.

Our app stays simpler: OpenAI Realtime capture, four bounty personas, model routing, local memory, storage adapters, clip handoff, and a glass broadcast UI. The extracted piece is the stricter intelligence layer.

## Best Next Improvements

- Add speaker-aware transcript turns so the UI can show "Host", "Guest 1", "Guest 2", and link cards back to the exact turn.
- Add optional vector search over Memory Stash attachments for prior show notes, guest dossiers, and project docs.
- Add entity cooldowns in the browser so repeated windows do not generate repeated cards for the same claim.
- Add source tier badges in the UI for fact/news cards.
