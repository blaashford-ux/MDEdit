import { Schema } from '@milkdown/kit/prose/model';
import { describe, expect, it } from 'vitest';
import { flatten, offsetToPos, posToOffset } from './reviewPlugin';

const schema = new Schema({
  nodes: {
    doc: { content: 'paragraph+' },
    paragraph: { content: 'text*', group: 'block' },
    text: { group: 'inline' }
  }
});
const doc = schema.node('doc', null, [
  schema.node('paragraph', null, [schema.text('Hello world')]),
  schema.node('paragraph', null, [schema.text('Second one')])
]);

describe('flattening a chapter for notes', () => {
  it('joins blocks with a newline', () => {
    expect(flatten(doc).text).toBe('Hello world\nSecond one');
  });

  it('maps offsets to positions and back', () => {
    const flat = flatten(doc);
    expect(offsetToPos(flat, 0, 'start')).toBe(1);
    expect(offsetToPos(flat, 6, 'start')).toBe(7);
    expect(offsetToPos(flat, 12, 'start')).toBe(14); // start of the second paragraph's text
    expect(offsetToPos(flat, 11, 'end')).toBe(12); // end of the first
    expect(posToOffset(flat, 14)).toBe(12);
    expect(doc.textBetween(offsetToPos(flat, 6, 'start')!, offsetToPos(flat, 11, 'end')!)).toBe('world');
  });
});
