import { describe, expect, it } from 'vitest';
import { getBerryServisStory } from './get-story.js';

describe('getBerryServisStory', () => {
  it('contains key facts', () => {
    const text = getBerryServisStory();
    expect(text).toContain('2000');
    expect(text).toContain('Břežany II');
    expect(text).toContain('Regionální potravina');
  });
});
