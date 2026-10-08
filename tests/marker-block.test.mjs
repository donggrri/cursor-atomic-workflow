/**
 * Marker block seam (T6a implements scripts/lib/marker-block.mjs).
 *
 * import { upsertBlock, removeBlock, hasBlock } from "../scripts/lib/marker-block.mjs";
 *
 * Markers (exact):
 *   <!-- cursor-atomic-workflow:begin -->
 *   <!-- cursor-atomic-workflow:end -->
 *
 * upsertBlock(text, body) -> string
 *   - Empty text: returns only one block wrapping body (markers + body + newlines as in wrapBlock).
 *   - No existing block: inserts the block after the first "\n\n" in text; if text has no "\n\n",
 *     prepends wrapBlock(body) + "\n\n" + text.
 *   - Exactly one existing block: replaces only the inner body; bytes outside begin/end unchanged.
 *   - Mismatched markers (begin only, end only, or more than one block): throws Error; pure — caller's
 *     input string must remain unchanged when the throw is caught.
 *
 * removeBlock(text) -> string
 *   - Removes the single valid block (markers and inner body). Text without a block: unchanged.
 *   - Mismatched markers: throws Error (same purity rule as upsertBlock).
 *
 * hasBlock(text) -> boolean
 *   - true when text contains exactly one well-formed begin/end pair with begin before end.
 *
 * Block shape (LF inside the block region):
 *   <!-- cursor-atomic-workflow:begin -->\n{body}\n<!-- cursor-atomic-workflow:end -->
 */

import test from "node:test";
import assert from "node:assert/strict";

import { upsertBlock, removeBlock, hasBlock } from "../scripts/lib/marker-block.mjs";

const BEGIN = "<!-- cursor-atomic-workflow:begin -->";
const END = "<!-- cursor-atomic-workflow:end -->";

/** @param {string} body */
function wrapBlock(body) {
  return `${BEGIN}\n${body}\n${END}`;
}

/** @param {() => void} fn @param {string} text */
function assertInputUnchangedOnThrow(fn, text) {
  const snapshot = text;
  assert.throws(fn);
  assert.equal(snapshot, text);
}

test("upsertBlock on empty text creates block-only file and hasBlock is true", () => {
  const body = "parent session routing";
  const result = upsertBlock("", body);
  assert.equal(result, wrapBlock(body));
  assert.equal(hasBlock(result), true);
});

test("upsertBlock inserts after first blank line preserving outside bytes and CRLF", () => {
  const body = "managed rules";
  const lfInput = "header line\n\nuser-owned tail\n";
  const lfExpected = `header line\n\n${wrapBlock(body)}\n\nuser-owned tail\n`;
  assert.equal(upsertBlock(lfInput, body), lfExpected);
  assert.equal(hasBlock(lfExpected), true);

  const crlfBody = "managed";
  const crlfInput = "head\r\n\r\ntail\r\n";
  const crlfExpected = `head\r\n\r\n${wrapBlock(crlfBody)}\r\n\r\ntail\r\n`;
  assert.equal(upsertBlock(crlfInput, crlfBody), crlfExpected);
});

test("upsertBlock is idempotent when body is unchanged", () => {
  const input = "intro\n\nsection\n";
  const body = "same body";
  const once = upsertBlock(input, body);
  const twice = upsertBlock(once, body);
  assert.equal(twice, once);
});

test("upsertBlock replaces only inner body when body changes", () => {
  const input = "top\n\nbottom\n";
  const withV1 = upsertBlock(input, "version-one");
  const withV2 = upsertBlock(withV1, "version-two");
  const expected = `top\n\n${wrapBlock("version-two")}\n\nbottom\n`;
  assert.equal(withV2, expected);
  assert.equal(withV1.includes("version-one"), true);
  assert.equal(withV2.includes("version-one"), false);
});

test("removeBlock strips a single block and leaves outside bytes unchanged", () => {
  const input = "keep-start\n\nkeep-end\n";
  const body = "inside";
  const withBlock = upsertBlock(input, body);
  assert.equal(removeBlock(withBlock), input);
});

test("removeBlock on text without a block returns text unchanged", () => {
  const plain = "no markers here\n";
  assert.equal(removeBlock(plain), plain);
  assert.equal(hasBlock(plain), false);
});

test("upsertBlock throws on begin-only marker without mutating input", () => {
  const text = "prefix\n<!-- cursor-atomic-workflow:begin -->\ninner\n";
  assertInputUnchangedOnThrow(() => upsertBlock(text, "new"), text);
});

test("upsertBlock throws on end-only marker without mutating input", () => {
  const text = "inner\n<!-- cursor-atomic-workflow:end -->\nsuffix\n";
  assertInputUnchangedOnThrow(() => upsertBlock(text, "new"), text);
});

test("upsertBlock throws on two blocks without mutating input", () => {
  const text = `${wrapBlock("first")}\n\n${wrapBlock("second")}\n`;
  assertInputUnchangedOnThrow(() => upsertBlock(text, "new"), text);
});

test("removeBlock throws on mismatched markers without mutating input", () => {
  const beginOnly = "x\n<!-- cursor-atomic-workflow:begin -->\n";
  assertInputUnchangedOnThrow(() => removeBlock(beginOnly), beginOnly);

  const endOnly = "<!-- cursor-atomic-workflow:end -->\n";
  assertInputUnchangedOnThrow(() => removeBlock(endOnly), endOnly);

  const two = `${wrapBlock("a")}\n${wrapBlock("b")}\n`;
  assertInputUnchangedOnThrow(() => removeBlock(two), two);
});
