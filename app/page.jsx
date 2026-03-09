"use client";
import { useState, useMemo,  } from "react";

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
  {
    id: "gha-npm-ci-frozen-lockfile",
    errorString: "npm ci can only install packages when your package.json and package-lock.json or npm-shrinkwrap.json are in sync",
    provider: "GitHub Actions",
    runner: "ubuntu-22.04",
    toolchain: "Node.js / npm",
    severity: "high",
    tags: ["npm", "lockfile", "package-lock", "ci"],
    rootCause: "Your package.json was updated but package-lock.json was not committed alongside it. npm ci is stricter than npm install — it requires both files to be perfectly in sync.",
    fixSteps: [
      "Run npm install locally to regenerate package-lock.json.",
      "Commit both package.json and package-lock.json together.",
      "Never edit package.json manually — always use npm install <package>.",
    ],
    reproduction: `npm install
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
    rootCause: "The default GITHUB_TOKEN does not have write permissions to push back to the repository.",
    fixSteps: [
      "In your workflow file add permissions: contents: write at the top level.",
      "Or pass the token explicitly: token: ${{ secrets.GITHUB_TOKEN }} to actions/checkout.",
      "Check repo Settings → Actions → General → Workflow permissions.",
    ],
    reproduction: `permissions:
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
    rootCause: "Docker Buildx cannot authenticate to GitHub Container Registry when pulling the build cache.",
    fixSteps: [
      "Add a login step before the build: use docker/login-action@v3 with registry: ghcr.io.",
      "Pass username: ${{ github.actor }} and password: ${{ secrets.GITHUB_TOKEN }}.",
      "Add permissions: packages: write to your workflow.",
    ],
    reproduction: `- name: Login to GHCR
  uses: docker/login-action@v3
  with:
    registry: ghcr.io
    username: \${{ github.actor }}
    password: \${{ secrets.GITHUB_TOKEN }}`,
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
    rootCause: "A Jest test is taking longer than the default 5 second timeout. On CI runners this is more common than locally because shared runners have less CPU.",
    fixSteps: [
      "Increase timeout for slow tests: jest.setTimeout(30000).",
      "Mock external services instead of making real network calls.",
      "Check for missing await on async operations.",
      "Use --testTimeout=10000 flag globally in your jest config.",
    ],
    reproduction: `// jest.config.js
module.exports = {
  testTimeout: 10000,
};`,
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
    rootCause: "The GitLab runner host has run out of disk space. Docker images, build artifacts, and caches accumulate over time and are never automatically cleaned up.",
    fixSteps: [
      "Run docker system prune -af on the runner host.",
      "Clear GitLab runner cache: gitlab-runner cache-clear.",
      "Add a scheduled CI job that runs docker system prune -af weekly.",
    ],
    reproduction: `cleanup:
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
    rootCause: "A required input for an Action is empty. The secret is not set in the repository, or set at the wrong level, or the secret name has a typo.",
    fixSteps: [
      "Go to repo Settings → Secrets and variables → Actions and verify the secret exists.",
      "Check the exact name — secret names are case-sensitive.",
      "If using environments, make sure the secret is added to that specific environment.",
    ],
    reproduction: `- name: Deploy
  uses: some-action@v1
  with:
    token: \${{ secrets.MY_EXACT_SECRET_NAME }}`,
    sponsored: null,
    related: ["gha-actions-checkout-permission"],
  },
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
  },// ZKOPÍRUJ TYTO ZÁZNAMY A VLOŽ JE DO POLE FAILURES V page.jsx
// Přidej je za poslední záznam, před uzavírací ]

  {
    id: "gha-yarn-frozen-lockfile",
    errorString: "Your lockfile needs to be updated, but yarn was run with --frozen-lockfile.",
    provider: "GitHub Actions",
    runner: "ubuntu-22.04",
    toolchain: "Node.js / Yarn",
    severity: "high",
    tags: ["yarn", "lockfile", "frozen", "dependencies"],
    rootCause: "yarn.lock is out of sync with package.json. Yarn CI mode requires a perfect match. This happens when someone adds a package locally but forgets to commit the updated yarn.lock.",
    fixSteps: [
      "Run yarn install locally to regenerate yarn.lock.",
      "Commit both package.json and yarn.lock together.",
      "Never edit package.json manually — use yarn add <package>.",
      "Add a pre-commit hook with husky to enforce lockfile sync.",
    ],
    reproduction: `# Fix locally
yarn install
git add package.json yarn.lock
git commit -m "sync yarn lockfile"
git push`,
    sponsored: null,
    related: ["gha-npm-ci-frozen-lockfile", "gha-node-heap-exceeded"],
  },
  {
    id: "gha-pnpm-frozen-lockfile",
    errorString: "ERR_PNPM_OUTDATED_LOCKFILE  Cannot install with frozen-lockfile because pnpm-lock.yaml is not up-to-date with package.json",
    provider: "GitHub Actions",
    runner: "ubuntu-22.04",
    toolchain: "Node.js / pnpm",
    severity: "high",
    tags: ["pnpm", "lockfile", "frozen", "dependencies"],
    rootCause: "pnpm-lock.yaml is out of sync with package.json. pnpm ci mode (--frozen-lockfile) requires exact match. Common cause: dependency added or version bumped without committing the updated lockfile.",
    fixSteps: [
      "Run pnpm install locally to regenerate pnpm-lock.yaml.",
      "Commit both package.json and pnpm-lock.yaml.",
      "Use pnpm add <package> instead of editing package.json manually.",
      "In CI use: pnpm install --frozen-lockfile only after verifying lockfile is committed.",
    ],
    reproduction: `- uses: pnpm/action-setup@v3
  with:
    version: 8

- name: Install
  run: pnpm install --frozen-lockfile`,
    sponsored: null,
    related: ["gha-npm-ci-frozen-lockfile", "gha-yarn-frozen-lockfile"],
  },
  {
    id: "gha-docker-buildx-not-setup",
    errorString: "ERROR: docker buildx is not a docker command",
    provider: "GitHub Actions",
    runner: "ubuntu-22.04",
    toolchain: "Docker Buildx",
    severity: "high",
    tags: ["docker", "buildx", "setup", "multiplatform"],
    rootCause: "Docker Buildx is not initialized on the runner. The default Docker installation on GitHub Actions runners does not always have Buildx enabled by default, especially for multi-platform builds.",
    fixSteps: [
      "Add docker/setup-buildx-action@v3 before your build step.",
      "This is always required when using docker/build-push-action.",
      "For multi-platform builds also add docker/setup-qemu-action@v3.",
    ],
    reproduction: `- name: Set up Docker Buildx
  uses: docker/setup-buildx-action@v3

- name: Build
  uses: docker/build-push-action@v5
  with:
    push: false`,
    sponsored: {
      name: "Depot",
      tagline: "Drop-in Buildx replacement with persistent cache and 2x faster builds.",
      url: "#",
    },
    related: ["gha-exit-1-docker-buildx", "gha-docker-layer-cache-miss"],
  },
  {
    id: "gha-node-version-mismatch",
    errorString: "The engine node is incompatible with this module. Expected version >= 18. Got 16.",
    provider: "GitHub Actions",
    runner: "ubuntu-22.04",
    toolchain: "Node.js / npm",
    severity: "medium",
    tags: ["node", "version", "engine", "compatibility"],
    rootCause: "The Node.js version on the runner is lower than what the package requires in its engines field. GitHub Actions runners ship with a default Node version that may be older than your project needs.",
    fixSteps: [
      "Add actions/setup-node to your workflow and pin the version.",
      "Match the Node version in CI to your .nvmrc or .node-version file.",
      "Use node-version-file: '.nvmrc' to automatically read from your config file.",
    ],
    reproduction: `- uses: actions/setup-node@v4
  with:
    node-version: '20'
    cache: 'npm'

- run: npm ci`,
    sponsored: null,
    related: ["gha-npm-ci-frozen-lockfile", "gha-node-heap-exceeded"],
  },
  {
    id: "gha-missing-env-variable",
    errorString: "Error: ENOENT: no such file or directory, open '.env'",
    provider: "GitHub Actions",
    runner: "ubuntu-22.04",
    toolchain: "Node.js / Any",
    severity: "medium",
    tags: ["env", "dotenv", "environment", "config", "secrets"],
    rootCause: "Your app tries to load a .env file that does not exist in CI. The .env file is correctly in .gitignore (as it should be) so it never reaches the runner. CI needs environment variables set directly.",
    fixSteps: [
      "Add each required variable as a GitHub Actions secret.",
      "Reference them in your workflow with env: MY_VAR: ${{ secrets.MY_VAR }}.",
      "Never commit .env files — use secrets for sensitive values.",
      "Use a .env.example file to document required variables for new developers.",
    ],
    reproduction: `jobs:
  build:
    runs-on: ubuntu-22.04
    env:
      DATABASE_URL: \${{ secrets.DATABASE_URL }}
      API_KEY: \${{ secrets.API_KEY }}
    steps:
      - run: npm run build`,
    sponsored: null,
    related: ["gha-env-secret-empty", "gha-actions-checkout-permission"],
  },
  {
    id: "gha-port-already-in-use",
    errorString: "Error: listen EADDRINUSE: address already in use :::3000",
    provider: "GitHub Actions",
    runner: "ubuntu-22.04",
    toolchain: "Node.js / Express",
    severity: "medium",
    tags: ["port", "eaddrinuse", "node", "server", "e2e"],
    rootCause: "A previous test or step started a server on port 3000 and it was never shut down. When the next step tries to start on the same port, it fails. Common in e2e test setups with Playwright or Cypress.",
    fixSteps: [
      "Kill the process after tests: kill $(lsof -t -i:3000) in a post step.",
      "Use a different port for each parallel job with PORT env variable.",
      "Use wait-on package to properly manage server startup and shutdown.",
      "Add if: always() to your cleanup step so it runs even when tests fail.",
    ],
    reproduction: `- name: Start server
  run: npm start &
  
- name: Run tests
  run: npm test

- name: Stop server
  if: always()
  run: kill $(lsof -t -i:3000) || true`,
    sponsored: null,
    related: ["gha-jest-timeout", "gha-exit-137"],
  },
  {
    id: "gha-checkout-lfs",
    errorString: "Encountered X file(s) that should have been pointers, but weren't",
    provider: "GitHub Actions",
    runner: "ubuntu-22.04",
    toolchain: "Git LFS / GitHub Actions",
    severity: "medium",
    tags: ["git", "lfs", "large-files", "checkout", "binary"],
    rootCause: "Your repository uses Git LFS for large files but actions/checkout does not download LFS objects by default. The files exist as LFS pointers instead of actual content.",
    fixSteps: [
      "Add lfs: true to your actions/checkout step.",
      "Make sure git-lfs is installed on the runner — it is on GitHub-hosted runners by default.",
      "For self-hosted runners: apt-get install git-lfs && git lfs install.",
    ],
    reproduction: `- uses: actions/checkout@v4
  with:
    lfs: true  # add this line`,
    sponsored: null,
    related: ["gha-actions-checkout-permission"],
  },
  {
    id: "gha-terraform-state-lock",
    errorString: "Error acquiring the state lock: ConditionalCheckFailedException",
    provider: "GitHub Actions",
    runner: "ubuntu-22.04",
    toolchain: "Terraform / AWS",
    severity: "critical",
    tags: ["terraform", "state", "lock", "aws", "dynamodb"],
    rootCause: "A previous Terraform run failed or was cancelled without releasing the state lock in DynamoDB. Terraform locks state to prevent concurrent modifications, but crashes leave the lock orphaned.",
    fixSteps: [
      "Run terraform force-unlock <LOCK_ID> — the lock ID is shown in the error message.",
      "Check if another pipeline is actually running — do not force-unlock a live run.",
      "Add -lock-timeout=5m to your terraform plan/apply commands.",
      "Consider using -lock=false only in read-only plan steps, never in apply.",
    ],
    reproduction: `# Unlock orphaned state
terraform force-unlock <LOCK_ID_FROM_ERROR>

# Prevent future issues
- name: Terraform Apply
  run: terraform apply -auto-approve -lock-timeout=5m`,
    sponsored: null,
    related: ["gha-env-secret-empty", "gha-missing-env-variable"],
  },
  {
    id: "gha-jest-cannot-find-module",
    errorString: "Cannot find module '@/components/Button' from 'src/App.test.js'",
    provider: "GitHub Actions",
    runner: "ubuntu-22.04",
    toolchain: "Node.js / Jest",
    severity: "medium",
    tags: ["jest", "module", "alias", "path", "typescript"],
    rootCause: "Jest cannot resolve path aliases like @/ that are configured in tsconfig.json or webpack. Jest uses its own module resolver and does not read tsconfig paths by default.",
    fixSteps: [
      "Add moduleNameMapper to jest.config.js to map @/ to the src directory.",
      "Install babel-plugin-module-resolver or ts-jest if using TypeScript.",
      "Make sure jest.config.js paths match your tsconfig.json paths exactly.",
    ],
    reproduction: `// jest.config.js
module.exports = {
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
};`,
    sponsored: null,
    related: ["gha-jest-timeout", "gha-python-pip-no-module"],
  },
  {
    id: "gha-aws-credentials-missing",
    errorString: "NoCredentialProviders: no valid providers in chain",
    provider: "GitHub Actions",
    runner: "ubuntu-22.04",
    toolchain: "AWS CLI / Terraform",
    severity: "critical",
    tags: ["aws", "credentials", "iam", "secrets", "cloud"],
    rootCause: "AWS CLI or SDK cannot find valid credentials on the runner. The credentials are not configured as environment variables or the aws-actions/configure-aws-credentials step is missing.",
    fixSteps: [
      "Add aws-actions/configure-aws-credentials@v4 before any AWS steps.",
      "Store AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY as GitHub secrets.",
      "For better security use OIDC with role-to-assume instead of long-lived keys.",
      "Never hardcode credentials in your workflow files.",
    ],
    reproduction: `- name: Configure AWS credentials
  uses: aws-actions/configure-aws-credentials@v4
  with:
    aws-access-key-id: \${{ secrets.AWS_ACCESS_KEY_ID }}
    aws-secret-access-key: \${{ secrets.AWS_SECRET_ACCESS_KEY }}
    aws-region: eu-west-1`,
    sponsored: null,
    related: ["gha-env-secret-empty", "gha-missing-env-variable"],
  },
  {
    id: "gha-playwright-browser-missing",
    errorString: "browserType.launch: Executable doesn't exist at /root/.cache/ms-playwright/chromium",
    provider: "GitHub Actions",
    runner: "ubuntu-22.04",
    toolchain: "Node.js / Playwright",
    severity: "high",
    tags: ["playwright", "browser", "e2e", "chromium", "test"],
    rootCause: "Playwright browsers are not installed on the runner. Unlike local development where you run npx playwright install once, CI runners start fresh every time and need browsers installed in each run.",
    fixSteps: [
      "Add npx playwright install --with-deps before running tests.",
      "Cache the browser installation to speed up runs: cache key on playwright version.",
      "Use the official Playwright Docker image for consistent browser versions.",
    ],
    reproduction: `- name: Install Playwright browsers
  run: npx playwright install --with-deps chromium

- name: Run e2e tests
  run: npx playwright test`,
    sponsored: null,
    related: ["gha-jest-timeout", "gha-port-already-in-use"],
  },
  {
    id: "gha-cypress-video-artifact",
    errorString: "Could not process video. No frames were recorded.",
    provider: "GitHub Actions",
    runner: "ubuntu-22.04",
    toolchain: "Node.js / Cypress",
    severity: "low",
    tags: ["cypress", "video", "e2e", "recording", "display"],
    rootCause: "Cypress video recording fails on CI because there is no display server. The runner has no GUI environment so video frames cannot be captured.",
    fixSteps: [
      "Disable video recording in CI: add video: false to cypress.config.js.",
      "Or use a virtual display: install xvfb and run with: xvfb-run cypress run.",
      "Screenshots on failure still work without video — usually sufficient for debugging.",
    ],
    reproduction: `// cypress.config.js
module.exports = {
  video: false, // disable in CI
  screenshotOnRunFailure: true,
};`,
    sponsored: null,
    related: ["gha-playwright-browser-missing", "gha-port-already-in-use"],
  },
  {
    id: "gha-python-version-mismatch",
    errorString: "SyntaxError: f-string expression part cannot include a backslash",
    provider: "GitHub Actions",
    runner: "ubuntu-22.04",
    toolchain: "Python",
    severity: "medium",
    tags: ["python", "version", "fstring", "syntax", "compatibility"],
    rootCause: "This syntax was invalid in Python 3.11 and earlier but is valid in Python 3.12+. The runner is using an older Python version than expected. Ubuntu 22.04 ships with Python 3.10 by default.",
    fixSteps: [
      "Add actions/setup-python and pin to python-version: '3.12'.",
      "Add a .python-version file to your repo and use python-version-file: '.python-version'.",
      "Test locally with the same Python version as CI.",
    ],
    reproduction: `- uses: actions/setup-python@v5
  with:
    python-version: '3.12'
    cache: 'pip'`,
    sponsored: null,
    related: ["gha-python-pip-no-module"],
  },
  {
    id: "gha-docker-compose-version",
    errorString: "docker-compose: command not found",
    provider: "GitHub Actions",
    runner: "ubuntu-22.04",
    toolchain: "Docker Compose",
    severity: "medium",
    tags: ["docker", "compose", "v2", "command", "plugin"],
    rootCause: "GitHub Actions runners have Docker Compose V2 installed as a plugin (docker compose) not as a standalone binary (docker-compose). The hyphenated command was removed in newer versions.",
    fixSteps: [
      "Replace docker-compose with docker compose (no hyphen) in all your scripts.",
      "Or install the standalone binary: pip install docker-compose.",
      "Update any Makefile targets or scripts that use the old command.",
    ],
    reproduction: `# Old (broken on newer runners)
docker-compose up -d

# New (correct)
docker compose up -d`,
    sponsored: null,
    related: ["gitlab-docker-daemon-not-running", "gha-exit-1-docker-buildx"],
  },
  {
    id: "gha-gradle-oom",
    errorString: "GC overhead limit exceeded / Java heap space",
    provider: "GitHub Actions",
    runner: "ubuntu-22.04",
    toolchain: "Java / Gradle",
    severity: "critical",
    tags: ["java", "gradle", "heap", "memory", "oom"],
    rootCause: "The Gradle build daemon ran out of Java heap memory. GitHub Actions runners have limited RAM and Gradle's default heap size is often too small for large projects.",
    fixSteps: [
      "Add org.gradle.jvmargs=-Xmx4g to gradle.properties.",
      "Enable Gradle parallel builds: org.gradle.parallel=true.",
      "Use actions/cache to cache ~/.gradle to avoid re-downloading dependencies.",
      "Consider splitting the build into modules.",
    ],
    reproduction: `# gradle.properties
org.gradle.jvmargs=-Xmx4g -XX:MaxMetaspaceSize=512m
org.gradle.parallel=true
org.gradle.caching=true`,
    sponsored: null,
    related: ["gha-exit-137", "gha-node-heap-exceeded"],
  },
  {
    id: "gha-maven-dependency-resolve",
    errorString: "Could not resolve dependencies for project: Artifact X:Y:Z:jar not found",
    provider: "GitHub Actions",
    runner: "ubuntu-22.04",
    toolchain: "Java / Maven",
    severity: "high",
    tags: ["java", "maven", "dependencies", "artifactory", "repository"],
    rootCause: "Maven cannot download a dependency from the remote repository. Usually caused by a private Artifactory or Nexus repository requiring authentication, or a transient network issue on the runner.",
    fixSteps: [
      "Add repository credentials to ~/.m2/settings.xml via a CI step.",
      "Use actions/cache to cache ~/.m2/repository to avoid re-downloading.",
      "For private repos: inject credentials from secrets into settings.xml.",
      "Retry transient failures with: mvn --fail-at-end.",
    ],
    reproduction: `- name: Set up Maven settings
  run: |
    mkdir -p ~/.m2
    echo "<settings><servers><server>
      <id>artifactory</id>
      <username>\${{ secrets.ARTIFACTORY_USER }}</username>
      <password>\${{ secrets.ARTIFACTORY_TOKEN }}</password>
    </server></servers></settings>" > ~/.m2/settings.xml`,
    sponsored: null,
    related: ["gha-npm-ci-frozen-lockfile", "gha-python-pip-no-module"],
  },
  {
    id: "gitlab-pipeline-stuck-pending",
    errorString: "This job is stuck because the project doesn't have any runners online assigned to it.",
    provider: "GitLab CI",
    runner: "gitlab-runner",
    toolchain: "GitLab CI",
    severity: "critical",
    tags: ["gitlab", "runner", "pending", "stuck", "registration"],
    rootCause: "No GitLab runner is available to pick up the job. Either the runner is offline, unregistered, or the runner tags do not match the tags required by the job.",
    fixSteps: [
      "Check runner status in Settings → CI/CD → Runners.",
      "Restart the runner service: sudo systemctl restart gitlab-runner.",
      "Remove tags from the job or add matching tags to the runner.",
      "For shared runners: make sure they are enabled for your project.",
    ],
    reproduction: `# .gitlab-ci.yml — remove tags if not needed
build:
  # tags:
  #   - docker  # comment this out if no tagged runner available
  script:
    - echo "building"`,
    sponsored: {
      name: "BuildKite",
      tagline: "Always-on elastic runners — never wait for an available agent again.",
      url: "#",
    },
    related: ["gitlab-docker-daemon-not-running", "gitlab-runner-no-space"],
  },
  {
    id: "gha-ssh-key-permission-denied",
    errorString: "Permission denied (publickey). fatal: Could not read from remote repository.",
    provider: "GitHub Actions",
    runner: "ubuntu-22.04",
    toolchain: "Git / SSH",
    severity: "high",
    tags: ["ssh", "git", "permission", "deploy-key", "clone"],
    rootCause: "The SSH key used by the runner does not have access to the repository being cloned. This happens with private submodules or when cloning a different repo than the one running the workflow.",
    fixSteps: [
      "Add a deploy key to the target repository with read access.",
      "Store the private key as a GitHub secret.",
      "Add a step to configure SSH: use webfactory/ssh-agent action.",
      "For submodules use: actions/checkout with submodules: recursive and ssh-key secret.",
    ],
    reproduction: `- uses: webfactory/ssh-agent@v0.9.0
  with:
    ssh-private-key: \${{ secrets.SSH_PRIVATE_KEY }}

- uses: actions/checkout@v4
  with:
    submodules: recursive`,
    sponsored: null,
    related: ["gha-actions-checkout-permission", "gha-env-secret-empty"],
  },
  {
    id: "gha-codecov-upload-fail",
    errorString: "There was an error running the uploader: Error: No coverage reports found.",
    provider: "GitHub Actions",
    runner: "ubuntu-22.04",
    toolchain: "Node.js / Codecov",
    severity: "low",
    tags: ["codecov", "coverage", "upload", "report", "test"],
    rootCause: "Codecov uploader cannot find a coverage report file. Either the test runner did not generate a coverage report, the file is in a non-default location, or the tests failed before coverage was written.",
    fixSteps: [
      "Make sure tests run with coverage flag: jest --coverage or pytest --cov.",
      "Specify the coverage file path explicitly in the Codecov action.",
      "Ensure the coverage step runs even if tests fail using if: always().",
      "Check that the coverage output format matches what Codecov expects (lcov, xml, etc.).",
    ],
    reproduction: `- name: Run tests with coverage
  run: jest --coverage --coverageReporters=lcov

- name: Upload coverage
  uses: codecov/codecov-action@v4
  with:
    files: ./coverage/lcov.info
    token: \${{ secrets.CODECOV_TOKEN }}`,
    sponsored: null,
    related: ["gha-jest-timeout", "gha-jest-cannot-find-module"],
  },
  {
    id: "gha-kubernetes-kubectl-auth",
    errorString: "error: You must be logged in to the server (Unauthorized)",
    provider: "GitHub Actions",
    runner: "ubuntu-22.04",
    toolchain: "Kubernetes / kubectl",
    severity: "critical",
    tags: ["kubernetes", "kubectl", "auth", "kubeconfig", "deploy"],
    rootCause: "kubectl cannot authenticate to the Kubernetes cluster. The kubeconfig is missing, expired, or the service account token does not have sufficient permissions.",
    fixSteps: [
      "Store your kubeconfig as a base64-encoded GitHub secret.",
      "Decode and write it in a CI step: echo $KUBECONFIG_B64 | base64 -d > ~/.kube/config.",
      "For EKS use aws eks update-kubeconfig in the workflow.",
      "For GKE use gke-gcloud-auth-plugin and google-github-actions/get-gke-credentials.",
    ],
    reproduction: `- name: Set up kubeconfig
  run: |
    mkdir -p ~/.kube
    echo "\${{ secrets.KUBECONFIG_B64 }}" | base64 -d > ~/.kube/config

- name: Deploy
  run: kubectl apply -f k8s/`,
    sponsored: null,
    related: ["gha-aws-credentials-missing", "gha-env-secret-empty"],
  },
  {
    id: "gha-ruby-bundler-fail",
    errorString: "Your bundle is locked to <gem> but that version could not be found in any of the sources.",
    provider: "GitHub Actions",
    runner: "ubuntu-22.04",
    toolchain: "Ruby / Bundler",
    severity: "high",
    tags: ["ruby", "bundler", "gemfile", "lockfile", "gems"],
    rootCause: "Gemfile.lock references a gem version that no longer exists on RubyGems or in your private gem source. This often happens after a gem is yanked from RubyGems or a private Gemfury source changes.",
    fixSteps: [
      "Run bundle update <gem-name> locally to get a valid version.",
      "Commit the updated Gemfile.lock.",
      "Use bundle config set --local frozen false in CI if you need flexible resolution.",
      "Pin gems to version ranges instead of exact versions to avoid yanked-gem issues.",
    ],
    reproduction: `- uses: ruby/setup-ruby@v1
  with:
    ruby-version: '3.3'
    bundler-cache: true  # runs bundle install automatically`,
    sponsored: null,
    related: ["gha-npm-ci-frozen-lockfile", "gha-yarn-frozen-lockfile"],
  },
  {
    id: "gha-go-module-private",
    errorString: "verifying module: checksum mismatch / GONOSUMCHECK",
    provider: "GitHub Actions",
    runner: "ubuntu-22.04",
    toolchain: "Go / Go Modules",
    severity: "high",
    tags: ["go", "modules", "private", "gosum", "goprivate"],
    rootCause: "Go module checksum verification fails for private modules. The Go checksum database (sum.golang.org) cannot verify private repositories, causing the build to fail when GONOSUMCHECK or GOPRIVATE is not configured.",
    fixSteps: [
      "Set GOPRIVATE=github.com/yourorg/* in your workflow environment.",
      "Set GONOSUMCHECK=github.com/yourorg/* to skip checksum for private modules.",
      "Configure GOAUTH or GONOSUMDB for private module authentication.",
      "Store the git credentials and configure them before go mod download.",
    ],
    reproduction: `- name: Set Go private module config
  env:
    GOPRIVATE: github.com/myorg/*
    GONOSUMCHECK: github.com/myorg/*
  run: go mod download`,
    sponsored: null,
    related: ["gha-ssh-key-permission-denied", "gha-aws-credentials-missing"],
  },
  {
    id: "gha-cache-restore-fail",
    errorString: "Cache not found for input keys:",
    provider: "GitHub Actions",
    runner: "ubuntu-22.04",
    toolchain: "GitHub Actions",
    severity: "low",
    tags: ["cache", "actions", "restore", "miss", "performance"],
    rootCause: "The cache key does not match any existing cache. This is normal on first run or after changing the cache key. It is not an error — the build will proceed without cache, just slower.",
    fixSteps: [
      "This is expected behavior on first run — not a real error.",
      "Use a fallback restore-keys to hit partial cache matches.",
      "Make sure your cache key includes the lockfile hash for best hit rate.",
      "Do not fail the workflow on cache miss — it is normal.",
    ],
    reproduction: `- uses: actions/cache@v4
  with:
    path: ~/.npm
    key: \${{ runner.os }}-node-\${{ hashFiles('**/package-lock.json') }}
    restore-keys: |
      \${{ runner.os }}-node-`,
    sponsored: null,
    related: ["gha-npm-ci-frozen-lockfile", "gha-exit-137"],
  },
  {
    id: "gha-sonarqube-quality-gate",
    errorString: "ERROR: SONAR_TOKEN is not set. Please set the SONAR_TOKEN environment variable.",
    provider: "GitHub Actions",
    runner: "ubuntu-22.04",
    toolchain: "SonarQube / SonarCloud",
    severity: "medium",
    tags: ["sonarqube", "sonarcloud", "quality", "token", "static-analysis"],
    rootCause: "The SonarQube or SonarCloud scanner requires a SONAR_TOKEN to authenticate with the server. The token is missing from the runner environment.",
    fixSteps: [
      "Generate a token in SonarCloud: My Account → Security → Generate Token.",
      "Add it as a GitHub secret named SONAR_TOKEN.",
      "Reference it in your workflow: SONAR_TOKEN: ${{ secrets.SONAR_TOKEN }}.",
    ],
    reproduction: `- name: SonarCloud Scan
  uses: SonarSource/sonarcloud-github-action@master
  env:
    GITHUB_TOKEN: \${{ secrets.GITHUB_TOKEN }}
    SONAR_TOKEN: \${{ secrets.SONAR_TOKEN }}`,
    sponsored: null,
    related: ["gha-env-secret-empty", "gha-codecov-upload-fail"],
  },
  {
    id: "gha-gh-pages-deploy-fail",
    errorString: "remote: Permission to user/repo.git denied to github-actions[bot].",
    provider: "GitHub Actions",
    runner: "ubuntu-22.04",
    toolchain: "GitHub Pages",
    severity: "high",
    tags: ["github-pages", "deploy", "permissions", "token", "pages"],
    rootCause: "The workflow does not have permission to push to the gh-pages branch. GitHub Actions bot is denied write access because the workflow permissions are set to read-only.",
    fixSteps: [
      "Add permissions: pages: write and id-token: write to your workflow.",
      "Use the official actions/deploy-pages action instead of manual git push.",
      "In repo Settings → Actions → General → set Workflow permissions to Read and write.",
    ],
    reproduction: `permissions:
  contents: write
  pages: write
  id-token: write

- name: Deploy to GitHub Pages
  uses: actions/deploy-pages@v4`,
    sponsored: null,
    related: ["gha-actions-checkout-permission", "gha-env-secret-empty"],
  },
  {
    id: "gha-trivy-scan-fail",
    errorString: "FATAL: error in image scan: failed to initialize source: GET https://ghcr.io/v2/: UNAUTHORIZED",
    provider: "GitHub Actions",
    runner: "ubuntu-22.04",
    toolchain: "Trivy / Container Security",
    severity: "medium",
    tags: ["trivy", "security", "scan", "container", "ghcr", "401"],
    rootCause: "Trivy cannot pull the container image to scan because it is not authenticated to the registry. The image is in a private registry (ghcr.io or ECR) and no credentials are passed to the scanner.",
    fixSteps: [
      "Log in to the registry before running Trivy.",
      "Pass the image-ref after docker pull so Trivy scans the local image.",
      "Use trivy image --input image.tar to scan a local tarball instead.",
    ],
    reproduction: `- name: Login to GHCR
  uses: docker/login-action@v3
  with:
    registry: ghcr.io
    username: \${{ github.actor }}
    password: \${{ secrets.GITHUB_TOKEN }}

- name: Run Trivy scan
  uses: aquasecurity/trivy-action@master
  with:
    image-ref: ghcr.io/myorg/myapp:latest`,
    sponsored: null,
    related: ["gha-docker-layer-cache-miss", "gha-aws-credentials-missing"],
  },
  {
    id: "gha-matrix-strategy-fail-fast",
    errorString: "Some jobs were cancelled due to fail-fast strategy.",
    provider: "GitHub Actions",
    runner: "ubuntu-22.04",
    toolchain: "GitHub Actions",
    severity: "low",
    tags: ["matrix", "fail-fast", "strategy", "parallel", "cancelled"],
    rootCause: "When using matrix builds, GitHub Actions cancels all remaining matrix jobs as soon as one fails. This is the default fail-fast: true behavior. It saves CI minutes but makes it hard to see failures across all matrix combinations.",
    fixSteps: [
      "Add fail-fast: false to your matrix strategy to run all combinations.",
      "Use this when you need to see failures across all Node/OS/Python versions at once.",
      "Keep fail-fast: true for expensive builds where you want to save CI minutes.",
    ],
    reproduction: `jobs:
  test:
    strategy:
      fail-fast: false  # run all matrix jobs even if one fails
      matrix:
        node: [18, 20, 22]
        os: [ubuntu-22.04, windows-latest]`,
    sponsored: null,
    related: ["gha-jest-timeout", "gha-node-version-mismatch"],
  },
  {
    id: "gha-permissions-denied-chmod",
    errorString: "Permission denied: './scripts/deploy.sh'",
    provider: "GitHub Actions",
    runner: "ubuntu-22.04",
    toolchain: "Bash / Shell",
    severity: "medium",
    tags: ["permissions", "chmod", "shell", "script", "bash"],
    rootCause: "A shell script is not executable. When files are committed to Git without the executable bit set, they lose their permissions. On checkout the file exists but cannot be run directly.",
    fixSteps: [
      "Add chmod +x scripts/deploy.sh before running the script.",
      "Or run it with bash explicitly: bash scripts/deploy.sh.",
      "Fix permanently: git update-index --chmod=+x scripts/deploy.sh and commit.",
    ],
    reproduction: `# Option 1: chmod in CI
- run: chmod +x scripts/deploy.sh && ./scripts/deploy.sh

# Option 2: fix in git permanently  
git update-index --chmod=+x scripts/deploy.sh
git commit -m "fix script permissions"`,
    sponsored: null,
    related: ["gha-actions-checkout-permission", "gha-ssh-key-permission-denied"],
  },
  {
    id: "gha-vercel-deploy-fail",
    errorString: "Error: No existing credentials found. Please run vercel login.",
    provider: "GitHub Actions",
    runner: "ubuntu-22.04",
    toolchain: "Vercel / Next.js",
    severity: "high",
    tags: ["vercel", "deploy", "token", "nextjs", "credentials"],
    rootCause: "The Vercel CLI on the runner has no authentication token. Vercel deployments from CI require a VERCEL_TOKEN secret — the CLI cannot use browser-based OAuth in a headless environment.",
    fixSteps: [
      "Generate a Vercel token: vercel.com → Settings → Tokens → Create.",
      "Add it as a GitHub secret: VERCEL_TOKEN.",
      "Also add VERCEL_ORG_ID and VERCEL_PROJECT_ID from your .vercel/project.json.",
      "Use the official Vercel GitHub integration for zero-config deployments instead.",
    ],
    reproduction: `- name: Deploy to Vercel
  run: vercel --prod --token=\${{ secrets.VERCEL_TOKEN }}
  env:
    VERCEL_ORG_ID: \${{ secrets.VERCEL_ORG_ID }}
    VERCEL_PROJECT_ID: \${{ secrets.VERCEL_PROJECT_ID }}`,
    sponsored: null,
    related: ["gha-env-secret-empty", "gha-gh-pages-deploy-fail"],
  },// BATCH 1 - 50 chyb
