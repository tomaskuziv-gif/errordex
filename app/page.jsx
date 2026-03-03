"use client";
import { useState, useMemo } from "react";

const FAILURES = [
  {
    id: "gha-exit-137",
    errorString: "Process completed with exit code 137.",
    provider: "GitHub Actions",
    runner: "ubuntu-22.04",
    toolchain: "Docker / Node.js",
    severity: "critical",
    tags: ["oom", "memory", "docker", "node"],
    rootCause: "Exit code 137 = OOM kill (128 + SIGKILL). The kernel's OOM killer terminated your process because it exceeded available RAM. Commonly triggered by large npm installs, Jest workers spawning too many processes, or Docker build layers loading too many files simultaneously.",
    fixSteps: [
      "Reduce Jest worker count: add --maxWorkers=2 to your test script in package.json.",
      "Add NODE_OPTIONS='--max-old-space-size=2048' as an env var to your workflow step.",
      "Use actions/cache to skip redundant installs and lower peak memory pressure.",
      "Upgrade runner to ubuntu-22.04 with 16GB RAM for memory-intensive builds.",
      "In Dockerfile, split RUN instructions to avoid single-layer memory spikes.",
    ],
    reproduction: `# .github/workflows/test.yml
- name: Run tests
  env:
    NODE_OPTIONS: "--max-old-space-size=2048"
  run: npx jest --maxWorkers=2 --forceExit`,
    sponsored: {
      name: "Depot",
      tagline: "10× faster Docker builds with remote cache — no OOM on ephemeral runners.",
      url: "#",
    },
    related: ["gha-exit-1-docker-buildx", "gha-node-heap-exceeded"],
  },
  {
    id: "gha-exit-1-docker-buildx",
    errorString: "ERROR: failed to solve: failed to read dockerfile: open Dockerfile: no such file or directory",
    provider: "GitHub Actions",
    runner: "ubuntu-22.04",
    toolchain: "Docker Buildx",
    severity: "high",
    tags: ["docker", "buildx", "dockerfile", "path"],
    rootCause: "Docker Buildx cannot locate the Dockerfile. This is almost always a working directory mismatch — your docker build context defaults to the repo root, but your Dockerfile lives in a subdirectory, or your job's working-directory is set to a subfolder.",
    fixSteps: [
      "Explicitly pass --file flag: docker buildx build --file ./apps/api/Dockerfile .",
      "Check if you set working-directory on the job/step — Buildx context inherits this.",
      "Verify the Dockerfile path with: ls -la ${{ github.workspace }} in a prior step.",
      "If using docker/build-push-action, set context: ./apps/api and file: ./apps/api/Dockerfile.",
    ],
    reproduction: `# Broken
- uses: docker/build-push-action@v5
  with:
    push: false

# Fixed
- uses: docker/build-push-action@v5
  with:
    context: ./apps/api
    file: ./apps/api/Dockerfile
    push: false`,
    sponsored: null,
    related: ["gha-exit-137", "gitlab-docker-daemon-not-running"],
  },
  {
    id: "gitlab-docker-daemon-not-running",
    errorString: "Cannot connect to the Docker daemon at unix:///var/run/docker.sock. Is the docker daemon running?",
    provider: "GitLab CI",
    runner: "gitlab-runner shell",
    toolchain: "Docker",
    severity: "critical",
    tags: ["docker", "daemon", "socket", "gitlab", "dind"],
    rootCause: "Your GitLab runner is using the shell executor but Docker is either not installed, not started, or the gitlab-runner user doesn't have permission to access the Docker socket. Alternatively you're using the docker executor without docker:dind service.",
    fixSteps: [
      "For shell executor: sudo usermod -aG docker gitlab-runner, then restart the runner.",
      "For docker executor: add services: [docker:24-dind] and set DOCKER_HOST: tcp://docker:2376.",
      "Verify daemon is running on the host: sudo systemctl status docker.",
      "Check socket permissions: ls -la /var/run/docker.sock — group should be docker.",
    ],
    reproduction: `# .gitlab-ci.yml — correct dind setup
build:
  image: docker:24
  services:
    - docker:24-dind
  variables:
    DOCKER_HOST: tcp://docker:2376
    DOCKER_TLS_CERTDIR: "/certs"
  script:
    - docker build -t myapp .`,
    sponsored: {
      name: "BuildKite",
      tagline: "Elastic CI — pre-warmed Docker agents, zero daemon config.",
      url: "#",
    },
    related: ["gha-exit-1-docker-buildx", "gha-exit-137"],
  },
  {
    id: "gha-node-heap-exceeded",
    errorString: "FATAL ERROR: CALL_AND_RETRY_LAST Allocation failed - JavaScript heap out of memory",
    provider: "GitHub Actions",
    runner: "ubuntu-22.04",
    toolchain: "Node.js / Webpack",
    severity: "critical",
    tags: ["node", "heap", "webpack", "memory", "oom"],
    rootCause: "Node.js hit its default heap limit (~1.5 GB on 64-bit). Common culprits: Webpack bundling a large monorepo, ts-node compiling without incremental builds, or running multiple memory-heavy tools in sequence without releasing memory.",
    fixSteps: [
      "Set NODE_OPTIONS='--max-old-space-size=4096' before the failing command.",
      "Enable Webpack cache: cache: { type: 'filesystem' } to skip re-processing unchanged modules.",
      "Split builds: build each package separately instead of one giant bundle.",
      "Use esbuild or SWC as Webpack loaders — dramatically lower memory footprint than babel-loader.",
    ],
    reproduction: `# package.json
{
  "scripts": {
    "build": "NODE_OPTIONS='--max-old-space-size=4096' webpack --config webpack.prod.js"
  }
}`,
    sponsored: {
      name: "Nx Cloud",
      tagline: "Remote computation cache — never rebuild what hasn't changed.",
      url: "#",
    },
    related: ["gha-exit-137"],
  },
];

