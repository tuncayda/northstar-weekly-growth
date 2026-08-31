"use client";

import { ChangeEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChartNoAxesCombined, Cloud, Database, House, LogOut, Moon, Sparkles, Sun } from "lucide-react";
import type { User } from "@supabase/supabase-js";
import { isSupabaseConfigured, supabase } from "../src/lib/supabase";

type Skill = { id: string; title: string; prompt: string; description: string };
type Review = { id: string; date: string; week: string; scores: Record<string, number>; notes: Record<string, string>; overall: number };
type ReviewDraft = { weekId: string; index: number; scores: Record<string, number>; notes: Record<string, string> };
type View = "overview" | "trends" | "practice";
type Theme = "light" | "dark";

const skills: Skill[] = [
  { id: "storytelling", title: "Storytelling", prompt: "Did you make your thinking visible and help people imagine the end goal?", description: "Visualize stories so people can understand your thinking, see the destination, and begin to live it." },
  { id: "prioritize", title: "Prioritize sharp", prompt: "Did you protect your focus and choose what mattered most?", description: "Taking on too much creates stress and slows you down. Make the hard, sharp choices." },
  { id: "communication", title: "Communication", prompt: "Did you speak up and keep people in the loop?", description: "Do not disappear in meetings, chat, or email. Share context early and communicate clearly." },
  { id: "analytical", title: "Analytical thinking", prompt: "Did you use evidence to make or prove your point?", description: "Use numbers to measure success, follow up on outcomes, and support decisions." },
  { id: "strategy", title: "Strategic thinking", prompt: "Did your choices connect today’s work to the long-term strategy?", description: "Think beyond day-to-day tasks. Follow the strategy—or raise it clearly when you disagree." },
  { id: "learning", title: "Learning", prompt: "Did you deliberately invest in learning this week?", description: "Read, listen, take notes, and turn what you learn into your own weekly summaries." },
  { id: "growth", title: "Growth mindset", prompt: "Did you treat effort, feedback, and setbacks as ways to grow?", description: "Abilities are not fixed. They develop through learning, feedback, persistence, and practice." },
  { id: "ideas", title: "Big ideas", prompt: "Did you give yourself space to think beyond incremental improvements?", description: "Look for ambitious ideas with the potential to create meaningful, outsized impact." },
  { id: "human", title: "Be human", prompt: "Did you notice, remember, and follow up on how people were doing?", description: "Ask how people feel. Listen closely, remember personal details, and follow up with care." },
  { id: "frameworks", title: "Framework thinking", prompt: "Did you act with a clear framework or intentional standard?", description: "Use best practices with intent. Change the framework when needed, but never work randomly." },
  { id: "journey", title: "Document your journey", prompt: "Did you capture a reflection or achievement worth remembering?", description: "Write regular self-reflections and keep an evidence-based record of your achievements." },
  { id: "meetings", title: "Prepare for meetings", prompt: "Did you prepare your position, questions, and counterarguments?", description: "Prepare like you did in school: understand the material and anticipate other perspectives." },
  { id: "presence", title: "Posture & presence", prompt: "Did your posture and presence strengthen your communication?", description: "People can see you before they hear you. Let your physical presence support your message." },
];

const STORAGE_KEY = "northstar-weekly-reviews-v1";
const DRAFT_KEY = "northstar-weekly-draft-v1";

function getWeekInfo(date = new Date()) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNumber = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  const monday = new Date(date); monday.setDate(date.getDate() - ((date.getDay() + 6) % 7));
  const sunday = new Date(monday); sunday.setDate(monday.getDate() + 6);
  const short = (x: Date) => x.toLocaleDateString("en-GB", { day: "numeric", month: "short" }).toUpperCase();
  return { id: `${d.getUTCFullYear()}-W${String(weekNumber).padStart(2, "0")}`, label: `WEEK ${weekNumber} · ${short(monday)}–${short(sunday)}` };
}