// Zkopíruj a vlož před uzavírací ] v poli FAILURES

  {
    id: "gha-dotnet-restore-fail",
    errorString: "error MSB3202: The project file could not be loaded.",
    provider: "GitHub Actions",
    runner: "ubuntu-22.04",
    toolchain: ".NET / MSBuild",
    severity: "high",
    tags: ["dotnet", "msbuild", "csproj", "restore", "build"],
    rootCause: "MSBuild cannot find or parse the .csproj file. Usually caused by a wrong working directory, missing file in the repo, or a corrupted project reference.",
    fixSteps: [
      "Verify the path to your .csproj file is correct in the workflow.",
      "Add a step to list files: ls -la to confirm the file exists.",
      "Check for BOM characters or encoding issues in the .csproj file.",
      "Use dotnet restore explicitly before dotnet build.",
    ],
    reproduction: `- name: Restore
  run: dotnet restore src/MyApp/MyApp.csproj

- name: Build
  run: dotnet build src/MyApp/MyApp.csproj --no-restore`,
    sponsored: null,
    related: ["gha-missing-env-variable", "gha-npm-ci-frozen-lockfile"],
  },
  {
    id: "gha-dotnet-test-fail",
    errorString: "Failed to publish: No test is available in provided file(s).",
    provider: "GitHub Actions",
    runner: "ubuntu-22.04",
    toolchain: ".NET / xUnit",
    severity: "medium",
    tags: ["dotnet", "xunit", "test", "publish", "nunit"],
    rootCause: "The test runner cannot find any test assemblies. Either the build output path is wrong, tests were not compiled, or the test project is not referenced correctly.",
    fixSteps: [
      "Run dotnet build before dotnet test.",
      "Specify the test project explicitly: dotnet test src/MyApp.Tests/MyApp.Tests.csproj.",
      "Check that the test project references the correct test framework package.",
    ],
    reproduction: `- name: Test
  run: dotnet test src/MyApp.Tests/MyApp.Tests.csproj --verbosity normal`,
    sponsored: null,
    related: ["gha-dotnet-restore-fail", "gha-jest-timeout"],
  },
  {
    id: "gha-helm-chart-not-found",
    errorString: "Error: chart not found: myapp",
    provider: "GitHub Actions",
    runner: "ubuntu-22.04",
    toolchain: "Helm / Kubernetes",
    severity: "high",
    tags: ["helm", "kubernetes", "chart", "deploy", "k8s"],
    rootCause: "Helm cannot find the chart in the specified repository or local path. Either the repo is not added, the chart name is wrong, or helm repo update was not run.",
    fixSteps: [
      "Run helm repo add and helm repo update before helm install.",
      "Check the chart name with helm search repo <name>.",
      "For local charts verify the path: helm install myapp ./charts/myapp.",
    ],
    reproduction: `- name: Add Helm repo
  run: |
    helm repo add myrepo https://charts.example.com
    helm repo update

- name: Deploy
  run: helm upgrade --install myapp myrepo/myapp`,
    sponsored: null,
    related: ["gha-kubernetes-kubectl-auth", "gha-aws-credentials-missing"],
  },
  {
    id: "gha-jest-open-handles",
    errorString: "Jest did not exit one second after the test run has completed. This usually means that there are asynchronous operations that weren't stopped in your tests.",
    provider: "GitHub Actions",
    runner: "ubuntu-22.04",
    toolchain: "Node.js / Jest",
    severity: "medium",
    tags: ["jest", "async", "handles", "exit", "node"],
    rootCause: "Jest tests left open handles — database connections, timers, or server instances that were never closed. Jest waits for them to close before exiting, causing the CI job to hang.",
    fixSteps: [
      "Add --forceExit flag to jest command as a temporary fix.",
      "Fix properly: close database connections in afterAll() hooks.",
      "Use jest --detectOpenHandles to identify which handles are left open.",
      "Clear all timers: jest.clearAllTimers() in afterEach.",
    ],
    reproduction: `// jest.config.js
module.exports = {
  testTimeout: 10000,
  forceExit: true, // temporary fix
};

// proper fix in test file
afterAll(async () => {
  await db.disconnect();
  server.close();
});`,
    sponsored: null,
    related: ["gha-jest-timeout", "gha-jest-cannot-find-module"],
  },
  {
    id: "gha-nextjs-build-static",
    errorString: "Error: Page /dashboard couldn't be rendered statically because it used dynamic features.",
    provider: "GitHub Actions",
    runner: "ubuntu-22.04",
    toolchain: "Next.js / Vercel",
    severity: "medium",
    tags: ["nextjs", "static", "dynamic", "build", "ssr"],
    rootCause: "Next.js is trying to statically render a page that uses dynamic features like headers(), cookies(), or searchParams at build time. These are only available at request time.",
    fixSteps: [
      "Add export const dynamic = 'force-dynamic' to the page file.",
      "Or use generateStaticParams for dynamic routes that can be pre-rendered.",
      "Move dynamic data fetching to client components with useEffect.",
    ],
    reproduction: `// app/dashboard/page.jsx
export const dynamic = 'force-dynamic'; // add this line

export default function Dashboard() {
  // your dynamic page
}`,
    sponsored: null,
    related: ["gha-vercel-deploy-fail", "gha-missing-env-variable"],
  },
  {
    id: "gha-pip-dependency-conflict",
    errorString: "ERROR: pip's dependency resolver does not currently take into account all the packages that are installed.",
    provider: "GitHub Actions",
    runner: "ubuntu-22.04",
    toolchain: "Python / pip",
    severity: "medium",
    tags: ["python", "pip", "dependency", "conflict", "resolver"],
    rootCause: "Two or more packages in requirements.txt have conflicting version requirements. pip installs them anyway but warns that the environment may be broken.",
    fixSteps: [
      "Use pip-tools to generate a consistent requirements.txt: pip-compile requirements.in.",
      "Create a virtual environment and test the install locally.",
      "Pin all dependency versions to avoid conflicts: package==1.2.3.",
      "Use poetry or pipenv for better dependency resolution.",
    ],
    reproduction: `# Use pip-tools for consistent deps
pip install pip-tools
pip-compile requirements.in
pip-sync requirements.txt`,
    sponsored: null,
    related: ["gha-python-pip-no-module", "gha-python-version-mismatch"],
  },
  {
    id: "gha-docker-push-denied",
    errorString: "denied: requested access to the resource is denied",
    provider: "GitHub Actions",
    runner: "ubuntu-22.04",
    toolchain: "Docker / Registry",
    severity: "high",
    tags: ["docker", "push", "registry", "auth", "denied"],
    rootCause: "Docker push was denied by the registry. Either you are not logged in, the token lacks push permissions, or the image name does not match the registry namespace.",
    fixSteps: [
      "Add docker/login-action before the push step.",
      "Verify the image name matches your registry namespace exactly.",
      "For GHCR: image name must be ghcr.io/OWNER/IMAGE not just IMAGE.",
      "Check that GITHUB_TOKEN has packages: write permission.",
    ],
    reproduction: `- name: Login to registry
  uses: docker/login-action@v3
  with:
    registry: ghcr.io
    username: \${{ github.actor }}
    password: \${{ secrets.GITHUB_TOKEN }}

- name: Build and push
  uses: docker/build-push-action@v5
  with:
    push: true
    tags: ghcr.io/myorg/myapp:latest`,
    sponsored: null,
    related: ["gha-docker-layer-cache-miss", "gha-docker-buildx-not-setup"],
  },
  {
    id: "gha-terraform-init-fail",
    errorString: "Error: Failed to install provider: Could not retrieve the list of available versions.",
    provider: "GitHub Actions",
    runner: "ubuntu-22.04",
    toolchain: "Terraform / AWS",
    severity: "high",
    tags: ["terraform", "init", "provider", "network", "registry"],
    rootCause: "terraform init cannot download providers from registry.terraform.io. Usually a transient network issue, rate limiting, or firewall blocking the runner's outbound traffic.",
    fixSteps: [
      "Retry the job — often a transient network issue.",
      "Cache the .terraform directory to avoid re-downloading: actions/cache.",
      "Mirror providers to your own registry for air-gapped environments.",
      "Add -upgrade flag: terraform init -upgrade to force re-resolution.",
    ],
    reproduction: `- uses: actions/cache@v4
  with:
    path: .terraform
    key: terraform-\${{ hashFiles('**/.terraform.lock.hcl') }}

- name: Terraform Init
  run: terraform init`,
    sponsored: null,
    related: ["gha-terraform-state-lock", "gha-aws-credentials-missing"],
  },
  {
    id: "gha-ansible-ssh-fail",
    errorString: "fatal: [host]: UNREACHABLE! => {'msg': 'Failed to connect to the host via ssh'}",
    provider: "GitHub Actions",
    runner: "ubuntu-22.04",
    toolchain: "Ansible",
    severity: "critical",
    tags: ["ansible", "ssh", "unreachable", "deploy", "connection"],
    rootCause: "Ansible cannot SSH into the target host. Common causes: wrong IP, firewall blocking port 22, SSH key not added to authorized_keys, or the host is down.",
    fixSteps: [
      "Verify the target host IP/hostname is correct in your inventory.",
      "Check that port 22 is open: nc -zv HOST 22.",
      "Add the SSH private key using webfactory/ssh-agent action.",
      "Add the host to known_hosts or use StrictHostKeyChecking=no for CI.",
    ],
    reproduction: `- uses: webfactory/ssh-agent@v0.9.0
  with:
    ssh-private-key: \${{ secrets.ANSIBLE_SSH_KEY }}

- name: Run playbook
  run: |
    echo "HOST ansible_user=ubuntu" > inventory
    ansible-playbook -i inventory playbook.yml \
      --ssh-extra-args="-o StrictHostKeyChecking=no"`,
    sponsored: null,
    related: ["gha-ssh-key-permission-denied", "gha-kubernetes-kubectl-auth"],
  },
  {
    id: "gha-slack-notify-fail",
    errorString: "Error: An API error occurred: invalid_auth",
    provider: "GitHub Actions",
    runner: "ubuntu-22.04",
    toolchain: "Slack / GitHub Actions",
    severity: "low",
    tags: ["slack", "notification", "token", "webhook", "auth"],
    rootCause: "The Slack API token is invalid, expired, or the bot does not have permission to post to the channel. Often happens after Slack workspace token rotation.",
    fixSteps: [
      "Regenerate the Slack bot token and update the GitHub secret.",
      "Use Slack incoming webhooks instead of bot tokens for simpler setup.",
      "Verify the bot is invited to the target channel.",
      "Check token scopes: needs chat:write at minimum.",
    ],
    reproduction: `- name: Notify Slack
  uses: slackapi/slack-github-action@v1
  with:
    channel-id: 'C1234567890'
    slack-message: "Deploy complete"
  env:
    SLACK_BOT_TOKEN: \${{ secrets.SLACK_BOT_TOKEN }}`,
    sponsored: null,
    related: ["gha-env-secret-empty", "gha-missing-env-variable"],
  },
  {
    id: "gha-github-release-fail",
    errorString: "HttpError: Validation Failed: tag_name already exists",
    provider: "GitHub Actions",
    runner: "ubuntu-22.04",
    toolchain: "GitHub Actions / Releases",
    severity: "medium",
    tags: ["release", "tag", "github", "version", "duplicate"],
    rootCause: "A GitHub release with this tag already exists. The workflow tried to create a release for a tag that was already published — common when a workflow is re-run or triggered multiple times.",
    fixSteps: [
      "Add fail_on_unmatched_files: false and a check for existing release.",
      "Use update_latest: true to overwrite instead of creating a new release.",
      "Add a condition: if: startsWith(github.ref, 'refs/tags/') to only run on tags.",
    ],
    reproduction: `- name: Create Release
  uses: softprops/action-gh-release@v2
  if: startsWith(github.ref, 'refs/tags/')
  with:
    files: dist/*
    fail_on_unmatched_files: false`,
    sponsored: null,
    related: ["gha-actions-checkout-permission", "gha-gh-pages-deploy-fail"],
  },
  {
    id: "gha-pnpm-workspace-not-found",
    errorString: "ERR_PNPM_NO_MATCHING_VERSION No matching version found for",
    provider: "GitHub Actions",
    runner: "ubuntu-22.04",
    toolchain: "Node.js / pnpm / Monorepo",
    severity: "high",
    tags: ["pnpm", "monorepo", "workspace", "version", "dependency"],
    rootCause: "pnpm cannot find a version of a package that satisfies the version range. Often happens in monorepos when workspace packages reference each other with version ranges that don't match the actual published version.",
    fixSteps: [
      "Use workspace: protocol for internal packages: workspace:*.",
      "Run pnpm install locally and commit the updated lockfile.",
      "Check that the package version in package.json matches what's referenced.",
    ],
    reproduction: `# package.json in monorepo package
{
  "dependencies": {
    "@myorg/shared": "workspace:*"
  }
}`,
    sponsored: null,
    related: ["gha-pnpm-frozen-lockfile", "gha-yarn-frozen-lockfile"],
  },
  {
    id: "gha-cypress-missing-binary",
    errorString: "The cypress npm package is installed, but the Cypress binary is missing.",
    provider: "GitHub Actions",
    runner: "ubuntu-22.04",
    toolchain: "Node.js / Cypress",
    severity: "high",
    tags: ["cypress", "binary", "install", "e2e", "cache"],
    rootCause: "Cypress npm package is installed but the actual browser binary was not downloaded. This happens when node_modules is restored from cache but the Cypress binary cache (~/.cache/Cypress) is not.",
    fixSteps: [
      "Cache both node_modules AND ~/.cache/Cypress together.",
      "Or run npx cypress install after npm ci.",
      "Use the official cypress/included Docker image which has binary pre-installed.",
    ],
    reproduction: `- uses: actions/cache@v4
  with:
    path: |
      node_modules
      ~/.cache/Cypress
    key: cypress-\${{ hashFiles('package-lock.json') }}

- run: npm ci
- run: npx cypress run`,
    sponsored: null,
    related: ["gha-cypress-video-artifact", "gha-playwright-browser-missing"],
  },
  {
    id: "gha-upload-artifact-size",
    errorString: "Upload artifact failed. Artifact is too large. Maximum size is 2GB.",
    provider: "GitHub Actions",
    runner: "ubuntu-22.04",
    toolchain: "GitHub Actions",
    severity: "medium",
    tags: ["artifact", "upload", "size", "limit", "storage"],
    rootCause: "The artifact being uploaded exceeds GitHub's 2GB limit per artifact. Common with large build outputs, uncompressed Docker images saved as tarballs, or accidentally including node_modules.",
    fixSteps: [
      "Exclude node_modules and other large directories from the artifact.",
      "Compress the artifact before uploading: tar -czf artifact.tar.gz dist/.",
      "Split into multiple smaller artifacts.",
      "Use a dedicated storage solution (S3, GCS) for large files.",
    ],
    reproduction: `- uses: actions/upload-artifact@v4
  with:
    name: build
    path: |
      dist/
      !dist/**/*.map
    compression-level: 9`,
    sponsored: null,
    related: ["gha-artifact-not-found", "gha-cache-restore-fail"],
  },
  {
    id: "gha-concurrency-cancelled",
    errorString: "This run was cancelled because a newer run was started.",
    provider: "GitHub Actions",
    runner: "ubuntu-22.04",
    toolchain: "GitHub Actions",
    severity: "low",
    tags: ["concurrency", "cancelled", "queue", "workflow"],
    rootCause: "A concurrency group is configured to cancel in-progress runs when a new one starts. This is intentional behavior but can be surprising if you need all runs to complete.",
    fixSteps: [
      "If cancellation is not desired, remove cancel-in-progress: true.",
      "Use a more specific concurrency group key to avoid cancelling unrelated runs.",
      "For deployment workflows, cancellation is usually desirable — keep it.",
    ],
    reproduction: `concurrency:
  group: \${{ github.workflow }}-\${{ github.ref }}
  cancel-in-progress: false # change to false to keep all runs`,
    sponsored: null,
    related: ["gha-matrix-strategy-fail-fast", "gha-timeout-job"],
  },
  {
    id: "gha-rust-cargo-fail",
    errorString: "error[E0463]: can't find crate for `std`",
    provider: "GitHub Actions",
    runner: "ubuntu-22.04",
    toolchain: "Rust / Cargo",
    severity: "high",
    tags: ["rust", "cargo", "std", "toolchain", "target"],
    rootCause: "Rust cannot find the standard library for the target platform. This happens when cross-compiling for a different target (e.g., musl, ARM) without installing the target toolchain first.",
    fixSteps: [
      "Add rustup target add <target> before cargo build.",
      "Use actions-rs/toolchain to set up the correct Rust toolchain.",
      "For musl builds: rustup target add x86_64-unknown-linux-musl.",
    ],
    reproduction: `- uses: actions-rs/toolchain@v1
  with:
    toolchain: stable
    target: x86_64-unknown-linux-musl
    override: true

- name: Build
  run: cargo build --release --target x86_64-unknown-linux-musl`,
    sponsored: null,
    related: ["gha-missing-env-variable", "gha-node-version-mismatch"],
  },
  {
    id: "gha-mysql-connection-refused",
    errorString: "Error: connect ECONNREFUSED 127.0.0.1:3306",
    provider: "GitHub Actions",
    runner: "ubuntu-22.04",
    toolchain: "Node.js / MySQL",
    severity: "high",
    tags: ["mysql", "database", "connection", "service", "econnrefused"],
    rootCause: "The application cannot connect to MySQL. In CI the database must be started as a service container and given time to initialize before the app connects.",
    fixSteps: [
      "Add MySQL as a service in your workflow.",
      "Wait for MySQL to be ready with a health check.",
      "Use 127.0.0.1 not localhost — some drivers treat them differently.",
    ],
    reproduction: `jobs:
  test:
    runs-on: ubuntu-22.04
    services:
      mysql:
        image: mysql:8.0
        env:
          MYSQL_ROOT_PASSWORD: root
          MYSQL_DATABASE: testdb
        ports:
          - 3306:3306
        options: --health-cmd="mysqladmin ping" --health-interval=10s --health-timeout=5s --health-retries=3`,
    sponsored: null,
    related: ["gha-jest-open-handles", "gha-port-already-in-use"],
  },
  {
    id: "gha-postgres-connection-refused",
    errorString: "Error: connect ECONNREFUSED 127.0.0.1:5432",
    provider: "GitHub Actions",
    runner: "ubuntu-22.04",
    toolchain: "Node.js / PostgreSQL",
    severity: "high",
    tags: ["postgres", "postgresql", "database", "connection", "service"],
    rootCause: "PostgreSQL service is not running or not ready when the tests try to connect. Service containers need health checks to ensure they're fully initialized.",
    fixSteps: [
      "Add PostgreSQL as a service with health checks.",
      "Use --health-cmd='pg_isready' to wait for Postgres to be ready.",
      "Set PGPASSWORD environment variable for passwordless connections in tests.",
    ],
    reproduction: `services:
  postgres:
    image: postgres:16
    env:
      POSTGRES_PASSWORD: postgres
      POSTGRES_DB: testdb
    ports:
      - 5432:5432
    options: >-
      --health-cmd pg_isready
      --health-interval 10s
      --health-timeout 5s
      --health-retries 5`,
    sponsored: null,
    related: ["gha-mysql-connection-refused", "gha-jest-open-handles"],
  },
  {
    id: "gha-redis-connection-refused",
    errorString: "Error: connect ECONNREFUSED 127.0.0.1:6379",
    provider: "GitHub Actions",
    runner: "ubuntu-22.04",
    toolchain: "Node.js / Redis",
    severity: "high",
    tags: ["redis", "cache", "connection", "service", "econnrefused"],
    rootCause: "Redis is not running in the CI environment. Tests that depend on Redis need it started as a service container.",
    fixSteps: [
      "Add Redis as a service container in your workflow.",
      "Use redis:alpine for a lightweight image.",
      "Add a health check to ensure Redis is ready before tests run.",
    ],
    reproduction: `services:
  redis:
    image: redis:alpine
    ports:
      - 6379:6379
    options: --health-cmd "redis-cli ping" --health-interval 10s --health-timeout 5s --health-retries 5`,
    sponsored: null,
    related: ["gha-mysql-connection-refused", "gha-postgres-connection-refused"],
  },
  {
    id: "gha-mongodb-connection-fail",
    errorString: "MongoServerSelectionError: connect ECONNREFUSED 127.0.0.1:27017",
    provider: "GitHub Actions",
    runner: "ubuntu-22.04",
    toolchain: "Node.js / MongoDB",
    severity: "high",
    tags: ["mongodb", "mongo", "database", "connection", "service"],
    rootCause: "MongoDB is not running in CI. Tests requiring MongoDB need it as a service container or use mongodb-memory-server for in-process testing.",
    fixSteps: [
      "Add MongoDB as a service container.",
      "Or use mongodb-memory-server npm package for zero-config in-memory MongoDB.",
      "mongodb-memory-server is preferred for unit tests — no service setup needed.",
    ],
    reproduction: `# Option 1: Service container
services:
  mongodb:
    image: mongo:7
    ports:
      - 27017:27017

# Option 2: In-memory (preferred for unit tests)
# npm install --save-dev mongodb-memory-server`,
    sponsored: null,
    related: ["gha-mysql-connection-refused", "gha-postgres-connection-refused"],
  },
  {
    id: "gha-snyk-auth-fail",
    errorString: "Error: Missing `--org` argument or target org in snyk config.",
    provider: "GitHub Actions",
    runner: "ubuntu-22.04",
    toolchain: "Snyk / Security",
    severity: "medium",
    tags: ["snyk", "security", "auth", "org", "token"],
    rootCause: "Snyk CLI is not authenticated or the org parameter is missing. SNYK_TOKEN secret is either not set or the org slug is not specified.",
    fixSteps: [
      "Add SNYK_TOKEN as a GitHub secret.",
      "Specify --org=your-org-slug in the snyk command.",
      "Use the official snyk/actions GitHub Action for easier setup.",
    ],
    reproduction: `- name: Run Snyk
  uses: snyk/actions/node@master
  env:
    SNYK_TOKEN: \${{ secrets.SNYK_TOKEN }}
  with:
    args: --org=my-org-slug`,
    sponsored: null,
    related: ["gha-sonarqube-quality-gate", "gha-trivy-scan-fail"],
  },
  {
    id: "gha-windows-path-separator",
    errorString: "The system cannot find the path specified.",
    provider: "GitHub Actions",
    runner: "windows-latest",
    toolchain: "Windows / PowerShell",
    severity: "medium",
    tags: ["windows", "path", "separator", "powershell", "cross-platform"],
    rootCause: "A script uses Unix-style forward slashes or assumes Unix path conventions. Windows uses backslashes and has different path structures.",
    fixSteps: [
      "Use ${{ github.workspace }} instead of hardcoded paths.",
      "Replace forward slashes with backslashes for Windows-specific steps.",
      "Use cross-platform path utilities in Node.js: path.join() instead of string concatenation.",
      "Consider using ubuntu-22.04 runner unless Windows-specific testing is required.",
    ],
    reproduction: `# Cross-platform path in workflow
- name: Build
  run: |
    $path = Join-Path $env:GITHUB_WORKSPACE "dist"
    Write-Host "Building in $path"`,
    sponsored: null,
    related: ["gha-permissions-denied-chmod", "gha-missing-env-variable"],
  },
  {
    id: "gha-java-version-mismatch",
    errorString: "UnsupportedClassVersionError: Unsupported major.minor version 61.0",
    provider: "GitHub Actions",
    runner: "ubuntu-22.04",
    toolchain: "Java / Maven",
    severity: "high",
    tags: ["java", "version", "jdk", "compatibility", "classversion"],
    rootCause: "The compiled bytecode requires a newer JVM than what's running. Version 61.0 = Java 17. The runner has an older JDK installed.",
    fixSteps: [
      "Add actions/setup-java and pin the version to match your project.",
      "Use java-version: '17' or whatever version your project targets.",
      "Check your pom.xml maven.compiler.source and target properties.",
    ],
    reproduction: `- uses: actions/setup-java@v4
  with:
    java-version: '17'
    distribution: 'temurin'
    cache: 'maven'`,
    sponsored: null,
    related: ["gha-gradle-oom", "gha-maven-dependency-resolve"],
  },
  {
    id: "gha-flutter-pub-get-fail",
    errorString: "Because myapp depends on flutter_localizations any which doesn't exist, version solving failed.",
    provider: "GitHub Actions",
    runner: "ubuntu-22.04",
    toolchain: "Flutter / Dart",
    severity: "high",
    tags: ["flutter", "dart", "pub", "dependency", "package"],
    rootCause: "Flutter pub get failed because a dependency cannot be resolved. Often caused by an outdated flutter SDK version on the runner that doesn't support newer packages.",
    fixSteps: [
      "Use subosito/flutter-action to set up Flutter with a specific version.",
      "Pin flutter-version to match your local development version.",
      "Run flutter pub upgrade locally and commit pubspec.lock.",
    ],
    reproduction: `- uses: subosito/flutter-action@v2
  with:
    flutter-version: '3.19.0'
    channel: 'stable'

- name: Get dependencies
  run: flutter pub get`,
    sponsored: null,
    related: ["gha-node-version-mismatch", "gha-python-version-mismatch"],
  },
  {
    id: "gha-xcodeproj-not-found",
    errorString: "xcodebuild: error: The project named does not contain a scheme named",
    provider: "GitHub Actions",
    runner: "macos-latest",
    toolchain: "Xcode / iOS",
    severity: "high",
    tags: ["xcode", "ios", "macos", "scheme", "build"],
    rootCause: "xcodebuild cannot find the specified scheme. Either the scheme name is wrong, the scheme is not shared (not committed to git), or the wrong Xcode version is selected.",
    fixSteps: [
      "List available schemes: xcodebuild -list -project MyApp.xcodeproj.",
      "Mark the scheme as shared in Xcode: Product → Scheme → Manage Schemes → check Shared.",
      "Commit the .xcscheme file to git.",
      "Select Xcode version: sudo xcode-select -s /Applications/Xcode_15.2.app.",
    ],
    reproduction: `- name: List schemes
  run: xcodebuild -list -project MyApp.xcodeproj

- name: Build
  run: xcodebuild -scheme MyApp -destination 'platform=iOS Simulator,name=iPhone 15'`,
    sponsored: null,
    related: ["gha-missing-env-variable", "gha-node-version-mismatch"],
  },
  {
    id: "gha-android-sdk-not-found",
    errorString: "SDK location not found. Define location with an ANDROID_SDK_ROOT environment variable.",
    provider: "GitHub Actions",
    runner: "ubuntu-22.04",
    toolchain: "Android / Gradle",
    severity: "high",
    tags: ["android", "sdk", "gradle", "mobile", "build"],
    rootCause: "The Android SDK path is not set. GitHub Actions ubuntu runners have Android SDK pre-installed but the environment variable may not be set correctly for your build tool.",
    fixSteps: [
      "Set ANDROID_SDK_ROOT: $ANDROID_SDK_ROOT in your workflow env.",
      "Use actions/setup-java with the correct JDK version.",
      "Create local.properties with sdk.dir=$ANDROID_SDK_ROOT.",
    ],
    reproduction: `- name: Build APK
  env:
    ANDROID_SDK_ROOT: /usr/local/lib/android/sdk
  run: |
    echo "sdk.dir=$ANDROID_SDK_ROOT" > local.properties
    ./gradlew assembleRelease`,
    sponsored: null,
    related: ["gha-gradle-oom", "gha-java-version-mismatch"],
  },
  {
    id: "gha-semver-tag-invalid",
    errorString: "fatal: No names found, cannot describe anything.",
    provider: "GitHub Actions",
    runner: "ubuntu-22.04",
    toolchain: "Git / Semantic Versioning",
    severity: "medium",
    tags: ["git", "tag", "semver", "version", "describe"],
    rootCause: "git describe failed because there are no tags in the repository. This command is used to generate version numbers from git history but requires at least one tag to work.",
    fixSteps: [
      "Add --always flag: git describe --tags --always to fall back to commit hash.",
      "Fetch tags in checkout: actions/checkout with fetch-depth: 0.",
      "Create an initial tag: git tag v0.0.1 and push it.",
    ],
    reproduction: `- uses: actions/checkout@v4
  with:
    fetch-depth: 0  # fetch all history and tags

- name: Get version
  run: git describe --tags --always`,
    sponsored: null,
    related: ["gha-github-release-fail", "gha-actions-checkout-permission"],
  },
  {
    id: "gha-php-composer-fail",
    errorString: "Your requirements could not be resolved to an installable set of packages.",
    provider: "GitHub Actions",
    runner: "ubuntu-22.04",
    toolchain: "PHP / Composer",
    severity: "high",
    tags: ["php", "composer", "dependency", "version", "laravel"],
    rootCause: "Composer cannot find a compatible set of package versions. Often caused by PHP version mismatch — packages requiring PHP 8.2 but runner has PHP 8.1, or conflicting package constraints.",
    fixSteps: [
      "Use shivammathur/setup-php action to set the correct PHP version.",
      "Run composer update locally and commit composer.lock.",
      "Use composer install --no-interaction --prefer-dist in CI.",
    ],
    reproduction: `- uses: shivammathur/setup-php@v2
  with:
    php-version: '8.2'
    extensions: mbstring, pdo_mysql

- name: Install dependencies
  run: composer install --no-interaction --prefer-dist`,
    sponsored: null,
    related: ["gha-ruby-bundler-fail", "gha-npm-ci-frozen-lockfile"],
  },
  {
    id: "gha-firebase-deploy-fail",
    errorString: "Error: Failed to get Firebase project. Please make sure the project exists.",
    provider: "GitHub Actions",
    runner: "ubuntu-22.04",
    toolchain: "Firebase / Google Cloud",
    severity: "high",
    tags: ["firebase", "deploy", "google", "token", "project"],
    rootCause: "Firebase CLI cannot authenticate or find the project. Either FIREBASE_TOKEN is missing, the project ID is wrong, or the service account lacks deployment permissions.",
    fixSteps: [
      "Generate Firebase CI token: firebase login:ci and add as FIREBASE_TOKEN secret.",
      "Verify project ID in .firebaserc matches your actual Firebase project.",
      "Use google-github-actions/auth with Workload Identity for better security.",
    ],
    reproduction: `- name: Deploy to Firebase
  uses: FirebaseExtended/action-hosting-deploy@v0
  with:
    repoToken: \${{ secrets.GITHUB_TOKEN }}
    firebaseServiceAccount: \${{ secrets.FIREBASE_SERVICE_ACCOUNT }}
    projectId: my-firebase-project`,
    sponsored: null,
    related: ["gha-aws-credentials-missing", "gha-vercel-deploy-fail"],
  },
  {
    id: "gha-chromatic-storybook-fail",
    errorString: "Error: Failed to build Storybook. Check the Storybook build log above.",
    provider: "GitHub Actions",
    runner: "ubuntu-22.04",
    toolchain: "Storybook / Chromatic",
    severity: "medium",
    tags: ["storybook", "chromatic", "visual-testing", "build", "react"],
    rootCause: "Storybook build failed before Chromatic could run visual tests. Usually caused by a broken story file, missing peer dependency, or incompatible addon versions.",
    fixSteps: [
      "Run npx storybook build locally to reproduce the error.",
      "Check for TypeScript errors in story files.",
      "Ensure all addons are compatible with your Storybook version.",
      "Add --quiet flag to reduce noise: storybook build --quiet.",
    ],
    reproduction: `- name: Build Storybook
  run: npx storybook build

- name: Run Chromatic
  uses: chromaui/action@latest
  with:
    projectToken: \${{ secrets.CHROMATIC_PROJECT_TOKEN }}`,
    sponsored: null,
    related: ["gha-jest-timeout", "gha-node-heap-exceeded"],
  },
  {
    id: "gha-datadog-api-key-missing",
    errorString: "Error sending metrics: 403 Forbidden: the API key is not authorized",
    provider: "GitHub Actions",
    runner: "ubuntu-22.04",
    toolchain: "Datadog / Monitoring",
    severity: "medium",
    tags: ["datadog", "monitoring", "api-key", "metrics", "403"],
    rootCause: "The Datadog API key is invalid or not set. The key may have been rotated, deleted, or the secret was never added to the repository.",
    fixSteps: [
      "Regenerate the API key in Datadog: Organization Settings → API Keys.",
      "Update the DATADOG_API_KEY GitHub secret.",
      "Verify you're using an API key not an App key — they have different permissions.",
    ],
    reproduction: `- name: Send metrics to Datadog
  env:
    DATADOG_API_KEY: \${{ secrets.DATADOG_API_KEY }}
  run: |
    curl -X POST "https://api.datadoghq.com/api/v2/series" \
      -H "DD-API-KEY: $DATADOG_API_KEY" \
      -d '{"series":[{"metric":"ci.build","points":[[0,1]]}]}'`,
    sponsored: {
      name: "Datadog",
      tagline: "Full-stack observability — metrics, logs, and traces in one platform.",
      url: "#",
    },
    related: ["gha-env-secret-empty", "gha-slack-notify-fail"],
  },
  {
    id: "gha-sentry-release-fail",
    errorString: "Error: Could not find Sentry project. Check your auth token and organization.",
    provider: "GitHub Actions",
    runner: "ubuntu-22.04",
    toolchain: "Sentry / Error Tracking",
    severity: "medium",
    tags: ["sentry", "release", "sourcemap", "auth", "token"],
    rootCause: "Sentry CLI cannot authenticate to create a release. SENTRY_AUTH_TOKEN is missing or the org/project slugs are wrong.",
    fixSteps: [
      "Create an auth token in Sentry: Settings → Auth Tokens → Create New Token.",
      "Add SENTRY_AUTH_TOKEN, SENTRY_ORG, and SENTRY_PROJECT as GitHub secrets.",
      "Use the official getsentry/action-release action for simpler setup.",
    ],
    reproduction: `- name: Create Sentry release
  uses: getsentry/action-release@v1
  env:
    SENTRY_AUTH_TOKEN: \${{ secrets.SENTRY_AUTH_TOKEN }}
    SENTRY_ORG: my-org
    SENTRY_PROJECT: my-project
  with:
    environment: production`,
    sponsored: {
      name: "Sentry",
      tagline: "Application monitoring and error tracking — know about errors before your users do.",
      url: "#",
    },
    related: ["gha-datadog-api-key-missing", "gha-env-secret-empty"],
  },
  {
    id: "gha-npm-audit-fail",
    errorString: "npm audit: found X vulnerabilities (Y critical)",
    provider: "GitHub Actions",
    runner: "ubuntu-22.04",
    toolchain: "Node.js / npm",
    severity: "high",
    tags: ["npm", "audit", "security", "vulnerability", "cve"],
    rootCause: "npm audit found security vulnerabilities in your dependencies. The CI pipeline is configured to fail on vulnerabilities above a certain severity level.",
    fixSteps: [
      "Run npm audit fix to automatically fix compatible vulnerabilities.",
      "For breaking changes: npm audit fix --force (test thoroughly after).",
      "Use npm audit --audit-level=critical to only fail on critical issues.",
      "Add npm audit --audit-level=high to your CI script.",
    ],
    reproduction: `- name: Security audit
  run: npm audit --audit-level=high
  # Use --audit-level=critical to be less strict`,
    sponsored: null,
    related: ["gha-snyk-auth-fail", "gha-trivy-scan-fail"],
  },
  {
    id: "gha-stale-action-version",
    errorString: "Warning: The `set-output` command is deprecated and will be disabled soon.",
    provider: "GitHub Actions",
    runner: "ubuntu-22.04",
    toolchain: "GitHub Actions",
    severity: "low",
    tags: ["deprecated", "set-output", "actions", "warning", "version"],
    rootCause: "You or a third-party action is using the deprecated set-output workflow command. GitHub deprecated this in favor of $GITHUB_OUTPUT environment file.",
    fixSteps: [
      "Update third-party actions to their latest versions.",
      "Replace set-output: echo 'name=value' >> $GITHUB_OUTPUT.",
      "Check all your actions versions and update to latest.",
    ],
    reproduction: `# Old (deprecated)
echo "::set-output name=version::1.0.0"

# New (correct)
echo "version=1.0.0" >> $GITHUB_OUTPUT`,
    sponsored: null,
    related: ["gha-github-release-fail", "gha-actions-checkout-permission"],
  },
  {
    id: "gha-long-sha-checkout",
    errorString: "fatal: reference is not a tree: abc123",
    provider: "GitHub Actions",
    runner: "ubuntu-22.04",
    toolchain: "Git / GitHub Actions",
    severity: "medium",
    tags: ["git", "checkout", "sha", "shallow", "fetch-depth"],
    rootCause: "A workflow tries to checkout a specific commit SHA that isn't available because the repository was cloned with a shallow fetch. By default actions/checkout fetches only 1 commit.",
    fixSteps: [
      "Set fetch-depth: 0 in actions/checkout to fetch full history.",
      "Or set fetch-depth to a number large enough to include the target SHA.",
      "For PR workflows use fetch-depth: 2 to get the base commit.",
    ],
    reproduction: `- uses: actions/checkout@v4
  with:
    fetch-depth: 0  # full history`,
    sponsored: null,
    related: ["gha-semver-tag-invalid", "gha-actions-checkout-permission"],
  },
  {
    id: "gha-elastic-beanstalk-deploy",
    errorString: "ERROR: Failed to deploy application. Environment update failed.",
    provider: "GitHub Actions",
    runner: "ubuntu-22.04",
    toolchain: "AWS Elastic Beanstalk",
    severity: "critical",
    tags: ["aws", "elastic-beanstalk", "deploy", "eb", "environment"],
    rootCause: "Elastic Beanstalk environment update failed. Common causes: health check failing on new version, instance type not available, or configuration error in .ebextensions.",
    fixSteps: [
      "Check EB environment health in AWS Console → Elastic Beanstalk → Logs.",
      "Review eb-activity.log for the specific error.",
      "Test deployment locally first: eb local run.",
      "Check that health check path returns 200 for the new version.",
    ],
    reproduction: `- name: Deploy to Elastic Beanstalk
  uses: einaregilsson/beanstalk-deploy@v22
  with:
    aws_access_key: \${{ secrets.AWS_ACCESS_KEY_ID }}
    aws_secret_key: \${{ secrets.AWS_SECRET_ACCESS_KEY }}
    application_name: myapp
    environment_name: myapp-production
    region: eu-west-1
    version_label: \${{ github.sha }}`,
    sponsored: null,
    related: ["gha-aws-credentials-missing", "gha-terraform-state-lock"],
  },
  {
    id: "gha-lint-staged-fail",
    errorString: "lint-staged: Configuration could not be found",
    provider: "GitHub Actions",
    runner: "ubuntu-22.04",
    toolchain: "Node.js / lint-staged",
    severity: "low",
    tags: ["lint-staged", "husky", "pre-commit", "lint", "format"],
    rootCause: "lint-staged cannot find its configuration. It looks for config in package.json, .lintstagedrc, or lint-staged.config.js. The file may be missing or in the wrong location.",
    fixSteps: [
      "Add lint-staged config to package.json under the lint-staged key.",
      "Or create .lintstagedrc.json in the root directory.",
      "Verify the config file is committed to git.",
    ],
    reproduction: `// package.json
{
  "lint-staged": {
    "*.{js,jsx,ts,tsx}": ["eslint --fix", "prettier --write"],
    "*.{css,md}": "prettier --write"
  }
}`,
    sponsored: null,
    related: ["gha-exit-code-1-eslint", "gha-npm-ci-frozen-lockfile"],
  },
  {
    id: "gha-github-pages-not-enabled",
    errorString: "Error: GitHub Pages site is disabled. Please enable it in the repository settings.",
    provider: "GitHub Actions",
    runner: "ubuntu-22.04",
    toolchain: "GitHub Pages",
    severity: "medium",
    tags: ["github-pages", "pages", "deploy", "settings", "enable"],
    rootCause: "GitHub Pages is not enabled for the repository. The deployment action requires Pages to be configured in the repository settings before it can deploy.",
    fixSteps: [
      "Go to repo Settings → Pages → Source → select GitHub Actions.",
      "Make sure the repository is public or you have GitHub Pro/Team for private repos.",
      "The first deployment may take a few minutes to appear.",
    ],
    reproduction: `# Enable in Settings → Pages → Source → GitHub Actions
# Then use this workflow:
- name: Deploy to GitHub Pages
  uses: actions/deploy-pages@v4`,
    sponsored: null,
    related: ["gha-gh-pages-deploy-fail", "gha-actions-checkout-permission"],
  },
  {
    id: "gha-expo-build-fail",
    errorString: "CommandError: Your project must use Expo SDK 46 or higher to build with EAS.",
    provider: "GitHub Actions",
    runner: "ubuntu-22.04",
    toolchain: "Expo / React Native",
    severity: "high",
    tags: ["expo", "react-native", "eas", "build", "sdk"],
    rootCause: "EAS Build requires a minimum Expo SDK version. The project is using an older SDK that is not supported by the current EAS CLI version.",
    fixSteps: [
      "Upgrade Expo SDK: npx expo upgrade.",
      "Or pin the EAS CLI version to one compatible with your SDK.",
      "Check EAS changelog for minimum SDK requirements.",
    ],
    reproduction: `- name: Setup EAS
  uses: expo/expo-github-action@v8
  with:
    expo-version: latest
    eas-version: latest
    token: \${{ secrets.EXPO_TOKEN }}

- name: Build
  run: eas build --platform android --non-interactive`,
    sponsored: null,
    related: ["gha-flutter-pub-get-fail", "gha-android-sdk-not-found"],
  },
  {
    id: "gha-liquibase-migration-fail",
    errorString: "liquibase.exception.LockException: Could not acquire change log lock.",
    provider: "GitHub Actions",
    runner: "ubuntu-22.04",
    toolchain: "Java / Liquibase",
    severity: "critical",
    tags: ["liquibase", "database", "migration", "lock", "java"],
    rootCause: "A previous Liquibase run crashed without releasing the changelog lock in the DATABASECHANGELOGLOCK table. Liquibase locks the table during migrations to prevent concurrent changes.",
    fixSteps: [
      "Run liquibase releaseLocks to release the orphaned lock.",
      "Or manually: UPDATE DATABASECHANGELOGLOCK SET LOCKED=0.",
      "Add --lockWaitTime=5 to timeout instead of hanging indefinitely.",
    ],
    reproduction: `- name: Release locks (if stuck)
  run: liquibase releaseLocks

- name: Run migrations
  run: liquibase update`,
    sponsored: null,
    related: ["gha-terraform-state-lock", "gha-mysql-connection-refused"],
  },
  {
    id: "gha-prisma-migrate-fail",
    errorString: "Error: P3006: Migration failed to apply cleanly to the shadow database.",
    provider: "GitHub Actions",
    runner: "ubuntu-22.04",
    toolchain: "Node.js / Prisma",
    severity: "high",
    tags: ["prisma", "migration", "database", "shadow", "node"],
    rootCause: "Prisma migrate deploy failed because the migration SQL cannot be applied to the shadow database. Usually caused by a manual database change that conflicts with the migration history.",
    fixSteps: [
      "Use prisma migrate deploy (not dev) in CI — it doesn't use shadow database.",
      "Never run prisma migrate dev in CI — it's for local development only.",
      "Check that DATABASE_URL points to the correct CI database.",
    ],
    reproduction: `- name: Run Prisma migrations
  env:
    DATABASE_URL: \${{ secrets.DATABASE_URL }}
  run: npx prisma migrate deploy`,
    sponsored: null,
    related: ["gha-postgres-connection-refused", "gha-mysql-connection-refused"],
  },
  {
    id: "gha-aws-ecr-auth-fail",
    errorString: "Error: Cannot perform an interactive login from a non TTY device",
    provider: "GitHub Actions",
    runner: "ubuntu-22.04",
    toolchain: "AWS ECR / Docker",
    severity: "high",
    tags: ["aws", "ecr", "docker", "login", "tty", "registry"],
    rootCause: "Running aws ecr get-login-password | docker login directly fails in non-interactive CI environments. The pipe doesn't work the same way without a TTY.",
    fixSteps: [
      "Use amazon-ecr-login GitHub Action instead of manual docker login.",
      "Or use the correct pipe syntax for CI.",
    ],
    reproduction: `- name: Login to Amazon ECR
  uses: aws-actions/amazon-ecr-login@v2
  id: login-ecr

- name: Build and push
  uses: docker/build-push-action@v5
  with:
    push: true
    tags: \${{ steps.login-ecr.outputs.registry }}/myapp:latest`,
    sponsored: null,
    related: ["gha-aws-credentials-missing", "gha-docker-push-denied"],
  },
  {
    id: "gha-tflint-config-missing",
    errorString: "Error: Failed to load configurations. .tflint.hcl not found.",
    provider: "GitHub Actions",
    runner: "ubuntu-22.04",
    toolchain: "Terraform / TFLint",
    severity: "low",
    tags: ["terraform", "tflint", "lint", "config", "hcl"],
    rootCause: "TFLint looks for .tflint.hcl in the current directory but it doesn't exist. Without configuration it doesn't know which plugins to load or rules to apply.",
    fixSteps: [
      "Create a .tflint.hcl file in your repository root.",
      "Use --config flag to specify a different config path.",
      "Add plugin config for AWS, Azure, or GCP providers as needed.",
    ],
    reproduction: `# .tflint.hcl
plugin "aws" {
  enabled = true
  version = "0.29.0"
  source  = "github.com/terraform-linters/tflint-ruleset-aws"
}`,
    sponsored: null,
    related: ["gha-terraform-init-fail", "gha-terraform-state-lock"],
  },
  {
    id: "gha-newrelic-license-key-missing",
    errorString: "FATAL ERROR: No license key found. Please set NEW_RELIC_LICENSE_KEY.",
    provider: "GitHub Actions",
    runner: "ubuntu-22.04",
    toolchain: "New Relic / APM",
    severity: "medium",
    tags: ["newrelic", "apm", "monitoring", "license", "key"],
    rootCause: "New Relic agent cannot start because the license key environment variable is not set in the CI environment.",
    fixSteps: [
      "Add NEW_RELIC_LICENSE_KEY as a GitHub secret.",
      "Reference it in your workflow: NEW_RELIC_LICENSE_KEY: ${{ secrets.NEW_RELIC_LICENSE_KEY }}.",
      "For testing environments, disable New Relic: NEW_RELIC_ENABLED=false.",
    ],
    reproduction: `- name: Run tests
  env:
    NEW_RELIC_ENABLED: false  # disable in CI
  run: npm test`,
    sponsored: null,
    related: ["gha-datadog-api-key-missing", "gha-env-secret-empty"],
  },
  {
    id: "gha-heroku-deploy-fail",
    errorString: "Error: The provided credentials are invalid. Please run heroku login.",
    provider: "GitHub Actions",
    runner: "ubuntu-22.04",
    toolchain: "Heroku",
    severity: "high",
    tags: ["heroku", "deploy", "credentials", "token", "api-key"],
    rootCause: "Heroku CLI is not authenticated. HEROKU_API_KEY secret is missing, expired, or the wrong account.",
    fixSteps: [
      "Generate Heroku API key: heroku authorizations:create.",
      "Add HEROKU_API_KEY as a GitHub secret.",
      "Use AkhileshNS/heroku-deploy action for simpler setup.",
    ],
    reproduction: `- name: Deploy to Heroku
  uses: AkhileshNS/heroku-deploy@v3.13.15
  with:
    heroku_api_key: \${{ secrets.HEROKU_API_KEY }}
    heroku_app_name: my-heroku-app
    heroku_email: my@email.com`,
    sponsored: null,
    related: ["gha-vercel-deploy-fail", "gha-firebase-deploy-fail"],
  },
  {
    id: "gha-docker-multi-platform-fail",
    errorString: "ERROR: Multi-platform build is not supported for the docker driver.",
    provider: "GitHub Actions",
    runner: "ubuntu-22.04",
    toolchain: "Docker Buildx / Multi-platform",
    severity: "high",
    tags: ["docker", "buildx", "multiplatform", "arm", "amd64"],
    rootCause: "Multi-platform builds require the docker-container buildx driver, not the default docker driver. The default driver only supports the host platform.",
    fixSteps: [
      "Add docker/setup-buildx-action with driver: docker-container.",
      "Add docker/setup-qemu-action for ARM emulation.",
      "Specify platforms: linux/amd64,linux/arm64 in the build step.",
    ],
    reproduction: `- name: Set up QEMU
  uses: docker/setup-qemu-action@v3

- name: Set up Docker Buildx
  uses: docker/setup-buildx-action@v3

- name: Build multi-platform
  uses: docker/build-push-action@v5
  with:
    platforms: linux/amd64,linux/arm64
    push: true
    tags: myorg/myapp:latest`,
    sponsored: {
      name: "Depot",
      tagline: "Native multi-platform builds without QEMU — 10x faster ARM builds.",
      url: "#",
    },
    related: ["gha-docker-buildx-not-setup", "gha-docker-push-denied"],
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

const CARDS_PER_PAGE = 3;

export default function ErrorDex() {
  const [view, setView] = useState("home");
  const [selectedId, setSelectedId] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [submitForm, setSubmitForm] = useState({ error: "", provider: "", runner: "", toolchain: "" });
  const [activeFilter, setActiveFilter] = useState("all");
 const [carouselPage, setCarouselPage] = useState(0);



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

 
  const totalPages = Math.ceil(filtered.length / CARDS_PER_PAGE);
 const visibleCards = filtered.slice(carouselPage * CARDS_PER_PAGE, (carouselPage + 1) * CARDS_PER_PAGE);

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

          {filtered.length === 0 ? (
            <div style={styles.empty}>
              <div style={styles.emptyIcon}>⚠</div>
              <p style={styles.emptyText}>No match found.</p>
              <p style={styles.emptySubtext}>Help the community — submit this error.</p>
              <button style={styles.btnPrimary} onClick={() => { setSubmitForm(f => ({ ...f, error: searchQuery })); setView("submit"); }}>
                Submit error string →
              </button>
            </div>
          ) : (
            <div style={styles.carouselWrap}>
              <div style={styles.carouselHeader}>
                <span style={styles.carouselCount}>
                  <strong>{filtered.length}</strong> failures found
                  {totalPages > 1 && <span style={styles.carouselPagination}> — page {carouselPage + 1} of {totalPages}</span>}
                </span>
                {totalPages > 1 && (
                  <div style={styles.carouselNav}>
                    <button
                      style={{ ...styles.navBtn, opacity: carouselPage === 0 ? 0.3 : 1 }}
                      onClick={() => setCarouselPage(p => Math.max(0, p - 1))}
                      disabled={carouselPage === 0}
                    >
                      ←
                    </button>
                    <div style={styles.dotWrap}>
                      {Array.from({ length: totalPages }).map((_, i) => (
                        <button
                          key={i}
                          style={{ ...styles.dot, background: i === carouselPage ? "#00ff88" : "#2a2a2a" }}
                          onClick={() => setCarouselPage(i)}
                        />
                      ))}
                    </div>
                    <button
                      style={{ ...styles.navBtn, opacity: carouselPage === totalPages - 1 ? 0.3 : 1 }}
                      onClick={() => setCarouselPage(p => Math.min(totalPages - 1, p + 1))}
                      disabled={carouselPage === totalPages - 1}
                    >
                      →
                    </button>
                  </div>
                )}
              </div>

              <div style={styles.carouselGrid}>
                {visibleCards.map((f, i) => (
                  <button
                    key={f.id}
                    style={{ ...styles.card, animationDelay: `${i * 80}ms` }}
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
                      </div>
                      <span style={styles.cardArrow}>→</span>
                    </div>
                    <div style={styles.cardError}>{f.errorString}</div>
                    <div style={styles.cardFooter}>
                      <span style={styles.toolchainLabel}>{f.toolchain}</span>
                      <div style={styles.cardTags}>
                        {f.tags.slice(0, 2).map((t) => (
                          <span key={t} style={styles.tag}>{t}</span>
                        ))}
                      </div>
                    </div>
                  </button>
                ))}
              </div>

              {totalPages > 1 && (
                <div style={styles.carouselFooter}>
                  <button
                    style={{ ...styles.navBtnLarge, opacity: carouselPage === 0 ? 0.3 : 1 }}
                    onClick={() => setCarouselPage(p => Math.max(0, p - 1))}
                    disabled={carouselPage === 0}
                  >
                    ← Previous
                  </button>
                  <button
                    style={{ ...styles.navBtnLarge, opacity: carouselPage === totalPages - 1 ? 0.3 : 1 }}
                    onClick={() => setCarouselPage(p => Math.min(totalPages - 1, p + 1))}
                    disabled={carouselPage === totalPages - 1}
                  >
                    Next →
                  </button>
                </div>
              )}
            </div>
          )}

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
                  <a href={selectedEntry.sponsored.url} style={styles.sponsoredBtn}>Learn more →</a>
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
                <button style={styles.btnOutline} onClick={() => setView("submit")}>Submit your signature →</button>
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
                onClick={async () => {
                  await fetch("https://formspree.io/f/mzdanqeb", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(submitForm),
                  });
                  setView("submitted");
                }}
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
  .card-hover:hover { transform: translateY(-3px); border-color: rgba(0,255,136,0.35) !important; box-shadow: 0 8px 32px rgba(0,255,136,0.08) !important; }
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
  page: { maxWidth: 960, margin: "0 auto", padding: "48px 24px" },
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

  carouselWrap: { marginBottom: 40 },
  carouselHeader: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 },
  carouselCount: { fontSize: 13, color: "#555", fontFamily: "'JetBrains Mono', monospace" },
  carouselPagination: { color: "#444" },
  carouselNav: { display: "flex", alignItems: "center", gap: 12 },
  navBtn: { background: "none", border: "1px solid #2a2a2a", color: "#888", fontSize: 16, width: 36, height: 36, borderRadius: 8, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", transition: "all 0.15s", fontFamily: "monospace" },
  dotWrap: { display: "flex", gap: 6, alignItems: "center" },
  dot: { width: 6, height: 6, borderRadius: "50%", border: "none", cursor: "pointer", transition: "background 0.2s", padding: 0 },
  carouselGrid: { display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16 },
  carouselFooter: { display: "flex", justifyContent: "center", gap: 12, marginTop: 24 },
  navBtnLarge: { background: "none", border: "1px solid #2a2a2a", color: "#888", fontSize: 13, padding: "8px 20px", borderRadius: 8, cursor: "pointer", fontFamily: "'JetBrains Mono', monospace", transition: "all 0.15s" },

  card: { background: "#111", border: "1px solid #1e1e1e", borderRadius: 10, padding: "20px", cursor: "pointer", textAlign: "left", width: "100%", display: "flex", flexDirection: "column", gap: 10, minHeight: 160 },
  cardTop: { display: "flex", justifyContent: "space-between", alignItems: "center" },
  cardMeta: { display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" },
  cardArrow: { color: "#333", fontSize: 16 },
  cardError: { fontFamily: "'JetBrains Mono', monospace", fontSize: 12, color: "#e8e8e0", lineHeight: 1.5, wordBreak: "break-word", flex: 1 },
  cardFooter: { display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 6 },
  cardTags: { display: "flex", gap: 6, flexWrap: "wrap" },
  severityBadge: { fontFamily: "'JetBrains Mono', monospace", fontSize: 9, fontWeight: 700, letterSpacing: "0.08em", padding: "2px 6px", borderRadius: 4 },
  providerBadge: { fontFamily: "'JetBrains Mono', monospace", fontSize: 10, fontWeight: 600 },
  runnerBadge: { fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: "#555", background: "#161616", padding: "2px 8px", borderRadius: 4 },
  toolchainLabel: { fontSize: 11, color: "#555", fontFamily: "'JetBrains Mono', monospace" },
  tag: { fontSize: 10, color: "#444", background: "#161616", padding: "2px 6px", borderRadius: 4, fontFamily: "'JetBrains Mono', monospace" },

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