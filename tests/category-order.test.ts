import assert from "node:assert/strict";
import test from "node:test";
import { insertCategory } from "../lib/category-order";

test("inserts before or after a target while preserving other categories", () => {
  const order = ["A", "B", "C", "D"];
  assert.deepEqual(insertCategory(order, "A", "C", "after"), ["B", "C", "A", "D"]);
  assert.deepEqual(insertCategory(order, "D", "B", "before"), ["A", "D", "B", "C"]);
  assert.deepEqual(insertCategory(order, "A", "D", "after"), ["B", "C", "D", "A"]);
  assert.deepEqual(insertCategory(order, "B", "A", "before"), ["B", "A", "C", "D"]);
  assert.deepEqual(insertCategory(order, "A", "B", "before"), order);
  assert.deepEqual(insertCategory(order, "B", "B", "after"), order);
  assert.deepEqual(order, ["A", "B", "C", "D"]);
});