function formatScore(value?: number) { return value === undefined ? "—" : value.toFixed(1); }
function delta(current?: number, previous?: number) {
  if (current === undefined || previous === undefined) return null;
  const value = current - previous;
  return { value: `${value >= 0 ? "+" : "−"}${Math.abs(value).toFixed(1)}`, up: value >= 0 };
}

export default function Home() {
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(!isSupabaseConfigured);
  const [theme, setTheme] = useState<Theme>(() => {
    if (typeof window === "undefined") return "light";
    try {
      const saved = localStorage.getItem("northstar-theme");
      if (saved === "light" || saved === "dark") return saved;
    } catch { /* Continue with the device preference when storage is unavailable. */ }
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  });

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
    try { localStorage.setItem("northstar-theme", theme); } catch { /* The theme still works for this visit. */ }
  }, [theme]);

  useEffect(() => {
    if (!supabase) return;
    void supabase.auth.getSession().then(({ data }) => { setUser(data.session?.user ?? null); setAuthReady(true); });
    const { data } = supabase.auth.onAuthStateChange((_event, session) => { setUser(session?.user ?? null); setAuthReady(true); });
    return () => data.subscription.unsubscribe();
  }, []);

  const toggleTheme = () => setTheme((current) => current === "light" ? "dark" : "light");
  if (!isSupabaseConfigured) return <CloudSetupNeeded theme={theme} onToggleTheme={toggleTheme} />;
  if (!authReady) return <LoadingScreen theme={theme} onToggleTheme={toggleTheme} />;
  if (!user) return <SignInScreen theme={theme} onToggleTheme={toggleTheme} />;
  return <Tracker user={user} theme={theme} onToggleTheme={toggleTheme} />;
}

