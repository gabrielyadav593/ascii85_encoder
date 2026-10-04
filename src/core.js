/**
 * Core Ascii85 (btoa) encoder/decoder.
 *
 * Implements the Adobe variant of Ascii85 used in PostScript and PDF. This is the
 * "btoa" family: zero bytes in a group become 'z', and a leading '<~' / trailing '~>'
 * wrapper is used by PostScript. PDF strips the wrapper.
 *
 * Why a separate core module: keeps the encoding logic testable in isolation from the
 * framing policy. The core deals only with bytes and characters; framing (wrapper, line
 * wrapping) is layered on top by index.js.
 */

// Ascii85 digits are taken from the printable ASCII range starting at '!'.
// Using '!'..='u' (33..117) keeps every encoded byte in the 7-bit safe range,
// which is why Ascii85 survives through ASCII-only transports in PostScript and PDF.
const FIRST_BYTE = 0x21; // '!'
const LAST_BYTE = 0x75;  // 'u'
const BASE = 85;
const POW_85 = [1, 85, 7225, 614125, 52200625]; // 85^0 .. 85^4

// The all-zero group is the only compression shortcut PostScript defines.
// It collapses to a single 'z'.
const ALL_ZERO = 0x00000000;

const DELIMITER_START = '<~';
const DELIMITER_END = '~>';

/**
 * Encode a Uint8Array into an Ascii85 character stream WITHOUT the <~ ~> wrapper,
 * WITHOUT 'z'/'!' shortcuts, and WITHOUT line wrapping. Group-level primitives only.
 *
 * Exposed so callers that need raw groups (e.g. testing the core) can bypass framing.
 *
 * @param {Uint8Array} input
 * @returns {string}
 */
export function encodeGroups(input) {
  let out = '';
  let i = 0;
  while (i + 4 <= input.length) {
    // Reassemble 4 bytes into a big-endian uint32. Big-endian because that's what
    // the PostScript Language Reference specifies for btoa: the first byte is the
    // most significant digit of the base-85 number.
    const n =
      ((input[i] << 24) |
      (input[i + 1] << 16) |
      (input[i + 2] << 8) |
      input[i + 3]) >>> 0;

    if (n === ALL_ZERO) {
      out += 'z';
    } else {
      let v = n;
      // PostScript uses five base-85 digits. Divmod five times; prepend each digit
      // because we computed least-significant first but want most-significant first.
      let group = '';
      for (let j = 0; j < 5; j++) {
        group = String.fromCharCode(FIRST_BYTE + (v % BASE)) + group;
        v = Math.floor(v / BASE);
      }
      out += group;
    }
    i += 4;
  }

  // Tail handling: fewer than 4 bytes left. Pad with zero bytes, encode 5 digits,
  // then drop the corresponding number of trailing digits. This is the standard
  // btoa rounding rule — dropping rather than keeping makes the stream
  // round-trippable because the decoder knows how many real bytes to emit from
  // the group count.
  const rem = input.length - i;
  if (rem > 0) {
    const b0 = input[i] || 0;
    const b1 = rem > 1 ? input[i + 1] : 0;
    const b2 = rem > 2 ? input[i + 2] : 0;
    const b3 = 0;
    const n = ((b0 << 24) | (b1 << 16) | (b2 << 8) | b3) >>> 0;

    let v = n;
    let group = '';
    for (let j = 0; j < 5; j++) {
      group = String.fromCharCode(FIRST_BYTE + (v % BASE)) + group;
      v = Math.floor(v / BASE);
    }
    // Drop (4 - rem) trailing digits: a 1-byte tail yields 2 chars, 2-byte→3, 3-byte→4.
    out += group.slice(0, rem + 1);
  }

  return out;
}

/**
 * Strip a <~ ~> wrapper if present. Tolerant of missing wrapper (PDF ASCII85Decode
 * does not require one).
 *
 * @param {string} s
 * @returns {string}
 */
export function unwrap(s) {
  let start = 0;
  let end = s.length;
  if (s.startsWith(DELIMITER_START)) start = DELIMITER_START.length;
  if (s.endsWith(DELIMITER_END)) end -= DELIMITER_END.length;
  return s.slice(start, end);
}

/**
 * Remove whitespace and the Adobe <~ ~> delimiters from an Ascii85 stream.
 * PDF permits arbitrary whitespace inside ASCII85 strings.
 *
 * @param {string} s
 * @returns {string}
 */
export function clean(s) {
  // Strip wrapper first so any whitespace inside the wrapper survives the next pass
  // unchanged; cleaning the unwrapped body matches PDF reader behaviour.
  const body = unwrap(s);
  return body.replace(/\s+/g, '');
}

/**
 * Decode an Ascii85 string (with or without <~ ~>, with or without whitespace)
 * into a Uint8Array. Throws on malformed input.
 *
 * @param {string} input
 * @returns {Uint8Array}
 */
export function decode(input) {
  const s = clean(input);
  const bytes = [];
  let i = 0;

  while (i < s.length) {
    const c = s[i];

    if (c === 'z') {
      // 'z' is only valid where a full group is expected (i.e. when the remaining
      // stream could still contain a 5-digit group). PDF readers reject 'z' in tail.
      bytes.push(0, 0, 0, 0);
      i += 1;
      continue;
    }

    // Gather up to 5 Ascii85 digits for a group.
    let group = '';
    let j = 0;
    while (j < 5 && i + j < s.length) {
      const d = s[i + j];
      const code = d.charCodeAt(0);
      if (code < FIRST_BYTE || code > LAST_BYTE) break;
      group += d;
      j++;
    }

    if (group.length < 5) {
      // Tail group. Padded by the decoder with 'u' (the max digit) so that the
      // numeric value is the maximum it could be — this matches Adobe's documented
      // behaviour for partial trailing groups in PDF.
      const pad = 5 - group.length;
      group += 'u'.repeat(pad);
      const n = decodeGroup(group);
          // We pushed pad digits, so we drop pad-1 trailing bytes (a 2-char tail
          // means 1 real byte was encoded; 3-char→2; 4-char→3).
      const realBytes = 5 - (pad + 1);
      pushBytes(bytes, n, realBytes);
      i += group.length - pad;
      break;
    }

    const n = decodeGroup(group);
    pushBytes(bytes, n, 4);
    i += 5;
  }

  return Uint8Array.from(bytes);
}

function decodeGroup(group) {
  let n = 0;
  for (let k = 0; k < 5; k++) {
    const code = group.charCodeAt(k);
    if (code < FIRST_BYTE || code > LAST_BYTE) {
      throw new Error(`Invalid Ascii85 character: ${group[k]}`);
    }
    n = n * BASE + (code - FIRST_BYTE);
  }
  // n can exceed 2^32 if the digits are large; that's an overflow in the source
  // stream and we reject it the same way Adobe does.
  if (n > 0xffffffff) {
    throw new Error('Ascii85 group decodes to a value larger than 2^32 - 1');
  }
  return n >>> 0;
}

function pushBytes(out, n, count) {
  const all = [0, 0, 0, 0];
  let v = n >>> 0;
  for (let k = 3; k >= 0; k--) {
    all[k] = v & 0xff;
    v = Math.floor(v / 0x100);
  }
  for (let k = 0; k < count; k++) out.push(all[k]);
}
