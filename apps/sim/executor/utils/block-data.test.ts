// @vitest-environment node
import '@sim/testing/mocks/executor'

import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { SerializedBlock } from '@/serializer/types'

import { getBlockSchema } from './block-data'

// Mock response-format utilities used transitively by getEffectiveBlockOutputs → getResponseFormatOutputs
vi.mock('@/lib/core/utils/response-format', () => ({
  parseResponseFormatSafely: vi.fn(),
  extractFieldsFromSchema: vi.fn(),
}))

// Mock @/blocks/registry (used by getBlockSchema in block-data.ts for hasTriggerCapability)
vi.mock('@/blocks/registry', () => ({
  getBlock: vi.fn(),
}))

// Import mocked functions so we can control return values per test
import {
  extractFieldsFromSchema,
  parseResponseFormatSafely,
} from '@/lib/core/utils/response-format'

// Import mocked getBlock from @/blocks (used by getEffectiveBlockOutputs in block-outputs.ts)
import { getBlock } from '@/blocks'
// Import mocked getBlock from @/blocks/registry (used by getBlockSchema in block-data.ts)
import { getBlock as getBlockRegistry } from '@/blocks/registry'

const mockParseResponseFormat = vi.mocked(parseResponseFormatSafely)
const mockExtractFields = vi.mocked(extractFieldsFromSchema)
const mockGetBlock = vi.mocked(getBlock)
const mockGetBlockRegistry = vi.mocked(getBlockRegistry)

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Standard agent block outputs — mirrors what real agent blocks expose. */
const AGENT_BASE_OUTPUTS: Record<string, { type: string }> = {
  content: { type: 'string' },
  model: { type: 'string' },
  tokens: { type: 'object' },
  toolCalls: { type: 'object' },
  providerTiming: { type: 'object' },
}

