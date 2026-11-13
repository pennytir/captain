# Captain — Spec-Driven Plan

> Spec-driven development: every feature below has requirements, acceptance criteria, and a task list before code is written. Tick tasks in `OpenChamber` knowledge or here as they land.

## 1. Product overview

**Captain** is an Obsidian plugin + hosted service:

- **Captain (plugin)**: RAG chat over vault notes (mini-rag style), AI-generated Mermaid workflow diagrams with Iconoir icons, and a "Publish" command that ships notes to the hosted service.
- **Captain Publish (service)**: obsidi.xyz — hosted Obsidian-Publish-like sites, with versioning, password protection, design customization, collaboration (named + anonymous).

## 2. Goals / non-goals

**Goals**
- Private-by-default RAG over local notes (Ollama or llama.cpp).
- AI-assisted diagram generation from note content.
- One-click publish to a versioned, shareable site.
- Customizable design (fonts, colors via Coloris).
- Real-time collaboration with granular permissions, including anonymous guests.
- WorkOS auth, Cloudflare Worker + R2, wildcard subdomains.

**Non-goals (v1)**
- Mobile (desktop-only plugin).
- Full Obsidian plugin parity with Obsidian Publish's advanced features (e.g. graph view).
- Self-hosted worker (managed service only).

## 3. Architecture

```
Obsidian (Captain plugin)
  ├── RAG module (chunking, embeddings, cache)  -> Ollama/llama.cpp (local)
  ├── Diagram module (LLM -> Mermaid)           -> OpenCodex proxy or local
  └── Publish module (push notes)               -> Captain Publish API (Worker)
                                                      ├── WorkOS (auth)
                                                      ├── R2 (versioned notes + assets)
                                                      ├── D1/KV (metadata, perms, handles)
                                                      └── yaos (real-time collab)
```

Subdomain routing: `{handle}.obsidi.xyz` -> Worker -> R2 render.

## 4. Feature specs

### 4.1 RAG chat (mini-rag integration)

**Requirements**
- R1. Chat panel opens from note/folder context menu and command palette.
- R2. Chunk note content, embed via Ollama or llama.cpp, retrieve top-k relevant chunks.
- R3. On-disk embedding cache keyed by content hash, chunk version, provider, model, server URL.
- R4. Requests sized to model context window.
- R5. Streaming responses; Stop cancels.
- R6. Summarize folders of any size in stages.
- R7. Settings: provider, URLs, chat model, embedding model, cache toggle.

**Acceptance criteria**
- Given a note with 10k words, chat returns relevant answer citing chunks.
- Re-opening same note uses cache (no re-embed).
- Switching embedding model re-embeds only changed notes.

**Tasks**
- [ ] Port mini-rag chunking + embedding + cache modules into `src/rag/`
- [ ] Add settings tab (provider, URLs, models, cache)
- [ ] Add context-menu + command-palette entries
- [ ] Add streaming chat view
- [ ] Add folder summarize
- [ ] Tests: chunking, cache key, retrieval

### 4.2 AI workflow diagrams

