#!/usr/bin/env node
// 📱 iOS のプロジェクト（ios/・`npx cap add ios` が作る）に、申請に要る決まりごとを入れる（2026-10-29）。
//
//   node scripts/ios-prepare.mjs            # ios/App/App を直す（何度流しても同じ結果・手で変えた所は壊さない）
//   node scripts/ios-prepare.mjs --check    # 直さずに、足りないものを並べて終わる（足りなければ exit 1）
//   node scripts/ios-prepare.mjs --dir <ios/App/App>   # 置き場所を変える（テスト用）
//
// 入れるもの（company/app-store-submission.md §5・§8）:
//   - Info.plist: カメラ・写真・写真の保存の説明文（無いと開いた瞬間に落ちる／審査で聞かれる）、
//     ITSAppUsesNonExemptEncryption=NO（暗号化は HTTPS だけ＝毎回のビルドで聞かれなくなる）、
//     CFBundleDevelopmentRegion=ja、iPhone の向きは縦だけ（横にしても画面は縦の設計・iPad は Apple の決まりで全部）
//   - PrivacyInfo.xcprivacy（App Privacy と同じ申告・§8）を App/ に置き、Xcode のプロジェクト（project.pbxproj）に
//     Resources として登録する（置くだけでは束ねられない）
//   手で直した説明文は上書きしない（キーが無いときだけ足す）。Signing・Capability（In-App Purchase・Sign in with Apple・
//   Push Notifications）は Xcode でチーム（Apple ID）が要るので、ここでは触らない。
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
const check = args.includes('--check');
const dirIdx = args.indexOf('--dir');
const APP_DIR = resolve(dirIdx >= 0 ? args[dirIdx + 1] : 'ios/App/App');
const PLIST = join(APP_DIR, 'Info.plist');
const PRIVACY = join(APP_DIR, 'PrivacyInfo.xcprivacy');
const PBXPROJ = join(APP_DIR, '..', 'App.xcodeproj', 'project.pbxproj');
const SCENE = join(APP_DIR, 'SceneDelegate.swift');

// 🪟 UIScene の起動（2026-11-16・App 審査 2.1(a)「iPadOS 27.2 の iPad で起動したとたんに落ちる」）。
//   iOS 27 の SDK で作ったアプリは、UIScene の起動に移っていないと立ち上がらない（Apple TN3187）。
//   Capacitor 8.5 の雛形はまだ AppDelegate だけなので、ここで Info.plist の UIApplicationSceneManifest と
//   SceneDelegate.swift（URL・ユニバーサルリンクは Capacitor の SceneDelegateProxy へ渡す）を足す。
export const SCENE_DELEGATE_SWIFT = `import UIKit
import Capacitor

// UIScene の起動（iOS 27 の SDK で必要・scripts/ios-prepare.mjs が置く）。
// 画面は Info.plist の UISceneStoryboardFile（Main）から作られ、window はここに入る。
class SceneDelegate: UIResponder, UIWindowSceneDelegate {

    var window: UIWindow?

    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
        SceneDelegateProxy.shared.scene(scene, willConnectTo: session, options: connectionOptions)
    }

    func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
        SceneDelegateProxy.shared.scene(scene, openURLContexts: URLContexts)
    }

    func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
        SceneDelegateProxy.shared.scene(scene, continue: userActivity)
    }
}
`;

export const SCENE_MANIFEST_XML = `<dict>
\t\t<key>UIApplicationSupportsMultipleScenes</key>
\t\t<false/>
\t\t<key>UISceneConfigurations</key>
\t\t<dict>
\t\t\t<key>UIWindowSceneSessionRoleApplication</key>
\t\t\t<array>
\t\t\t\t<dict>
\t\t\t\t\t<key>UISceneConfigurationName</key>
\t\t\t\t\t<string>Default Configuration</string>
\t\t\t\t\t<key>UISceneDelegateClassName</key>
\t\t\t\t\t<string>$(PRODUCT_MODULE_NAME).SceneDelegate</string>
\t\t\t\t\t<key>UISceneStoryboardFile</key>
\t\t\t\t\t<string>Main</string>
\t\t\t\t</dict>
\t\t\t</array>
\t\t</dict>
\t</dict>`;

// Info.plist に入れる文字列（2026-10-11 に決めた文・company/app-store-submission.md §5）
export const USAGE_STRINGS = {
  NSCameraUsageDescription: '本のバーコードを読み取るとき、本のページを撮って文字に書き起こすとき、メモに写真を添えるとき、写真で共有の画像を撮るときに使います。',
  NSPhotoLibraryUsageDescription: 'メモに添える写真や、写真で共有の背景にする写真をアルバムから選ぶときに使います。',
  NSPhotoLibraryAddUsageDescription: '写真で共有で作った画像を、写真に保存するときに使います。',
};

