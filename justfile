default:
    @just --list

# Build the site in an isolated temporary directory.
build-site:
    sh scripts/build-site.sh

# Run the build pipeline.
build:
    crux run scripts/build.crux

# Check external links.
check-external-links:
    sh scripts/check-external-links.sh

# Verify Crux pipelines stop after a failed step.
check-fail-fast:
    sh scripts/check-fail-fast.sh

# Validate workflow syntax and dry-run every target.
check-workflows:
    sh scripts/check-workflows.sh

# Validate zk template contracts.
check-zk-templates:
    sh scripts/check-zk-templates.sh

# Run repository checks.
check:
    crux run scripts/check.crux

# Run the complete CI pipeline.
ci:
    crux run scripts/ci.crux

# Validate editorial content contracts.
editorial-check:
    nu scripts/editorial-check.nu

# Check formatting without modifying files.
format-check:
    crux run scripts/format-check.crux

# Format repository content.
format:
    crux run scripts/format.crux

# Lint repository Markdown.
lint:
    crux run scripts/lint.crux

# Start the local Zola server and open it in a browser.
serve:
    crux run scripts/serve.crux

# Smoke-test an existing Zola output directory.
smoke-site output_dir:
    sh scripts/smoke-site.sh "{{ output_dir }}"

# Validate workflow composition contracts.
test-workflow-contract:
    sh scripts/test-workflow-contract.sh

# Render and validate every zk template.
test-zk-templates:
    nu scripts/test-zk-templates.nu