function Tracker({ user, theme, onToggleTheme }: { user: User; theme: Theme; onToggleTheme: () => void }) {
  const [view, setView] = useState<View>("overview");
  const [reviews, setReviews] = useState<Review[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [savedDraft, setSavedDraft] = useState<ReviewDraft | null>(null);
  const [syncError, setSyncError] = useState("");
  const [reviewIndex, setReviewIndex] = useState<number | null>(null);
  const [draftScores, setDraftScores] = useState<Record<string, number>>({});
  const [draftNotes, setDraftNotes] = useState<Record<string, string>>({});
  const [selectedSkill, setSelectedSkill] = useState<Skill | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const week = getWeekInfo();

  useEffect(() => {
    let active = true;
    const loadCloudData = async () => {
      setHydrated(false); setSyncError("");
      const [reviewResult, draftResult] = await Promise.all([
        supabase!.from("reviews").select("week_id, reviewed_at, week_label, scores, notes, overall").eq("user_id", user.id).order("reviewed_at"),
        supabase!.from("review_drafts").select("week_id, current_index, scores, notes").eq("user_id", user.id).maybeSingle(),
      ]);
      if (!active) return;
      if (reviewResult.error || draftResult.error) {
        setSyncError("Cloud sync could not connect. Please try again shortly."); setHydrated(true); return;
      }
      let cloudReviews: Review[] = (reviewResult.data ?? []).map((row) => ({ id: row.week_id, date: row.reviewed_at, week: row.week_label, scores: row.scores as Record<string, number>, notes: row.notes as Record<string, string>, overall: Number(row.overall) }));
      let cloudDraft: ReviewDraft | null = draftResult.data ? { weekId: draftResult.data.week_id, index: draftResult.data.current_index, scores: draftResult.data.scores as Record<string, number>, notes: draftResult.data.notes as Record<string, string> } : null;

      // One-time migration from the old browser-only version.
      try {
        let migrationSucceeded = true;
        const localReviews = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]") as Review[];
        const cloudByWeek = new Map(cloudReviews.map((review) => [review.id, review]));
        const newerLocal = localReviews.filter((review) => !cloudByWeek.has(review.id) || review.date > cloudByWeek.get(review.id)!.date);
        if (newerLocal.length) {
          const { error } = await supabase!.from("reviews").upsert(newerLocal.map((review) => ({ user_id: user.id, week_id: review.id, reviewed_at: review.date, week_label: review.week, scores: review.scores, notes: review.notes, overall: review.overall })));
          newerLocal.forEach((review) => cloudByWeek.set(review.id, review)); cloudReviews = [...cloudByWeek.values()];
          if (error) { migrationSucceeded = false; setSyncError("Your earlier browser data is safe, but has not synced yet."); }
        }
        const localDraft = JSON.parse(localStorage.getItem(DRAFT_KEY) ?? "null") as ReviewDraft | null;
        if (!cloudDraft && localDraft?.weekId === week.id) {
          const { error } = await supabase!.from("review_drafts").upsert({ user_id: user.id, week_id: localDraft.weekId, current_index: localDraft.index, scores: localDraft.scores, notes: localDraft.notes, updated_at: new Date().toISOString() });
          cloudDraft = localDraft;
          if (error) { migrationSucceeded = false; setSyncError("Your earlier in-progress review is safe, but has not synced yet."); }
        }
        if (migrationSucceeded) { localStorage.removeItem(STORAGE_KEY); localStorage.removeItem(DRAFT_KEY); }
      } catch { /* Invalid old browser data is ignored. */ }

      if (!active) return;
      setReviews(cloudReviews); setSavedDraft(cloudDraft); setHydrated(true);
    };
    void loadCloudData();
    return () => { active = false; };
  }, [user.id, week.id]);

  const persistDraft = useCallback(async (draft: ReviewDraft) => {
    setSavedDraft(draft);
    const { error } = await supabase!.from("review_drafts").upsert({ user_id: user.id, week_id: draft.weekId, current_index: draft.index, scores: draft.scores, notes: draft.notes, updated_at: new Date().toISOString() });
    if (error) setSyncError("Your latest progress has not synced yet."); else setSyncError("");
  }, [user.id]);

  useEffect(() => {
    if (!hydrated || reviewIndex === null) return;
    const draft = { weekId: week.id, index: reviewIndex, scores: draftScores, notes: draftNotes };
    const timer = window.setTimeout(() => { void persistDraft(draft); }, 500);
    return () => window.clearTimeout(timer);
  }, [draftNotes, draftScores, hydrated, persistDraft, reviewIndex, week.id]);

  const ordered = useMemo(() => [...reviews].sort((a, b) => a.date.localeCompare(b.date)), [reviews]);
  const latest = ordered.at(-1);
  const previous = ordered.at(-2);
  const latestDelta = delta(latest?.overall, previous?.overall);

  const startReview = () => {
    if (savedDraft?.weekId === week.id && Number.isInteger(savedDraft.index)) {
      setDraftScores(savedDraft.scores ?? {}); setDraftNotes(savedDraft.notes ?? {}); setReviewIndex(Math.max(0, Math.min(savedDraft.index, skills.length - 1)));
      return;
    }
    const existing = reviews.find((r) => r.id === week.id);
    setDraftScores(existing?.scores ?? {}); setDraftNotes(existing?.notes ?? {}); setReviewIndex(0);
  };

  const closeReview = () => {
    if (reviewIndex !== null) void persistDraft({ weekId: week.id, index: reviewIndex, scores: draftScores, notes: draftNotes });
    setReviewIndex(null);
  };
  const finishReview = async (completedScores = draftScores) => {
    if (Object.keys(completedScores).length !== skills.length) return;
    const overall = skills.reduce((sum, skill) => sum + completedScores[skill.id], 0) / skills.length;
    const entry: Review = { id: week.id, date: new Date().toISOString(), week: week.label.split(" · ")[0], scores: completedScores, notes: draftNotes, overall };
    const { error } = await supabase!.from("reviews").upsert({ user_id: user.id, week_id: entry.id, reviewed_at: entry.date, week_label: entry.week, scores: entry.scores, notes: entry.notes, overall: entry.overall });
    if (error) { setSyncError("This review could not be saved. Please check your connection and try again."); setReviewIndex(null); window.setTimeout(() => setReviewIndex(skills.length - 1), 0); return; }
    setReviews((current) => [...current.filter((r) => r.id !== entry.id), entry]);
    await supabase!.from("review_drafts").delete().eq("user_id", user.id);
    setSavedDraft(null); setSyncError("");
    setReviewIndex(null); setView("overview");
  };

  const exportData = () => {
    const blob = new Blob([JSON.stringify({ version: 1, exportedAt: new Date().toISOString(), reviews }, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = "northstar-review-backup.json"; a.click(); URL.revokeObjectURL(url);
  };

  const importData = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]; if (!file) return;
    try {
      const parsed = JSON.parse(await file.text());
      if (Array.isArray(parsed.reviews)) {
        const imported = parsed.reviews as Review[];
        const { error } = await supabase!.from("reviews").upsert(imported.map((review) => ({ user_id: user.id, week_id: review.id, reviewed_at: review.date, week_label: review.week, scores: review.scores, notes: review.notes, overall: review.overall })));
        if (error) throw error;
        const byWeek = new Map([...reviews, ...imported].map((review) => [review.id, review]));
        setReviews([...byWeek.values()]); setSettingsOpen(false); setSyncError("");
      }
    } catch { alert("That file could not be imported."); }
    event.target.value = "";
  };

  const deleteAllData = async () => {
    if (!confirm("Delete all Northstar reviews and your in-progress review from your synced account?")) return;
    const [{ error: reviewError }, { error: draftError }] = await Promise.all([
      supabase!.from("reviews").delete().eq("user_id", user.id),
      supabase!.from("review_drafts").delete().eq("user_id", user.id),
    ]);
    if (reviewError || draftError) { setSyncError("Your data could not be deleted. Please try again."); return; }
    setReviews([]); setDraftScores({}); setDraftNotes({}); setSavedDraft(null); setSettingsOpen(false); setSyncError("");
  };

  const scoreFor = (skill: Skill) => latest?.scores[skill.id];

  return (
    <main className="app-shell">
      {syncError && <button className="sync-error" onClick={() => window.location.reload()}>{syncError} <span>Retry</span></button>}
      <aside className="sidebar">
        <button className="brand-mark" onClick={() => setView("overview")} aria-label="Northstar home">N</button>
        <nav aria-label="Main navigation">
          <button className={`nav-dot ${view === "overview" ? "active" : ""}`} onClick={() => setView("overview")} aria-label="Overview"><House aria-hidden="true" /><span className="nav-label">Home</span></button>
          <button className={`nav-dot ${view === "trends" ? "active" : ""}`} onClick={() => setView("trends")} aria-label="Trends"><ChartNoAxesCombined aria-hidden="true" /><span className="nav-label">Trends</span></button>
          <button className={`nav-dot ${view === "practice" ? "active" : ""}`} onClick={() => setView("practice")} aria-label="Skills"><Sparkles aria-hidden="true" /><span className="nav-label">Practice</span></button>
          <button className={`nav-dot mobile-data ${settingsOpen ? "active" : ""}`} onClick={() => setSettingsOpen(true)} aria-label="Data settings"><Database aria-hidden="true" /><span className="nav-label">Data</span></button>
          <ThemeButton theme={theme} onToggle={onToggleTheme} className="nav-dot theme-nav" />
        </nav>
        <button className="avatar" onClick={() => setSettingsOpen(true)} aria-label="Data settings">TD</button>
      </aside>

      <section className="page">
        {view === "overview" && <>
          <section className="home-fold">
            <header className="topbar">
              <div><p className="eyebrow">{week.label}</p><h1>Your week,<br className="desktop-break" /> in focus.</h1></div>
            </header>

            <div className="hero-grid home-score-grid">
              <article className="score-card">
                <p className="card-label">OVERALL SCORE</p>
                <div className="score-row"><strong>{hydrated ? formatScore(latest?.overall) : "—"}</strong>{latest && <span>/10</span>}{latestDelta && <div className={`score-change ${latestDelta.up ? "" : "negative"}`}>{latestDelta.up ? "↑" : "↓"} {latestDelta.value.replace(/^[-+−]/, "")} <small>vs last review</small></div>}</div>
                {ordered.length ? <TrendBars reviews={ordered.slice(-8)} value={(r) => r.overall} /> : <div className="empty-trend"><span>01</span><i /><span>10</span><p>Your trend begins after your first review.</p></div>}
              </article>
            </div>

            <button className="home-review-cta" onClick={startReview}>
              <span><small>WEEKLY PRACTICE</small>{reviews.some((r) => r.id === week.id) ? "Update your weekly review" : "Start your weekly review"}</span>
              <b>→</b>
            </button>
          </section>

          <article className="reminder-strip">
            <div><p>YOUR WEEKLY REMINDER</p><span>“</span></div>
            <blockquote>Progress is the quiet result of showing up, reflecting honestly, and choosing again.</blockquote>
          </article>

          <section className="skills-section">
            <div className="section-heading"><div><p className="eyebrow">YOUR PRACTICE</p><h2>All 13 skills</h2></div></div>
            <div className="skill-table">
              {skills.map((skill, index) => {
                const value = scoreFor(skill); const movement = delta(value, previous?.scores[skill.id]);
                return <article className="skill-row" key={skill.id}><span className="skill-index">{String(index + 1).padStart(2, "0")}</span><div className="skill-name"><h3>{skill.title}</h3><div className="mini-bar"><i style={{ width: `${(value ?? 0) * 10}%` }} /></div></div><strong>{formatScore(value)}</strong><span className={`change ${movement && !movement.up ? "down" : ""}`}>{movement?.value ?? ""}</span><button onClick={() => setSelectedSkill(skill)} aria-label={`See ${skill.title} trend`}>↗</button></article>;
              })}
            </div>
          </section>
        </>}

        {view === "trends" && <TrendsView reviews={ordered} onStart={startReview} onSkill={setSelectedSkill} />}
        {view === "practice" && <PracticeView latest={latest} previous={previous} onSkill={setSelectedSkill} />}
      </section>

      {reviewIndex !== null && <ReviewFlow key={reviewIndex} index={reviewIndex} notes={draftNotes} onChoose={(id, value) => { const completedScores = { ...draftScores, [id]: value }; setDraftScores(completedScores); if (reviewIndex === skills.length - 1) finishReview(completedScores); else setReviewIndex(reviewIndex + 1); }} onNote={(id, value) => setDraftNotes((x) => ({ ...x, [id]: value }))} onBack={() => reviewIndex === 0 ? closeReview() : setReviewIndex(reviewIndex - 1)} onClose={closeReview} />}
      {selectedSkill && <SkillDetail skill={selectedSkill} reviews={ordered} onClose={() => setSelectedSkill(null)} />}
      {settingsOpen && <DataSettings email={user.email ?? "Signed-in account"} count={reviews.length} onClose={() => setSettingsOpen(false)} onExport={exportData} onImport={() => fileInput.current?.click()} onReset={() => void deleteAllData()} onSignOut={() => void supabase!.auth.signOut()} />}
      <input ref={fileInput} className="hidden-input" type="file" accept="application/json" onChange={importData} />
    </main>
  );
}

function TrendBars({ reviews, value }: { reviews: Review[]; value: (review: Review) => number | undefined }) {
  return <div className="trend-bars" aria-label="Score trend">{reviews.map((review) => { const score = value(review); return <div className="trend-column" key={review.id} title={`${review.week}: ${score?.toFixed(1) ?? "No score"}`}><span>{score?.toFixed(1)}</span><i style={{ height: `${(score ?? 0) * 10}%` }} /><small>{review.week.replace("WEEK ", "W")}</small></div>; })}</div>;
}

function TrendsView({ reviews, onStart, onSkill }: { reviews: Review[]; onStart: () => void; onSkill: (skill: Skill) => void }) {
  const latest = reviews.at(-1); const previous = reviews.at(-2);
  const ranked = [...skills].sort((a, b) => (latest?.scores[b.id] ?? 0) - (latest?.scores[a.id] ?? 0));
  return <>
    <header className="inner-header"><div><p className="eyebrow">PROGRESS OVER TIME</p><h1>See the pattern.</h1><p className="header-copy">The point is not perfection. It is seeing clearly enough to choose where your attention goes next.</p></div></header>
    <section className="wide-chart"><div className="section-heading"><div><p className="eyebrow">OVERALL TREND</p><h2>{formatScore(latest?.overall)}{latest && <small> / 10</small>}</h2></div><span className="history-count">{reviews.length} {reviews.length === 1 ? "review" : "reviews"}</span></div>{reviews.length ? <TrendBars reviews={reviews.slice(-12)} value={(r) => r.overall} /> : <EmptyState onStart={onStart} />}</section>
    {latest && <section className="rankings"><div className="section-heading"><div><p className="eyebrow">LATEST REVIEW</p><h2>Strengths & opportunities</h2></div></div><div className="ranking-grid"><div><p className="rank-label">STRONGEST</p>{ranked.slice(0,3).map((skill, i) => <RankRow key={skill.id} rank={i+1} skill={skill} score={latest.scores[skill.id]} movement={delta(latest.scores[skill.id], previous?.scores[skill.id])} onClick={() => onSkill(skill)} />)}</div><div><p className="rank-label">ROOM TO GROW</p>{ranked.slice(-3).reverse().map((skill, i) => <RankRow key={skill.id} rank={i+1} skill={skill} score={latest.scores[skill.id]} movement={delta(latest.scores[skill.id], previous?.scores[skill.id])} onClick={() => onSkill(skill)} />)}</div></div></section>}
  </>;
}

function RankRow({ rank, skill, score, movement, onClick }: { rank: number; skill: Skill; score: number; movement: ReturnType<typeof delta>; onClick: () => void }) {
  return <button className="rank-row" onClick={onClick}><span>0{rank}</span><strong>{skill.title}</strong><b>{score.toFixed(1)}</b><i className={movement && !movement.up ? "negative" : ""}>{movement?.value}</i><em>↗</em></button>;
}

function PracticeView({ latest, previous, onSkill }: { latest?: Review; previous?: Review; onSkill: (skill: Skill) => void }) {
  return <><header className="inner-header"><div><p className="eyebrow">THE PRACTICE</p><h1>Thirteen ways<br />to grow.</h1><p className="header-copy">A personal operating system for becoming more intentional, more useful, and more human.</p></div></header><section className="practice-list">{skills.map((skill, index) => { const score = latest?.scores[skill.id]; const movement = delta(score, previous?.scores[skill.id]); return <button className="practice-card" key={skill.id} onClick={() => onSkill(skill)}><span className="practice-number">{String(index+1).padStart(2,"0")}</span><div><h2>{skill.title}</h2><p>{skill.description}</p></div><div className="practice-score"><strong>{formatScore(score)}</strong><small className={movement && !movement.up ? "negative" : ""}>{movement?.value}</small></div><span className="open-arrow">↗</span></button>; })}</section></>;
}

function ReviewFlow({ index, notes, onChoose, onNote, onBack, onClose }: { index: number; notes: Record<string, string>; onChoose: (id: string, value: number) => void; onNote: (id: string, value: string) => void; onBack: () => void; onClose: () => void }) {
  const skill = skills[index];
  const [chosen, setChosen] = useState<number>();
  const [leaving, setLeaving] = useState(false);
  const advanceTimer = useRef<number | null>(null);
  const choose = useCallback((value: number) => {
    if (leaving) return;
    setChosen(value);
    setLeaving(true);
    advanceTimer.current = window.setTimeout(() => onChoose(skill.id, value), 360);
  }, [leaving, onChoose, skill.id]);
  useEffect(() => () => { if (advanceTimer.current !== null) window.clearTimeout(advanceTimer.current); }, []);
  useEffect(() => { const handler = (e: KeyboardEvent) => { if (/^[1-9]$/.test(e.key)) choose(Number(e.key)); if (e.key === "0") choose(10); if (e.key === "Escape") onClose(); }; window.addEventListener("keydown", handler); return () => window.removeEventListener("keydown", handler); }, [choose, onClose]);
  return <div className="review-screen"><header className="review-top"><button className="brand-mark" onClick={onClose}>N</button><div className="review-progress"><i style={{ width: `${((index+1)/skills.length)*100}%` }} /></div><span>{String(index+1).padStart(2,"0")} / {skills.length}</span><button className="close-button" onClick={onClose} aria-label="Close">×</button></header><section className={`review-content ${leaving ? "point-leaving" : ""}`}><p className="eyebrow">{skill.title.toUpperCase()}</p><h2>{skill.prompt}</h2><p className="review-description">{skill.description}</p><div className="rating-grid">{Array.from({length:10},(_,i) => <button className={chosen === i+1 ? "selected" : ""} disabled={leaving} aria-pressed={chosen === i+1} onClick={() => choose(i+1)} key={i}><span>{i+1}</span></button>)}</div><div className="rating-labels"><span>Needs attention</span><span>Exceptional</span></div><label className="reflection-label"><span>One thing worth remembering <small>· optional, add before rating</small></span><textarea value={notes[skill.id] ?? ""} onChange={(e) => onNote(skill.id, e.target.value)} placeholder="A moment, lesson, or intention…" rows={2} /></label></section><footer className="review-footer"><button className="back-button" onClick={onBack}>← <span>{index === 0 ? "Exit" : "Back"}</span></button><p className="auto-advance-hint">Choose a number to {index === skills.length-1 ? "save this week" : "continue"} <span>→</span></p></footer></div>;
}

function SkillDetail({ skill, reviews, onClose }: { skill: Skill; reviews: Review[]; onClose: () => void }) {
  const latest = reviews.at(-1); const notes = reviews.filter((r) => r.notes?.[skill.id]).slice(-3).reverse();
  return <dialog open className="modal-backdrop"><section className="detail-modal"><button className="close-button" onClick={onClose}>×</button><p className="eyebrow">INDIVIDUAL TREND</p><h2>{skill.title}</h2><p className="detail-description">{skill.description}</p><div className="detail-score"><strong>{formatScore(latest?.scores[skill.id])}</strong>{latest && <span>/10 latest</span>}</div>{reviews.length ? <TrendBars reviews={reviews.slice(-10)} value={(r) => r.scores[skill.id]} /> : <p className="no-data-copy">Complete your first weekly review to begin this trend.</p>}{notes.length > 0 && <div className="past-notes"><p className="eyebrow">REFLECTIONS</p>{notes.map((r) => <article key={r.id}><span>{r.week}</span><p>{r.notes[skill.id]}</p></article>)}</div>}</section></dialog>;
}

function DataSettings({ email, count, onClose, onExport, onImport, onReset, onSignOut }: { email: string; count: number; onClose: () => void; onExport: () => void; onImport: () => void; onReset: () => void; onSignOut: () => void }) {
  return <dialog open className="modal-backdrop"><section className="settings-modal"><button className="close-button" onClick={onClose}>×</button><p className="eyebrow">YOUR DATA</p><h2>Private and synced.</h2><p>Your {count} saved {count === 1 ? "review is" : "reviews are"} encrypted in transit and synced to your signed-in account, ready on your phone and computer.</p><div className="account-row"><Cloud aria-hidden="true" /><span><small>SYNCED AS</small>{email}</span></div><div className="settings-actions"><button onClick={onExport} disabled={!count}>Export backup <span>↓</span></button><button onClick={onImport}>Import backup <span>↑</span></button><button onClick={onSignOut}>Sign out <LogOut aria-hidden="true" /></button><button className="danger" onClick={onReset} disabled={!count}>Delete all data</button></div></section></dialog>;
}

function EmptyState({ onStart }: { onStart: () => void }) { return <div className="empty-state"><p>No scores yet. Your first honest check-in is all it takes to begin.</p><button className="primary-button" onClick={onStart}><span>Start first review</span><b>→</b></button></div>; }

function ThemeButton({ theme, onToggle, className = "theme-button" }: { theme: Theme; onToggle: () => void; className?: string }) {
  const nextTheme = theme === "light" ? "dark" : "light";
  return <button className={className} onClick={onToggle} aria-label={`Switch to ${nextTheme} mode`} title={`Switch to ${nextTheme} mode`}>{theme === "light" ? <Moon aria-hidden="true" /> : <Sun aria-hidden="true" />}<span className="nav-label">{theme === "light" ? "Dark" : "Light"}</span></button>;
}

function LoadingScreen({ theme, onToggleTheme }: { theme: Theme; onToggleTheme: () => void }) {
  return <main className="auth-screen"><ThemeButton theme={theme} onToggle={onToggleTheme} /><div className="auth-card"><div className="auth-brand">N</div><p className="eyebrow">NORTHSTAR</p><h1>Finding your progress…</h1><div className="loading-line"><i /></div></div></main>;
}

function CloudSetupNeeded({ theme, onToggleTheme }: { theme: Theme; onToggleTheme: () => void }) {
  return <main className="auth-screen"><ThemeButton theme={theme} onToggle={onToggleTheme} /><div className="auth-card"><div className="auth-brand">N</div><p className="eyebrow">ONE-TIME SETUP</p><h1>Cloud connection needed.</h1><p className="auth-copy">Add the Supabase project details to finish enabling private sync.</p></div></main>;
}

function SignInScreen({ theme, onToggleTheme }: { theme: Theme; onToggleTheme: () => void }) {
  const [status, setStatus] = useState<"idle" | "opening" | "error">("idle");
  const signInWithGoogle = async () => {
    setStatus("opening");
    const redirectTo = new URL(import.meta.env.BASE_URL ?? "/", window.location.origin).href;
    const { error } = await supabase!.auth.signInWithOAuth({ provider: "google", options: { redirectTo } });
    if (error) setStatus("error");
  };
  return <main className="auth-screen"><ThemeButton theme={theme} onToggle={onToggleTheme} /><section className="auth-card"><div className="auth-brand">N</div><p className="eyebrow">NORTHSTAR · PRIVATE SYNC</p><h1>Your growth,<br />wherever you are.</h1><p className="auth-copy">Continue with your Google account to keep reviews private and seamlessly synced between phone and computer.</p><button className="google-signin" onClick={signInWithGoogle} disabled={status === "opening"}><span className="google-mark" aria-hidden="true"><svg viewBox="0 0 24 24"><path fill="#4285f4" d="M21.6 12.2c0-.7-.1-1.4-.2-2H12v3.9h5.4a4.6 4.6 0 0 1-2 3v2.5h3.3c1.9-1.8 2.9-4.4 2.9-7.4Z"/><path fill="#34a853" d="M12 22c2.7 0 5-.9 6.7-2.4l-3.3-2.5c-.9.6-2.1 1-3.4 1a5.9 5.9 0 0 1-5.5-4.1H3.1v2.6A10 10 0 0 0 12 22Z"/><path fill="#fbbc05" d="M6.5 14a6 6 0 0 1 0-3.9V7.5H3.1a10 10 0 0 0 0 9.1L6.5 14Z"/><path fill="#ea4335" d="M12 6a5.4 5.4 0 0 1 3.8 1.5l2.9-2.9A9.8 9.8 0 0 0 3.1 7.5l3.4 2.6A5.9 5.9 0 0 1 12 6Z"/></svg></span><strong>{status === "opening" ? "Opening Google…" : "Continue with Google"}</strong><b>→</b></button>{status === "error" && <p className="auth-error">Google sign-in could not start. Please try again.</p>}<p className="auth-footnote"><Cloud aria-hidden="true" /> Northstar only uses your Google identity to protect your private data.</p></section></main>;
}
