import { describe, expect, it } from 'vitest';
import { getInheritedLinkedTrackerItemIds } from '../metaAgentTrackerLinks';

describe('getInheritedLinkedTrackerItemIds', () => {
  it('returns linked tracker ids from session metadata', () => {
    expect(getInheritedLinkedTrackerItemIds({
      linkedTrackerItemIds: ['task_1', 'plan_2'],
    })).toEqual(['task_1', 'plan_2']);
  });

  it('filters invalid and duplicate tracker ids', () => {
    expect(getInheritedLinkedTrackerItemIds({
      linkedTrackerItemIds: ['task_1', '', null, 'task_1', 42, 'plan_2'],
    })).toEqual(['task_1', 'plan_2']);
  });

  it('returns an empty list when metadata has no tracker links', () => {
    expect(getInheritedLinkedTrackerItemIds({ tags: ['meta-agent'] })).toEqual([]);
    expect(getInheritedLinkedTrackerItemIds(null)).toEqual([]);
  });
});
