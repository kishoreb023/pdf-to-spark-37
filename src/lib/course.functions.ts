import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { callChatCompletion, callJsonCompletion } from "./ai-gateway.server";

// ----- Types -----
type CourseOutline = {
  title: string;
  description: string;
  difficulty: string;
  estimated_time: string;
  learning_objectives: string[];
  prerequisites: string[];
  chapters: {
    title: string;
    summary: string;
    lessons: { title: string }[];
  }[];
};

type LessonContent = {
  explanation: string;
  key_takeaways: string[];
  notes: string[];
  examples: string[];
  summary: string;
};

// ----- Upload & extract -----
export const createCourseFromPdf = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: unknown) =>
      z
        .object({
          storagePath: z.string().min(1),
          fileName: z.string().min(1),
        })
        .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // Download PDF from storage
    const { data: file, error: dlErr } = await supabase.storage.from("pdfs").download(data.storagePath);
    if (dlErr || !file) throw new Error(`Failed to read PDF: ${dlErr?.message ?? "unknown"}`);
    const buf = new Uint8Array(await file.arrayBuffer());

    // Extract text with unpdf (edge-compatible)
    const { extractText, getDocumentProxy } = await import("unpdf");
    const pdf = await getDocumentProxy(buf);
    const { text: pages } = await extractText(pdf, { mergePages: false });
    const fullText = Array.isArray(pages) ? pages.join("\n\n") : String(pages);
    const trimmed = fullText.slice(0, 60000); // cap for LLM context

    if (trimmed.trim().length < 100) {
      throw new Error("Could not extract usable text from PDF.");
    }

    // Create course record
    const { data: course, error: cErr } = await supabase
      .from("courses")
      .insert({
        user_id: userId,
        title: data.fileName.replace(/\.pdf$/i, ""),
        source_file_name: data.fileName,
        source_text: trimmed,
        status: "processing",
      })
      .select()
      .single();
    if (cErr || !course) throw new Error(`Failed to create course: ${cErr?.message}`);

    // Generate outline
    try {
      const outline = await callJsonCompletion<CourseOutline>({
        system:
          "You are an expert instructional designer. Convert source material into a rich, structured learning course. Always respond with valid JSON only.",
        user: `Create a structured course from this document. Return JSON with keys: title (string), description (string, 2-3 sentences), difficulty ("Beginner"|"Intermediate"|"Advanced"), estimated_time (e.g. "3 hours"), learning_objectives (string[], 4-6 items), prerequisites (string[], 2-4 items), chapters (array of 3-6 chapters, each with title, summary (1-2 sentences), lessons (array of 2-4 lessons, each with title)).

DOCUMENT:
${trimmed}`,
      });

      // Update course metadata
      await supabase
        .from("courses")
        .update({
          title: outline.title || course.title,
          description: outline.description,
          difficulty: outline.difficulty,
          estimated_time: outline.estimated_time,
          learning_objectives: outline.learning_objectives ?? [],
          prerequisites: outline.prerequisites ?? [],
          status: "ready",
        })
        .eq("id", course.id);

      // Create chapters + lessons (skeleton; lesson content generated lazily on view)
      for (let ci = 0; ci < (outline.chapters ?? []).length; ci++) {
        const ch = outline.chapters[ci];
        const { data: chapter } = await supabase
          .from("chapters")
          .insert({
            course_id: course.id,
            title: ch.title,
            summary: ch.summary,
            order_index: ci,
          })
          .select()
          .single();
        if (!chapter) continue;
        const lessonRows = (ch.lessons ?? []).map((l, li) => ({
          chapter_id: chapter.id,
          title: l.title,
          order_index: li,
          content: {},
        }));
        if (lessonRows.length) await supabase.from("lessons").insert(lessonRows);
      }

      return { courseId: course.id };
    } catch (e) {
      await supabase
        .from("courses")
        .update({ status: "failed", error_message: (e as Error).message })
        .eq("id", course.id);
      throw e;
    }
  });