const SEVERITY_META = {
  critical: { label: "CRITICAL", color: "#ff3b3b", bg: "rgba(255,59,59,0.1)" },
  high: { label: "HIGH", color: "#ff8c00", bg: "rgba(255,140,0,0.1)" },
  medium: { label: "MEDIUM", color: "#f5c400", bg: "rgba(245,196,0,0.1)" },
};

const PROVIDER_COLORS = {
  "GitHub Actions": "#58a6ff",
  "GitLab CI": "#fc6d26",
  "CircleCI": "#343434",
};

export default function ErrorDex() {
  const [view, setView] = useState("home"); // home | entry | submit | submitted
 const [selectedId, setSelectedId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [submitForm, setSubmitForm] = useState({ error: "", provider: "", runner: "", toolchain: "" });
  const [activeFilter, setActiveFilter] = useState("all");

  const filtered = useMemo(() => {
    return FAILURES.filter((f) => {
      const q = searchQuery.toLowerCase();
      const matchesSearch =
        !q ||
        f.errorString.toLowerCase().includes(q) ||
        f.tags.some((t) => t.includes(q)) ||
        f.toolchain.toLowerCase().includes(q) ||
        f.runner.toLowerCase().includes(q);
      const matchesFilter = activeFilter === "all" || f.provider === activeFilter;
      return matchesSearch && matchesFilter;
    });
  }, [searchQuery, activeFilter]);

  const selectedEntry = FAILURES.find((f) => f.id === selectedId);

const openEntry = (id: string) => {
    setSelectedId(id);
    setView("entry");
  };

  return (
    <div style={styles.root}>
      <style>{globalCSS}</style>

      {/* NAV */}
      <nav style={styles.nav}>
        <button style={styles.logo} onClick={() => setView("home")}>
          <span style={styles.logoIcon}>⬡</span>
          <span style={styles.logoText}>errordex</span>
        </button>
        <div style={styles.navLinks}>
          <button style={styles.navLink} onClick={() => setView("home")}>Search</button>
          <button style={styles.navLinkAccent} onClick={() => setView("submit")}>Submit Error</button>
        </div>
      </nav>

      {/* HOME */}
      {view === "home" && (
        <div style={styles.page}>
          <div style={styles.hero}>
            <div style={styles.heroEyebrow}>CI/CD Failure Encyclopedia</div>
            <h1 style={styles.heroTitle}>
              Paste the error.<br />
              <span style={styles.heroAccent}>Get the fix.</span>
            </h1>
            <p style={styles.heroSub}>
              Verbatim error strings indexed by runner, toolchain, and provider.
              Built for engineers debugging at 2am.
            </p>

            <div style={styles.searchWrap}>
              <span style={styles.searchIcon}>⌕</span>
              <input
                style={styles.searchInput}
                placeholder='Paste your exact error string, e.g. "exit code 137"'
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                autoFocus
              />
              {searchQuery && (
                <button style={styles.searchClear} onClick={() => setSearchQuery("")}>✕</button>
              )}
            </div>

            <div style={styles.filters}>
              {["all", "GitHub Actions", "GitLab CI"].map((f) => (
                <button
                  key={f}
                  style={{ ...styles.filterChip, ...(activeFilter === f ? styles.filterChipActive : {}) }}
                  onClick={() => setActiveFilter(f)}
                >
                  {f === "all" ? "All providers" : f}
                </button>
              ))}
            </div>
          </div>

          {/* RESULTS */}
          <div style={styles.results}>
            {filtered.length === 0 && (
              <div style={styles.empty}>
                <div style={styles.emptyIcon}>⚠</div>
                <p style={styles.emptyText}>No match found.</p>
                <p style={styles.emptySubtext}>Help the community — submit this error.</p>
                <button style={styles.btnPrimary} onClick={() => { setSubmitForm(f => ({ ...f, error: searchQuery })); setView("submit"); }}>
                  Submit error string →
                </button>
              </div>
            )}
            {filtered.map((f, i) => (
              <button
                key={f.id}
                style={{ ...styles.card, animationDelay: `${i * 60}ms` }}
                className="card-hover"
                onClick={() => openEntry(f.id)}
              >
                <div style={styles.cardTop}>
                  <div style={styles.cardMeta}>
                    <span style={{ ...styles.severityBadge, color: SEVERITY_META[f.severity].color, background: SEVERITY_META[f.severity].bg }}>
                      {SEVERITY_META[f.severity].label}
                    </span>
                    <span style={{ ...styles.providerBadge, color: PROVIDER_COLORS[f.provider] || "#aaa" }}>
                      {f.provider}
                    </span>
                    <span style={styles.runnerBadge}>{f.runner}</span>
                  </div>
                  <span style={styles.cardArrow}>→</span>
                </div>
                <div style={styles.cardError}>{f.errorString}</div>
                <div style={styles.cardFooter}>
                  <span style={styles.toolchainLabel}>{f.toolchain}</span>
                  <div style={styles.cardTags}>
                    {f.tags.slice(0, 3).map((t) => (
                      <span key={t} style={styles.tag}>{t}</span>
                    ))}
                  </div>
                </div>
              </button>
            ))}
          </div>

          <div style={styles.statsBar}>
            <span style={styles.stat}><strong>{FAILURES.length}</strong> indexed failures</span>
            <span style={styles.statDot}>·</span>
            <span style={styles.stat}><strong>3</strong> CI providers</span>
            <span style={styles.statDot}>·</span>
            <span style={styles.stat}>Community-sourced</span>
          </div>
        </div>
      )}

      {/* ENTRY DETAIL */}
      {view === "entry" && selectedEntry && (
        <div style={styles.page}>
          <button style={styles.backBtn} onClick={() => setView("home")}>← Back to search</button>

          <div style={styles.entryHeader}>
            <div style={styles.cardMeta}>
              <span style={{ ...styles.severityBadge, color: SEVERITY_META[selectedEntry.severity].color, background: SEVERITY_META[selectedEntry.severity].bg }}>
                {SEVERITY_META[selectedEntry.severity].label}
              </span>
              <span style={{ ...styles.providerBadge, color: PROVIDER_COLORS[selectedEntry.provider] || "#aaa" }}>
                {selectedEntry.provider}
              </span>
              <span style={styles.runnerBadge}>{selectedEntry.runner}</span>
              <span style={styles.runnerBadge}>{selectedEntry.toolchain}</span>
            </div>
            <h2 style={styles.entryErrorString}>{selectedEntry.errorString}</h2>
          </div>

          <div style={styles.entryGrid}>
            <div style={styles.entryMain}>
              {/* ROOT CAUSE */}
              <section style={styles.section}>
                <div style={styles.sectionLabel}>ROOT CAUSE</div>
                <p style={styles.sectionText}>{selectedEntry.rootCause}</p>
              </section>

              {/* FIX STEPS */}
              <section style={styles.section}>
                <div style={styles.sectionLabel}>FIX STEPS</div>
                <ol style={styles.fixList}>
                  {selectedEntry.fixSteps.map((step, i) => (
                    <li key={i} style={styles.fixItem}>
                      <span style={styles.fixNum}>{String(i + 1).padStart(2, "0")}</span>
                      <span style={styles.fixText}>{step}</span>
                    </li>
                  ))}
                </ol>
              </section>

              {/* REPRODUCTION */}
              <section style={styles.section}>
                <div style={styles.sectionLabel}>MINIMAL REPRODUCTION</div>
                <div style={styles.codeBlock}>
                  <pre style={styles.code}>{selectedEntry.reproduction}</pre>
                </div>
              </section>
            </div>

            <div style={styles.entrySidebar}>
              {/* SPONSORED */}
              {selectedEntry.sponsored && (
                <div style={styles.sponsoredCard}>
                  <div style={styles.sponsoredLabel}>SPONSORED FIX</div>
                  <div style={styles.sponsoredName}>{selectedEntry.sponsored.name}</div>
                  <p style={styles.sponsoredTagline}>{selectedEntry.sponsored.tagline}</p>
                  <a href={selectedEntry.sponsored.url} style={styles.sponsoredBtn}>
                    Learn more →
                  </a>
                </div>
              )}

              {/* RELATED */}
              <div style={styles.relatedCard}>
                <div style={styles.sectionLabel}>RELATED FAILURES</div>
                {selectedEntry.related.map((rid) => {
                  const rel = FAILURES.find((f) => f.id === rid);
                  if (!rel) return null;
                  return (
                    <button key={rid} style={styles.relatedItem} onClick={() => openEntry(rid)}>
                      <span style={{ ...styles.severityDot, background: SEVERITY_META[rel.severity].color }} />
                      <span style={styles.relatedText}>{rel.errorString.slice(0, 52)}…</span>
                    </button>
                  );
                })}
              </div>

              {/* SUBMIT CTA */}
              <div style={styles.submitCta}>
                <p style={styles.submitCtaText}>Got a variation of this error?</p>
                <button style={styles.btnOutline} onClick={() => setView("submit")}>
                  Submit your signature →
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* SUBMIT FORM */}
      {view === "submit" && (
        <div style={styles.page}>
          <button style={styles.backBtn} onClick={() => setView("home")}>← Back</button>
          <div style={styles.formWrap}>
            <div style={styles.formHeader}>
              <div style={styles.heroEyebrow}>Contribute</div>
              <h2 style={styles.formTitle}>Submit an error signature</h2>
              <p style={styles.formSubtitle}>Your submission is anonymized. We'll standardize it and add it to the index.</p>
            </div>

            <div style={styles.formFields}>
              <label style={styles.fieldLabel}>Error string (verbatim) *</label>
              <textarea
                style={styles.textarea}
                placeholder="Paste the exact error message from your CI log"
                value={submitForm.error}
                onChange={(e) => setSubmitForm(f => ({ ...f, error: e.target.value }))}
                rows={4}
              />

              <div style={styles.fieldRow}>
                <div style={styles.fieldGroup}>
                  <label style={styles.fieldLabel}>CI Provider *</label>
                  <select
                    style={styles.select}
                    value={submitForm.provider}
                    onChange={(e) => setSubmitForm(f => ({ ...f, provider: e.target.value }))}
                  >
                    <option value="">Select provider</option>
                    <option>GitHub Actions</option>
                    <option>GitLab CI</option>
                    <option>CircleCI</option>
                    <option>Jenkins</option>
                    <option>Bitbucket Pipelines</option>
                    <option>Other</option>
                  </select>
                </div>
                <div style={styles.fieldGroup}>
                  <label style={styles.fieldLabel}>Runner / Image</label>
                  <input
                    style={styles.input}
                    placeholder="e.g. ubuntu-22.04, docker:24-dind"
                    value={submitForm.runner}
                    onChange={(e) => setSubmitForm(f => ({ ...f, runner: e.target.value }))}
                  />
                </div>
              </div>

              <label style={styles.fieldLabel}>Toolchain / Stack</label>
              <input
                style={styles.input}
                placeholder="e.g. Node 20 / Webpack 5 / Docker Buildx"
                value={submitForm.toolchain}
                onChange={(e) => setSubmitForm(f => ({ ...f, toolchain: e.target.value }))}
              />

              <div style={styles.privacyNote}>
                🔒 No account needed. No IP logged. Submission is reviewed before publishing.
              </div>

              <button
                style={{ ...styles.btnPrimary, opacity: submitForm.error && submitForm.provider ? 1 : 0.4 }}
                disabled={!submitForm.error || !submitForm.provider}
                onClick={() => setView("submitted")}
              >
                Submit for review →
              </button>
            </div>
          </div>
        </div>
      )}

      {/* SUBMITTED */}
      {view === "submitted" && (
        <div style={styles.page}>
          <div style={styles.successWrap}>
            <div style={styles.successIcon}>✓</div>
            <h2 style={styles.successTitle}>Submitted for review</h2>
            <p style={styles.successText}>
              Your error signature is queued. Once reviewed and standardized, it'll be indexed and searchable — helping the next engineer who hits the same wall.
            </p>
            <button style={styles.btnPrimary} onClick={() => { setView("home"); setSubmitForm({ error: "", provider: "", runner: "", toolchain: "" }); }}>
              Back to search
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

const globalCSS = `
  @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;600;700&family=Epilogue:wght@400;500;700;900&display=swap');

  * { box-sizing: border-box; margin: 0; padding: 0; }

  .card-hover {
    transition: transform 0.18s ease, border-color 0.18s ease, box-shadow 0.18s ease;
    animation: fadeUp 0.4s ease both;
  }
  .card-hover:hover {
    transform: translateY(-2px);
    border-color: rgba(0,255,136,0.35) !important;
    box-shadow: 0 8px 32px rgba(0,255,136,0.08) !important;
  }

  @keyframes fadeUp {
    from { opacity: 0; transform: translateY(16px); }
    to { opacity: 1; transform: translateY(0); }
  }

  ::-webkit-scrollbar { width: 6px; }
  ::-webkit-scrollbar-track { background: #0a0a0a; }
  ::-webkit-scrollbar-thumb { background: #2a2a2a; border-radius: 3px; }
`;

const styles = {
  root: {
    minHeight: "100vh",
    background: "#0a0a0a",
    color: "#e8e8e0",
    fontFamily: "'Epilogue', sans-serif",
  },
  nav: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "0 32px",
    height: 56,
    borderBottom: "1px solid #1a1a1a",
    position: "sticky",
    top: 0,
    background: "rgba(10,10,10,0.95)",
    backdropFilter: "blur(12px)",
    zIndex: 100,
  },
  logo: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    background: "none",
    border: "none",
    cursor: "pointer",
    padding: 0,
  },
  logoIcon: { fontSize: 20, color: "#00ff88" },
  logoText: {
    fontFamily: "'JetBrains Mono', monospace",
    fontWeight: 700,
    fontSize: 16,
    color: "#e8e8e0",
    letterSpacing: "-0.5px",
  },
  navLinks: { display: "flex", gap: 8, alignItems: "center" },
  navLink: {
    background: "none",
    border: "none",
    color: "#888",
    fontSize: 13,
    cursor: "pointer",
    padding: "6px 12px",
    borderRadius: 6,
    transition: "color 0.15s",
    fontFamily: "'Epilogue', sans-serif",
  },
  navLinkAccent: {
    background: "rgba(0,255,136,0.08)",
    border: "1px solid rgba(0,255,136,0.2)",
    color: "#00ff88",
    fontSize: 13,
    cursor: "pointer",
    padding: "6px 14px",
    borderRadius: 6,
    fontFamily: "'Epilogue', sans-serif",
    fontWeight: 500,
  },

  page: {
    maxWidth: 900,
    margin: "0 auto",
    padding: "48px 24px",
  },

  hero: { textAlign: "center", marginBottom: 40 },
  heroEyebrow: {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: 11,
    letterSpacing: "0.15em",
    color: "#00ff88",
    textTransform: "uppercase",
    marginBottom: 16,
  },
  heroTitle: {
    fontSize: "clamp(36px, 6vw, 58px)",
    fontWeight: 900,
    lineHeight: 1.05,
    letterSpacing: "-2px",
    color: "#f0f0e8",
    marginBottom: 16,
  },
  heroAccent: { color: "#00ff88" },
  heroSub: {
    fontSize: 16,
    color: "#666",
    maxWidth: 480,
    margin: "0 auto 32px",
    lineHeight: 1.6,
  },

  searchWrap: {
    display: "flex",
    alignItems: "center",
    background: "#111",
    border: "1px solid #2a2a2a",
    borderRadius: 10,
    padding: "0 16px",
    transition: "border-color 0.2s",
    maxWidth: 640,
    margin: "0 auto 16px",
  },
  searchIcon: {
    fontSize: 20,
    color: "#444",
    marginRight: 10,
    fontFamily: "monospace",
  },
  searchInput: {
    flex: 1,
    background: "none",
    border: "none",
    outline: "none",
    color: "#e8e8e0",
    fontSize: 14,
    padding: "14px 0",
    fontFamily: "'JetBrains Mono', monospace",
  },
  searchClear: {
    background: "none",
    border: "none",
    color: "#444",
    cursor: "pointer",
    fontSize: 14,
    padding: 4,
  },

  filters: {
    display: "flex",
    justifyContent: "center",
    gap: 8,
    flexWrap: "wrap",
  },
  filterChip: {
    background: "none",
    border: "1px solid #222",
    color: "#666",
    fontSize: 12,
    padding: "5px 12px",
    borderRadius: 20,
    cursor: "pointer",
    fontFamily: "'JetBrains Mono', monospace",
    transition: "all 0.15s",
  },
  filterChipActive: {
    border: "1px solid #00ff88",
    color: "#00ff88",
    background: "rgba(0,255,136,0.06)",
  },

  results: { display: "flex", flexDirection: "column", gap: 12 },
  card: {
    background: "#111",
    border: "1px solid #1e1e1e",
    borderRadius: 10,
    padding: "20px 24px",
    cursor: "pointer",
    textAlign: "left",
    width: "100%",
    display: "flex",
    flexDirection: "column",
    gap: 10,
  },
  cardTop: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
  },
  cardMeta: { display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" },
  cardArrow: { color: "#333", fontSize: 18 },
  cardError: {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: 13,
    color: "#e8e8e0",
    lineHeight: 1.5,
    wordBreak: "break-word",
  },
  cardFooter: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 8,
  },
  cardTags: { display: "flex", gap: 6, flexWrap: "wrap" },

  severityBadge: {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: "0.08em",
    padding: "3px 8px",
    borderRadius: 4,
  },
  providerBadge: {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: 11,
    fontWeight: 600,
  },
  runnerBadge: {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: 11,
    color: "#555",
    background: "#161616",
    padding: "2px 8px",
    borderRadius: 4,
  },
  toolchainLabel: {
    fontSize: 12,
    color: "#555",
    fontFamily: "'JetBrains Mono', monospace",
  },
  tag: {
    fontSize: 11,
    color: "#444",
    background: "#161616",
    padding: "2px 7px",
    borderRadius: 4,
    fontFamily: "'JetBrains Mono', monospace",
  },

  empty: {
    textAlign: "center",
    padding: "64px 24px",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 12,
  },
  emptyIcon: { fontSize: 36, opacity: 0.3 },
  emptyText: { fontSize: 18, color: "#666" },
  emptySubtext: { fontSize: 14, color: "#444" },

  statsBar: {
    display: "flex",
    justifyContent: "center",
    gap: 12,
    marginTop: 40,
    color: "#444",
    fontSize: 13,
    fontFamily: "'JetBrains Mono', monospace",
  },
  stat: { color: "#555" },
  statDot: { color: "#2a2a2a" },

  // ENTRY
  backBtn: {
    background: "none",
    border: "none",
    color: "#555",
    fontSize: 13,
    cursor: "pointer",
    marginBottom: 32,
    fontFamily: "'Epilogue', sans-serif",
    padding: 0,
    display: "block",
    transition: "color 0.15s",
  },
  entryHeader: {
    marginBottom: 40,
    paddingBottom: 32,
    borderBottom: "1px solid #1a1a1a",
  },
  entryErrorString: {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: "clamp(16px, 2.5vw, 22px)",
    color: "#f0f0e8",
    lineHeight: 1.5,
    marginTop: 16,
    wordBreak: "break-word",
  },
  entryGrid: {
    display: "grid",
    gridTemplateColumns: "1fr 280px",
    gap: 32,
    alignItems: "start",
  },
  entryMain: { display: "flex", flexDirection: "column", gap: 32 },
  entrySidebar: { display: "flex", flexDirection: "column", gap: 16 },

  section: {},
  sectionLabel: {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: 10,
    letterSpacing: "0.15em",
    color: "#444",
    textTransform: "uppercase",
    marginBottom: 12,
  },
  sectionText: {
    fontSize: 14,
    color: "#999",
    lineHeight: 1.7,
  },
  fixList: {
    listStyle: "none",
    display: "flex",
    flexDirection: "column",
    gap: 12,
  },
  fixItem: {
    display: "flex",
    gap: 14,
    alignItems: "flex-start",
  },
  fixNum: {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: 11,
    color: "#00ff88",
    minWidth: 24,
    paddingTop: 2,
    opacity: 0.7,
  },
  fixText: {
    fontSize: 14,
    color: "#bbb",
    lineHeight: 1.6,
  },
  codeBlock: {
    background: "#0d0d0d",
    border: "1px solid #1e1e1e",
    borderRadius: 8,
    overflow: "hidden",
  },
  code: {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: 12,
    color: "#7ec8a0",
    lineHeight: 1.8,
    padding: "20px 24px",
    overflow: "auto",
    whiteSpace: "pre",
  },

  sponsoredCard: {
    background: "rgba(0,255,136,0.04)",
    border: "1px solid rgba(0,255,136,0.15)",
    borderRadius: 10,
    padding: "20px",
  },
  sponsoredLabel: {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: 9,
    letterSpacing: "0.15em",
    color: "#00ff88",
    opacity: 0.7,
    marginBottom: 8,
  },
  sponsoredName: {
    fontSize: 16,
    fontWeight: 700,
    color: "#f0f0e8",
    marginBottom: 8,
  },
  sponsoredTagline: {
    fontSize: 13,
    color: "#777",
    lineHeight: 1.5,
    marginBottom: 14,
  },
  sponsoredBtn: {
    display: "inline-block",
    fontSize: 12,
    color: "#00ff88",
    textDecoration: "none",
    fontFamily: "'JetBrains Mono', monospace",
    fontWeight: 600,
  },
  relatedCard: {
    background: "#111",
    border: "1px solid #1e1e1e",
    borderRadius: 10,
    padding: "20px",
    display: "flex",
    flexDirection: "column",
    gap: 12,
  },
  relatedItem: {
    background: "none",
    border: "none",
    cursor: "pointer",
    display: "flex",
    alignItems: "flex-start",
    gap: 10,
    padding: 0,
    textAlign: "left",
  },
  relatedText: {
    fontSize: 12,
    color: "#666",
    fontFamily: "'JetBrains Mono', monospace",
    lineHeight: 1.5,
    transition: "color 0.15s",
  },
  severityDot: {
    width: 6,
    height: 6,
    borderRadius: "50%",
    marginTop: 5,
    flexShrink: 0,
  },
  submitCta: {
    background: "#111",
    border: "1px solid #1e1e1e",
    borderRadius: 10,
    padding: "20px",
    textAlign: "center",
  },
  submitCtaText: {
    fontSize: 13,
    color: "#555",
    marginBottom: 12,
  },

  // FORM
  formWrap: {
    maxWidth: 580,
    margin: "0 auto",
  },
  formHeader: { marginBottom: 40 },
  formTitle: {
    fontSize: 36,
    fontWeight: 900,
    letterSpacing: "-1.5px",
    color: "#f0f0e8",
    marginBottom: 10,
  },
  formSubtitle: { fontSize: 14, color: "#666", lineHeight: 1.6 },
  formFields: { display: "flex", flexDirection: "column", gap: 20 },
  fieldLabel: {
    display: "block",
    fontSize: 11,
    fontFamily: "'JetBrains Mono', monospace",
    color: "#555",
    letterSpacing: "0.08em",
    marginBottom: 8,
    textTransform: "uppercase",
  },
  fieldRow: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 },
  fieldGroup: { display: "flex", flexDirection: "column" },
  textarea: {
    background: "#111",
    border: "1px solid #222",
    borderRadius: 8,
    color: "#e8e8e0",
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: 12,
    padding: "12px 16px",
    resize: "vertical",
    outline: "none",
    lineHeight: 1.6,
  },
  input: {
    background: "#111",
    border: "1px solid #222",
    borderRadius: 8,
    color: "#e8e8e0",
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: 12,
    padding: "12px 16px",
    outline: "none",
  },
  select: {
    background: "#111",
    border: "1px solid #222",
    borderRadius: 8,
    color: "#e8e8e0",
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: 12,
    padding: "12px 16px",
    outline: "none",
  },
  privacyNote: {
    fontSize: 12,
    color: "#444",
    background: "#0d0d0d",
    border: "1px solid #1a1a1a",
    borderRadius: 6,
    padding: "10px 14px",
    fontFamily: "'JetBrains Mono', monospace",
  },

  // BUTTONS
  btnPrimary: {
    background: "#00ff88",
    color: "#0a0a0a",
    border: "none",
    borderRadius: 8,
    padding: "13px 24px",
    fontSize: 13,
    fontWeight: 700,
    fontFamily: "'Epilogue', sans-serif",
    cursor: "pointer",
    transition: "opacity 0.15s",
    letterSpacing: "-0.3px",
  },
  btnOutline: {
    background: "none",
    border: "1px solid #2a2a2a",
    color: "#888",
    borderRadius: 8,
    padding: "10px 18px",
    fontSize: 12,
    cursor: "pointer",
    fontFamily: "'JetBrains Mono', monospace",
    transition: "border-color 0.15s",
  },

  // SUCCESS
  successWrap: {
    maxWidth: 480,
    margin: "80px auto",
    textAlign: "center",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 16,
  },
  successIcon: {
    width: 56,
    height: 56,
    borderRadius: "50%",
    background: "rgba(0,255,136,0.1)",
    border: "1px solid rgba(0,255,136,0.3)",
    color: "#00ff88",
    fontSize: 24,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  successTitle: {
    fontSize: 28,
    fontWeight: 900,
    letterSpacing: "-1px",
    color: "#f0f0e8",
  },
  successText: {
    fontSize: 14,
    color: "#666",
    lineHeight: 1.7,
    maxWidth: 380,
  },
};
