import ReactMarkdown from "react-markdown";

interface SegmentListProps {
  fullText: string;
}

/**
 * Renders the transcript full_text.
 * The BE formats full_text with speaker labels + timestamps (plain text or markdown).
 * react-markdown handles any markdown formatting; plain text falls back to paragraphs.
 */
export function SegmentList({ fullText }: SegmentListProps) {
  return (
    <div
      data-testid="segment-list"
      className="prose prose-sm max-w-none whitespace-pre-wrap font-mono text-sm leading-relaxed"
    >
      <ReactMarkdown>{fullText}</ReactMarkdown>
    </div>
  );
}
