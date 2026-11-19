import fs from "fs";
import path from "path";
import Script from "next/script";

export const dynamic = "force-static";

export default function Page() {
  const html = fs.readFileSync(path.join(process.cwd(), "app", "body.html"), "utf8");
  return (
    <>
      <div id="app" dangerouslySetInnerHTML={{ __html: html }} />
      <Script src="/app.js" strategy="afterInteractive" />
    </>
  );
}
