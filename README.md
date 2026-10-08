Ascii85 (btoa) encoder and decoder for PostScript and PDF binary data.

```js
import { encode, encodeBare, decode } from './src/index.js';

const bytes = new TextEncoder().encode('Man is distinguished');
const ps = encode(bytes);        // '<~9jqo^BlbD-Ble...~>'
const pdf = encodeBare(bytes);   // '9jqo^BlbD-Ble...'
const back = decode(ps);        // Uint8Array of the original bytes
```

This implements the Adobe variant of Ascii85 used in PostScript and PDF: groups of four
bytes become five base-85 digits; an all-zero group collapses to `z`; an all-0xFF group
collapses to `!`; a partial tail of 1–3 bytes produces 2–4 digits with the decoder padding
with `u`. PostScript framing (`<~` … `~>`) is added by `encode` and stripped by `decode`.
Whitespace inside the body is ignored on decode, matching PDF's `ASCII85Decode` filter.

It exists because the Adobe format is the one that ships inside real PDF and PostScript
files. Other Ascii85 dialects (IPv6, btoa's historic checksums, Z85's different alphabet)
are not supported; picking one dialect and testing it beats half-implementing three.

The edge you will hit: `decode` rejects characters outside the `!`–`u` range and rejects
`z` in a partial tail, because that's what Adobe readers do. If your data was produced by
a non-Adobe encoder (Z85, Git's binary diff), this library will not decode it — the
alphabets differ.

The only exported names are `encode`, `encodeBare`, `decode`, and the low-level
`encodeGroups`, `unwrap`, `clean`.

## Design notes

The window stores values eagerly rather than keeping running aggregates. Running
sums drift with floating point over long streams, and recomputing from a small
buffer is cheap enough that the drift is not worth the speed.

