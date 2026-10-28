// Checks predict() against the 10 reference outputs produced by Orange. Run: node test_predict.js
import { predict } from "./predict.js";
import { EXAMPLES } from "./examples.js";
let pass = 0;
for (const c of EXAMPLES) {
  const got = predict(c.inputs).probability;
  const ok = got.toFixed(3) === c.expected.toFixed(3);
  if (ok) pass++;
  console.log(`Case ${c.id}: expected ${c.expected.toFixed(3)}  got ${got.toFixed(3)}  ${ok ? "MATCH" : "MISMATCH"}`);
}
console.log(`\n${pass} of ${EXAMPLES.length} match Orange.`);
process.exit(pass === EXAMPLES.length ? 0 : 1);
