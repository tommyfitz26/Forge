// Stub for `server-only` in vitest — the real module throws on import because
// vitest's bundler looks like a client bundle to it. In tests we're always in
// node, so this is safe.
export {};
