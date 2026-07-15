import { createFileRoute, Link } from "@tanstack/react-router";
import { BookOpen, Brain, FileText, MessageSquare, Sparkles, Trophy } from "lucide-react";

export const Route = createFileRoute("/")({
  component: Landing,
});

function Landing() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-background via-background to-muted/30">
      <header className="container mx-auto flex items-center justify-between px-6 py-6">
        <div className="flex items-center gap-2 text-lg font-semibold">
          <Sparkles className="h-6 w-6 text-primary" />
          <span>PDFCourse</span>
        </div>
        <nav className="flex items-center gap-3">
          <Link
            to="/auth"
            className="rounded-md px-4 py-2 text-sm font-medium text-foreground hover:bg-muted"
          >
            Sign in
          </Link>
          <Link
            to="/auth"
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            Get started
          </Link>
        </nav>
      </header>

      <main className="container mx-auto px-6 pb-24 pt-16">
        <section className="mx-auto max-w-3xl text-center">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-xs font-medium text-muted-foreground">
            <Sparkles className="h-3 w-3" /> AI-powered learning
          </div>
          <h1 className="text-4xl font-bold tracking-tight text-foreground sm:text-6xl">
            Turn any PDF into an interactive course
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg text-muted-foreground">
            Upload a book, paper, or study material. In seconds, get structured chapters, rich lessons, quizzes, and an AI tutor that answers questions about your content.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link
              to="/auth"
              className="rounded-md bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
            >
              Start learning free
            </Link>
            <a
              href="#features"
              className="rounded-md border border-input bg-background px-6 py-3 text-sm font-semibold text-foreground hover:bg-accent"
            >
              See how it works
            </a>
          </div>
        </section>

        <section id="features" className="mx-auto mt-24 grid max-w-5xl gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {[
            { icon: FileText, title: "Upload any PDF", body: "Books, research papers, docs — we extract and structure the content." },
            { icon: BookOpen, title: "Structured lessons", body: "Chapters, lessons, key takeaways, examples, and summaries." },
            { icon: MessageSquare, title: "AI learning companion", body: "Ask questions, get explanations, and receive study suggestions." },
            { icon: Brain, title: "Auto-generated quizzes", body: "MCQ, true/false, and short answer questions for each chapter." },
            { icon: Trophy, title: "Track progress", body: "Mark lessons complete, resume anytime, see completion %." },
            { icon: Sparkles, title: "Powered by Lovable AI", body: "Gemini + GPT models — no API keys required to try." },
          ].map((f) => (
            <div key={f.title} className="rounded-2xl border border-border bg-card p-6">
              <f.icon className="h-6 w-6 text-primary" />
              <h3 className="mt-4 font-semibold text-card-foreground">{f.title}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{f.body}</p>
            </div>
          ))}
        </section>
      </main>

      <footer className="border-t border-border py-8 text-center text-sm text-muted-foreground">
        Built with Lovable • AI courses from your PDFs
      </footer>
    </div>
  );
}