// ----- Lesson content generation (lazy) -----
export const getOrGenerateLesson = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ lessonId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: lesson, error } = await supabase
      .from("lessons")
      .select("id, title, content, chapter_id, chapters(title, summary, course_id, courses(title, source_text))")
      .eq("id", data.lessonId)
      .single();
    if (error || !lesson) throw new Error("Lesson not found");

    const content = lesson.content as Partial<LessonContent> | null;
    if (content && content.explanation) return lesson;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ch = (lesson as any).chapters;
    const course = ch?.courses;
    const source: string = course?.source_text ?? "";

    const generated = await callJsonCompletion<LessonContent>({
      system:
        "You are an expert educator writing a clear, engaging lesson. Return valid JSON only.",
      user: `Write a lesson for the course "${course?.title}", chapter "${ch?.title}".
Lesson title: "${lesson.title}"
Chapter summary: ${ch?.summary}

Base the content on this source material (excerpts):
${source.slice(0, 20000)}

Return JSON with:
- explanation (string, markdown, 3-6 paragraphs)
- key_takeaways (string[], 3-5 items)
- notes (string[], 2-4 important notes)
- examples (string[], 1-3 real-world examples with brief context)
- summary (string, 2-3 sentences)`,
    });

    await supabase.from("lessons").update({ content: generated }).eq("id", lesson.id);
    return { ...lesson, content: generated };
  });

// ----- List / read -----
export const listCourses = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase
      .from("courses")
      .select("id, title, description, difficulty, estimated_time, status, created_at")
      .order("created_at", { ascending: false });
    return data ?? [];
  });

export const getCourseFull = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ courseId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: course } = await supabase.from("courses").select("*").eq("id", data.courseId).single();
    if (!course) throw new Error("Course not found");
    const { data: chapters } = await supabase
      .from("chapters")
      .select("id, title, summary, order_index, lessons(id, title, order_index)")
      .eq("course_id", data.courseId)
      .order("order_index");
    const { data: progress } = await supabase
      .from("lesson_progress")
      .select("lesson_id")
      .eq("user_id", userId)
      .eq("course_id", data.courseId);
    // sort lessons
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (chapters ?? []).forEach((c: any) => c.lessons?.sort((a: any, b: any) => a.order_index - b.order_index));
    return {
      course,
      chapters: chapters ?? [],
      completedLessonIds: (progress ?? []).map((p) => p.lesson_id),
    };
  });

// ----- Progress -----
export const toggleLessonComplete = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ lessonId: z.string().uuid(), courseId: z.string().uuid(), completed: z.boolean() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    if (data.completed) {
      await supabase
        .from("lesson_progress")
        .upsert({ user_id: userId, lesson_id: data.lessonId, course_id: data.courseId });
    } else {
      await supabase
        .from("lesson_progress")
        .delete()
        .eq("user_id", userId)
        .eq("lesson_id", data.lessonId);
    }
    return { ok: true };
  });

// ----- Chat -----
export const sendChatMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ courseId: z.string().uuid(), message: z.string().min(1).max(4000) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: course } = await supabase
      .from("courses")
      .select("title, description, source_text")
      .eq("id", data.courseId)
      .single();
    if (!course) throw new Error("Course not found");

    const { data: history } = await supabase
      .from("chat_messages")
      .select("role, content")
      .eq("course_id", data.courseId)
      .eq("user_id", userId)
      .order("created_at", { ascending: true })
      .limit(20);

    await supabase.from("chat_messages").insert({
      user_id: userId,
      course_id: data.courseId,
      role: "user",
      content: data.message,
    });

    const messages = [
      {
        role: "system",
        content: `You are an AI learning companion for the course "${course.title}". ${course.description ?? ""}
Answer using the course material below. Explain difficult concepts simply, offer examples, and suggest quizzes or next steps when relevant.

COURSE MATERIAL (excerpt):
${(course.source_text ?? "").slice(0, 15000)}`,
      },
      ...(history ?? []),
      { role: "user", content: data.message },
    ];

    const res = await callChatCompletion({
      model: "google/gemini-2.5-flash",
      messages,
    });
    const reply = res.choices?.[0]?.message?.content ?? "(no response)";

    await supabase.from("chat_messages").insert({
      user_id: userId,
      course_id: data.courseId,
      role: "assistant",
      content: reply,
    });

    return { reply };
  });

