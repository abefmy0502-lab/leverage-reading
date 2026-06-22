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
              【Web 版】月額 1,280円(税込) / 年額 10,800円(税込)<br />
              【アプリ版】各ストア(App Store / Google Play)に表示される価格<br />
              ※ 各プランの最新価格は、決済画面に表示される金額が正式なものです。
            </td>
          </tr>
          <tr>
            <th>商品代金以外の必要料金</th>
            <td>インターネット接続にかかる通信料金、その他端末等の購入費用は、ユーザー負担となります。</td>
          </tr>
          <tr>
            <th>支払方法</th>
            <td>
              【Web 版】クレジットカード決済(決済代行:Stripe)<br />
              【アプリ版】アプリ内課金(Apple App Store / Google Play)
            </td>
          </tr>
          <tr>
            <th>支払時期</th>
            <td>
              初回:お申し込み(購入)時に決済されます。<br />
              2回目以降:契約日に対応する更新日に自動課金(自動更新型サブスクリプション)。Web 版は Stripe、アプリ版は各ストアにより決済されます。
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
              Web 版:アプリ内の「プラン管理」(Stripe カスタマーポータル)からいつでも解約手続きが可能です。<br />
              アプリ版:App Store / Google Play のサブスクリプション管理画面からいつでも解約手続きが可能です。<br />
              いずれの場合も、解約後は契約期間(現在の課金期間)の末日までご利用いただけます。違約金はかかりません。<br />
              <br />
              【返金】<br />
              Web 版:初回のご契約に限り、ご契約日を含む5日以内にお問い合わせ窓口(メール)へご連絡いただいた場合、理由を問わず全額を返金いたします(お一人様1回限り)。返金後は有料機能のご利用を停止いたします。当該保証期間(5日)経過後は、サービスの性質上、原則として返金いたしません(中途解約による日割り返金を含みません)。<br />
              アプリ版:Apple App Store / Google Play 各ストアの返金ポリシーおよび手続に従います。<br />
              いずれの場合も、当方の責に帰すべき事由による場合、または消費者契約法その他の強行法規により返金が必要な場合は、この限りではありません。
            </td>
          </tr>
          <tr>
            <th>動作環境</th>
            <td>
              iOS / Android アプリ(App Store / Google Play で配布)。<br />
              Web 版は iOS 15以上の Safari、Android 10 以上の Chrome、最新版の Chrome / Safari / Edge / Firefox に対応
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
