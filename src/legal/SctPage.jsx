// 📜 特定商取引法に基づく表記 — /legal/sct
//
// iOS アプリ(App Store)専用。課金は Apple の App 内課金(IAP / RevenueCat 経由)で、
// 決済・返金は Apple が行う。所在地・電話番号は「請求があった場合に開示」とする
// 一般的な運用を採用。販売事業者名・運営責任者は記入済み(下記フィールド参照)。
// 公開中の本文はこのファイルが正（legal/tokushoho.md は旧い下書き）。
// 2026-10-04: 法令の点検（特商法 11 条・定期購入の表示）に沿って、無料プラン・7 日間無料のあとの自動更新・
//   創業メンバー価格（年額の初回特典）・追加トークン（消耗型）を足した。期間中は終わる日を lib/foundingOffer.js から出す。

import LegalLayout from './LegalLayout';
import { SUPPORT_EMAIL } from '../lib/contact';
import { FREE_TOKENS, PAID_TOKENS, TRIAL_TOKENS, FREE_OCR_PER_MONTH } from '../lib/tokenAmounts';
import { FOUNDING_PRICE_YEN, readFoundingOffer } from '../lib/foundingOffer';

const FOUNDING_YEN = FOUNDING_PRICE_YEN.toLocaleString('ja-JP');

export default function SctPage() {
  const founding = readFoundingOffer();
  return (
    <LegalLayout
      title="特定商取引法に基づく表記"
      description="Orime の特定商取引法に基づく表記。販売事業者・販売価格・初回特典・追加トークン・支払方法・解約条件など。"
    >
      <p className="effective-date">最終更新日:2026年10月4日</p>

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
            <td><a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a></td>
          </tr>
          <tr>
            <th>販売価格</th>
            <td>
              無料プラン:0円(期間の定めはありません。AI は相談に使える毎月 {FREE_TOKENS} トークンと、写真から書き起こし 毎月 {FREE_OCR_PER_MONTH} 回まで)<br />
              月額プラン:月額 1,480円(税込)<br />
              年額プラン:年額 12,800円(税込)<br />
              (有料プランは毎月 {PAID_TOKENS} トークン・すべての AI 機能。使わなかったトークンは翌月に繰り越しません)<br />
              追加トークン(有料プランをご利用中の方のみ):300 トークン 300円(税込) / 1,000 トークン 800円(税込)<br />
              ※ 本サービスは iOS アプリ(App Store)でのみ提供しています。<br />
              ※ 各商品の最新価格は、App Store の購入画面に表示される金額が正式なものです。
            </td>
          </tr>
          <tr>
            <th>初回特典(無料期間・初回価格)</th>
            <td>
              初回特典は、同じ Apple ID で本サービスの有料プランの初回特典を使ったことがない方が対象です(1 つの Apple ID につき 1 回)。<br />
              <br />
              【7日間無料】<br />
              月額プラン(創業メンバー価格の期間のあとは年額プランも)は、最初の 7 日間が無料です(その間に使えるトークンは {TRIAL_TOKENS} トークン)。無料期間が終わると、解約しない限り、自動で選んだプランの料金(月額 1,480円(税込)または年額 12,800円(税込))で課金されます。無料期間が終わる 24 時間前までに解約すれば、料金はかかりません。<br />
              <br />
              【創業メンバー価格(年額プラン)】<br />
              {founding.active && founding.endLabel
                ? `いま(${founding.endLabel}(日本時間)まで)`
                : '当方が定める期間(本サービスの公開から 30 日間。終わる日は、本サービス内と App Store の購入画面に表示します)'}
              に年額プランを始めた方は、1 年目が {FOUNDING_YEN}円(税込)です。お申し込み時に 1 年分を一括でお支払いいただき、2 年目からは、解約しない限り年額 12,800円(税込)で自動更新されます。月額プランの 7 日間無料をすでに使った Apple ID には適用されません。期間中は、年額プランに 7 日間無料は付きません。
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
              有料プランの初回:お申し込み(購入)時に App Store 経由で決済されます。7日間無料で始めた場合は、無料期間が終わったときに決済されます。<br />
              2回目以降:契約期間(1 か月または 1 年)ごとの更新日に自動で決済されます(自動更新型サブスクリプション)。<br />
              追加トークン:購入時に決済されます。<br />
              決済は Apple App Store により行われます。
            </td>
          </tr>
          <tr>
            <th>商品の引渡時期</th>
            <td>
              有料プラン:お申し込み(決済完了。7日間無料のときはお申し込み)後、すぐにご利用いただけます。<br />
              追加トークン:購入後すぐに使えます。購入から 180 日間有効で、期限を過ぎた分は消滅します。
            </td>
          </tr>
          <tr>
            <th>解約・返金について</th>
            <td>
              【申込みの撤回】<br />
              デジタルサービスのため、購入後のお申し込みの撤回(キャンセル)はできません。<br />
              <br />
              【解約】<br />
              iPhone の「設定 → Apple ID → サブスクリプション」、または App Store のサブスクリプション管理画面からいつでも解約手続きが可能です。<br />
              自動更新を止めるには、次の更新日(7日間無料のときは無料期間が終わる日)の 24 時間前までに解約してください。<br />
              解約後は契約期間(現在の課金期間)の末日までご利用いただけます。違約金はかかりません。解約しても無料プランとして引き続き使え、メモは消えません。<br />
              <br />
              【返金】<br />
              お支払いは Apple App Store を通じて行われるため、返金は Apple App Store の返金ポリシーおよび手続に従います(Apple のサポート窓口へご請求ください)。<br />
              追加トークンは、使わなかった分・期限を過ぎた分の払い戻しはできません。<br />
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
