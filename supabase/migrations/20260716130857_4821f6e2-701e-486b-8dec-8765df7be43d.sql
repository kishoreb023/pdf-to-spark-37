-- Ensure profiles are created automatically for new email/password users.
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Remove unnecessary anonymous table privileges from user-owned data.
REVOKE ALL ON public.profiles FROM anon;
REVOKE ALL ON public.courses FROM anon;
REVOKE ALL ON public.chapters FROM anon;
REVOKE ALL ON public.lessons FROM anon;
REVOKE ALL ON public.lesson_progress FROM anon;
REVOKE ALL ON public.chat_messages FROM anon;
REVOKE ALL ON public.quizzes FROM anon;
REVOKE ALL ON public.quiz_attempts FROM anon;

-- Keep explicit access for authenticated users and trusted backend service code.
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.courses TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.chapters TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lessons TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lesson_progress TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.chat_messages TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.quizzes TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.quiz_attempts TO authenticated;

GRANT ALL ON public.profiles TO service_role;
GRANT ALL ON public.courses TO service_role;
GRANT ALL ON public.chapters TO service_role;
GRANT ALL ON public.lessons TO service_role;
GRANT ALL ON public.lesson_progress TO service_role;
GRANT ALL ON public.chat_messages TO service_role;
GRANT ALL ON public.quizzes TO service_role;
GRANT ALL ON public.quiz_attempts TO service_role;