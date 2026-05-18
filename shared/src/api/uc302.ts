import { z } from 'zod';

// UC-302 — Export protocol to PDF
// No JSON body — response is application/pdf (binary).
// Content-Disposition: attachment; filename="<meeting-title>-protocol-v<version>.pdf"

export const PdfExportError = z.object({
  code: z.literal('PDF_RENDER_FAILED'),
  message: z.string(),
});
export type PdfExportError = z.infer<typeof PdfExportError>;
