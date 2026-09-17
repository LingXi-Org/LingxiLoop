-- Both humans and agents are conversation participants; agents have no human membership row.
SET LOCAL lock_timeout = '5s';
ALTER TABLE public.im_read_receipt_advances
  DROP CONSTRAINT im_read_receipt_reader_company_fkey,
  ADD CONSTRAINT im_read_receipt_reader_company_fkey
    FOREIGN KEY (reader_id, company_id) REFERENCES public.participants(id, company_id) ON DELETE CASCADE;
