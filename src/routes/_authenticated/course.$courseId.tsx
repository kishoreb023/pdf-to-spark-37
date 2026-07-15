import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState, useEffect, useRef } from "react";
import ReactMarkdown from "react-markdown";
import {
  getCourseFull,
  getOrGenerateLesson,
  toggleLessonComplete,
  sendChatMessage,
  getChatHistory,
  generateQuiz,
  submitQuiz,
} from "@/lib/course.functions";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import {
  ArrowLeft,
  BookOpen,
  Brain,
  CheckCircle2,
  Loader2,
  MessageSquare,
  Send,
  Sparkles,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/course/$courseId")({
  component: CourseView,
});

type Tab = "lesson" | "chat" | "quiz";

function CourseView() {
  const { courseId } = Route.useParams();
  const qc = useQueryClient();
  const load = useServerFn(getCourseFull);
  const loadLesson = useServerFn(getOrGenerateLesson);
  const toggle = useServerFn(toggleLessonComplete);

  const { data, isLoading } = useQuery({
    queryKey: ["course", courseId],
    queryFn: () => load({ data: { courseId } }),
  });

  const allLessons = useMemo(() => {
    if (!data) return [] as { id: string; title: string; chapterId: string }[];
    return data.chapters.flatMap((c) =>
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (c.lessons ?? []).map((l: any) => ({ id: l.id, title: l.title, chapterId: c.id })),
    );
  }, [data]);

  const [activeLessonId, setActiveLessonId] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("lesson");

  useEffect(() => {
    if (!activeLessonId && allLessons[0]) setActiveLessonId(allLessons[0].id);
  }, [allLessons, activeLessonId]);

  const activeChapterId = allLessons.find((l) => l.id === activeLessonId)?.chapterId ?? null;

  const lessonQuery = useQuery({
    queryKey: ["lesson", activeLessonId],
    queryFn: () => loadLesson({ data: { lessonId: activeLessonId! } }),
    enabled: !!activeLessonId,
  });

  const toggleMut = useMutation({
    mutationFn: (v: { lessonId: string; completed: boolean }) =>
      toggle({ data: { lessonId: v.lessonId, courseId, completed: v.completed } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["course", courseId] }),
  });

  if (isLoading || !data) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const { course, chapters, completedLessonIds } = data;
  const completedSet = new Set(completedLessonIds);
  const totalLessons = allLessons.length;
  const doneLessons = allLessons.filter((l) => completedSet.has(l.id)).length;
  const percent = totalLessons ? Math.round((doneLessons / totalLessons) * 100) : 0;

  if (course.status === "processing" || course.status === "pending") {
    return (
      <div className="container mx-auto px-6 py-16 text-center">
        <Loader2 className="mx-auto mb-4 h-8 w-8 animate-spin text-primary" />
        <p>Generating your course… refresh in a moment.</p>
      </div>
    );
  }
  if (course.status === "failed") {
    return (
      <div className="container mx-auto px-6 py-16 text-center">
        <p className="text-destructive">Failed to generate course: {course.error_message}</p>
        <Link to="/dashboard" className="mt-4 inline-block underline">
          Back to dashboard
        </Link>
      </div>
    );
  }

  return (
    <div className="container mx-auto grid gap-6 px-4 py-6 lg:grid-cols-[320px_1fr]">
      {/* Sidebar */}
      <aside className="lg:sticky lg:top-20 lg:h-[calc(100vh-6rem)] lg:overflow-y-auto">
        <Link to="/dashboard" className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Dashboard
        </Link>
        <h1 className="text-xl font-bold">{course.title}</h1>
        {course.description && <p className="mt-1 text-sm text-muted-foreground">{course.description}</p>}
        <div className="mt-3 flex flex-wrap gap-2 text-xs">
          {course.difficulty && <span className="rounded-full bg-primary/10 px-2 py-0.5 text-primary">{course.difficulty}</span>}
          {course.estimated_time && <span className="rounded-full bg-muted px-2 py-0.5 text-muted-foreground">{course.estimated_time}</span>}
        </div>
        <div className="mt-4">
          <div className="mb-1 flex justify-between text-xs text-muted-foreground">
            <span>Progress</span>
            <span>{percent}%</span>
          </div>
          <Progress value={percent} className="h-2" />
        </div>

        {Array.isArray(course.learning_objectives) && course.learning_objectives.length > 0 && (
          <details className="mt-4 rounded-lg border border-border bg-card p-3 text-sm">
            <summary className="cursor-pointer font-medium">Learning objectives</summary>
            <ul className="mt-2 list-disc pl-5 text-muted-foreground">
              {(course.learning_objectives as string[]).map((o, i) => (
                <li key={i}>{o}</li>
              ))}
            </ul>
          </details>
        )}

        <nav className="mt-5 space-y-4">
          {chapters.map((ch, ci) => (
            <div key={ch.id}>
              <div className="mb-1 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                <BookOpen className="h-3.5 w-3.5" /> Chapter {ci + 1}
              </div>
              <div className="text-sm font-medium">{ch.title}</div>
              <ul className="mt-2 space-y-1">
                {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                {(ch.lessons ?? []).map((l: any) => {
                  const active = l.id === activeLessonId;
                  const done = completedSet.has(l.id);
                  return (
                    <li key={l.id}>
                      <button
                        onClick={() => {
                          setActiveLessonId(l.id);
                          setTab("lesson");
                        }}
                        className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition ${
                          active ? "bg-primary/10 text-primary" : "hover:bg-muted"
                        }`}
                      >
                        {done ? (
                          <CheckCircle2 className="h-4 w-4 shrink-0 text-primary" />
                        ) : (
                          <span className="h-4 w-4 shrink-0 rounded-full border border-muted-foreground/40" />
                        )}
                        <span className="line-clamp-2">{l.title}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>
      </aside>

      {/* Main */}
      <main>
        <div className="mb-4 flex gap-2 border-b border-border">
          {(["lesson", "chat", "quiz"] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`inline-flex items-center gap-1.5 border-b-2 px-4 py-2 text-sm font-medium capitalize transition ${
                tab === t ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {t === "lesson" && <BookOpen className="h-4 w-4" />}
              {t === "chat" && <MessageSquare className="h-4 w-4" />}
              {t === "quiz" && <Brain className="h-4 w-4" />}
              {t === "chat" ? "AI Tutor" : t}
            </button>
          ))}
        </div>

        {tab === "lesson" && (
          <LessonPanel
            lessonQuery={lessonQuery}
            lessonId={activeLessonId}
            courseId={courseId}
            completed={activeLessonId ? completedSet.has(activeLessonId) : false}
            onToggle={(completed) => activeLessonId && toggleMut.mutate({ lessonId: activeLessonId, completed })}
          />
        )}
        {tab === "chat" && <ChatPanel courseId={courseId} />}
        {tab === "quiz" && <QuizPanel courseId={courseId} chapterId={activeChapterId} />}
      </main>
    </div>
  );
}

// ---------- Lesson ----------
function LessonPanel({
  lessonQuery,
  lessonId,
  completed,
  onToggle,
}: {
  lessonQuery: ReturnType<typeof useQuery>;
  lessonId: string | null;
  courseId: string;
  completed: boolean;
  onToggle: (c: boolean) => void;
}) {
  if (!lessonId) return <p className="text-muted-foreground">Select a lesson to begin.</p>;
  if (lessonQuery.isLoading || lessonQuery.isFetching) {
    return (
      <div className="flex items-center gap-2 py-10 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Generating lesson…
      </div>
    );
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const lesson = lessonQuery.data as any;
  if (!lesson) return null;
  const c = lesson.content ?? {};

  return (
    <article className="max-w-3xl">
      <header className="mb-6 flex items-start justify-between gap-4">
        <h2 className="text-2xl font-bold">{lesson.title}</h2>
        <label className="flex shrink-0 items-center gap-2 rounded-md border border-border bg-card px-3 py-2 text-sm">
          <Checkbox checked={completed} onCheckedChange={(v) => onToggle(!!v)} />
          Mark complete
        </label>
      </header>

      {c.explanation && (
        <div className="prose prose-sm max-w-none dark:prose-invert">
          <ReactMarkdown>{c.explanation}</ReactMarkdown>
        </div>
      )}

      {Array.isArray(c.key_takeaways) && c.key_takeaways.length > 0 && (
        <Card title="Key takeaways" icon={<Sparkles className="h-4 w-4 text-primary" />}>
          <ul className="list-disc space-y-1 pl-5 text-sm">
            {c.key_takeaways.map((k: string, i: number) => <li key={i}>{k}</li>)}
          </ul>
        </Card>
      )}

      {Array.isArray(c.examples) && c.examples.length > 0 && (
        <Card title="Real-world examples">
          <ul className="space-y-2 text-sm">
            {c.examples.map((e: string, i: number) => <li key={i} className="rounded-md bg-muted p-3">{e}</li>)}
          </ul>
        </Card>
      )}

      {Array.isArray(c.notes) && c.notes.length > 0 && (
        <Card title="Important notes">
          <ul className="list-disc space-y-1 pl-5 text-sm">
            {c.notes.map((n: string, i: number) => <li key={i}>{n}</li>)}
          </ul>
        </Card>
      )}

      {c.summary && (
        <Card title="Summary">
          <p className="text-sm">{c.summary}</p>
        </Card>
      )}
    </article>
  );
}

function Card({ title, icon, children }: { title: string; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="mt-6 rounded-xl border border-border bg-card p-5">
      <h3 className="mb-3 flex items-center gap-2 font-semibold">
        {icon} {title}
      </h3>
      {children}
    </section>
  );
}

// ---------- Chat ----------
function ChatPanel({ courseId }: { courseId: string }) {
  const history = useServerFn(getChatHistory);
  const send = useServerFn(sendChatMessage);
  const qc = useQueryClient();
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const { data: msgs = [] } = useQuery({
    queryKey: ["chat", courseId],
    queryFn: () => history({ data: { courseId } }),
  });

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [msgs, sending]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const msg = input.trim();
    if (!msg || sending) return;
    setInput("");
    setSending(true);
    try {
      await send({ data: { courseId, message: msg } });
      qc.invalidateQueries({ queryKey: ["chat", courseId] });
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="flex h-[calc(100vh-14rem)] flex-col rounded-xl border border-border bg-card">
      <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto p-4">
        {msgs.length === 0 && (
          <div className="rounded-lg bg-muted p-4 text-sm text-muted-foreground">
            👋 Ask me anything about this course — request explanations, summaries, examples, or quizzes.
          </div>
        )}
        {msgs.map((m) => (
          <div key={m.id} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
            <div
              className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm ${
                m.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted"
              }`}
            >
              {m.role === "assistant" ? (
                <div className="prose prose-sm max-w-none dark:prose-invert">
                  <ReactMarkdown>{m.content}</ReactMarkdown>
                </div>
              ) : (
                m.content
              )}
            </div>
          </div>
        ))}
        {sending && (
          <div className="flex justify-start">
            <div className="rounded-2xl bg-muted px-4 py-2.5 text-sm text-muted-foreground">
              <Loader2 className="inline h-3 w-3 animate-spin" /> Thinking…
            </div>
          </div>
        )}
      </div>
      <form onSubmit={submit} className="flex gap-2 border-t border-border p-3">
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask about the material…"
          disabled={sending}
          autoFocus
        />
        <Button type="submit" disabled={sending || !input.trim()}>
          <Send className="h-4 w-4" />
        </Button>
      </form>
    </div>
  );
}

// ---------- Quiz ----------
type QuizQuestion = {
  type: "mcq" | "true_false" | "short_answer";
  question: string;
  options?: string[];
  answer: string;
  explanation: string;
};

function QuizPanel({ courseId, chapterId }: { courseId: string; chapterId: string | null }) {
  const gen = useServerFn(generateQuiz);
  const submit = useServerFn(submitQuiz);
  const [quiz, setQuiz] = useState<{ id: string; questions: QuizQuestion[] } | null>(null);
  const [answers, setAnswers] = useState<string[]>([]);
  const [result, setResult] = useState<{ score: number; total: number } | null>(null);
  const [loading, setLoading] = useState(false);

  async function start() {
    if (!chapterId) return;
    setLoading(true);
    setResult(null);
    try {
      const q = await gen({ data: { chapterId } });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const questions = (q as any).questions as QuizQuestion[];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      setQuiz({ id: (q as any).id, questions });
      setAnswers(new Array(questions.length).fill(""));
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit() {
    if (!quiz) return;
    setLoading(true);
    try {
      const r = await submit({ data: { quizId: quiz.id, courseId, answers } });
      setResult(r);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  if (!chapterId) return <p className="text-muted-foreground">Select a lesson first.</p>;

  if (!quiz) {
    return (
      <div className="rounded-xl border border-border bg-card p-8 text-center">
        <Brain className="mx-auto h-8 w-8 text-primary" />
        <h3 className="mt-3 font-semibold">Test your knowledge</h3>
        <p className="mt-1 text-sm text-muted-foreground">Generate a quiz for this chapter.</p>
        <Button className="mt-4" onClick={start} disabled={loading}>
          {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Generate quiz
        </Button>
      </div>
    );
  }

  return (
    <div className="max-w-3xl space-y-6">
      {quiz.questions.map((q, i) => {
        const correct =
          result &&
          (answers[i] ?? "").trim().toLowerCase() === q.answer.trim().toLowerCase();
        return (
          <div key={i} className="rounded-xl border border-border bg-card p-5">
            <p className="font-medium">
              {i + 1}. {q.question}
            </p>
            <div className="mt-3 space-y-2">
              {q.type === "mcq" && (q.options ?? []).map((opt) => (
                <label key={opt} className="flex cursor-pointer items-center gap-2 rounded-md border border-border p-2 text-sm hover:bg-muted">
                  <input
                    type="radio"
                    name={`q${i}`}
                    checked={answers[i] === opt}
                    disabled={!!result}
                    onChange={() => setAnswers((a) => a.map((v, idx) => (idx === i ? opt : v)))}
                  />
                  {opt}
                </label>
              ))}
              {q.type === "true_false" && ["True", "False"].map((opt) => (
                <label key={opt} className="flex cursor-pointer items-center gap-2 rounded-md border border-border p-2 text-sm hover:bg-muted">
                  <input
                    type="radio"
                    name={`q${i}`}
                    checked={answers[i] === opt}
                    disabled={!!result}
                    onChange={() => setAnswers((a) => a.map((v, idx) => (idx === i ? opt : v)))}
                  />
                  {opt}
                </label>
              ))}
              {q.type === "short_answer" && (
                <Input
                  value={answers[i]}
                  disabled={!!result}
                  onChange={(e) => setAnswers((a) => a.map((v, idx) => (idx === i ? e.target.value : v)))}
                  placeholder="Your answer…"
                />
              )}
            </div>
            {result && (
              <div className={`mt-3 rounded-md p-3 text-sm ${correct ? "bg-primary/10 text-primary" : "bg-destructive/10 text-destructive"}`}>
                <p className="font-medium">
                  {correct ? "Correct" : `Answer: ${q.answer}`}
                </p>
                <p className="mt-1 text-muted-foreground">{q.explanation}</p>
              </div>
            )}
          </div>
        );
      })}

      {result ? (
        <div className="rounded-xl border border-primary bg-primary/5 p-5 text-center">
          <p className="text-2xl font-bold text-primary">
            {result.score} / {result.total}
          </p>
          <p className="text-sm text-muted-foreground">Great job! Try another chapter.</p>
          <Button variant="outline" className="mt-3" onClick={() => { setQuiz(null); setResult(null); }}>
            Try another
          </Button>
        </div>
      ) : (
        <Button onClick={handleSubmit} disabled={loading || answers.some((a) => !a)}>
          {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Submit answers
        </Button>
      )}
    </div>
  );
}
