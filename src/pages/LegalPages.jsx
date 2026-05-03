// 📜 LP の法的ページ — 利用規約 / プライバシーポリシー / お問い合わせ
//
// 3 ページとも /lp/* にルーティング。LP footer のリンクから到達できる。
// LandingPage と同じ html.lp-active 上書きを使ってメインアプリの
// overflow:hidden + 100dvh レイアウトを解除する (LP と同じ仕掛け)。

import { useEffect } from 'react';
import './landing.css';
import './legal.css';

const setMeta = (name, content, attr = 'name') => {
  let el = document.querySelector(`meta[${attr}="${name}"]`);
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(attr, name);
    document.head.appendChild(el);
  }
  el.setAttribute('content', content);
  return el;
};

// ============ 共通レイアウト ============
function LegalLayout({ title, description, children }) {
  useEffect(() => {
    const prevTitle = document.title;
    document.title = `${title} | レバレッジ読書ログ`;
    const tags = description
      ? [setMeta('description', description)]
      : [];

    // メインアプリの overflow:hidden + 100dvh を解除 (LP と同じ仕組み)
    const root = document.getElementById('root');
    document.documentElement.classList.add('lp-active');
    document.body.classList.add('lp-active');
    if (root) root.classList.add('lp-active');
    const prev = {
      htmlOverflow: document.documentElement.style.overflow,
      htmlHeight: document.documentElement.style.height,
      bodyOverflow: document.body.style.overflow,
      bodyHeight: document.body.style.height,
      rootOverflow: root?.style.overflow ?? '',
      rootHeight: root?.style.height ?? '',
      rootDisplay: root?.style.display ?? '',
    };
    document.documentElement.style.overflow = 'auto';
    document.documentElement.style.height = 'auto';
    document.body.style.overflow = 'auto';
    document.body.style.height = 'auto';
    if (root) {
      root.style.overflow = 'visible';
      root.style.height = 'auto';
      root.style.display = 'block';
    }
    window.scrollTo(0, 0);

    return () => {
      document.title = prevTitle;
      tags.forEach((el) => el && el.parentElement && el.parentElement.removeChild(el));
      document.documentElement.classList.remove('lp-active');
      document.body.classList.remove('lp-active');
      if (root) root.classList.remove('lp-active');
      document.documentElement.style.overflow = prev.htmlOverflow;
      document.documentElement.style.height = prev.htmlHeight;
      document.body.style.overflow = prev.bodyOverflow;
      document.body.style.height = prev.bodyHeight;
      if (root) {
        root.style.overflow = prev.rootOverflow;
        root.style.height = prev.rootHeight;
        root.style.display = prev.rootDisplay;
      }
    };
  }, [title, description]);

  return (
    <div className="lp-root">
      <div className="legal-page">
        <header className="legal-header">
          <a href="/lp" className="back-to-lp">← LP に戻る</a>
          <h1>{title}</h1>
        </header>

        <main className="legal-content">
          {children}
        </main>

        <footer className="legal-footer">
          <div className="legal-footer-links">
            <a href="/lp/terms">利用規約</a>
            <a href="/lp/privacy">プライバシーポリシー</a>
            <a href="/lp/contact">お問い合わせ</a>
          </div>
          <p className="legal-copyright">© 2026 レバレッジ読書ログ</p>
        </footer>
      </div>
    </div>
  );
}

