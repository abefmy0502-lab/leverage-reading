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
      description="レバレッジ読書ログの特定商取引法に基づく表記。販売事業者・販売価格・支払方法・解約条件など。"
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
            <td>月額 990円(税込)</td>
          </tr>
          <tr>
            <th>商品代金以外の必要料金</th>
            <td>インターネット接続にかかる通信料金、その他端末等の購入費用は、ユーザー負担となります。</td>
          </tr>
          <tr>
            <th>支払方法</th>
            <td>アプリ内課金(Apple App Store / Google Play)</td>
          </tr>
          <tr>
            <th>支払時期</th>
            <td>毎月、契約日に対応する日に自動課金(各ストアによる自動更新)</td>
          </tr>
          <tr>
            <th>商品の引渡時期</th>
            <td>登録完了後、即時にご利用いただけます。</td>
          </tr>
          <tr>
            <th>解約・返金について</th>
            <td>
              App Store / Google Play のサブスクリプション管理画面からいつでも解約手続きが可能です。<br />
              解約後も、契約月(現在の課金期間)の末日まではご利用いただけます。<br />
              返金については、Apple App Store / Google Play 各ストアの返金ポリシーに従います。<br />
              既にお支払いいただいた料金は、各ストアのポリシーに基づく場合または当方の責に帰すべき事由による場合を除き、返金いたしません。
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
