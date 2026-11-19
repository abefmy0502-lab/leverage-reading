import { describe, it, expect } from 'vitest';
import { PATCHED_SWIFT, MARK, MARK_PREFIX, pluginState } from './patch-apple-sign-in.mjs';

// App 審査 2.1(a)（2026-11-19）: iPad で Apple でサインインが「サインイン中…」のまま。直した Plugin.swift の要点を確かめる。
describe('Sign in with Apple の Plugin.swift の直し', () => {
  it('Apple の画面は main で始め、出す窓を決め、controller を持っておく', () => {
    expect(PATCHED_SWIFT.startsWith(MARK)).toBe(true);
    expect(PATCHED_SWIFT).toContain('DispatchQueue.main.async');
    expect(PATCHED_SWIFT).toContain('controller.presentationContextProvider = self');
    expect(PATCHED_SWIFT).toContain('ASAuthorizationControllerPresentationContextProviding');
    expect(PATCHED_SWIFT).toContain('self.authController = controller');
  });
  it('前の回の controller が遅れて返しても、新しい回を横取りしない', () => {
    expect(PATCHED_SWIFT.match(/guard controller === self.authController else \{ return \}/g).length).toBe(2);
  });
  it('答えが足りないときも必ず JS へ返す（強制のアンラップをしない）', () => {
    expect(PATCHED_SWIFT).not.toMatch(/identityToken!/);
    expect(PATCHED_SWIFT).not.toMatch(/authorizationCode!/);
    expect(PATCHED_SWIFT).toContain('call.reject("Sign in with Apple did not return an identity token."');
    // 成功・失敗の両方で待っている回を取り出して返す
    expect(PATCHED_SWIFT.match(/takePendingCall\(\)/g).length).toBeGreaterThanOrEqual(3);
  });
  it('状態の見分け: 無い・直した・元の 7.1.0・知らない中身', () => {
    expect(pluginState(null)).toBe('missing');
    expect(pluginState(PATCHED_SWIFT)).toBe('patched');
    expect(pluginState('import Foundation\n authorizationController.performRequests()\nextension SignInWithApple: ASAuthorizationControllerDelegate {')).toBe('original');
    expect(pluginState('// まったく別の中身')).toBe('unknown');
    // 印はあるが中身が古い（このスクリプトを直したあと）＝置きかえ直す
    expect(pluginState(`${MARK}\n古い直し`)).toBe('original');
    expect(pluginState(`${MARK_PREFIX} v2\n前の版の直し`)).toBe('original');
  });
});
