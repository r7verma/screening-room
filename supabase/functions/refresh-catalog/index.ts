// Supabase Edge Function: refresh-catalog
// Runs daily via cron (set in Supabase dashboard → Edge Functions → Schedules)
// Cron: 0 3 * * *  (3am UTC every day)
//
// Deploy:
//   supabase functions deploy refresh-catalog
//
// Required env vars (set in Supabase dashboard → Settings → Edge Functions):
//   TMDB_KEY        — your TMDB API key
//   SUPABASE_URL    — your project URL (auto-available in edge functions)
//   SUPABASE_SERVICE_ROLE_KEY — service role key (bypasses RLS for server writes)

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const TMDB_KEY = Deno.env.get("TMDB_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const IMG_BASE = "https://image.tmdb.org/t/p/w342";

const GENRES_MOVIE: Record<number, string> = {28:"Action",12:"Adventure",16:"Animation",35:"Comedy",80:"Crime",99:"Documentary",18:"Drama",10751:"Family",14:"Fantasy",36:"History",27:"Horror",10402:"Music",9648:"Mystery",10749:"Romance",878:"Sci-Fi",10770:"TV Movie",53:"Thriller",10752:"War",37:"Western"};
const GENRES_TV: Record<number, string> = {10759:"Action & Adventure",16:"Animation",35:"Comedy",80:"Crime",99:"Documentary",18:"Drama",10751:"Family",10762:"Kids",9648:"Mystery",10763:"News",10764:"Reality",10765:"Sci-Fi & Fantasy",10766:"Soap",10767:"Talk",10768:"War & Politics",37:"Western"};

const JOBS: [string, string, number][] = [
  ["movie","movie/popular",4],
  ["movie","movie/now_playing",2],
  ["movie","movie/top_rated",2],
  ["movie","movie/upcoming",2],
  ["movie","trending/movie/week",1],
  ["tv","tv/popular",3],
  ["tv","tv/top_rated",2],
  ["tv","tv/on_the_air",2],
  ["tv","trending/tv/week",1],
];

async function tmdb(path: string, params: Record<string, string> = {}) {
  const url = new URL(`https://api.themoviedb.org/3/${path}`);
  url.searchParams.set("api_key", TMDB_KEY);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  const r = await fetch(url.toString());
  if (!r.ok) throw new Error(`TMDB ${r.status} on ${path}`);
  return r.json();
}

function yearOf(dateStr?: string) {
  return dateStr ? parseInt(dateStr.slice(0, 4), 10) : null;
}

function mapItem(item: Record<string, unknown>, mt: string) {
  const date = (item.release_date || item.first_air_date) as string | undefined;
  const genreMap = mt === "tv" ? GENRES_TV : GENRES_MOVIE;
  const genres = ((item.genre_ids as number[]) || []).map(id => genreMap[id]).filter(Boolean);
  return {
    tmdb_id: item.id,
    media_type: mt,
    vertical: "entertainment",
    title: (item.title || item.name) as string,
    year: yearOf(date),
    genres,
    overview: (item.overview as string) || null,
    poster_path: (item.poster_path as string) || null,
    backdrop_path: (item.backdrop_path as string) || null,
    vote_average: (item.vote_average as number) || null,
    popularity: (item.popularity as number) || null,
    release_date: date || null,
  };
}

Deno.serve(async (_req) => {
  try {
    const sb = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
    const today = new Date().toISOString().slice(0, 10);

    // Check if already refreshed today
    const { data: meta } = await sb.from("catalog_meta").select("*").eq("id", "singleton").maybeSingle();
    if (meta?.last_refresh === today) {
      return new Response(JSON.stringify({ ok: true, skipped: true, reason: "already refreshed today" }), { status: 200 });
    }

    const rowsByKey: Record<string, ReturnType<typeof mapItem>> = {};

    for (const [mt, path, pages] of JOBS) {
      for (let p = 1; p <= pages; p++) {
        try {
          const res = await tmdb(path, { page: String(p) });
          for (const item of (res.results || [])) {
            if (item.media_type && item.media_type !== "movie" && item.media_type !== "tv") continue;
            const mapped = mapItem(item, mt);
            if (mapped.title && mapped.poster_path) {
              rowsByKey[`${mt}:${mapped.tmdb_id}`] = mapped;
            }
          }
        } catch (e) {
          console.warn(`Skipping ${path} page ${p}:`, e);
        }
      }
    }

    const rows = Object.values(rowsByKey);
    console.log(`Upserting ${rows.length} catalog items`);

    // Upsert in chunks of 200
    for (let i = 0; i < rows.length; i += 200) {
      const { error } = await sb.from("catalog").upsert(rows.slice(i, i + 200), { onConflict: "tmdb_id,media_type" });
      if (error) console.error("Upsert error:", error);
    }

    const { count } = await sb.from("catalog").select("*", { count: "exact", head: true });
    await sb.from("catalog_meta").upsert({ id: "singleton", last_refresh: today, total: count || rows.length });

    return new Response(JSON.stringify({ ok: true, upserted: rows.length, total: count }), { status: 200 });
  } catch (err) {
    console.error("refresh-catalog failed:", err);
    return new Response(JSON.stringify({ ok: false, error: String(err) }), { status: 500 });
  }
});
