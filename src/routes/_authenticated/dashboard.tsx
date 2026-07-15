import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getDashboardStats, createCourseFromPdf } from "@/lib/course.functions";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import { Upload, FileText, Loader2, BookOpen, Search, Trophy } from "lucide-react";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/_authenticated/dashboard")({
  component: Dashboard,
});

function Dashboard() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const stats = useServerFn(getDashboardStats);
  const createCourse = useServerFn(createCourseFromPdf);
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [search, setSearch] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["dashboard"],
    queryFn: () => stats(),
  });

  const upload = useMutation({
    mutationFn: async (file: File) => {
      const { data: user } = await supabase.auth.getUser();
      if (!user.user) throw new Error("Not signed in");
      const path = `${user.user.id}/${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
      const { error } = await supabase.storage.from("pdfs").upload(path, file, {
        contentType: "application/pdf",
      });
      if (error) throw error;
      const res = await createCourse({ data: { storagePath: path, fileName: file.name } });
      return res.courseId;
    },
    onSuccess: (courseId) => {
      toast.success("Course generated!");
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      navigate({ to: "/course/$courseId", params: { courseId } });
    },
    onError: (e) => toast.error((e as Error).message),
    onSettled: () => setUploading(false),
  });

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.type !== "application/pdf" && !f.name.toLowerCase().endsWith(".pdf")) {
      toast.error("Please upload a PDF file");
      return;
    }
    if (f.size > 20 * 1024 * 1024) {
      toast.error("PDF must be under 20 MB");
      return;
    }
    setUploading(true);
    upload.mutate(f);
  }

  const filtered = (data?.courses ?? []).filter((c) =>
    c.title.toLowerCase().includes(search.toLowerCase()) ||
    (c.description ?? "").toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <div className="container mx-auto px-6 py-10">
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Your learning dashboard</h1>
          <p className="mt-1 text-muted-foreground">Upload a PDF and let AI build a course for you.</p>
        </div>
        <div className="flex items-center gap-2">
          <input ref={fileRef} type="file" accept="application/pdf,.pdf" className="hidden" onChange={onFile} />
          <Button onClick={() => fileRef.current?.click()} disabled={uploading} size="lg">
            {uploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
            {uploading ? "Generating course…" : "Upload PDF"}
          </Button>
        </div>
      </div>

      {uploading && (
        <div className="mb-8 rounded-xl border border-border bg-card p-6">
          <div className="flex items-center gap-3">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
            <div>
              <p className="font-medium">Extracting text and generating course</p>
              <p className="text-sm text-muted-foreground">This can take up to a minute for larger PDFs.</p>
            </div>
          </div>
        </div>
      )}

      <div className="mb-6 flex items-center gap-2">
        <div className="relative flex-1 max-w-md">
          <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search your courses…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-40 animate-pulse rounded-xl bg-muted" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-12 text-center">
          <FileText className="mx-auto h-10 w-10 text-muted-foreground" />
          <h3 className="mt-4 font-semibold">No courses yet</h3>
          <p className="mt-1 text-sm text-muted-foreground">Upload your first PDF to generate a course.</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((c) => (
            <Link
              key={c.id}
              to="/course/$courseId"
              params={{ courseId: c.id }}
              className="group rounded-xl border border-border bg-card p-5 transition hover:border-primary hover:shadow-sm"
            >
              <div className="flex items-start justify-between">
                <BookOpen className="h-5 w-5 text-primary" />
                <span className="text-xs text-muted-foreground">
                  {new Date(c.created_at).toLocaleDateString()}
                </span>
              </div>
              <h3 className="mt-3 line-clamp-2 font-semibold group-hover:text-primary">{c.title}</h3>
              <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{c.description ?? "Processing…"}</p>
              <div className="mt-4">
                <div className="mb-1 flex items-center justify-between text-xs text-muted-foreground">
                  <span>
                    {c.completed_lessons}/{c.total_lessons} lessons
                  </span>
                  <span>{c.percent}%</span>
                </div>
                <Progress value={c.percent} className="h-2" />
              </div>
              {c.status !== "ready" && (
                <span className="mt-3 inline-block rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                  {c.status}
                </span>
              )}
            </Link>
          ))}
        </div>
      )}

      {(data?.recentAttempts?.length ?? 0) > 0 && (
        <section className="mt-12">
          <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold">
            <Trophy className="h-5 w-5 text-primary" /> Recent quiz attempts
          </h2>
          <div className="rounded-xl border border-border bg-card">
            {data!.recentAttempts.map((a, i) => (
              <div key={i} className="flex items-center justify-between border-b border-border p-4 last:border-0">
                <span className="text-sm text-muted-foreground">
                  {new Date(a.created_at).toLocaleString()}
                </span>
                <span className="font-medium">
                  {a.score} / {a.total}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