// PrivacyInfo.xcprivacy（§8 と同じ。Sentry を入れたビルドだけクラッシュ・パフォーマンスを足す＝VITE_SENTRY_DSN）
export function privacyManifest({ sentry = Boolean(process.env.VITE_SENTRY_DSN) } = {}) {
  const linked = (type, purpose = 'AppFunctionality') => `    <dict>
      <key>NSPrivacyCollectedDataType</key>
      <string>NSPrivacyCollectedDataType${type}</string>
      <key>NSPrivacyCollectedDataTypeLinked</key><true/>
      <key>NSPrivacyCollectedDataTypeTracking</key><false/>
      <key>NSPrivacyCollectedDataTypePurposes</key>
      <array><string>NSPrivacyCollectedDataTypePurpose${purpose}</string></array>
    </dict>`;
  const unlinked = (type) => linked(type).replace('<key>NSPrivacyCollectedDataTypeLinked</key><true/>', '<key>NSPrivacyCollectedDataTypeLinked</key><false/>');
  const types = [
    linked('EmailAddress'), linked('Name'), linked('UserID'), linked('PurchaseHistory'),
    linked('PhotosorVideos'), linked('OtherUserContent'), linked('CustomerSupport'),
    linked('ProductInteraction', 'Analytics'),
    ...(sentry ? [unlinked('CrashData'), unlinked('PerformanceData')] : []),
  ];
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>NSPrivacyTracking</key>
  <false/>
  <key>NSPrivacyTrackingDomains</key>
  <array/>
  <key>NSPrivacyCollectedDataTypes</key>
  <array>
${types.join('\n')}
  </array>
  <key>NSPrivacyAccessedAPITypes</key>
  <array>
    <dict>
      <key>NSPrivacyAccessedAPIType</key>
      <string>NSPrivacyAccessedAPICategoryUserDefaults</string>
      <key>NSPrivacyAccessedAPITypeReasons</key>
      <array><string>CA92.1</string></array>
    </dict>
  </array>
</dict>
</plist>
`;
}

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const hasKey = (plist, key) => new RegExp(`<key>${key}</key>`).test(plist);

// Info.plist（文字列のまま直す・plutil に頼らない＝Linux でもテストできる）
export function patchPlist(plist) {
  const todo = [];
  let out = plist;
  const add = (key, valueXml) => {
    if (hasKey(out, key)) return;
    out = out.replace(/\n<\/dict>\n<\/plist>/, `\n\t<key>${key}</key>\n\t${valueXml}\n</dict>\n</plist>`);
    todo.push(key);
  };
  for (const [k, v] of Object.entries(USAGE_STRINGS)) add(k, `<string>${esc(v)}</string>`);
  add('ITSAppUsesNonExemptEncryption', '<false/>');
  add('UIApplicationSceneManifest', SCENE_MANIFEST_XML);
  // UIScene では画面は UISceneStoryboardFile から作る。古い UIMainStoryboardFile は外す（二重に作らない）
  if (/<key>UIMainStoryboardFile<\/key>/.test(out)) {
    out = out.replace(/\n?[ \t]*<key>UIMainStoryboardFile<\/key>\s*<string>[^<]*<\/string>/, '');
    todo.push('UIMainStoryboardFile を外す');
  }
  // 言語: en → ja（App Store の「主言語」と同じ・ホーム画面の名前 Orime は変えない）
  if (/<key>CFBundleDevelopmentRegion<\/key>\s*<string>en<\/string>/.test(out)) {
    out = out.replace(/(<key>CFBundleDevelopmentRegion<\/key>\s*<string>)en(<\/string>)/, '$1ja$2');
    todo.push('CFBundleDevelopmentRegion=ja');
  }
  // iPhone は縦だけ（~ipad の方は触らない）
  const m = out.match(/<key>UISupportedInterfaceOrientations<\/key>\s*<array>([\s\S]*?)<\/array>/);
  if (m && /Landscape/.test(m[1])) {
    out = out.replace(m[0], '<key>UISupportedInterfaceOrientations</key>\n\t<array>\n\t\t<string>UIInterfaceOrientationPortrait</string>\n\t</array>');
    todo.push('UISupportedInterfaceOrientations=Portrait');
  }
  return { plist: out, todo };
}

// project.pbxproj に PrivacyInfo.xcprivacy を Resources として登録（id は名前から決めて毎回同じ）
export function patchPbxproj(pbx) {
  if (/PrivacyInfo\.xcprivacy/.test(pbx)) return { pbx, added: false };
  const id = (seed) => createHash('sha1').update(`orime-privacy-${seed}`).digest('hex').slice(0, 24).toUpperCase();
  const fileRef = id('fileref');
  const buildFile = id('buildfile');
  let out = pbx;
  const refLine = `\t\t${fileRef} /* PrivacyInfo.xcprivacy */ = {isa = PBXFileReference; lastKnownFileType = text.xml; path = PrivacyInfo.xcprivacy; sourceTree = "<group>"; };\n`;
  const buildLine = `\t\t${buildFile} /* PrivacyInfo.xcprivacy in Resources */ = {isa = PBXBuildFile; fileRef = ${fileRef} /* PrivacyInfo.xcprivacy */; };\n`;
  out = out.replace('/* End PBXFileReference section */', refLine + '/* End PBXFileReference section */');
  out = out.replace('/* End PBXBuildFile section */', buildLine + '/* End PBXBuildFile section */');
  // App グループ（Info.plist と同じ所）に並べる
  out = out.replace(/(\/\* Info\.plist \*\/,\n)/, `$1\t\t\t\t${fileRef} /* PrivacyInfo.xcprivacy */,\n`);
  // Resources の build phase（capacitor.config.json と同じ所）
  out = out.replace(/(\/\* capacitor\.config\.json in Resources \*\/,\n)/, `$1\t\t\t\t${buildFile} /* PrivacyInfo.xcprivacy in Resources */,\n`);
  const ok = out.includes(`${fileRef} /* PrivacyInfo.xcprivacy */,`) && out.includes(`${buildFile} /* PrivacyInfo.xcprivacy in Resources */,`);
  if (!ok) throw new Error('project.pbxproj の形が想定と違います（Info.plist / capacitor.config.json の行が見つかりません）');
  return { pbx: out, added: true };
}

// project.pbxproj に SceneDelegate.swift を Sources として登録（AppDelegate.swift と同じ所）
export function patchPbxprojScene(pbx) {
  if (/SceneDelegate\.swift/.test(pbx)) return { pbx, added: false };
  const id = (seed) => createHash('sha1').update(`orime-scene-${seed}`).digest('hex').slice(0, 24).toUpperCase();
  const fileRef = id('fileref');
  const buildFile = id('buildfile');
  let out = pbx;
  out = out.replace('/* End PBXFileReference section */', `\t\t${fileRef} /* SceneDelegate.swift */ = {isa = PBXFileReference; lastKnownFileType = sourcecode.swift; path = SceneDelegate.swift; sourceTree = "<group>"; };\n/* End PBXFileReference section */`);
  out = out.replace('/* End PBXBuildFile section */', `\t\t${buildFile} /* SceneDelegate.swift in Sources */ = {isa = PBXBuildFile; fileRef = ${fileRef} /* SceneDelegate.swift */; };\n/* End PBXBuildFile section */`);
  out = out.replace(/(\t+[0-9A-F]{24} \/\* AppDelegate\.swift \*\/,\n)/, `$1\t\t\t\t${fileRef} /* SceneDelegate.swift */,\n`);
  out = out.replace(/(\t+[0-9A-F]{24} \/\* AppDelegate\.swift in Sources \*\/,\n)/, `$1\t\t\t\t${buildFile} /* SceneDelegate.swift in Sources */,\n`);
  const ok = out.includes(`${fileRef} /* SceneDelegate.swift */,`) && out.includes(`${buildFile} /* SceneDelegate.swift in Sources */,`);
  if (!ok) throw new Error('project.pbxproj の形が想定と違います（AppDelegate.swift の行が見つかりません）');
  return { pbx: out, added: true };
}

function main() {
  if (!existsSync(PLIST)) {
    console.error(`Info.plist がありません: ${PLIST}\n先に  npm run build && npx cap add ios  を実行してください。`);
    process.exit(2);
  }
  const plist = readFileSync(PLIST, 'utf8');
  const { plist: nextPlist, todo } = patchPlist(plist);
  const needPrivacy = !existsSync(PRIVACY);
  const pbx = existsSync(PBXPROJ) ? readFileSync(PBXPROJ, 'utf8') : null;
  const needPbx = pbx != null && !/PrivacyInfo\.xcprivacy/.test(pbx);
  const needScene = !existsSync(SCENE);
  const needPbxScene = pbx != null && !/SceneDelegate\.swift/.test(pbx);
  const items = [...todo, ...(needPrivacy ? ['PrivacyInfo.xcprivacy'] : []), ...(needPbx ? ['project.pbxproj に PrivacyInfo を登録'] : []),
    ...(needScene ? ['SceneDelegate.swift'] : []), ...(needPbxScene ? ['project.pbxproj に SceneDelegate を登録'] : [])];
  if (check) {
    if (items.length === 0) { console.log('iOS の準備はそろっています。'); return; }
    console.log('まだ入っていないもの:\n' + items.map((x) => `  - ${x}`).join('\n'));
    process.exit(1);
  }
  if (todo.length) writeFileSync(PLIST, nextPlist);
  if (needPrivacy) writeFileSync(PRIVACY, privacyManifest());
  if (needScene) writeFileSync(SCENE, SCENE_DELEGATE_SWIFT);
  if (needPbx || needPbxScene) {
    let next = pbx;
    if (needPbx) next = patchPbxproj(next).pbx;
    if (needPbxScene) next = patchPbxprojScene(next).pbx;
    writeFileSync(PBXPROJ, next);
  }
  console.log(items.length ? '入れました:\n' + items.map((x) => `  - ${x}`).join('\n') : 'すでにそろっています（変更なし）。');
  console.log('\n次は Xcode で: Signing & Capabilities → Team・In-App Purchase・Sign in with Apple（通知は APNs がそろってから）。');
}

// 置き場所に空白や日本語があっても（URL の %20 と比べない）直接の実行だけ main を動かす。import（テスト）では動かさない。
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
