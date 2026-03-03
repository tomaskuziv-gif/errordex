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
      tagline: "10x faster Docker builds with remote cache — no OOM on ephemeral runners.",
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
      "Verify the Dockerfile path with: ls -la in a prior step.",
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
    rootCause: "Your GitLab runner is using the shell executor but Docker is either not installed, not started, or the gitlab-runner user does not have permission to access the Docker socket.",
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
// ZKOPÍRUJ TYTO ZÁZNAMY A VLOŽ JE DO POLE FAILURES V page.jsx
// Přidej je za poslední záznam, před uzavírací ]

  {
    id: "gha-npm-ci-frozen-lockfile",
    errorString: "npm ci can only install packages when your package.json and package-lock.json or npm-shrinkwrap.json are in sync",
    provider: "GitHub Actions",
    runner: "ubuntu-22.04",
    toolchain: "Node.js / npm",
    severity: "high",
    tags: ["npm", "lockfile", "package-lock", "ci"],
    rootCause: "Your package.json was updated (new dependency added or version changed) but package-lock.json was not committed alongside it. npm ci is stricter than npm install — it requires both files to be perfectly in sync.",
    fixSteps: [
      "Run npm install locally to regenerate package-lock.json.",
      "Commit both package.json and package-lock.json together.",
      "Never edit package.json manually — always use npm install <package> so lockfile updates automatically.",
      "Add a CI check: npm ci --dry-run to catch this before it reaches your pipeline.",
    ],
    reproduction: `# Fix: run locally and commit both files
npm install
git add package.json package-lock.json
git commit -m "sync lockfile"
git push`,
    sponsored: null,
    related: ["gha-exit-137", "gha-node-heap-exceeded"],
  },
  {
    id: "gha-actions-checkout-permission",
    errorString: "remote: Permission to repo.git denied to github-actions[bot]",
    provider: "GitHub Actions",
    runner: "ubuntu-22.04",
    toolchain: "Git / GitHub Actions",
    severity: "high",
    tags: ["permissions", "github-actions", "token", "git", "push"],
    rootCause: "The default GITHUB_TOKEN does not have write permissions to push back to the repository. This commonly happens when a workflow tries to commit generated files, bump versions, or update changelogs.",
    fixSteps: [
      "In your workflow file add permissions: contents: write at the top level.",
      "Or pass the token explicitly: token: ${{ secrets.GITHUB_TOKEN }} to actions/checkout.",
      "For cross-repo pushes you need a Personal Access Token (PAT) stored as a secret.",
      "Check repo Settings → Actions → General → Workflow permissions — set to Read and write.",
    ],
    reproduction: `# .github/workflows/release.yml
permissions:
  contents: write

jobs:
  release:
    runs-on: ubuntu-22.04
    steps:
      - uses: actions/checkout@v4
        with:
          token: \${{ secrets.GITHUB_TOKEN }}`,
    sponsored: null,
    related: ["gha-exit-137"],
  },
  {
    id: "gha-docker-layer-cache-miss",
    errorString: "importing cache manifest from ghcr.io: unexpected status code 401 Unauthorized",
    provider: "GitHub Actions",
    runner: "ubuntu-22.04",
    toolchain: "Docker Buildx / GHCR",
    severity: "medium",
    tags: ["docker", "cache", "ghcr", "401", "registry", "buildx"],
    rootCause: "Docker Buildx cannot authenticate to GitHub Container Registry (ghcr.io) when pulling the build cache. The GITHUB_TOKEN is not being passed to the registry login step, or the package visibility is set to private without proper auth.",
    fixSteps: [
      "Add a login step before the build: use docker/login-action@v3 with registry: ghcr.io.",
      "Pass username: ${{ github.actor }} and password: ${{ secrets.GITHUB_TOKEN }}.",
      "Make sure your package (image) visibility in GitHub Packages is set correctly.",
      "Add permissions: packages: write to your workflow.",
    ],
    reproduction: `- name: Login to GHCR
  uses: docker/login-action@v3
  with:
    registry: ghcr.io
    username: \${{ github.actor }}
    password: \${{ secrets.GITHUB_TOKEN }}

- name: Build with cache
  uses: docker/build-push-action@v5
  with:
    cache-from: type=registry,ref=ghcr.io/myorg/myapp:cache
    cache-to: type=registry,ref=ghcr.io/myorg/myapp:cache,mode=max`,
    sponsored: {
      name: "Depot",
      tagline: "Persistent Docker layer cache across all your CI runs — no registry setup needed.",
      url: "#",
    },
    related: ["gha-exit-1-docker-buildx", "gha-exit-137"],
  },
  {
    id: "gha-jest-timeout",
    errorString: "Exceeded timeout of 5000 ms for a test.",
    provider: "GitHub Actions",
    runner: "ubuntu-22.04",
    toolchain: "Node.js / Jest",
    severity: "medium",
    tags: ["jest", "timeout", "test", "async", "node"],
    rootCause: "A Jest test is taking longer than the default 5 second timeout. On CI runners this is more common than locally because shared runners have less CPU, more I/O latency, and cold-start penalties for database or network connections.",
    fixSteps: [
      "Increase timeout for slow tests: jest.setTimeout(30000) at the top of the test file.",
      "Mock external services instead of making real network calls in unit tests.",
      "Check for missing await on async operations — an unawaited promise causes silent hangs.",
      "Use --testTimeout=10000 flag globally in your jest config for all CI runs.",
    ],
    reproduction: `// jest.config.js
module.exports = {
  testTimeout: 10000, // 10s for CI
};

// or per-file
beforeAll(() => {
  jest.setTimeout(30000);
});`,
    sponsored: null,
    related: ["gha-exit-137", "gha-node-heap-exceeded"],
  },
  {
    id: "gitlab-runner-no-space",
    errorString: "no space left on device",
    provider: "GitLab CI",
    runner: "gitlab-runner shell",
    toolchain: "Docker / Any",
    severity: "critical",
    tags: ["disk", "space", "docker", "gitlab", "storage"],
    rootCause: "The GitLab runner host has run out of disk space. Docker images, build artifacts, and npm/pip caches accumulate over time on self-hosted runners and are never automatically cleaned up.",
    fixSteps: [
      "Run docker system prune -af on the runner host to remove unused images and containers.",
      "Clear GitLab runner cache: gitlab-runner cache-clear.",
      "Add a scheduled CI job that runs docker system prune -af weekly.",
      "Increase disk size of the runner host, or switch to ephemeral cloud runners.",
    ],
    reproduction: `# Add to .gitlab-ci.yml as a scheduled cleanup job
cleanup:
  script:
    - docker system prune -af --volumes
  only:
    - schedules`,
    sponsored: {
      name: "BuildKite",
      tagline: "Ephemeral cloud runners — fresh disk every build, no cleanup needed.",
      url: "#",
    },
    related: ["gitlab-docker-daemon-not-running", "gha-exit-137"],
  },
  {
    id: "gha-env-secret-empty",
    errorString: "Error: Input required and not supplied: token",
    provider: "GitHub Actions",
    runner: "ubuntu-22.04",
    toolchain: "GitHub Actions",
    severity: "high",
    tags: ["secrets", "env", "token", "input", "actions"],
    rootCause: "A required input for an Action is empty. This almost always means a secret is not set in the repository, or it is set at the wrong level (org vs repo vs environment), or the secret name in the workflow has a typo.",
    fixSteps: [
      "Go to repo Settings → Secrets and variables → Actions and verify the secret exists.",
      "Check the exact name — secret names are case-sensitive. MY_TOKEN is not the same as my_token.",
      "If using environments (production/staging), make sure the secret is added to that specific environment.",
      "Print available env vars with: env | grep -v SECRET to debug without exposing values.",
    ],
    reproduction: `# Check secret name matches exactly
- name: Deploy
  uses: some-action@v1
  with:
    token: \${{ secrets.MY_EXACT_SECRET_NAME }}
    # Must match Settings → Secrets → Name`,
    sponsored: null,
    related: ["gha-actions-checkout-permission"],
  },
  {
    id: "gha-python-pip-no-module",
    errorString: "ModuleNotFoundError: No module named 'X'",
    provider: "GitHub Actions",
    runner: "ubuntu-22.04",
    toolchain: "Python / pip",
    severity: "medium",
    tags: ["python", "pip", "module", "dependencies", "venv"],
    rootCause: "A Python module is missing in the CI environment. Either it is not in requirements.txt, the wrong Python version is active, or pip install ran in a different virtual environment than the one running your code.",
    fixSteps: [
      "Make sure the missing package is listed in requirements.txt or pyproject.toml.",
      "Use actions/setup-python and pin the exact Python version: python-version: '3.11'.",
      "Always run pip install -r requirements.txt in the same step that runs your code.",
      "Use pip freeze > requirements.txt locally to capture exact versions.",
    ],
    reproduction: `- uses: actions/setup-python@v5
  with:
    python-version: '3.11'
    cache: 'pip'

- name: Install dependencies
  run: pip install -r requirements.txt

- name: Run tests
  run: pytest`,
    sponsored: null,
    related: ["gha-exit-137"],
  },
  {
    id: "gha-artifact-not-found",
    errorString: "Unable to find any artifacts for the associated workflow",
    provider: "GitHub Actions",
    runner: "ubuntu-22.04",
    toolchain: "GitHub Actions",
    severity: "medium",
    tags: ["artifacts", "upload", "download", "workflow", "actions"],
    rootCause: "A job is trying to download an artifact that was never uploaded, or was uploaded in a different workflow run. This commonly happens when an upload-artifact step was skipped due to a prior failure, or when artifact names don't match exactly.",
    fixSteps: [
      "Check that the upload-artifact step ran successfully in the producing job.",
      "Verify the artifact name matches exactly between upload and download steps.",
      "Add if: always() to upload-artifact if you want artifacts even when the job fails.",
      "Artifacts expire after 90 days by default — check if you're referencing an old run.",
    ],
    reproduction: `# Producer job
- uses: actions/upload-artifact@v4
  with:
    name: build-output   # must match exactly
    path: ./dist

# Consumer job
- uses: actions/download-artifact@v4
  with:
    name: build-output   # must match exactly`,
    sponsored: null,
    related: ["gha-actions-checkout-permission", "gha-env-secret-empty"],
  },
  {
    id: "gha-exit-code-1-eslint",
    errorString: "ESLint found too many warnings (maximum: 0)",
    provider: "GitHub Actions",
    runner: "ubuntu-22.04",
    toolchain: "Node.js / ESLint",
    severity: "low",
    tags: ["eslint", "lint", "warnings", "node", "quality"],
    rootCause: "ESLint is configured with --max-warnings 0, meaning any warning fails the build. This is intentional in strict setups but often surprises teams after upgrading ESLint rules or adding new code.",
    fixSteps: [
      "Fix the actual warnings — run npx eslint . locally to see the full list.",
      "If warnings are acceptable, change --max-warnings 0 to --max-warnings 10 in your script.",
      "Use // eslint-disable-next-line rule-name to suppress specific intentional violations.",
      "Upgrade your .eslintrc gradually — use 'warn' instead of 'error' for new rules during transition.",
    ],
    reproduction: `# package.json — remove --max-warnings 0 to allow warnings
{
  "scripts": {
    "lint": "eslint . --max-warnings 10"
  }
}`,
    sponsored: null,
    related: ["gha-npm-ci-frozen-lockfile"],
  },
  {
    id: "gha-timeout-job",
    errorString: "The job running on runner GitHub Actions has exceeded the maximum execution time of 360 minutes.",
    provider: "GitHub Actions",
    runner: "ubuntu-22.04",
    toolchain: "GitHub Actions",
    severity: "critical",
    tags: ["timeout", "hung", "infinite-loop", "ci", "actions"],
    rootCause: "Your CI job hit the 6-hour GitHub Actions limit. This usually means a process is hanging waiting for input, an infinite loop in a script, a test that never resolves, or a deployment waiting for a confirmation that never comes.",
    fixSteps: [
      "Add timeout-minutes: 30 to your job to fail fast instead of waiting 6 hours.",
      "Look for interactive prompts in scripts — add -y or --yes flags to commands like apt-get install.",
      "Check for tests with missing done() callbacks or unresolved promises.",
      "Use set -e in bash scripts so any failing command immediately exits.",
    ],
    reproduction: `jobs:
  build:
    runs-on: ubuntu-22.04
    timeout-minutes: 30  # fail fast
    steps:
      - name: Install
        run: apt-get install -y curl  # -y prevents interactive prompt`,
    sponsored: null,
    related: ["gha-jest-timeout", "gha-exit-137"],
  },];


