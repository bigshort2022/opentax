import { z } from "zod";
const document = z.object({
  source_document_reference: z.string().trim().min(1),
  sha256: z.string().regex(/^[0-9a-f]{64}$/),
  bytes_base64: z.string().min(1),
}).strict();
/** Reviewed transaction bytes, without claiming a following-year 1099-SA was issued. */
export const employerPostyearEvidenceSchema = z.object({
  filed_tax_year_w2: document,
  following_year_trustee_payment: document,
  following_year_owner_receipt: document,
}).strict();
