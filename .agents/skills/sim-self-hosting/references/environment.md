# Environment

This reference summarizes self-hosting environment guidance from the repo's
shipped docs.

## Baseline Required Variables

The self-hosting environment docs list these as required:

- `DATABASE_URL`
- `BETTER_AUTH_SECRET`
- `BETTER_AUTH_URL`
- `ENCRYPTION_KEY`
- `INTERNAL_API_SECRET`
- `NEXT_PUBLIC_APP_URL`
- `NEXT_PUBLIC_SOCKET_URL`

## `API_ENCRYPTION_KEY` Guidance

Treat `API_ENCRYPTION_KEY` as **optional/recommended by default**, not universally
required across every target:

- `apps/docs/.../environment-variables.mdx` lists it under **Optional**
- `helm/sim/README.md` lists it as **Optional Security (Recommended for Production)**
- `README.md` and `RENDER_DEPLOYMENT.md` document deployment flows where it may be
  provided or auto-generated for that target

When a deployment target or template auto-generates it, keep that target-specific
behavior. When self-hosting manually, generate it if you want API keys encrypted
at rest.

## Other Optional Variables

Examples documented locally include:

- `COPILOT_API_KEY`
- `ADMIN_API_KEY`
- `RESEND_API_KEY`
- `OLLAMA_URL`
- `VLLM_BASE_URL`

Always defer to the target-specific docs for which optional values are supported.
