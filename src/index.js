/**
 * Public surface for the Ascii85 library.
 *
 * Exports two framed encoders (with and without the <~ ~> wrapper) plus a decoder,
 * and re-exports the raw group-level primitives for advanced users.
 */

import { encodeGroups, decode, unwrap, clean } from './core.js';

/**
 * Encode binary data to an Ascii85 string wrapped in <~ ~>, the PostScript form.
 *
 * @param {Uint8Array | number[]} input
 * @returns {string}
 */
export function encode(input) {
  const bytes = input instanceof Uint8Array ? input : Uint8Array.from(input);
  return '<~' + encodeGroups(bytes) + '~>';
}

/**
 * Encode binary data to a bare Ascii85 string, no wrapper. Suitable for PDF streams
 * where the consumer is the PDF reader itself and expects no framing.
 *
 * @param {Uint8Array | number[]} input
 * @returns {string}
 */
export function encodeBare(input) {
  const bytes = input instanceof Uint8Array ? input : Uint8Array.from(input);
  return encodeGroups(bytes);
}

/** Re-export of the underlying decoder. Accepts framed or unframed input. */
export { decode, unwrap, clean, encodeGroups };
