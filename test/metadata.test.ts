import { describe, it, expect } from 'vitest';

import {
  is_mcp_metadata_trusted,
  sanitize_mcp_input_schema,
  format_untrusted_mcp_description,
  create_mcp_tool_registration_metadata,
  create_stub_tool_metadata,
} from '../dist/metadata.js';

describe('metadata', () => {
  describe('is_mcp_metadata_trusted', () => {
    it('returns true when metadata_trusted is undefined', () => {
      expect(is_mcp_metadata_trusted({ name: 's' })).toBe(true);
    });

    it('returns true when metadata_trusted is true', () => {
      expect(is_mcp_metadata_trusted({ name: 's', metadata_trusted: true })).toBe(true);
    });

    it('returns false when metadata_trusted is explicitly false', () => {
      expect(is_mcp_metadata_trusted({ name: 's', metadata_trusted: false })).toBe(false);
    });
  });

  describe('sanitize_mcp_input_schema', () => {
    it('returns default schema for undefined input', () => {
      const result = sanitize_mcp_input_schema(undefined);
      expect(result).toEqual({ type: 'object', properties: {} });
    });

    it('returns default schema for null input', () => {
      const result = sanitize_mcp_input_schema(null);
      expect(result).toEqual({ type: 'object', properties: {} });
    });

    it('strips prose keys from schema', () => {
      const schema = {
        type: 'object',
        properties: {
          name: {
            type: 'string',
            description: 'The name',
            title: 'Name',
            examples: ['foo'],
            default: 'bar',
          },
        },
      };
      const result = sanitize_mcp_input_schema(schema);
      const prop = result.properties.name;
      expect(prop.type).toBe('string');
      expect(prop.description).toBeUndefined();
      expect(prop.title).toBeUndefined();
      expect(prop.examples).toBeUndefined();
      expect(prop.default).toBeUndefined();
    });

    it('preserves non-prose keys', () => {
      const schema = {
        type: 'object',
        properties: {
          count: { type: 'number', minimum: 0 },
        },
        required: ['count'],
      };
      const result = sanitize_mcp_input_schema(schema);
      expect(result.properties.count.type).toBe('number');
      expect(result.properties.count.minimum).toBe(0);
      expect(result.required).toEqual(['count']);
    });

    it('handles nested objects', () => {
      const schema = {
        type: 'object',
        properties: {
          config: {
            type: 'object',
            properties: {
              key: { type: 'string', description: 'nested desc' },
            },
          },
        },
      };
      const result = sanitize_mcp_input_schema(schema);
      expect(result.properties.config.properties.key.type).toBe('string');
      expect(result.properties.config.properties.key.description).toBeUndefined();
    });

    it('handles arrays in schema', () => {
      const schema = {
        type: 'array',
        items: { type: 'string', description: 'item desc', title: 'Item' },
      };
      const result = sanitize_mcp_input_schema(schema);
      expect(result.items.type).toBe('string');
      expect(result.items.description).toBeUndefined();
      expect(result.items.title).toBeUndefined();
    });

    it('handles primitive schema values (pass-through)', () => {
      const schema = 'string-type';
      const result = sanitize_mcp_input_schema(schema as any);
      // String is not an object, so sanitize_schema_value returns it as-is,
      // but the outer check rejects non-objects, returning default
      expect(result).toEqual({ type: 'object', properties: {} });
    });

    it('handles array schema at top level (rejected)', () => {
      const schema = ['one', 'two'];
      const result = sanitize_mcp_input_schema(schema as any);
      expect(result).toEqual({ type: 'object', properties: {} });
    });

    it('strips all UNTRUSTED_SCHEMA_PROSE_KEYS', () => {
      const schema = {
        type: 'object',
        $comment: 'should go',
        default: 'should go',
        description: 'should go',
        enumDescriptions: ['should go'],
        errorMessage: 'should go',
        examples: ['should go'],
        markdownDescription: 'should go',
        title: 'should go',
        properties: { x: { type: 'string' } },
      };
      const result = sanitize_mcp_input_schema(schema);
      expect(result.$comment).toBeUndefined();
      expect(result.default).toBeUndefined();
      expect(result.description).toBeUndefined();
      expect(result.enumDescriptions).toBeUndefined();
      expect(result.errorMessage).toBeUndefined();
      expect(result.examples).toBeUndefined();
      expect(result.markdownDescription).toBeUndefined();
      expect(result.title).toBeUndefined();
      expect(result.type).toBe('object');
      expect(result.properties.x.type).toBe('string');
    });
  });

  describe('format_untrusted_mcp_description', () => {
    it('formats description with server and tool names', () => {
      const result = format_untrusted_mcp_description('my-server', 'do_thing');
      expect(result).toBe(
        'Untrusted MCP tool "do_thing" from server "my-server". Rich MCP metadata suppressed until this server is trusted.'
      );
    });

    it('includes both names in output', () => {
      const result = format_untrusted_mcp_description('srv-a', 'tool-b');
      expect(result).toContain('srv-a');
      expect(result).toContain('tool-b');
    });
  });

  describe('create_mcp_tool_registration_metadata', () => {
    it('returns full metadata when config is trusted', () => {
      const config = { name: 'trusted-server', metadata_trusted: true };
      const tool = { name: 'my_tool', description: 'Does stuff', inputSchema: { type: 'object' } };

      const result = create_mcp_tool_registration_metadata(config, tool);
      expect(result.label).toBe('trusted-server: my_tool');
      expect(result.description).toBe('Does stuff');
      expect(result.parameters).toEqual({ type: 'object' });
    });

    it('falls back to tool name when description is missing', () => {
      const config = { name: 'srv', metadata_trusted: true };
      const tool = { name: 't' };

      const result = create_mcp_tool_registration_metadata(config, tool);
      expect(result.description).toBe('t');
    });

    it('returns sanitized metadata when config is untrusted', () => {
      const config = { name: 'untrusted', metadata_trusted: false };
      const tool = {
        name: 'my_tool',
        description: 'Full description',
        inputSchema: {
          type: 'object',
          properties: { x: { type: 'string', description: 'param desc' } },
        },
      };

      const result = create_mcp_tool_registration_metadata(config, tool);
      expect(result.label).toBe('untrusted: my_tool (untrusted metadata)');
      expect(result.description).toContain('Untrusted MCP tool');
      expect(result.description).toContain('my_tool');
      expect(result.description).toContain('untrusted');
      // Schema should be sanitized (description stripped)
      expect(result.parameters.properties.x.description).toBeUndefined();
    });

    it('uses default schema when tool has no inputSchema', () => {
      const config = { name: 'srv', metadata_trusted: false };
      const tool = { name: 't', description: 'desc' };

      const result = create_mcp_tool_registration_metadata(config, tool);
      expect(result.parameters).toEqual({ type: 'object', properties: {} });
    });
  });

  describe('create_stub_tool_metadata', () => {
    it('creates label as server: tool', () => {
      const result = create_stub_tool_metadata('my-server', 'do_thing', 'Does a thing', {
        type: 'object',
        properties: { x: { type: 'string', description: 'param' } },
      });
      expect(result.label).toBe('my-server: do_thing');
    });

    it('extracts first sentence from description', () => {
      const result = create_stub_tool_metadata('s', 't', 'First sentence. More details here.', {});
      expect(result.description).toBe('First sentence.');
    });

    it('falls back to tool name when description is empty', () => {
      const result = create_stub_tool_metadata('s', 't', '', {});
      expect(result.description).toBe('t');
    });

    it('falls back to tool name when description is null/undefined', () => {
      const result = create_stub_tool_metadata('s', 't', null as any, {});
      expect(result.description).toBe('t');
    });

    it('truncates long description without sentence boundary', () => {
      const longDesc = 'A' .repeat(200);
      const result = create_stub_tool_metadata('s', 't', longDesc, {});
      expect(result.description.length).toBeLessThanOrEqual(120);
    });

    it('compacts schema (strips descriptions, keeps types)', () => {
      const result = create_stub_tool_metadata('s', 't', 'desc', {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'The name', title: 'Name' },
          count: { type: 'number', minimum: 0 },
        },
        required: ['name'],
      });
      expect(result.parameters.properties.name.type).toBe('string');
      expect(result.parameters.properties.name.description).toBeUndefined();
      expect(result.parameters.properties.count.type).toBe('number');
      expect(result.parameters.required).toEqual(['name']);
    });

    it('returns default schema for null input', () => {
      const result = create_stub_tool_metadata('s', 't', 'desc', null);
      expect(result.parameters).toEqual({ type: 'object', properties: {} });
    });

    it('returns default schema for undefined input', () => {
      const result = create_stub_tool_metadata('s', 't', 'desc', undefined);
      expect(result.parameters).toEqual({ type: 'object', properties: {} });
    });
  });
});