// ============ 利用規約 ============
export function TermsPage() {
  return (
    <LegalLayout title="利用規約" description="レバレッジ読書ログの利用規約。月額料金・解約・禁止事項・免責事項について。">
      <p className="legal-meta">制定日：2026 年 5 月 3 日</p>

      <p>
        この利用規約（以下「本規約」）は、レバレッジ読書ログ（以下「本サービス」）の利用条件を定めるものです。本サービスをご利用いただくユーザー（以下「ユーザー」）は、本規約に同意のうえ、本サービスを利用するものとします。
      </p>

      <h2>第 1 条（適用）</h2>
      <p>
        本規約は、本サービスの提供条件およびユーザーと運営者との間の権利義務関係を定めるものとし、ユーザーと運営者の間の本サービスに関する一切の関係に適用されます。
      </p>

      <h2>第 2 条（利用登録）</h2>
      <ol>
        <li>本サービスの利用を希望する者は、運営者の定める方法により利用登録を申請するものとします。</li>
        <li>運営者は、利用登録の申請があった場合、これを承認することができます。</li>
        <li>本サービスの利用には、有効なクレジットカードの登録が必要です。</li>
      </ol>

      <h2>第 3 条（料金および支払方法）</h2>
      <ol>
        <li>本サービスの利用料金は月額 1,000 円（税込）とします。</li>
        <li>利用料金は、登録時に指定したクレジットカードから自動で引き落とされます。</li>
        <li>解約はアプリ内から 1 タップで可能で、違約金は発生しません。</li>
        <li>解約後も、契約月の末日までは引き続き本サービスをご利用いただけます。</li>
      </ol>

      <h2>第 4 条（禁止事項）</h2>
      <p>ユーザーは、本サービスの利用にあたり、以下の行為をしてはなりません。</p>
      <ul>
        <li>法令または公序良俗に違反する行為</li>
        <li>犯罪行為に関連する行為</li>
        <li>本サービスの内容を、その権利者の許諾なく複製、転載、改変等する行為</li>
        <li>本サービスのサーバーまたはネットワークの機能を破壊・妨害する行為</li>
        <li>運営者のサービスの運営を妨害するおそれのある行為</li>
        <li>他のユーザーに関する個人情報等を収集または蓄積する行為</li>
        <li>不正アクセスをし、またはこれを試みる行為</li>
        <li>他のユーザーに成りすます行為</li>
        <li>運営者が許諾しない本サービス上での宣伝、広告、勧誘、または営業行為</li>
        <li>その他、運営者が不適切と判断する行為</li>
      </ul>

      <h2>第 5 条（サービスの提供の停止等）</h2>
      <p>
        運営者は、以下のいずれかの事由があると判断した場合、ユーザーに事前に通知することなく、本サービスの全部または一部の提供を停止または中断することができます。
      </p>
      <ul>
        <li>本サービスにかかるシステムの保守・点検または更新を行う場合</li>
        <li>地震、落雷、火災、停電または天災などの不可抗力により、本サービスの提供が困難となった場合</li>
        <li>その他、運営者が本サービスの提供が困難と判断した場合</li>
      </ul>

      <h2>第 6 条（著作権）</h2>
      <p>
        ユーザーが本サービスを通じて投稿・登録した文章・メモ等の著作権は、ユーザーに帰属します。ただし、運営者はサービス提供および改善の目的において、これらを利用できるものとします。
      </p>

      <h2>第 7 条（利用制限および登録抹消）</h2>
      <p>
        運営者は、ユーザーが本規約のいずれかの条項に違反した場合、事前の通知なく、ユーザーに対して本サービスの全部もしくは一部の利用を制限し、またはユーザーとしての登録を抹消することができます。
      </p>

      <h2>第 8 条（免責事項）</h2>
      <ol>
        <li>運営者は、本サービスに事実上または法律上の瑕疵がないことを明示的にも黙示的にも保証しません。</li>
        <li>運営者は、本サービスに起因してユーザーに生じたあらゆる損害について一切の責任を負いません。</li>
        <li>本サービスは、AI による選書・要約・回答を提供しますが、その内容の正確性・有用性は保証しません。</li>
      </ol>

      <h2>第 9 条（サービス内容の変更等）</h2>
      <p>
        運営者は、ユーザーに通知することなく、本サービスの内容を変更しまたは本サービスの提供を中止することができ、これによってユーザーに生じた損害について一切の責任を負いません。
      </p>

      <h2>第 10 条（利用規約の変更）</h2>
      <p>
        運営者は、必要と判断した場合には、ユーザーに通知することなくいつでも本規約を変更することができます。
      </p>

      <h2>第 11 条（準拠法・裁判管轄）</h2>
      <ol>
        <li>本規約の解釈にあたっては、日本法を準拠法とします。</li>
        <li>本サービスに関して紛争が生じた場合には、運営者の所在地を管轄する裁判所を専属的合意管轄とします。</li>
      </ol>
    </LegalLayout>
  );
}

