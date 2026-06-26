// 📜 特定商取引法に基づく表記 — /legal/sct
//
// 月額課金サービスでは法的に必須。所在地・電話番号は「請求があった場合
// に開示」とすることで個人情報を保護する一般的な運用を採用している。
// 商用化前に「販売事業者名」「運営責任者」を実名(または屋号)で埋める
// こと(TODO コメント参照)。

import LegalLayout from './LegalLayout';

export default function SctPage() {
  return (
    <LegalLayout
      title="特定商取引法に基づく表記"
      description="Orime の特定商取引法に基づく表記。販売事業者・販売価格・支払方法・解約条件など。"
    >
      <p className="effective-date">最終更新日:2026年6月21日</p>

      <table className="sct-table">
        <tbody>
          <tr>
            <th>販売事業者名</th>
            <td>阿部文哉</td>
          </tr>
          <tr>
            <th>運営責任者</th>
            <td>阿部文哉</td>
          </tr>
          <tr>
            <th>所在地</th>
            <td>
              ご請求があった場合は、遅滞なく開示いたします。<br />
              ご希望の方は、下記お問い合わせ先までご連絡ください。
            </td>
          </tr>
          <tr>
            <th>電話番号</th>
            <td>
              ご請求があった場合は、遅滞なく開示いたします。<br />
              ご希望の方は、下記お問い合わせ先までご連絡ください。
            </td>
          </tr>
          <tr>
            <th>メールアドレス</th>
            <td><a href="mailto:leverage.book0502@gmail.com">leverage.book0502@gmail.com</a></td>
          </tr>
          <tr>
            <th>販売価格</th>
            <td>
              月額 1,480円(税込) / 年額 12,800円(税込)<br />
              ※ 本サービスは iOS アプリ(App Store)でのみ提供しています。<br />
              ※ 各プランの最新価格は、App Store の購入画面に表示される金額が正式なものです。
            </td>
          </tr>
          <tr>
            <th>商品代金以外の必要料金</th>
            <td>インターネット接続にかかる通信料金、その他端末等の購入費用は、ユーザー負担となります。</td>
          </tr>
          <tr>
            <th>支払方法</th>
            <td>
              アプリ内課金(Apple App Store / In-App Purchase)。Apple ID に登録されたお支払い方法で決済されます。
            </td>
          </tr>
          <tr>
            <th>支払時期</th>
            <td>
              初回:お申し込み(購入)時に App Store 経由で決済されます。<br />
              2回目以降:契約日に対応する更新日に自動課金(自動更新型サブスクリプション)。決済は Apple App Store により行われます。
            </td>
          </tr>
          <tr>
            <th>商品の引渡時期</th>
            <td>登録(決済完了)後、即時にご利用いただけます。</td>
          </tr>
          <tr>
            <th>解約・返金について</th>
            <td>
              【解約】<br />
              iPhone の「設定 → Apple ID → サブスクリプション」、または App Store のサブスクリプション管理画面からいつでも解約手続きが可能です。<br />
              解約後は契約期間(現在の課金期間)の末日までご利用いただけます。違約金はかかりません。<br />
              <br />
              【返金】<br />
              お支払いは Apple App Store を通じて行われるため、返金は Apple App Store の返金ポリシーおよび手続に従います(Apple のサポート窓口へご請求ください)。<br />
              当方の責に帰すべき事由による場合、または消費者契約法その他の強行法規により返金が必要な場合は、この限りではありません。
            </td>
          </tr>
          <tr>
            <th>動作環境</th>
            <td>
              iOS アプリ(App Store で配布)。iOS 15 以上の iPhone に対応。<br />
              ※ Android 版は今後対応を検討中です。
            </td>
          </tr>
        </tbody>
      </table>

      <p className="sct-note">
        ※ 所在地・電話番号は、ご請求いただいた場合に遅滞なく書面または電子メール等で開示いたします。
      </p>
    </LegalLayout>
  );
}