**Requirements**
- R1. Command "Generate diagram from note" + context-menu entry.
- R2. LLM extracts process/pipeline and emits Mermaid source.
- R3. Insert as fenced ```mermaid block in note.
- R4. Live preview rendering in-note.
- R5. Per-node color/fill customization.
- R6. Iconoir icons embeddable in nodes.
- R7. Settings: model, provider, icon set, palette, auto-generate toggle.

**Acceptance criteria**
- Given a note describing a 5-step pipeline, command produces valid Mermaid flowchart.
- User can change node fill color; preview updates.
- Iconoir icon renders inside a node.

**Tasks**
- [ ] Research mermaid-maker rendering approach
- [ ] Design prompt + output validation
- [ ] Implement command + context-menu
- [ ] Render mermaid blocks with live preview
- [ ] Color/fill editor
- [ ] Iconoir icon integration
- [ ] Settings tab
- [ ] Tests: prompt construction, Mermaid validation

### 4.3 Captain Publish (obsidi.xyz)

**Requirements**
- R1. WorkOS auth (signup/signin/sessions/orgs).
- R2. Cloudflare Worker hosts app; R2 stores notes + assets.
- R3. Every publish creates an immutable version; never overwrite/delete.
- R4. Wildcard subdomain `{handle}.obsidi.xyz`.
- R5. Handle registration: unique, slug-safe, reserved words blocked.
- R6. Password protection per note and per vault.
- R7. "Built with Captain" footer/logo on every published page.
- R8. Design tab: font picker per element, Coloris color picker, theme presets.
- R9. build.awesome.me/docs components for site building.
- R10. Collaboration: invite collaborators via yaos, granular permissions (read/comment/edit/publish/admin).
- R11. Dashboard: sites, versions, collaborators, domains, analytics.

**Acceptance criteria**
- Publish a note -> reachable at `{handle}.obsidi.xyz/{note}` within 10s.
- Re-publish creates new version; old version still accessible via history.
- Password-protected note returns 401 without password, 200 with correct password.
- Collaborator with "comment" role cannot edit or publish.

**Tasks**
- [ ] Scaffold Worker (Wrangler) + R2 bucket + D1/KV
- [ ] WorkOS auth integration
- [ ] Wildcard subdomain routing
- [ ] Handle registration + validation
- [ ] Note ingestion API (from plugin)
- [ ] Immutable versioning + manifest
- [ ] Markdown -> HTML renderer with link resolution
- [ ] Password protection (note + vault)
- [ ] Branding footer
- [ ] Design tab (fonts + Coloris + presets)
- [ ] build.awesome.me integration
- [ ] yaos collaboration + granular permissions
- [ ] Dashboard UI
- [ ] Security review
- [ ] Tests: worker unit/integration, e2e publish, versioning, permissions
- [ ] Docs + onboarding

### 4.4 Anonymous collaboration sessions

**Requirements**
- R1. Invite link (no account required) to collaborate on a note/vault.
- R2. Optional password gate.
- R3. Join flow: display name + DiceBear avatar picker.
- R4. If no name/avatar chosen, auto-assign random name + avatar (Google Docs style).
- R5. Real-time collab via yaos for guests.
- R6. Granular permissions for guests (view/comment/edit).
- R7. Link expiry, revocation, max uses.
- R8. Abuse controls: rate limits, CAPTCHA, max guests.

**Acceptance criteria**
- Guest opens link, enters name "Alice", picks avatar -> appears in presence list.
- Guest skips inputs -> gets "Happy Panda" + random DiceBear avatar.
- Password-protected link rejects wrong password.
- Revoked link returns 410.

**Tasks**
- [ ] Design guest session model + short-lived tokens
- [ ] Invite link generation + optional password
- [ ] Password gate page
- [ ] Join flow + name/avatar UI
- [ ] DiceBear integration (styles, seed, SVG/PNG)
- [ ] Auto-assign random identity
- [ ] yaos real-time collab for guests
- [ ] Permission enforcement
- [ ] Expiry/revocation/max-uses
- [ ] Abuse controls
- [ ] Tests

### 4.5 OpenCodex proxy integration (Obsidian Copilot)

**Requirements**
- R1. Document BYOK custom provider setup (base URL, CORS on).
- R2. Auto-discover all `/v1/models` including combos.
- R3. Reasoning levels exposed via model metadata.
- R4. JEV combo as "auto mode" default.
- R5. Decide on CORS widening for Obsidian origin (streaming).

**Acceptance criteria**
- Following docs, Copilot chats through OpenCodex proxy successfully.
- `jev-auto` selectable as default model and routes per prompt.

**Tasks**
- [ ] Document BYOK setup in docs-site integrations
- [ ] CORS decision + implementation
- [ ] Verify reasoning_efforts in /v1/models
- [ ] End-to-end test jev-auto from Copilot
- [ ] Run bun install for dev env

### 4.6 Note linking & AI wiki (auto-linker, custom folder links, ai-wiki)

**Requirements**
- R1. Auto-linker: scan vault, detect known terms, suggest/insert `[[wikilinks]]`.
- R2. Custom folder links: resolve links within a folder scope.
- R3. AI wiki: generate wiki pages from selected notes/folders using an LLM.
- R4. Settings: enable/disable each feature, scopes, AI model/provider.
- R5. Commands + context-menu entries for all three.

**Acceptance criteria**
- Given a note mentioning a term that has its own note, auto-linker suggests a wikilink.
- Folder-scoped link resolves correctly within that folder.
- AI wiki generates a coherent wiki page from 3+ notes.

**Tasks**
- [ ] Research each plugin
- [ ] Integrate auto-linker
- [ ] Integrate custom folder links
- [ ] Integrate ai-wiki
- [ ] Settings tab
- [ ] Commands + context-menu
- [ ] Tests

## 5. Milestones

- **M1**: Captain plugin scaffold + RAG chat working (4.1)
- **M2**: Diagram generation (4.2)
- **M3**: Publish v1 to obsidi.xyz (4.3 core)
- **M4**: Collaboration + anonymous sessions (4.3 collab + 4.4)
- **M5**: Design tab + branding polish (4.3 design)
- **M6**: OpenCodex proxy integration docs (4.5)
- **M7**: Note linking & AI wiki (4.6)

## 6. Open questions

- Should RAG embeddings use OpenCodex proxy for cloud embedding models, or only local?
- Pricing model for obsidi.xyz (free tier limits?).
- yaos license/compatibility with anonymous guests.
- build.awesome.me license terms for commercial use.