/** Creates a minimal SerializedBlock for testing. */
function createAgentBlock(overrides: Partial<SerializedBlock> = {}): SerializedBlock {
  return {
    id: 'agent-1',
    position: { x: 0, y: 0 },
    config: { tool: 'agent', params: {} },
    inputs: {},
    outputs: { ...AGENT_BASE_OUTPUTS },
    metadata: { id: 'agent', name: 'Agent' },
    enabled: true,
    ...overrides,
  } as SerializedBlock
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('getBlockSchema', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Configure both getBlock mocks to return agent block config.
    // - @/blocks/registry: used by getBlockSchema for hasTriggerCapability
    // - @/blocks: used by getEffectiveBlockOutputs / getBlockOutputs for base outputs
    const agentBlockConfig = {
      type: 'agent',
      outputs: AGENT_BASE_OUTPUTS,
      subBlocks: [],
      category: 'ai',
    }
    const getBlockImpl = ((type: string) => {
      if (type === 'agent') return agentBlockConfig
      return undefined
    }) as any
    mockGetBlockRegistry.mockImplementation(getBlockImpl)
    mockGetBlock.mockImplementation(getBlockImpl)
  })

  // -----------------------------------------------------------------------
  // responseFormat merging (the bug-fix under test)
  // -----------------------------------------------------------------------
  describe('with responseFormat', () => {
    it('should merge responseFormat fields with base agent outputs', () => {
      const block = createAgentBlock({
        config: {
          tool: 'agent',
          params: {
            responseFormat: '{"type":"object","properties":{"sentiment":{"type":"string"},"summary":{"type":"string"}}}',
          },
        },
      })

      // Simulate the two parsing helpers returning valid data
      mockParseResponseFormat.mockReturnValue({
        type: 'object',
        properties: {
          sentiment: { type: 'string' },
          summary: { type: 'string' },
        },
      })
      mockExtractFields.mockReturnValue([
        { name: 'sentiment', type: 'string' },
        { name: 'summary', type: 'string' },
      ])

      const schema = getBlockSchema(block)

      // Schema MUST contain ALL base outputs AND the responseFormat fields
      expect(schema).toBeDefined()

      // Base outputs preserved
      expect(schema).toHaveProperty('content')
      expect(schema).toHaveProperty('model')
      expect(schema).toHaveProperty('tokens')
      expect(schema).toHaveProperty('toolCalls')
      expect(schema).toHaveProperty('providerTiming')

      // responseFormat fields added
      expect(schema).toHaveProperty('sentiment')
      expect(schema).toHaveProperty('summary')

      // Total keys = 5 base + 2 responseFormat = 7
      expect(Object.keys(schema!)).toHaveLength(7)
    })

    it('should preserve toolCalls output when responseFormat is set', () => {
      // This is the exact bug that broke the "Kamatas PROD" workflow:
      // workflows referencing <agent.toolCalls.list> failed because
      // responseFormat replaced all base outputs instead of merging.
      const block = createAgentBlock({
        config: {
          tool: 'agent',
          params: {
            responseFormat: '{"type":"object","properties":{"analysis":{"type":"string"}}}',
          },
        },
      })

      mockParseResponseFormat.mockReturnValue({
        type: 'object',
        properties: { analysis: { type: 'string' } },
      })
      mockExtractFields.mockReturnValue([{ name: 'analysis', type: 'string' }])

      const schema = getBlockSchema(block)

      expect(schema).toBeDefined()
      // The critical assertion: toolCalls must NOT be lost
      expect(schema).toHaveProperty('toolCalls')
      expect(schema!.toolCalls).toEqual({ type: 'object' })
      // responseFormat field must also be present
      expect(schema).toHaveProperty('analysis')
    })

    it('should let responseFormat fields override base outputs of the same name', () => {
      const block = createAgentBlock({
        config: {
          tool: 'agent',
          params: {
            responseFormat: '{"type":"object","properties":{"content":{"type":"object"}}}',
          },
        },
      })

      mockParseResponseFormat.mockReturnValue({
        type: 'object',
        properties: { content: { type: 'object' } },
      })
      mockExtractFields.mockReturnValue([{ name: 'content', type: 'object' }])

      const schema = getBlockSchema(block)

      expect(schema).toBeDefined()
      // responseFormat's "content" type should override the base "string" type
      expect(schema!.content).toEqual({ type: 'object', description: 'Field from Agent: content' })
      // Other base outputs still present
      expect(schema).toHaveProperty('toolCalls')
      expect(schema).toHaveProperty('model')
    })
  })

  // -----------------------------------------------------------------------
  // responseFormat edge-cases that should NOT change behaviour
  // -----------------------------------------------------------------------
  describe('without responseFormat', () => {
    it('should return base outputs when responseFormat is not set', () => {
      const block = createAgentBlock()

      // No responseFormat in config → parsing helpers never called
      const schema = getBlockSchema(block)

      expect(schema).toBeDefined()
      expect(Object.keys(schema!)).toHaveLength(5)
      expect(schema).toHaveProperty('content')
      expect(schema).toHaveProperty('model')
      expect(schema).toHaveProperty('tokens')
      expect(schema).toHaveProperty('toolCalls')
      expect(schema).toHaveProperty('providerTiming')

      // Parsing helpers should NOT be invoked
      expect(mockParseResponseFormat).not.toHaveBeenCalled()
    })

    it('should return undefined when block has no outputs and no responseFormat', () => {
      // Override mock to return agent config with no outputs for this test
      const emptyConfig = { type: 'agent', outputs: {}, subBlocks: [], category: 'ai' }
      const emptyImpl = ((type: string) => (type === 'agent' ? emptyConfig : undefined)) as any
      mockGetBlockRegistry.mockImplementation(emptyImpl)
      mockGetBlock.mockImplementation(emptyImpl)

      const block = createAgentBlock({ outputs: {} })

      const schema = getBlockSchema(block)

      expect(schema).toBeUndefined()
    })
  })

  // -----------------------------------------------------------------------
  // responseFormat with invalid / empty parsed results
  // -----------------------------------------------------------------------
  describe('with invalid responseFormat', () => {
    it('should fall back to base outputs when parseResponseFormatSafely returns null', () => {
      const block = createAgentBlock({
        config: {
          tool: 'agent',
          params: { responseFormat: 'not-valid-json' },
        },
      })

      mockParseResponseFormat.mockReturnValue(null)

      const schema = getBlockSchema(block)

      // Should fall through to base outputs (block.outputs)
      expect(schema).toBeDefined()
      expect(schema).toHaveProperty('content')
      expect(schema).toHaveProperty('toolCalls')
      expect(Object.keys(schema!)).toHaveLength(5)
    })

    it('should fall back to base outputs when extractFieldsFromSchema returns empty array', () => {
      const block = createAgentBlock({
        config: {
          tool: 'agent',
          params: { responseFormat: '{"type":"object","properties":{}}' },
        },
      })

      mockParseResponseFormat.mockReturnValue({ type: 'object', properties: {} })
      mockExtractFields.mockReturnValue([])

      const schema = getBlockSchema(block)

      // Empty fields → getResponseFormatOutputs returns undefined → fallback to base outputs
      expect(schema).toBeDefined()
      expect(schema).toHaveProperty('content')
      expect(schema).toHaveProperty('toolCalls')
      expect(Object.keys(schema!)).toHaveLength(5)
    })
  })
})
