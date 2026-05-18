import ReactMarkdown from "react-markdown";

interface ProtocolViewerProps {
  markdown: string;
}

export function ProtocolViewer({ markdown }: ProtocolViewerProps) {
  return (
    <div
      data-testid="protocol-viewer"
      className="prose prose-sm max-w-none dark:prose-invert"
    >
      <ReactMarkdown>{markdown}</ReactMarkdown>
    </div>
  );
}
