import { describe, expect, it } from 'vitest';
import { AgentProtocolTranscriptAdapter } from '../AgentProtocolTranscriptAdapter';

describe('AgentProtocolTranscriptAdapter', () => {
  it('normalizes live web search tool-call arguments before returning parsed items', () => {
    const emitted: any[] = [];
    const adapter = new AgentProtocolTranscriptAdapter({
      emit: (event) => emitted.push(event),
    }, 'session-1');

    const parsed = adapter.processEvent({
      type: 'tool_call',
      toolCall: {
        id: 'web-1',
        name: 'web_search',
        arguments: {
          query: '',
          action: { type: 'search', query: 'RAG Anything GitHub LightRAG documentation' },
        },
      },
    });

    expect(parsed).toEqual([{
      kind: 'tool_call',
      toolCall: {
        id: 'web-1',
        name: 'web_search',
        arguments: {
          query: 'RAG Anything GitHub LightRAG documentation',
          action: { type: 'search', query: 'RAG Anything GitHub LightRAG documentation' },
        },
      },
    }]);

    expect(emitted).toContainEqual(expect.objectContaining({
      type: 'tool_call_started',
      arguments: {
        query: 'RAG Anything GitHub LightRAG documentation',
        action: { type: 'search', query: 'RAG Anything GitHub LightRAG documentation' },
      },
    }));
  });
});
