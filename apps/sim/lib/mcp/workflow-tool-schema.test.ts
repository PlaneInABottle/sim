import { describe, expect, it } from 'vitest'
import { isValidToolName, sanitizeToolName, TOOL_NAME_PATTERN } from './workflow-tool-schema'

describe('workflow-tool-schema', () => {
  describe('TOOL_NAME_PATTERN', () => {
    it('should be a RegExp', () => {
      expect(TOOL_NAME_PATTERN).toBeInstanceOf(RegExp)
    })

    it('should enforce lowercase-only (no uppercase)', () => {
      expect(TOOL_NAME_PATTERN.test('MyTool')).toBe(false)
      expect(TOOL_NAME_PATTERN.test('GET_WEATHER')).toBe(false)
    })
  })

  describe('isValidToolName', () => {
    it.concurrent('should accept snake_case names', () => {
      expect(isValidToolName('ikas_search_products_v1')).toBe(true)
      expect(isValidToolName('my_tool_v1')).toBe(true)
    })

    it.concurrent('should accept kebab-case names', () => {
      expect(isValidToolName('my-tool-v1')).toBe(true)
    })

    it.concurrent('should accept simple alphanumeric names', () => {
      expect(isValidToolName('search')).toBe(true)
      expect(isValidToolName('tool123')).toBe(true)
    })

    it.concurrent('should reject names with spaces', () => {
      expect(isValidToolName('Ikas Search Products')).toBe(false)
      expect(isValidToolName('my tool')).toBe(false)
    })

    it.concurrent('should reject names with uppercase letters', () => {
      expect(isValidToolName('MyTool')).toBe(false)
      expect(isValidToolName('GET_WEATHER')).toBe(false)
      expect(isValidToolName('searchProducts')).toBe(false)
    })

    it.concurrent('should reject names with special characters', () => {
      expect(isValidToolName('my.tool')).toBe(false)
      expect(isValidToolName('tool@name')).toBe(false)
      expect(isValidToolName('tool/name')).toBe(false)
    })

    it.concurrent('should accept a name of exactly 64 characters', () => {
      expect(isValidToolName('a'.repeat(64))).toBe(true)
    })

    it.concurrent('should reject a name of 65 characters', () => {
      expect(isValidToolName('a'.repeat(65))).toBe(false)
    })

    it.concurrent('should reject an empty string', () => {
      expect(isValidToolName('')).toBe(false)
    })

    it.concurrent('should accept single-character names', () => {
      expect(isValidToolName('a')).toBe(true)
      expect(isValidToolName('1')).toBe(true)
      expect(isValidToolName('_')).toBe(true)
      expect(isValidToolName('-')).toBe(true)
    })
  })

  describe('sanitizeToolName', () => {
    it.concurrent('should convert uppercase to lowercase', () => {
      expect(sanitizeToolName('MyTool')).toBe('mytool')
    })

    it.concurrent('should replace spaces with underscores', () => {
      expect(sanitizeToolName('my tool name')).toBe('my_tool_name')
    })

    it.concurrent('should replace hyphens with underscores', () => {
      expect(sanitizeToolName('my-tool-name')).toBe('my_tool_name')
    })

    it.concurrent('should strip special characters', () => {
      expect(sanitizeToolName('tool@v1!')).toBe('toolv1')
    })

    it.concurrent('should collapse multiple underscores', () => {
      expect(sanitizeToolName('my__tool___name')).toBe('my_tool_name')
    })

    it.concurrent('should truncate to 64 characters', () => {
      const longName = 'a'.repeat(100)
      expect(sanitizeToolName(longName).length).toBe(64)
    })

    it.concurrent('should return fallback for empty/invalid input', () => {
      expect(sanitizeToolName('!!!')).toBe('workflow_tool')
    })
  })
})
