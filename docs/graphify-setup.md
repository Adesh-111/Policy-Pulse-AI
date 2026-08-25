# Graphify setup

PolicyPulse AI uses the official Graphify 0.9.49 CLI as a development-only tool. It is installed in an ignored Python virtual environment and is not a Node dependency or part of the Vercel runtime.

## Windows installation

From the repository root with Python 3.10 or newer:

```powershell
python -m venv .graphify-venv
.\.graphify-venv\Scripts\python.exe -m pip install "graphifyy[sql]==0.9.49"
.\.graphify-venv\Scripts\graphify.exe --version
.\.graphify-venv\Scripts\graphify.exe install --project --platform codex
```

The project setup installs the local Codex Graphify skill/instructions and updates `AGENTS.md`. Keep `.graphify-venv/`, `.codex/`, and generated graph output out of the production upload as configured by `.gitignore` and `.vercelignore`.

## Initial map

```powershell
.\.graphify-venv\Scripts\graphify.exe extract . --code-only
.\.graphify-venv\Scripts\graphify.exe cluster-only . --no-label
.\.graphify-venv\Scripts\graphify.exe export html
.\.graphify-venv\Scripts\graphify.exe export callflow-html
```

SQL support comes from the `[sql]` installation extra. No semantic-provider API key is required for the deterministic code/SQL graph.

## Incremental refresh

```powershell
.\.graphify-venv\Scripts\graphify.exe update .
```

After a broad deletion, perform a full extract and cluster again. The complete query workflow, exclusions, verified output names, final graph statistics, and architecture-review findings are in [graphify-workflow.md](graphify-workflow.md).

## Required exclusions

`.graphifyignore` excludes credentials, local environments, dependencies, build/coverage output, generated Graphify artifacts, reports, and temporary files. Review it before mapping any repository that contains confidential policy samples. Never replace `.env.example` placeholders with real values.

Official project and current CLI documentation: <https://github.com/Graphify-Labs/graphify>.
