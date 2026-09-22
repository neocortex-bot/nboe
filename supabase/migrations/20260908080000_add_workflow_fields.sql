-- ============================================================================
-- Workflow review untuk clinical_cases
-- ============================================================================
-- status:
--   'draft'     = kiriman AI agent via ingest-case API, MENUNGGU review admin.
--                 TIDAK tampil di daftar deploy sampai di-approve.
--   'published' = sudah di-review/edit admin, siap di-deploy ke station.
--   'rejected'  = ditolak admin (tidak dihapus, untuk audit).
-- source:
--   'admin'     = dibuat langsung dari UI admin.
--   'agent_api' = dikirim via endpoint ingest-case (perlu review manual).
-- rubric_mode:
--   'checklist' = penilaian memakai daftar tilik (rubrik enabled + items).
--   'none'      = tanpa daftar tilik, penilaian murni berbasis answer key.
-- ============================================================================

ALTER TABLE public.clinical_cases
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'published';

ALTER TABLE public.clinical_cases
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'admin';

ALTER TABLE public.clinical_cases
  ADD COLUMN IF NOT EXISTS rubric_mode TEXT NOT NULL DEFAULT 'checklist';

ALTER TABLE public.clinical_cases
  ADD COLUMN IF NOT EXISTS reviewed_by UUID REFERENCES public.profiles(id);

ALTER TABLE public.clinical_cases
  ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_clinical_cases_status
  ON public.clinical_cases(status);

CREATE INDEX IF NOT EXISTS idx_clinical_cases_source
  ON public.clinical_cases(source);

-- ============================================================================
-- RLS: jangan biarkan draft (kiriman AI yang belum di-review) bocor ke publik.
-- ============================================================================

-- Publik/anon: hanya bisa membaca case ber-status 'published'
DROP POLICY IF EXISTS "Public read cases" ON public.clinical_cases;
CREATE POLICY "Public read published cases"
  ON public.clinical_cases FOR SELECT TO anon
  USING (status = 'published');

-- Authenticated non-admin: published + draft miliknya sendiri
DROP POLICY IF EXISTS "Authenticated can read cases" ON public.clinical_cases;
CREATE POLICY "Authenticated read published or own drafts"
  ON public.clinical_cases FOR SELECT TO authenticated
  USING (status = 'published' OR created_by = auth.uid());

-- Baris lama tetap 'published'/'admin'/'checklist' agar tidak mengubah perilaku
-- yang sudah berjalan. Hanya kiriman baru (UI/API) yang menyetel status 'draft'.