export const getChatHistory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ courseId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: msgs } = await context.supabase
      .from("chat_messages")
      .select("id, role, content, created_at")
      .eq("course_id", data.courseId)
      .eq("user_id", context.userId)
      .order("created_at", { ascending: true });
    return msgs ?? [];
  });

// ----- Quizzes -----
type QuizQuestion = {
  type: "mcq" | "true_false" | "short_answer";
  question: string;
  options?: string[]; // mcq only
  answer: string;
  explanation: string;
};

export const generateQuiz = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ chapterId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: chapter } = await supabase
      .from("chapters")
      .select("id, title, summary, course_id, courses(title, source_text)")
      .eq("id", data.chapterId)
      .single();
    if (!chapter) throw new Error("Chapter not found");

    const existing = await supabase.from("quizzes").select("*").eq("chapter_id", data.chapterId).maybeSingle();
    if (existing.data) return existing.data;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const source: string = (chapter as any).courses?.source_text ?? "";

    const quiz = await callJsonCompletion<{ questions: QuizQuestion[] }>({
      system: "You are an expert quiz creator. Return valid JSON only.",
      user: `Create a 5-question quiz for chapter "${chapter.title}" (${chapter.summary}).
Mix: 3 MCQ (with 4 options), 1 true_false, 1 short_answer.
Return JSON: { "questions": [{ "type": "mcq"|"true_false"|"short_answer", "question": "...", "options": ["..."] (mcq only), "answer": "...", "explanation": "..." }] }

Source material:
${source.slice(0, 12000)}`,
    });

    const { data: inserted } = await supabase
      .from("quizzes")
      .insert({
        chapter_id: chapter.id,
        course_id: chapter.course_id,
        questions: quiz.questions,
      })
      .select()
      .single();
    return inserted;
  });

export const submitQuiz = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        quizId: z.string().uuid(),
        courseId: z.string().uuid(),
        answers: z.array(z.string()),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: quiz } = await supabase.from("quizzes").select("questions").eq("id", data.quizId).single();
    if (!quiz) throw new Error("Quiz not found");
    const questions = quiz.questions as QuizQuestion[];
    let score = 0;
    questions.forEach((q, i) => {
      const a = (data.answers[i] ?? "").trim().toLowerCase();
      const correct = (q.answer ?? "").trim().toLowerCase();
      if (a && (a === correct || correct.includes(a) || a.includes(correct))) score++;
    });
    await supabase.from("quiz_attempts").insert({
      user_id: userId,
      quiz_id: data.quizId,
      course_id: data.courseId,
      answers: data.answers,
      score,
      total: questions.length,
    });
    return { score, total: questions.length };
  });

// ----- Dashboard stats -----
export const getDashboardStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const [{ data: courses }, { data: progress }, { data: attempts }] = await Promise.all([
      supabase.from("courses").select("id, title, description, status, created_at").order("created_at", { ascending: false }),
      supabase.from("lesson_progress").select("course_id, lesson_id").eq("user_id", userId),
      supabase.from("quiz_attempts").select("score, total, created_at").eq("user_id", userId).order("created_at", { ascending: false }).limit(10),
    ]);

    // per-course completion %
    const totals = new Map<string, number>();
    for (const c of courses ?? []) {
      const { count } = await supabase
        .from("lessons")
        .select("id, chapters!inner(course_id)", { count: "exact", head: true })
        .eq("chapters.course_id", c.id);
      totals.set(c.id, count ?? 0);
    }
    const doneByCourse = new Map<string, number>();
    (progress ?? []).forEach((p) => doneByCourse.set(p.course_id, (doneByCourse.get(p.course_id) ?? 0) + 1));

    return {
      courses: (courses ?? []).map((c) => {
        const total = totals.get(c.id) ?? 0;
        const done = doneByCourse.get(c.id) ?? 0;
        return { ...c, total_lessons: total, completed_lessons: done, percent: total ? Math.round((done / total) * 100) : 0 };
      }),
      recentAttempts: attempts ?? [],
    };
  });
