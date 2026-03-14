import {
  isPublicCareersLinkEnabled,
  isPublicChangelogPageEnabled,
  isPublicLandingPageEnabled,
  isPublicLegalPagesEnabled,
  isPublicStudioPagesEnabled,
  isPublicTemplatesPagesEnabled,
} from '@/lib/core/config/feature-flags'
import { getBaseUrl } from '@/lib/core/utils/urls'

export async function GET() {
  const baseUrl = getBaseUrl()
  const corePages = [
    ...(isPublicLandingPageEnabled
      ? [`- [Homepage](${baseUrl}): Main landing page with product overview and features`]
      : []),
    ...(isPublicTemplatesPagesEnabled
      ? [`- [Templates](${baseUrl}/templates): Pre-built workflow templates to get started quickly`]
      : []),
    ...(isPublicChangelogPageEnabled
      ? [`- [Changelog](${baseUrl}/changelog): Product updates and release notes`]
      : []),
    ...(isPublicStudioPagesEnabled
      ? [
          `- [Sim Studio Blog](${baseUrl}/studio): Announcements, insights, and guides for AI workflows`,
        ]
      : []),
  ].join('\n')
  const legalLinks = [
    ...(isPublicLegalPagesEnabled
      ? [
          `- [Terms of Service](${baseUrl}/terms): Legal terms`,
          `- [Privacy Policy](${baseUrl}/privacy): Data handling practices`,
        ]
      : []),
  ].join('\n')
  const optionalLinks = [
    ...(isPublicCareersLinkEnabled
      ? ['- [Careers](https://jobs.ashbyhq.com/sim): Join the Sim team']
      : []),
    ...(legalLinks ? [legalLinks] : []),
  ].join('\n')
  const corePagesSection = corePages ? `## Core Pages\n\n${corePages}\n\n` : ''
  const optionalSection = optionalLinks ? `## Optional\n\n${optionalLinks}\n` : ''

  const llmsContent = `# Sim

> Sim is the open-source platform to build AI agents and run your agentic workforce. Connect 1,000+ integrations and LLMs to deploy and orchestrate agentic workflows.

Sim lets teams create agents, workflows, knowledge bases, tables, and docs. Over 100,000 builders use Sim — from startups to Fortune 500 companies. SOC2 and HIPAA compliant.

${corePagesSection}## Documentation

- [Documentation](https://docs.sim.ai): Complete guides and API reference
- [Quickstart](https://docs.sim.ai/quickstart): Get started in 5 minutes
- [API Reference](https://docs.sim.ai/api): REST API documentation

## Key Concepts

- **Workspace**: Container for workflows, data sources, and executions
- **Workflow**: Directed graph of blocks defining an agentic process
- **Block**: Individual step (LLM call, tool call, HTTP request, code execution)
- **Trigger**: Event or schedule that initiates workflow execution
- **Execution**: A single run of a workflow with logs and outputs
- **Knowledge Base**: Vector-indexed document store for retrieval-augmented generation

## Capabilities

- AI agent creation and deployment
- Agentic workflow orchestration
- 1,000+ integrations (Slack, Gmail, Notion, Airtable, databases, and more)
- Multi-model LLM orchestration (OpenAI, Anthropic, Google, Mistral, xAI, Perplexity)
- Knowledge base creation with retrieval-augmented generation (RAG)
- Table creation and management
- Document creation and processing
- Scheduled and webhook-triggered executions

## Use Cases

- AI agent deployment and orchestration
- Knowledge bases and RAG pipelines
- Document creation and processing
- Customer support automation
- Internal operations (sales, marketing, legal, finance)

## Links

- [GitHub Repository](https://github.com/simstudioai/sim): Open-source codebase
- [Discord Community](https://discord.gg/Hr4UWYEcTT): Get help and connect with 100,000+ builders
- [X/Twitter](https://x.com/simdotai): Product updates and announcements

${optionalSection}
`

  return new Response(llmsContent, {
    headers: {
      'Content-Type': 'text/markdown; charset=utf-8',
      'Cache-Control': 'public, max-age=86400, s-maxage=86400',
    },
  })
}
