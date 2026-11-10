/**
 * A shared plan link: the page's link preview names the people and the station, and its picture is the
 * plan (functions/og/plan.ts). Preview bots read the page without running the app, so the server finds
 * the same station. Anything that goes wrong serves the page as it is, with the general preview.
 */
import { answerFor, planQuery, previewText, type PreviewText } from "../preview/plan";
import { previewData, ROBOTS, siteFiles, type Env } from "../preview/server";

/** HTMLRewriter writes a quote in an attribute as &quot; but leaves an ampersand as it is, so names keep theirs here. */
function content(value: string): HTMLRewriterElementContentHandlers {
  return { element: (el) => void el.setAttribute("content", value.replaceAll("&", "&amp;")) };
}

interface Preview {
  readonly text: PreviewText;
  /** The plan's picture address. */
  readonly image: string;
}

async function previewFor(env: Env, url: URL): Promise<Preview | null> {
  try {
    const { matrix } = await previewData(siteFiles(env, url.origin));
    const best = answerFor(matrix, url.search);
    return best === null ? null : { text: previewText(best), image: `${url.origin}/og/plan${planQuery(matrix, url.search)}` };
  } catch {
    return null;
  }
}

export const onRequestGet: PagesFunction<Env> = async (ctx) => {
  const url = new URL(ctx.request.url);
  if (!url.searchParams.has("p")) return ctx.next();
  const preview = await previewFor(ctx.env, url);
  const page = await ctx.next();
  if (preview === null || !(page.headers.get("Content-Type") ?? "").includes("text/html")) return page;
  const { text, image } = preview;
  const marked = new Response(page.body, page);
  marked.headers.set("X-Robots-Tag", ROBOTS);
  return new HTMLRewriter()
    .on('meta[property="og:title"]', content(text.title))
    .on('meta[property="og:description"]', content(text.description))
    .on('meta[name="description"]', content(text.description))
    .on('meta[property="og:url"]', content(url.href))
    .on('meta[property="og:image"]', content(image))
    .on('meta[property="og:image:alt"]', content(text.alt))
    .on('meta[name="twitter:image:alt"]', content(text.alt))
    .transform(marked);
};
