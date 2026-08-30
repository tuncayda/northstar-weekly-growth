"use client";

import { ChangeEvent, useEffect, useMemo, useRef, useState } from "react";

type Skill = { id: string; title: string; prompt: string; description: string };
type Review = { id: string; date: string; week: string; scores: Record<string, number>; notes: Record<string, string>; overall: number };
type View = "overview" | "trends" | "practice";

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
  const [view, setView] = useState<View>("overview");
  const [reviews, setReviews] = useState<Review[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [reviewIndex, setReviewIndex] = useState<number | null>(null);
  const [draftScores, setDraftScores] = useState<Record<string, number>>({});
  const [draftNotes, setDraftNotes] = useState<Record<string, string>>({});
  const [selectedSkill, setSelectedSkill] = useState<Skill | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const week = getWeekInfo();

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try { const saved = localStorage.getItem(STORAGE_KEY); if (saved) setReviews(JSON.parse(saved)); } catch { /* Start clean if stored data is malformed. */ }
      setHydrated(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => { if (hydrated) localStorage.setItem(STORAGE_KEY, JSON.stringify(reviews)); }, [reviews, hydrated]);

  useEffect(() => {
    if (!hydrated || reviewIndex === null) return;
    localStorage.setItem(DRAFT_KEY, JSON.stringify({ weekId: week.id, index: reviewIndex, scores: draftScores, notes: draftNotes }));
  }, [draftNotes, draftScores, hydrated, reviewIndex, week.id]);

  const ordered = useMemo(() => [...reviews].sort((a, b) => a.date.localeCompare(b.date)), [reviews]);
  const latest = ordered.at(-1);
  const previous = ordered.at(-2);
  const latestDelta = delta(latest?.overall, previous?.overall);

  const startReview = () => {
    try {
      const savedDraft = localStorage.getItem(DRAFT_KEY);
      if (savedDraft) {
        const draft = JSON.parse(savedDraft);
        if (draft.weekId === week.id && Number.isInteger(draft.index)) {
          setDraftScores(draft.scores ?? {}); setDraftNotes(draft.notes ?? {}); setReviewIndex(Math.max(0, Math.min(draft.index, skills.length - 1)));
          return;
        }
      }
    } catch { /* Ignore an invalid draft and start from saved weekly data. */ }
    const existing = reviews.find((r) => r.id === week.id);
    setDraftScores(existing?.scores ?? {}); setDraftNotes(existing?.notes ?? {}); setReviewIndex(0);
  };

  const closeReview = () => setReviewIndex(null);
  const finishReview = (completedScores = draftScores) => {
    if (Object.keys(completedScores).length !== skills.length) return;
    const overall = skills.reduce((sum, skill) => sum + completedScores[skill.id], 0) / skills.length;
    const entry: Review = { id: week.id, date: new Date().toISOString(), week: week.label.split(" · ")[0], scores: completedScores, notes: draftNotes, overall };
    setReviews((current) => [...current.filter((r) => r.id !== entry.id), entry]);
    localStorage.removeItem(DRAFT_KEY);
    setReviewIndex(null); setView("overview");
  };

  const exportData = () => {
    const blob = new Blob([JSON.stringify({ version: 1, exportedAt: new Date().toISOString(), reviews }, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = "northstar-review-backup.json"; a.click(); URL.revokeObjectURL(url);
  };

  const importData = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]; if (!file) return;
    try { const parsed = JSON.parse(await file.text()); if (Array.isArray(parsed.reviews)) { setReviews(parsed.reviews); localStorage.removeItem(DRAFT_KEY); setSettingsOpen(false); } } catch { alert("That file could not be imported."); }
    event.target.value = "";
  };

  const scoreFor = (skill: Skill) => latest?.scores[skill.id];

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <button className="brand-mark" onClick={() => setView("overview")} aria-label="Northstar home">N</button>
        <nav aria-label="Main navigation">
          <button className={`nav-dot ${view === "overview" ? "active" : ""}`} onClick={() => setView("overview")} aria-label="Overview"><span>⌂</span></button>
          <button className={`nav-dot ${view === "trends" ? "active" : ""}`} onClick={() => setView("trends")} aria-label="Trends"><span>↗</span></button>
          <button className={`nav-dot ${view === "practice" ? "active" : ""}`} onClick={() => setView("practice")} aria-label="Skills"><span>◆</span></button>
        </nav>
        <button className="avatar" onClick={() => setSettingsOpen(true)} aria-label="Data settings">TD</button>
      </aside>

      <section className="page">
        {view === "overview" && <>
          <header className="topbar">
            <div><p className="eyebrow">{week.label}</p><h1>Your week,<br className="desktop-break" /> in focus.</h1></div>
            <button className="primary-button" onClick={startReview}><span>{reviews.some((r) => r.id === week.id) ? "Update weekly review" : "Start weekly review"}</span><b>→</b></button>
          </header>

          <div className="hero-grid">
            <article className="score-card">
              <p className="card-label">OVERALL SCORE</p>
              <div className="score-row"><strong>{hydrated ? formatScore(latest?.overall) : "—"}</strong>{latest && <span>/10</span>}{latestDelta && <div className={`score-change ${latestDelta.up ? "" : "negative"}`}>{latestDelta.up ? "↑" : "↓"} {latestDelta.value.replace(/^[-+−]/, "")} <small>vs last review</small></div>}</div>
              {ordered.length ? <TrendBars reviews={ordered.slice(-8)} value={(r) => r.overall} /> : <div className="empty-trend"><span>01</span><i /><span>10</span><p>Your trend begins after your first review.</p></div>}
            </article>
            <article className="quote-card"><div className="quote-mark">“</div><blockquote>Progress is the quiet result of showing up, reflecting honestly, and choosing again.</blockquote><p>YOUR WEEKLY REMINDER</p></article>
          </div>

          <section className="skills-section">
            <div className="section-heading"><div><p className="eyebrow">YOUR PRACTICE</p><h2>Skills in motion</h2></div><button className="text-button" onClick={() => setView("practice")}>View all 13 <span>→</span></button></div>
            <div className="skill-table">
              {skills.slice(0, 5).map((skill, index) => {
                const value = scoreFor(skill); const movement = delta(value, previous?.scores[skill.id]);
                return <article className="skill-row" key={skill.id}><span className="skill-index">{String(index + 1).padStart(2, "0")}</span><div className="skill-name"><h3>{skill.title}</h3><div className="mini-bar"><i style={{ width: `${(value ?? 0) * 10}%` }} /></div></div><strong>{formatScore(value)}</strong><span className={`change ${movement && !movement.up ? "down" : ""}`}>{movement?.value ?? ""}</span><button onClick={() => setSelectedSkill(skill)} aria-label={`See ${skill.title} trend`}>↗</button></article>;
              })}
            </div>
          </section>
        </>}

        {view === "trends" && <TrendsView reviews={ordered} onStart={startReview} onSkill={setSelectedSkill} />}
        {view === "practice" && <PracticeView latest={latest} previous={previous} onSkill={setSelectedSkill} />}
      </section>

      {reviewIndex !== null && <ReviewFlow index={reviewIndex} scores={draftScores} notes={draftNotes} onChoose={(id, value) => { const completedScores = { ...draftScores, [id]: value }; setDraftScores(completedScores); if (reviewIndex === skills.length - 1) finishReview(completedScores); else setReviewIndex(reviewIndex + 1); }} onNote={(id, value) => setDraftNotes((x) => ({ ...x, [id]: value }))} onBack={() => reviewIndex === 0 ? closeReview() : setReviewIndex(reviewIndex - 1)} onClose={closeReview} />}
      {selectedSkill && <SkillDetail skill={selectedSkill} reviews={ordered} onClose={() => setSelectedSkill(null)} />}
      {settingsOpen && <DataSettings count={reviews.length} onClose={() => setSettingsOpen(false)} onExport={exportData} onImport={() => fileInput.current?.click()} onReset={() => { if (confirm("Delete all saved Northstar reviews on this device?")) { setReviews([]); setDraftScores({}); setDraftNotes({}); localStorage.removeItem(DRAFT_KEY); setSettingsOpen(false); } }} />}
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

function ReviewFlow({ index, scores, notes, onChoose, onNote, onBack, onClose }: { index: number; scores: Record<string, number>; notes: Record<string, string>; onChoose: (id: string, value: number) => void; onNote: (id: string, value: string) => void; onBack: () => void; onClose: () => void }) {
  const skill = skills[index]; const selected = scores[skill.id];
  useEffect(() => { const handler = (e: KeyboardEvent) => { if (/^[1-9]$/.test(e.key)) onChoose(skill.id, Number(e.key)); if (e.key === "0") onChoose(skill.id, 10); if (e.key === "Escape") onClose(); }; window.addEventListener("keydown", handler); return () => window.removeEventListener("keydown", handler); }, [skill.id, onChoose, onClose]);
  return <div className="review-screen"><header className="review-top"><button className="brand-mark" onClick={onClose}>N</button><div className="review-progress"><i style={{ width: `${((index+1)/skills.length)*100}%` }} /></div><span>{String(index+1).padStart(2,"0")} / {skills.length}</span><button className="close-button" onClick={onClose} aria-label="Close">×</button></header><section className="review-content"><p className="eyebrow">{skill.title.toUpperCase()}</p><h2>{skill.prompt}</h2><p className="review-description">{skill.description}</p><div className="rating-grid">{Array.from({length:10},(_,i) => <button className={selected === i+1 ? "selected" : ""} onClick={() => onChoose(skill.id, i+1)} key={i}><span>{i+1}</span></button>)}</div><div className="rating-labels"><span>Needs attention</span><span>Exceptional</span></div><label className="reflection-label"><span>One thing worth remembering <small>· optional, add before rating</small></span><textarea value={notes[skill.id] ?? ""} onChange={(e) => onNote(skill.id, e.target.value)} placeholder="A moment, lesson, or intention…" rows={2} /></label></section><footer className="review-footer"><button className="back-button" onClick={onBack}>← <span>{index === 0 ? "Exit" : "Back"}</span></button><p className="auto-advance-hint">Choose a number to {index === skills.length-1 ? "save this week" : "continue"} <span>→</span></p></footer></div>;
}

function SkillDetail({ skill, reviews, onClose }: { skill: Skill; reviews: Review[]; onClose: () => void }) {
  const latest = reviews.at(-1); const notes = reviews.filter((r) => r.notes?.[skill.id]).slice(-3).reverse();
  return <dialog open className="modal-backdrop"><section className="detail-modal"><button className="close-button" onClick={onClose}>×</button><p className="eyebrow">INDIVIDUAL TREND</p><h2>{skill.title}</h2><p className="detail-description">{skill.description}</p><div className="detail-score"><strong>{formatScore(latest?.scores[skill.id])}</strong>{latest && <span>/10 latest</span>}</div>{reviews.length ? <TrendBars reviews={reviews.slice(-10)} value={(r) => r.scores[skill.id]} /> : <p className="no-data-copy">Complete your first weekly review to begin this trend.</p>}{notes.length > 0 && <div className="past-notes"><p className="eyebrow">REFLECTIONS</p>{notes.map((r) => <article key={r.id}><span>{r.week}</span><p>{r.notes[skill.id]}</p></article>)}</div>}</section></dialog>;
}

function DataSettings({ count, onClose, onExport, onImport, onReset }: { count: number; onClose: () => void; onExport: () => void; onImport: () => void; onReset: () => void }) {
  return <dialog open className="modal-backdrop"><section className="settings-modal"><button className="close-button" onClick={onClose}>×</button><p className="eyebrow">YOUR DATA</p><h2>Private by default.</h2><p>Your {count} saved {count === 1 ? "review lives" : "reviews live"} only in this browser. Export a backup before changing devices or clearing browser data.</p><div className="settings-actions"><button onClick={onExport} disabled={!count}>Export backup <span>↓</span></button><button onClick={onImport}>Import backup <span>↑</span></button><button className="danger" onClick={onReset} disabled={!count}>Delete all data</button></div></section></dialog>;
}

function EmptyState({ onStart }: { onStart: () => void }) { return <div className="empty-state"><p>No scores yet. Your first honest check-in is all it takes to begin.</p><button className="primary-button" onClick={onStart}><span>Start first review</span><b>→</b></button></div>; }
