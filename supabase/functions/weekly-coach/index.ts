declare const Deno: {
  env: { get: (name: string) => string | undefined };
  serve: (handler: (request: Request) => Response | Promise<Response>) => void;
};

type ReviewRow = {
  week_id: string;
  reviewed_at: string;
  week_label: string;
  scores: Record<string, number>;
  notes: Record<string, string>;
  overall: number;
};

type GeneratedInsight = {
  focus_skill_id: string;
  pattern: string;
  actions: string[];
  reflection_question: string;
  encouragement: string;
};

const skillNames: Record<string, string> = {
  storytelling: "Storytelling",
  prioritize: "Prioritize sharp",
  communication: "Communication",
  analytical: "Analytical thinking",
  strategy: "Strategic thinking",
  learning: "Learning",
  growth: "Growth mindset",
  ideas: "Big ideas",
  human: "Be human",
  frameworks: "Framework thinking",
  journey: "Document your journey",
  meetings: "Prepare for meetings",
  presence: "Posture & presence",
};

const allowedOrigins = new Set([
  "https://tuncayda.github.io",
  "http://localhost:3000",
  "http://localhost:5173",
]);

function corsHeaders(origin: string | null) {
  return {
    "Access-Control-Allow-Origin": origin && allowedOrigins.has(origin) ? origin : "https://tuncayda.github.io",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    Vary: "Origin",
  };
}

function json(body: unknown, status: number, cors: Record<string, string>) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
}

function asInsight(value: unknown): GeneratedInsight | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<GeneratedInsight>;
  if (!candidate.focus_skill_id || !skillNames[candidate.focus_skill_id]) return null;
  if (typeof candidate.pattern !== "string" || candidate.pattern.length < 12) return null;
  if (!Array.isArray(candidate.actions) || candidate.actions.length !== 2 || candidate.actions.some((action) => typeof action !== "string" || action.length < 8)) return null;
  if (typeof candidate.reflection_question !== "string" || typeof candidate.encouragement !== "string") return null;
  return candidate as GeneratedInsight;
}

