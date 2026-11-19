#!/usr/bin/env node
// 🍎 Sign in with Apple のネイティブの直し（2026-11-19・App 審査 2.1(a)「Apple でサインインを押すと サインイン中… のまま」）。
//
// @capacitor-community/apple-sign-in 7.1.0 の Plugin.swift は、
//   ① Capacitor がプラグインを呼ぶ裏のスレッドのまま ASAuthorizationController を始める（UI の操作は main で行う決まり）
//   ② presentationContextProvider を付けない（UIScene の起動に移した build 6 から、iPad で Apple の画面を出す窓が決まらない）
//   ③ controller を手元に持たない（終わる前に消えると、成功も失敗も返らない）
//   ④ Apple ID 以外の答え・identityToken が無いときに何も返さない（JS の待ちが終わらない）
// ので、Apple の画面が出ないか、出ても答えが JS に戻らず「サインイン中…」のまま止まる。
// npm install のたびに（postinstall）この 4 つを直した Plugin.swift に置きかえる。npx cap sync ios はそのあとに。
//
//   node scripts/patch-apple-sign-in.mjs           置きかえる（直してあれば何もしない）
//   node scripts/patch-apple-sign-in.mjs --check   直してあるかだけ確かめる（直っていなければ 1 で終わる）
//
// プラグインが入っていない（Web だけの環境）・版が違って中身が分からないときは、何もせずに知らせるだけ（install を止めない）。
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const PLUGIN_SWIFT = join(ROOT, 'node_modules/@capacitor-community/apple-sign-in/ios/Sources/SignInWithApple/Plugin.swift');
export const MARK_PREFIX = '// orime-patch: apple-sign-in';
export const MARK = `${MARK_PREFIX} v3`;

// 置きかえる前の目印（7.1.0 の中身）。これが無く、印も無ければ版が違うので触らない
const ORIGINAL_HINTS = ['authorizationController.performRequests()', 'extension SignInWithApple: ASAuthorizationControllerDelegate'];