const SEVERITY_META = {
  critical: { label: "CRITICAL", color: "#ff3b3b", bg: "rgba(255,59,59,0.1)" },
  high: { label: "HIGH", color: "#ff8c00", bg: "rgba(255,140,0,0.1)" },
  medium: { label: "MEDIUM", color: "#f5c400", bg: "rgba(245,196,0,0.1)" },
  low: { label: "LOW", color: "#00ff88", bg: "rgba(0,255,136,0.1)" },
};
const PROVIDER_COLORS = {
  "GitHub Actions": "#58a6ff",
  "GitLab CI": "#fc6d26",
  "CircleCI": "#343434",
};

export default function ErrorDex() {
  const [view, setView] = useState("home");
  const [selectedId, setSelectedId] = useState(null);
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

  const openEntry = (id) => {
    setSelectedId(id);
    setView("entry");
  };

  return (
    <div style={styles.root}>
      <style>{globalCSS}</style>

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
              <section style={styles.section}>
                <div style={styles.sectionLabel}>ROOT CAUSE</div>
                <p style={styles.sectionText}>{selectedEntry.rootCause}</p>
              </section>

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

              <section style={styles.section}>
                <div style={styles.sectionLabel}>MINIMAL REPRODUCTION</div>
                <div style={styles.codeBlock}>
                  <pre style={styles.code}>{selectedEntry.reproduction}</pre>
                </div>
              </section>
            </div>

            <div style={styles.entrySidebar}>
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

      {view === "submit" && (
        <div style={styles.page}>
          <button style={styles.backBtn} onClick={() => setView("home")}>← Back</button>
          <div style={styles.formWrap}>
            <div style={styles.formHeader}>
              <div style={styles.heroEyebrow}>Contribute</div>
              <h2 style={styles.formTitle}>Submit an error signature</h2>
              <p style={styles.formSubtitle}>Your submission is anonymized. We will standardize it and add it to the index.</p>
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
                No account needed. No IP logged. Submission is reviewed before publishing.
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

      {view === "submitted" && (
        <div style={styles.page}>
          <div style={styles.successWrap}>
            <div style={styles.successIcon}>✓</div>
            <h2 style={styles.successTitle}>Submitted for review</h2>
            <p style={styles.successText}>
              Your error signature is queued. Once reviewed and standardized, it will be indexed and searchable.
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
  .card-hover { transition: transform 0.18s ease, border-color 0.18s ease, box-shadow 0.18s ease; animation: fadeUp 0.4s ease both; }
  .card-hover:hover { transform: translateY(-2px); border-color: rgba(0,255,136,0.35) !important; box-shadow: 0 8px 32px rgba(0,255,136,0.08) !important; }
  @keyframes fadeUp { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: translateY(0); } }
  ::-webkit-scrollbar { width: 6px; }
  ::-webkit-scrollbar-track { background: #0a0a0a; }
  ::-webkit-scrollbar-thumb { background: #2a2a2a; border-radius: 3px; }
`;

const styles = {
  root: { minHeight: "100vh", background: "#0a0a0a", color: "#e8e8e0", fontFamily: "'Epilogue', sans-serif" },
  nav: { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 32px", height: 56, borderBottom: "1px solid #1a1a1a", position: "sticky", top: 0, background: "rgba(10,10,10,0.95)", backdropFilter: "blur(12px)", zIndex: 100 },
  logo: { display: "flex", alignItems: "center", gap: 8, background: "none", border: "none", cursor: "pointer", padding: 0 },
  logoIcon: { fontSize: 20, color: "#00ff88" },
  logoText: { fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, fontSize: 16, color: "#e8e8e0", letterSpacing: "-0.5px" },
  navLinks: { display: "flex", gap: 8, alignItems: "center" },
  navLink: { background: "none", border: "none", color: "#888", fontSize: 13, cursor: "pointer", padding: "6px 12px", borderRadius: 6, fontFamily: "'Epilogue', sans-serif" },
  navLinkAccent: { background: "rgba(0,255,136,0.08)", border: "1px solid rgba(0,255,136,0.2)", color: "#00ff88", fontSize: 13, cursor: "pointer", padding: "6px 14px", borderRadius: 6, fontFamily: "'Epilogue', sans-serif", fontWeight: 500 },
  page: { maxWidth: 900, margin: "0 auto", padding: "48px 24px" },
  hero: { textAlign: "center", marginBottom: 40 },
  heroEyebrow: { fontFamily: "'JetBrains Mono', monospace", fontSize: 11, letterSpacing: "0.15em", color: "#00ff88", textTransform: "uppercase", marginBottom: 16 },
  heroTitle: { fontSize: "clamp(36px, 6vw, 58px)", fontWeight: 900, lineHeight: 1.05, letterSpacing: "-2px", color: "#f0f0e8", marginBottom: 16 },
  heroAccent: { color: "#00ff88" },
  heroSub: { fontSize: 16, color: "#666", maxWidth: 480, margin: "0 auto 32px", lineHeight: 1.6 },
  searchWrap: { display: "flex", alignItems: "center", background: "#111", border: "1px solid #2a2a2a", borderRadius: 10, padding: "0 16px", maxWidth: 640, margin: "0 auto 16px" },
  searchIcon: { fontSize: 20, color: "#444", marginRight: 10, fontFamily: "monospace" },
  searchInput: { flex: 1, background: "none", border: "none", outline: "none", color: "#e8e8e0", fontSize: 14, padding: "14px 0", fontFamily: "'JetBrains Mono', monospace" },
  searchClear: { background: "none", border: "none", color: "#444", cursor: "pointer", fontSize: 14, padding: 4 },
  filters: { display: "flex", justifyContent: "center", gap: 8, flexWrap: "wrap" },
  filterChip: { background: "none", border: "1px solid #222", color: "#666", fontSize: 12, padding: "5px 12px", borderRadius: 20, cursor: "pointer", fontFamily: "'JetBrains Mono', monospace" },
  filterChipActive: { border: "1px solid #00ff88", color: "#00ff88", background: "rgba(0,255,136,0.06)" },
  results: { display: "flex", flexDirection: "column", gap: 12 },
  card: { background: "#111", border: "1px solid #1e1e1e", borderRadius: 10, padding: "20px 24px", cursor: "pointer", textAlign: "left", width: "100%", display: "flex", flexDirection: "column", gap: 10 },
  cardTop: { display: "flex", justifyContent: "space-between", alignItems: "center" },
  cardMeta: { display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" },
  cardArrow: { color: "#333", fontSize: 18 },
  cardError: { fontFamily: "'JetBrains Mono', monospace", fontSize: 13, color: "#e8e8e0", lineHeight: 1.5, wordBreak: "break-word" },
  cardFooter: { display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 },
  cardTags: { display: "flex", gap: 6, flexWrap: "wrap" },
  severityBadge: { fontFamily: "'JetBrains Mono', monospace", fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", padding: "3px 8px", borderRadius: 4 },
  providerBadge: { fontFamily: "'JetBrains Mono', monospace", fontSize: 11, fontWeight: 600 },
  runnerBadge: { fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: "#555", background: "#161616", padding: "2px 8px", borderRadius: 4 },
  toolchainLabel: { fontSize: 12, color: "#555", fontFamily: "'JetBrains Mono', monospace" },
  tag: { fontSize: 11, color: "#444", background: "#161616", padding: "2px 7px", borderRadius: 4, fontFamily: "'JetBrains Mono', monospace" },
  empty: { textAlign: "center", padding: "64px 24px", display: "flex", flexDirection: "column", alignItems: "center", gap: 12 },
  emptyIcon: { fontSize: 36, opacity: 0.3 },
  emptyText: { fontSize: 18, color: "#666" },
  emptySubtext: { fontSize: 14, color: "#444" },
  statsBar: { display: "flex", justifyContent: "center", gap: 12, marginTop: 40, color: "#444", fontSize: 13, fontFamily: "'JetBrains Mono', monospace" },
  stat: { color: "#555" },
  statDot: { color: "#2a2a2a" },
  backBtn: { background: "none", border: "none", color: "#555", fontSize: 13, cursor: "pointer", marginBottom: 32, fontFamily: "'Epilogue', sans-serif", padding: 0, display: "block" },
  entryHeader: { marginBottom: 40, paddingBottom: 32, borderBottom: "1px solid #1a1a1a" },
  entryErrorString: { fontFamily: "'JetBrains Mono', monospace", fontSize: "clamp(16px, 2.5vw, 22px)", color: "#f0f0e8", lineHeight: 1.5, marginTop: 16, wordBreak: "break-word" },
  entryGrid: { display: "grid", gridTemplateColumns: "1fr 280px", gap: 32, alignItems: "start" },
  entryMain: { display: "flex", flexDirection: "column", gap: 32 },
  entrySidebar: { display: "flex", flexDirection: "column", gap: 16 },
  section: {},
  sectionLabel: { fontFamily: "'JetBrains Mono', monospace", fontSize: 10, letterSpacing: "0.15em", color: "#444", textTransform: "uppercase", marginBottom: 12 },
  sectionText: { fontSize: 14, color: "#999", lineHeight: 1.7 },
  fixList: { listStyle: "none", display: "flex", flexDirection: "column", gap: 12 },
  fixItem: { display: "flex", gap: 14, alignItems: "flex-start" },
  fixNum: { fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: "#00ff88", minWidth: 24, paddingTop: 2, opacity: 0.7 },
  fixText: { fontSize: 14, color: "#bbb", lineHeight: 1.6 },
  codeBlock: { background: "#0d0d0d", border: "1px solid #1e1e1e", borderRadius: 8, overflow: "hidden" },
  code: { fontFamily: "'JetBrains Mono', monospace", fontSize: 12, color: "#7ec8a0", lineHeight: 1.8, padding: "20px 24px", overflow: "auto", whiteSpace: "pre" },
  sponsoredCard: { background: "rgba(0,255,136,0.04)", border: "1px solid rgba(0,255,136,0.15)", borderRadius: 10, padding: "20px" },
  sponsoredLabel: { fontFamily: "'JetBrains Mono', monospace", fontSize: 9, letterSpacing: "0.15em", color: "#00ff88", opacity: 0.7, marginBottom: 8 },
  sponsoredName: { fontSize: 16, fontWeight: 700, color: "#f0f0e8", marginBottom: 8 },
  sponsoredTagline: { fontSize: 13, color: "#777", lineHeight: 1.5, marginBottom: 14 },
  sponsoredBtn: { display: "inline-block", fontSize: 12, color: "#00ff88", textDecoration: "none", fontFamily: "'JetBrains Mono', monospace", fontWeight: 600 },
  relatedCard: { background: "#111", border: "1px solid #1e1e1e", borderRadius: 10, padding: "20px", display: "flex", flexDirection: "column", gap: 12 },
  relatedItem: { background: "none", border: "none", cursor: "pointer", display: "flex", alignItems: "flex-start", gap: 10, padding: 0, textAlign: "left" },
  relatedText: { fontSize: 12, color: "#666", fontFamily: "'JetBrains Mono', monospace", lineHeight: 1.5 },
  severityDot: { width: 6, height: 6, borderRadius: "50%", marginTop: 5, flexShrink: 0 },
  submitCta: { background: "#111", border: "1px solid #1e1e1e", borderRadius: 10, padding: "20px", textAlign: "center" },
  submitCtaText: { fontSize: 13, color: "#555", marginBottom: 12 },
  formWrap: { maxWidth: 580, margin: "0 auto" },
  formHeader: { marginBottom: 40 },
  formTitle: { fontSize: 36, fontWeight: 900, letterSpacing: "-1.5px", color: "#f0f0e8", marginBottom: 10 },
  formSubtitle: { fontSize: 14, color: "#666", lineHeight: 1.6 },
  formFields: { display: "flex", flexDirection: "column", gap: 20 },
  fieldLabel: { display: "block", fontSize: 11, fontFamily: "'JetBrains Mono', monospace", color: "#555", letterSpacing: "0.08em", marginBottom: 8, textTransform: "uppercase" },
  fieldRow: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 },
  fieldGroup: { display: "flex", flexDirection: "column" },
  textarea: { background: "#111", border: "1px solid #222", borderRadius: 8, color: "#e8e8e0", fontFamily: "'JetBrains Mono', monospace", fontSize: 12, padding: "12px 16px", resize: "vertical", outline: "none", lineHeight: 1.6 },
  input: { background: "#111", border: "1px solid #222", borderRadius: 8, color: "#e8e8e0", fontFamily: "'JetBrains Mono', monospace", fontSize: 12, padding: "12px 16px", outline: "none" },
  select: { background: "#111", border: "1px solid #222", borderRadius: 8, color: "#e8e8e0", fontFamily: "'JetBrains Mono', monospace", fontSize: 12, padding: "12px 16px", outline: "none" },
  privacyNote: { fontSize: 12, color: "#444", background: "#0d0d0d", border: "1px solid #1a1a1a", borderRadius: 6, padding: "10px 14px", fontFamily: "'JetBrains Mono', monospace" },
  btnPrimary: { background: "#00ff88", color: "#0a0a0a", border: "none", borderRadius: 8, padding: "13px 24px", fontSize: 13, fontWeight: 700, fontFamily: "'Epilogue', sans-serif", cursor: "pointer", letterSpacing: "-0.3px" },
  btnOutline: { background: "none", border: "1px solid #2a2a2a", color: "#888", borderRadius: 8, padding: "10px 18px", fontSize: 12, cursor: "pointer", fontFamily: "'JetBrains Mono', monospace" },
  successWrap: { maxWidth: 480, margin: "80px auto", textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", gap: 16 },
  successIcon: { width: 56, height: 56, borderRadius: "50%", background: "rgba(0,255,136,0.1)", border: "1px solid rgba(0,255,136,0.3)", color: "#00ff88", fontSize: 24, display: "flex", alignItems: "center", justifyContent: "center" },
  successTitle: { fontSize: 28, fontWeight: 900, letterSpacing: "-1px", color: "#f0f0e8" },
  successText: { fontSize: 14, color: "#666", lineHeight: 1.7, maxWidth: 380 },
};