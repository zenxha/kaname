/**
 * A shared plan link: the page's link preview names the people and the station, and its picture is the
 * plan (functions/og/plan.ts). Preview bots read the page without running the app, so the server finds
 * the same station. Anything that goes wrong serves the page as it is, with the general preview.
 */
import { answerFor, planQuery, previewText, type PreviewText } from "../preview/plan";
import { previewData, siteFiles, type Env } from "../preview/server";

/** HTMLRewriter writes a quote in an attribute as &quot; but leaves an ampersand as it is, so names keep theirs here. */
function content(value: string): HTMLRewriterElementContentHandlers {
  return { element: (el) => void el.setAttribute("content", value.replaceAll("&", "&amp;")) };
}

async function textFor(env: Env, url: URL): Promise<PreviewText | null> {
  try {
    const best = answerFor((await previewData(siteFiles(env, url.origin))).matrix, url.search);
    return best === null ? null : previewText(best);
  } catch {
    return null;
  }
}

export const onRequestGet: PagesFunction<Env> = async (ctx) => {
  const url = new URL(ctx.request.url);
  if (!url.searchParams.has("p")) return ctx.next();
  const text = await textFor(ctx.env, url);
  const page = await ctx.next();
  if (text === null || !(page.headers.get("Content-Type") ?? "").includes("text/html")) return page;
  const image = `${url.origin}/og/plan${planQuery(url.search)}`;
  return new HTMLRewriter()
    .on('meta[property="og:title"]', content(text.title))
    .on('meta[property="og:description"]', content(text.description))
    .on('meta[name="description"]', content(text.description))
    .on('meta[property="og:url"]', content(url.href))
    .on('meta[property="og:image"]', content(image))
    .on('meta[property="og:image:alt"]', content(text.alt))
    .on('meta[name="twitter:image:alt"]', content(text.alt))
    .transform(page);
};
