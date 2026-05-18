import { useEffect, useRef } from "react";
import { Editor, defaultValueCtx, rootCtx, serializerCtx, editorStateCtx } from "@milkdown/core";
import { commonmark } from "@milkdown/preset-commonmark";
import { listenerCtx, listener, type ListenerManager } from "@milkdown/plugin-listener";
import { MilkdownProvider, Milkdown, useEditor, useInstance } from "@milkdown/react";

export interface ProtocolEditorHandle {
  getMarkdown: () => string;
}

interface ProtocolEditorInnerProps {
  initialValue: string;
  onEditorReady: (getMarkdown: () => string) => void;
  onChange?: () => void;
}

function ProtocolEditorInner({ initialValue, onEditorReady, onChange }: ProtocolEditorInnerProps) {
  const [loading, getInstance] = useInstance();
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEditor(
    (root) =>
      Editor.make()
        .config((ctx) => {
          ctx.set(rootCtx, root);
          ctx.set(defaultValueCtx, initialValue);
          if (onChangeRef.current) {
            (ctx.get(listenerCtx) as ListenerManager).markdownUpdated(() => {
              onChangeRef.current?.();
            });
          }
        })
        .use(commonmark)
        .use(listener),
    [initialValue],
  );

  useEffect(() => {
    if (!loading) {
      onEditorReady(() => {
        const editor = getInstance();
        if (!editor) return initialValue;
        let markdown = initialValue;
        try {
          editor.action((ctx) => {
            const serializer = ctx.get(serializerCtx);
            const editorState = ctx.get(editorStateCtx);
            if (serializer && editorState) {
              markdown = serializer(editorState.doc);
            }
          });
        } catch {
          // If serialization fails return the initial value
        }
        return markdown;
      });
    }
  }, [loading, getInstance, initialValue, onEditorReady]);

  return <Milkdown />;
}

interface ProtocolEditorProps {
  initialValue: string;
  editorHandleRef: React.MutableRefObject<ProtocolEditorHandle | null>;
  onChange?: () => void;
}

export function ProtocolEditor({ initialValue, editorHandleRef, onChange }: ProtocolEditorProps) {
  const getMarkdownRef = useRef<() => string>(() => initialValue);

  const handleEditorReady = (getMarkdown: () => string) => {
    getMarkdownRef.current = getMarkdown;
    editorHandleRef.current = {
      getMarkdown: () => getMarkdownRef.current(),
    };
  };

  return (
    <div data-testid="protocol-editor" className="border rounded-md min-h-[300px] p-2">
      <MilkdownProvider>
        <ProtocolEditorInner
          initialValue={initialValue}
          onEditorReady={handleEditorReady}
          onChange={onChange}
        />
      </MilkdownProvider>
    </div>
  );
}
