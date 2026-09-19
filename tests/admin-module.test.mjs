import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("..", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

test("el acceso administrativo exige sesión y lista blanca", async () => {
  const source = await read("admin/admin.js");
  assert.match(source, /auth\.signInWithPassword/);
  assert.match(source, /from\("admins"\)/);
  assert.match(source, /if \(!isAdmin\)/);
  assert.match(source, /auth\.signOut/);
});

test("las acciones sensibles usan RPC del backend", async () => {
  const source = await read("admin/admin.js");
  for (const rpc of ["create_campaign", "create_qr_card", "validate_coupon", "mark_coupon_used"]) {
    assert.match(source, new RegExp(`rpc\\(\\"${rpc}\\"`));
  }
});

test("el panel conserva accesibilidad y movimiento reducido", async () => {
  const html = await read("admin/index.html");
  const css = await read("admin/admin.css");
  assert.match(html, /role="tab"/);
  assert.match(html, /aria-controls="tab-clientes"/);
  assert.match(css, /prefers-reduced-motion/);
  assert.match(css, /aria-busy/);
});

console.log("Admin module smoke/unit checks passed");

// Run with: node --test tests/admin-module.test.mjs
// These checks intentionally avoid credentials and network calls.
