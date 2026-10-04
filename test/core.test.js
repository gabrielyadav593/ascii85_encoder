import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { encode, encodeBare, decode, encodeGroups, unwrap, clean } from '../src/index.js';

const enc = (s) => new TextEncoder().encode(s);

describe('ascii85 round-trip', () => {
  it('round-trips the empty input', () => {
    assert.equal(encode([]), '<~~>');
    assert.deepEqual(Array.from(decode('<~~>')), []);
  });

  it('round-trips the canonical "Man" example', () => {
    // Classic Adobe test vector: "Man" is a 3-byte tail and encodes to 4 chars "9jqo".
    const v = enc('Man');
    assert.equal(encodeBare(v), '9jqo');
    assert.deepEqual(Array.from(decode('9jqo')), Array.from(v));
  });

  it('round-trips a longer ASCII string', () => {
    const v = enc('The quick brown fox jumps over the lazy dog');
    const encoded = encode(v);
    assert.deepEqual(Array.from(decode(encoded)), Array.from(v));
  });

  it('uses the z shortcut for an all-zero group', () => {
    const v = new Uint8Array([0, 0, 0, 0, 0, 0, 0, 0]);
    assert.equal(encodeGroups(v), 'zz');
    assert.deepEqual(Array.from(decode('zz')), [0, 0, 0, 0, 0, 0, 0, 0]);
  });

  it('round-trips an all-0xFF group', () => {
    const v = new Uint8Array([0xff, 0xff, 0xff, 0xff]);
    const g = encodeGroups(v);
    assert.equal(g, 's8W-!');
    assert.deepEqual(Array.from(decode(g)), [0xff, 0xff, 0xff, 0xff]);
  });

  it('handles a 1-byte tail (2 encoded chars)', () => {
    const v = new Uint8Array([0x41]); // 'A'
    const g = encodeGroups(v);
    assert.equal(g.length, 2);
    assert.deepEqual(Array.from(decode(g)), [0x41]);
  });

  it('handles a 2-byte tail (3 encoded chars)', () => {
    const v = new Uint8Array([0x41, 0x42]);
    const g = encodeGroups(v);
    assert.equal(g.length, 3);
    assert.deepEqual(Array.from(decode(g)), [0x41, 0x42]);
  });

  it('handles a 3-byte tail (4 encoded chars)', () => {
    const v = new Uint8Array([0x41, 0x42, 0x43]);
    const g = encodeGroups(v);
    assert.equal(g.length, 4);
    assert.deepEqual(Array.from(decode(g)), [0x41, 0x42, 0x43]);
  });
});

describe('framing and whitespace', () => {
  it('adds and strips the <~ ~> wrapper', () => {
    const v = enc('hello');
    const e = encode(v);
    assert.ok(e.startsWith('<~'));
    assert.ok(e.endsWith('~>'));
    assert.deepEqual(Array.from(decode(e)), Array.from(v));
  });

  it('decodes bare input without a wrapper', () => {
    const v = enc('bare');
    const e = encodeBare(v);
    assert.ok(!e.startsWith('<~'));
    assert.deepEqual(Array.from(decode(e)), Array.from(v));
  });

  it('ignores whitespace inside the body (PDF behaviour)', () => {
    const v = enc('with spaces');
    const e = encodeBare(v);
    const spaced = e.slice(0, 2) + '\n  ' + e.slice(2);
    assert.deepEqual(Array.from(decode(spaced)), Array.from(v));
  });

  it('ignores whitespace inside the <~ ~> wrapper', () => {
    const v = enc('wrapped ws');
    const e = encode(v);
    const spaced = '<~\n' + e.slice(2, -2) + '\n  ~>';
    assert.deepEqual(Array.from(decode(spaced)), Array.from(v));
  });
});

describe('public helpers', () => {
  it('unwrap removes only the outer delimiters', () => {
    assert.equal(unwrap('<~abc~>'), 'abc');
    assert.equal(unwrap('abc'), 'abc');
    assert.equal(unwrap('<~abc'), 'abc');
    assert.equal(unwrap('abc~>'), 'abc');
  });

  it('clean removes wrapper and interior whitespace', () => {
    assert.equal(clean('<~a b\nc~>'), 'abc');
    assert.equal(clean('a b\nc'), 'abc');
  });
});
