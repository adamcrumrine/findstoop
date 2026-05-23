-- Private bucket for screening uploads — driver's licenses, selfies, paystubs.
-- Sensitive PII, so explicitly NOT public. Edge functions access via service
-- role; applicants get short-lived signed URLs from the upload helper.

INSERT INTO storage.buckets (id, name, public)
VALUES ('screening-docs', 'screening-docs', FALSE)
ON CONFLICT (id) DO NOTHING;

-- Applicants write into a folder keyed by their screening_order id. They can
-- INSERT but not READ — we don't want them re-downloading their own DL after
-- the fact. Edge fns + manager flows fetch via service role + signed URLs.
DROP POLICY IF EXISTS screening_docs_applicant_insert ON storage.objects;
CREATE POLICY screening_docs_applicant_insert ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'screening-docs'
    AND auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM screening_orders so
      WHERE so.applicant_id = auth.uid()
        AND (storage.foldername(name))[1] = so.id::text
    )
  );
