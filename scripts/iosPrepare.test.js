// scripts/ios-prepare.mjs（2026-10-29）: Info.plist と project.pbxproj を冪等に直す。
import { describe, it, expect } from 'vitest';
import { patchPlist, patchPbxproj, patchPbxprojScene, privacyManifest, USAGE_STRINGS, SCENE_DELEGATE_SWIFT } from './ios-prepare.mjs';

const PLIST = `<?xml version="1.0" encoding="UTF-8"?>
<plist version="1.0">
<dict>
\t<key>CFBundleDevelopmentRegion</key>
\t<string>en</string>
\t<key>CFBundleDisplayName</key>
\t<string>orime</string>
\t<key>UISupportedInterfaceOrientations</key>
\t<array>
\t\t<string>UIInterfaceOrientationPortrait</string>
\t\t<string>UIInterfaceOrientationLandscapeLeft</string>
\t</array>
\t<key>UISupportedInterfaceOrientations~ipad</key>
\t<array>
\t\t<string>UIInterfaceOrientationPortrait</string>
\t\t<string>UIInterfaceOrientationLandscapeLeft</string>
\t</array>
</dict>
</plist>
`;

const PBX = `/* Begin PBXBuildFile section */
\t\tA1 /* capacitor.config.json in Resources */ = {isa = PBXBuildFile; fileRef = F1 /* capacitor.config.json */; };
/* End PBXBuildFile section */
/* Begin PBXFileReference section */
\t\tF1 /* capacitor.config.json */ = {isa = PBXFileReference; path = capacitor.config.json; };
\t\tF2 /* Info.plist */ = {isa = PBXFileReference; path = Info.plist; };
/* End PBXFileReference section */
\t\tG1 /* App */ = {
\t\t\tchildren = (
\t\t\t\tF1 /* capacitor.config.json */,
\t\t\t\tF2 /* Info.plist */,
\t\t\t);
\t\t};
\t\tR1 /* Resources */ = {
\t\t\tfiles = (
\t\t\t\tA1 /* capacitor.config.json in Resources */,
\t\t\t);
\t\t};
`;

describe('ios-prepare', () => {
  it('Info.plist に説明文・暗号化の免除・ja・縦だけ を足し、2 回目は何もしない', () => {
    const { plist, todo } = patchPlist(PLIST);
    for (const k of Object.keys(USAGE_STRINGS)) expect(plist).toContain(`<key>${k}</key>`);
    expect(plist).toContain(USAGE_STRINGS.NSCameraUsageDescription);
    expect(plist).toMatch(/<key>ITSAppUsesNonExemptEncryption<\/key>\s*<false\/>/);
    expect(plist).toMatch(/<key>CFBundleDevelopmentRegion<\/key>\s*<string>ja<\/string>/);
    expect(plist).toMatch(/<key>UISupportedInterfaceOrientations<\/key>\s*<array>\s*<string>UIInterfaceOrientationPortrait<\/string>\s*<\/array>/);
    // iPad の向きは触らない
    expect(plist).toMatch(/~ipad<\/key>\s*<array>\s*<string>UIInterfaceOrientationPortrait<\/string>\s*<string>UIInterfaceOrientationLandscapeLeft/);
    expect(todo.length).toBe(7);
    const again = patchPlist(plist);
    expect(again.todo).toEqual([]);
    expect(again.plist).toBe(plist);
  });

  it('手で直した説明文は上書きしない', () => {
    const mine = PLIST.replace('</dict>', '\t<key>NSCameraUsageDescription</key>\n\t<string>自分の文</string>\n</dict>');
    const { plist } = patchPlist(mine);
    expect(plist).toContain('自分の文');
    expect(plist).not.toContain(USAGE_STRINGS.NSCameraUsageDescription);
  });

  it('project.pbxproj に PrivacyInfo を 1 回だけ登録する', () => {
    const { pbx, added } = patchPbxproj(PBX);
    expect(added).toBe(true);
    expect(pbx.split('\n').filter((l) => l.includes('PrivacyInfo.xcprivacy')).length).toBe(4); // fileRef・buildFile・グループ・Resources
    expect(pbx).toMatch(/children = \(\n[^)]*PrivacyInfo\.xcprivacy \*\/,\n/);
    expect(pbx).toMatch(/files = \(\n[^)]*PrivacyInfo\.xcprivacy in Resources \*\/,\n/);
    expect(patchPbxproj(pbx).added).toBe(false);
  });

  it('PrivacyInfo は追跡なし・Sentry のあるビルドだけクラッシュとパフォーマンス', () => {
    const base = privacyManifest({ sentry: false });
    expect(base).toContain('<key>NSPrivacyTracking</key>\n  <false/>');
    expect(base).not.toContain('CrashData');
    const withSentry = privacyManifest({ sentry: true });
    expect(withSentry).toContain('NSPrivacyCollectedDataTypeCrashData');
    expect(withSentry).toContain('NSPrivacyCollectedDataTypePerformanceData');
    expect((base.match(/NSPrivacyCollectedDataType</g) || []).length).toBe(8);
  });

  it('UIScene の起動（iOS 27 の SDK で必要）: シーンの設定を足し、古い UIMainStoryboardFile を外す', () => {
    const src = PLIST.replace('</dict>\n</plist>', '\t<key>UIMainStoryboardFile</key>\n\t<string>Main</string>\n</dict>\n</plist>');
    const { plist, todo } = patchPlist(src);
    expect(plist).toMatch(/<key>UIApplicationSceneManifest<\/key>/);
    expect(plist).toContain('<string>$(PRODUCT_MODULE_NAME).SceneDelegate</string>');
    expect(plist).toMatch(/<key>UISceneStoryboardFile<\/key>\s*<string>Main<\/string>/);
    expect(plist).not.toContain('UIMainStoryboardFile');
    expect(todo).toContain('UIMainStoryboardFile を外す');
    expect(patchPlist(plist).todo).toEqual([]);
    expect(SCENE_DELEGATE_SWIFT).toContain('class SceneDelegate: UIResponder, UIWindowSceneDelegate');
    expect(SCENE_DELEGATE_SWIFT).toContain('SceneDelegateProxy.shared.scene(scene, willConnectTo: session, options: connectionOptions)');
  });

  it('project.pbxproj に SceneDelegate.swift を Sources として登録し、2 回目は何もしない', () => {
    const pbx = `/* Begin PBXBuildFile section */
\t\tB1 /* AppDelegate.swift in Sources */ = {isa = PBXBuildFile; fileRef = 504EC3071FED79650016851F /* AppDelegate.swift */; };
/* End PBXBuildFile section */
/* Begin PBXFileReference section */
/* End PBXFileReference section */
\t\t\tchildren = (
\t\t\t\t504EC3071FED79650016851F /* AppDelegate.swift */,
\t\t\t);
\t\t\tfiles = (
\t\t\t\t504EC3081FED79650016851F /* AppDelegate.swift in Sources */,
\t\t\t);
`;
    const { pbx: out, added } = patchPbxprojScene(pbx);
    expect(added).toBe(true);
    expect(out).toMatch(/[0-9A-F]{24} \/\* SceneDelegate\.swift \*\/ = \{isa = PBXFileReference/);
    expect(out).toMatch(/[0-9A-F]{24} \/\* SceneDelegate\.swift in Sources \*\/,/);
    expect(patchPbxprojScene(out)).toEqual({ pbx: out, added: false });
  });
});
