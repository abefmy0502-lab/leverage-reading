// JS の秒数（lib/motion.js）と CSS のトークン（tokens.css）が同じ値であることを確かめる（2026-10-28）。
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { DURATION_FAST_MS, DURATION_BASE_MS } from './motion';

const css = readFileSync(new URL('../styles/tokens.css', import.meta.url), 'utf8');
const token = (name) => Number(css.match(new RegExp(`--${name}:\\s*(\\d+)ms`))[1]);

describe('動きの秒数', () => {
  it('--duration-fast / --duration-base と一致する', () => {
    expect(DURATION_FAST_MS).toBe(token('duration-fast'));
    expect(DURATION_BASE_MS).toBe(token('duration-base'));
  });
});
