/* eslint-disable @next/next/no-html-link-for-pages -- Native navigation avoids the broken client router in the Cloudflare runtime. */
import { sellerTerms } from "@/lib/terms";

export default function TermsPage() {
  const lines = sellerTerms.split("\n");

  return <main className="legal-shell">
    <header className="workspace-header"><a href="/" className="workspace-brand"><span className="brand-mark" aria-hidden="true">C</span><span className="brand-name">Condomio <small>Red comercial</small></span></a><span className="workspace-label">Información legal</span></header>
    <article className="legal-page">
      {lines.map((line, index) => {
        if (!line) return <div className="legal-spacer" key={index} />;
        if (line.startsWith("# ")) return <h1 key={index}>{line.slice(2)}</h1>;
        if (line.startsWith("## ")) return <h2 key={index}>{line.slice(3)}</h2>;
        if (line.startsWith("### ")) return <h3 key={index}>{line.slice(4)}</h3>;
        if (line.startsWith("- ")) return <p className="legal-list-item" key={index}>{line.slice(2)}</p>;
        if (/^\d+\. /.test(line)) return <p className="legal-list-item legal-numbered" key={index}>{line}</p>;
        return <p key={index}>{line}</p>;
      })}
    </article>
  </main>;
}