export const PATCHED_SWIFT = `${MARK}
// scripts/patch-apple-sign-in.mjs が置きかえた（手で直さない）。直した点はスクリプトの冒頭を見る。
import Foundation
import UIKit
import Capacitor
import AuthenticationServices

@objc(SignInWithApple)
public class SignInWithApple: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "SignInWithApple"
    public let jsName = "SignInWithApple"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "authorize", returnType: CAPPluginReturnPromise),
    ]

    // 終わるまで手元に持つ（③）
    private var authController: ASAuthorizationController?
    private var pendingCallId: String?

    @objc func authorize(_ call: CAPPluginCall) {
        let appleIDProvider = ASAuthorizationAppleIDProvider()
        let request = appleIDProvider.createRequest()
        request.requestedScopes = getRequestedScopes(from: call)
        request.state = call.getString("state")
        request.nonce = call.getString("nonce")

        self.bridge?.saveCall(call)

        // UI の操作は main で（①）
        DispatchQueue.main.async {
            // 前の回が終わっていなければ、その回は取り消しとして返す
            if let previous = self.pendingCallId, previous != call.callbackId, let old = self.bridge?.savedCall(withID: previous) {
                old.reject("The operation was canceled.", "1001")
                self.bridge?.releaseCall(old)
            }
            self.pendingCallId = call.callbackId
            let controller = ASAuthorizationController(authorizationRequests: [request])
            controller.delegate = self
            controller.presentationContextProvider = self // ②
            self.authController = controller
            controller.performRequests()
        }
    }

    func getRequestedScopes(from call: CAPPluginCall) -> [ASAuthorization.Scope]? {
        var requestedScopes: [ASAuthorization.Scope] = []

        if let scopesStr = call.getString("scopes") {
            if scopesStr.contains("name") {
                requestedScopes.append(.fullName)
            }

            if scopesStr.contains("email") {
                requestedScopes.append(.email)
            }
        }

        if requestedScopes.count > 0 {
            return requestedScopes
        }

        return nil
    }

    // 待っている回を取り出す（無ければ nil）
    private func takePendingCall() -> CAPPluginCall? {
        defer {
            self.pendingCallId = nil
            self.authController = nil
        }
        guard let id = self.pendingCallId else { return nil }
        return self.bridge?.savedCall(withID: id)
    }
}

extension SignInWithApple: ASAuthorizationControllerDelegate {
    public func authorizationController(controller: ASAuthorizationController, didCompleteWithAuthorization authorization: ASAuthorization) {
        // 前の回の controller が遅れて返したときは無視する（新しい回を横取りしない）
        guard controller === self.authController else { return }
        guard let call = takePendingCall() else { return }
        // Apple ID の答えで、identityToken があるときだけ成功（④）
        guard let credential = authorization.credential as? ASAuthorizationAppleIDCredential,
              let tokenData = credential.identityToken,
              let identityToken = String(data: tokenData, encoding: .utf8) else {
            call.reject("Sign in with Apple did not return an identity token.", "no_identity_token")
            self.bridge?.releaseCall(call)
            return
        }
        let authorizationCode = credential.authorizationCode.flatMap { String(data: $0, encoding: .utf8) }

        var response: [String: Any] = [
            "user": credential.user,
            "identityToken": identityToken,
        ]
        if let email = credential.email { response["email"] = email }
        if let given = credential.fullName?.givenName { response["givenName"] = given }
        if let family = credential.fullName?.familyName { response["familyName"] = family }
        if let code = authorizationCode { response["authorizationCode"] = code }

        call.resolve(["response": response])
        self.bridge?.releaseCall(call)
    }

    public func authorizationController(controller: ASAuthorizationController, didCompleteWithError error: Error) {
        guard controller === self.authController else { return }
        guard let call = takePendingCall() else { return }
        let code = (error as NSError).code
        call.reject(error.localizedDescription, String(code))
        self.bridge?.releaseCall(call)
    }
}

// Apple の画面を出す窓（②）。アプリの画面の窓 → いま前にある窓 → 最初の窓 の順。
extension SignInWithApple: ASAuthorizationControllerPresentationContextProviding {
    public func presentationAnchor(for controller: ASAuthorizationController) -> ASPresentationAnchor {
        if let window = self.bridge?.webView?.window { return window }
        if let window = self.bridge?.viewController?.view.window { return window }
        let scenes = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }
        let active = scenes.filter { $0.activationState == .foregroundActive }
        for scene in active + scenes {
            if let key = scene.windows.first(where: { $0.isKeyWindow }) { return key }
        }
        if let first = scenes.first?.windows.first { return first }
        return ASPresentationAnchor()
    }
}
`;

/** いまの Plugin.swift の状態: 'missing' | 'patched' | 'original' | 'unknown' */
export function pluginState(text) {
  if (text == null) return 'missing';
  // 前の版の直し（印の版が違う・中身が違う）は置きかえ直す
  if (text.startsWith(MARK_PREFIX)) return text === PATCHED_SWIFT ? 'patched' : 'original';
  return ORIGINAL_HINTS.every((h) => text.includes(h)) ? 'original' : 'unknown';
}

function main() {
  const check = process.argv.includes('--check');
  const text = existsSync(PLUGIN_SWIFT) ? readFileSync(PLUGIN_SWIFT, 'utf8') : null;
  const state = pluginState(text);
  if (state === 'missing') { console.log('[patch-apple-sign-in] プラグインが無いので何もしません'); return; }
  if (state === 'patched') { console.log('[patch-apple-sign-in] 直してあります'); return; }
  if (state === 'unknown') {
    console.warn('[patch-apple-sign-in] ⚠️ Plugin.swift の中身が想定と違うので触りません（プラグインの版が変わった？ scripts/patch-apple-sign-in.mjs を見直す）');
    if (check) process.exitCode = 1;
    return;
  }
  if (check) { console.error('[patch-apple-sign-in] まだ直っていません（npm install か node scripts/patch-apple-sign-in.mjs）'); process.exitCode = 1; return; }
  writeFileSync(PLUGIN_SWIFT, PATCHED_SWIFT);
  console.log('[patch-apple-sign-in] Plugin.swift を直しました（このあと npx cap sync ios）');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