Deno.serve(async (request: Request) => {
  const origin = request.headers.get("origin");
  const cors = corsHeaders(origin);
  if (request.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405, cors);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const geminiApiKey = Deno.env.get("GEMINI_API_KEY");
  const authorization = request.headers.get("authorization");
  if (!supabaseUrl || !supabaseAnonKey || !geminiApiKey) return json({ error: "Server configuration is incomplete" }, 500, cors);
  if (!authorization?.startsWith("Bearer ")) return json({ error: "Sign in required" }, 401, cors);

  const authHeaders = { apikey: supabaseAnonKey, Authorization: authorization };
  const userResponse = await fetch(`${supabaseUrl}/auth/v1/user`, { headers: authHeaders });
  if (!userResponse.ok) return json({ error: "Your session has expired" }, 401, cors);
  const user = await userResponse.json() as { id: string };

  let weekId = "";
  try {
    const body = await request.json() as { weekId?: string };
    weekId = typeof body.weekId === "string" ? body.weekId : "";
  } catch { /* The validation below returns a useful error. */ }
  if (!/^\d{4}-W\d{2}$/.test(weekId)) return json({ error: "Invalid week" }, 400, cors);

  const reviewQuery = new URL(`${supabaseUrl}/rest/v1/reviews`);
  reviewQuery.searchParams.set("select", "week_id,reviewed_at,week_label,scores,notes,overall");
  reviewQuery.searchParams.set("user_id", `eq.${user.id}`);
  reviewQuery.searchParams.set("order", "reviewed_at.desc");
  reviewQuery.searchParams.set("limit", "8");
  const reviewResponse = await fetch(reviewQuery, { headers: authHeaders });
  if (!reviewResponse.ok) return json({ error: "Reviews could not be loaded" }, 502, cors);
  const reviews = await reviewResponse.json() as ReviewRow[];
  if (reviews.length < 2) return json({ error: "Complete at least two weekly reviews before generating tips" }, 400, cors);

  const latestReviewedAt = reviews[0].reviewed_at;
  const insightQuery = new URL(`${supabaseUrl}/rest/v1/weekly_insights`);
  insightQuery.searchParams.set("select", "week_id,created_at,source_reviewed_at,review_count,focus_skill_id,pattern,actions,reflection_question,encouragement");
  insightQuery.searchParams.set("user_id", `eq.${user.id}`);
  insightQuery.searchParams.set("week_id", `eq.${weekId}`);
  insightQuery.searchParams.set("limit", "1");
  const cachedResponse = await fetch(insightQuery, { headers: authHeaders });
  if (cachedResponse.ok) {
    const cached = await cachedResponse.json() as Array<Record<string, unknown>>;
    if (cached[0]?.source_reviewed_at === latestReviewedAt) return json(toClientInsight(cached[0]), 200, cors);
  }

  const chronological = [...reviews].reverse();
  const first = chronological[0];
  const latest = chronological.at(-1)!;
  const scoreTrends = Object.keys(skillNames).map((id) => {
    const values = chronological.map((review) => Number(review.scores[id])).filter(Number.isFinite);
    return {
      id,
      skill: skillNames[id],
      latest: Number(latest.scores[id]),
      average: Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(1)),
      change: Number((Number(latest.scores[id]) - Number(first.scores[id])).toFixed(1)),
    };
  });
  const reflections = chronological.flatMap((review) => Object.entries(review.notes ?? {})
    .filter(([, note]) => typeof note === "string" && note.trim())
    .map(([skillId, note]) => ({ week: review.week_label, skill: skillNames[skillId] ?? skillId, note: note.trim().slice(0, 600) })))
    .slice(-24);
  const evidence = {
    reviewCount: chronological.length,
    overall: chronological.map((review) => ({ week: review.week_label, score: Number(review.overall) })),
    skills: scoreTrends,
    reflections,
  };

  const responseSchema = {
    type: "object",
    properties: {
      focus_skill_id: { type: "string", enum: Object.keys(skillNames), description: "The single highest-leverage skill for the coming week." },
      pattern: { type: "string", description: "One evidence-based pattern in 1-2 concise sentences." },
      actions: { type: "array", minItems: 2, maxItems: 2, items: { type: "string" }, description: "Exactly two specific, realistic actions for the coming week." },
      reflection_question: { type: "string", description: "One short question to consider at the next review." },
      encouragement: { type: "string", description: "One grounded, non-generic sentence of encouragement." },
    },
    required: ["focus_skill_id", "pattern", "actions", "reflection_question", "encouragement"],
  };
  const prompt = `You are Northstar, a practical weekly reflection coach. Analyze only the supplied evidence. Do not diagnose personality, mental health, or ability. Do not invent events. Prefer a repeated or recent pattern over a single low score. Select one focus skill and give exactly two small actions that can be completed next week. Address the user directly and keep the full response concise.\n\nEvidence:\n${JSON.stringify(evidence)}`;
  const geminiResponse = await fetch("https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": geminiApiKey },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.35, maxOutputTokens: 700, responseMimeType: "application/json", responseSchema },
    }),
  });
  if (!geminiResponse.ok) return json({ error: "Gemini could not generate your tips right now" }, 502, cors);
  const geminiData = await geminiResponse.json() as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
  const rawText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text;
  let generated: GeneratedInsight | null = null;
  try { generated = asInsight(rawText ? JSON.parse(rawText) : null); } catch { /* Invalid output is handled below. */ }
  if (!generated) return json({ error: "Gemini returned an incomplete coaching plan" }, 502, cors);

  const row = {
    user_id: user.id,
    week_id: weekId,
    created_at: new Date().toISOString(),
    source_reviewed_at: latestReviewedAt,
    review_count: chronological.length,
    ...generated,
  };
  const saveResponse = await fetch(`${supabaseUrl}/rest/v1/weekly_insights?on_conflict=user_id,week_id`, {
    method: "POST",
    headers: { ...authHeaders, "Content-Type": "application/json", Prefer: "resolution=merge-duplicates,return=representation" },
    body: JSON.stringify(row),
  });
  if (!saveResponse.ok) return json({ error: "Your tips were generated but could not be saved" }, 502, cors);
  const saved = await saveResponse.json() as Array<Record<string, unknown>>;
  return json(toClientInsight(saved[0] ?? row), 200, cors);
});

function toClientInsight(row: Record<string, unknown>) {
  return {
    weekId: row.week_id,
    createdAt: row.created_at,
    sourceReviewedAt: row.source_reviewed_at,
    reviewCount: row.review_count,
    focusSkillId: row.focus_skill_id,
    pattern: row.pattern,
    actions: row.actions,
    reflectionQuestion: row.reflection_question,
    encouragement: row.encouragement,
  };
}
