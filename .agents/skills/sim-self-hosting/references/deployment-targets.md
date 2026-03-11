# Deployment Targets

This skill only wraps deployment targets already documented in the repo.

## Documented Targets

| Target | Source Doc | Notes |
|--------|------------|-------|
| npm self-hosting (`npx simstudio`) | `README.md` | Fastest documented single-command self-hosted entrypoint |
| Docker Compose (`docker-compose.prod.yml`) | `README.md` | Standard repo-local container deployment path |
| Docker Compose + Ollama | `README.md` | Local-model variant using `docker-compose.ollama.yml` |
| Dev Containers | `README.md` | Containerized development environment, not a production deploy target |
| Manual self-hosting | `README.md` | Bun + PostgreSQL + pgvector manual setup |
| Render Blueprint | `RENDER_DEPLOYMENT.md` | Creates web, realtime, db-migrations, and PostgreSQL services |
| Helm chart | `helm/sim/README.md` | Kubernetes deployment path documented in the chart README |

## Operator Notes

- Use `README.md` for high-level setup paths and compose/npm entrypoints.
- Use `RENDER_DEPLOYMENT.md` for Render-specific service layout and post-deploy steps.
- Use `helm/sim/README.md` for chart values, secrets, ingress, and production security notes.
- Keep packaged `.skill` archives outside `.agents/skills/`; deployment docs should point at runtime artifacts, not the live skill tree.