// ============ プライバシーポリシー ============
export function PrivacyPage() {
  return (
    <LegalLayout title="プライバシーポリシー" description="レバレッジ読書ログのプライバシーポリシー。収集情報・AI 連携・データ保管について。">
      <p className="legal-meta">制定日：2026 年 5 月 3 日</p>

      <p>
        レバレッジ読書ログ（以下「本サービス」）は、ユーザーの個人情報の保護を最優先に考え、以下のプライバシーポリシーに基づき、個人情報の取り扱いを定めます。
      </p>

      <h2>1. 収集する情報</h2>
      <p>本サービスは、以下の情報を収集します。</p>
      <ul>
        <li>メールアドレス（アカウント作成時）</li>
        <li>クレジットカード情報（決済代行サービスを通じて処理。本サービス側では保管しません）</li>
        <li>本サービス内で作成・登録される本のタイトル、メモ、行動記録等</li>
        <li>サービス利用に関するログ情報（アクセス日時、IP アドレス等）</li>
      </ul>

      <h2>2. 情報の利用目的</h2>
      <p>収集した情報は、以下の目的で利用します。</p>
      <ul>
        <li>本サービスの提供および運営</li>
        <li>ユーザーからのお問い合わせへの対応</li>
        <li>本サービスの改善および新機能の開発</li>
        <li>不正利用の防止</li>
        <li>利用料金の請求・決済処理</li>
      </ul>

      <h2>3. 情報の保管</h2>
      <p>
        ユーザーのデータは Supabase 上で暗号化保管され、Row Level Security により他のユーザーから完全に隔離されています。
      </p>

      <h2>4. 第三者への提供</h2>
      <p>
        本サービスは、法令に基づく場合または以下の場合を除き、ユーザーの個人情報を第三者に提供しません。
      </p>
      <ul>
        <li>ユーザーの同意がある場合</li>
        <li>決済処理のため、決済代行サービスへ必要な情報を提供する場合</li>
        <li>AI 機能のため、ユーザーが入力したテキストを AI サービスに送信する場合（送信されるデータは AI モデルの学習には利用されません）</li>
      </ul>

      <h2>5. AI への送信について</h2>
      <p>
        本サービスは Anthropic の Claude API を利用しています。ユーザーの質問内容、本のメモ等は、AI からの応答を生成するために送信されますが、Anthropic の API 利用規約により、これらのデータは AI モデルの学習には利用されません。
      </p>

      <h2>6. データの削除</h2>
      <p>
        ユーザーがサービスを解約した場合、データは一定期間保持されたのち、ユーザーからの明示的な削除依頼により完全に削除されます。アカウント削除はアプリ内の設定から行えます。
      </p>

      <h2>7. Cookie について</h2>
      <p>
        本サービスは、ユーザー体験向上のため Cookie を使用する場合があります。Cookie の使用を拒否することも可能ですが、その場合一部の機能が利用できない可能性があります。
      </p>

      <h2>8. プライバシーポリシーの変更</h2>
      <p>
        運営者は、必要と判断した場合には、本ポリシーをいつでも変更することができます。変更後のプライバシーポリシーは、本サービス上に掲載した時点で効力を生じるものとします。
      </p>

      <h2>9. お問い合わせ</h2>
      <p>
        本ポリシーに関するお問い合わせは、<a href="/lp/contact">お問い合わせページ</a>からお願いいたします。
      </p>
    </LegalLayout>
  );
}

// ============ お問い合わせ ============
export function ContactPage() {
  return (
    <LegalLayout title="お問い合わせ" description="レバレッジ読書ログへのお問い合わせ・ご要望・不具合報告はメールで受け付けています。">
      <p>
        本サービスに関するご質問・ご要望・不具合報告などは、以下のメールアドレスまでご連絡ください。
      </p>

      <div className="contact-card">
        <p className="contact-label">メールアドレス</p>
        <p className="contact-email">
          <a href="mailto:f.abe@pntwhere.com">f.abe@pntwhere.com</a>
        </p>
      </div>

      <h2>お問い合わせ前に</h2>
      <p>以下のページもご確認ください。</p>
      <ul>
        <li><a href="/lp">レバレッジ読書ログ トップページ</a></li>
        <li><a href="/lp/terms">利用規約</a></li>
        <li><a href="/lp/privacy">プライバシーポリシー</a></li>
      </ul>

      <h2>返信について</h2>
      <p>
        お問い合わせいただいた内容には、3 営業日以内にご返信いたします。内容によってはお時間をいただく場合がございます。あらかじめご了承ください。
      </p>
    </LegalLayout>
  );
}
