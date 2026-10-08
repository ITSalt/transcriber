/** Test fixtures: a .docx assembled in memory (2 comments, 1 insertion, 1 deletion). */
import JSZip from 'jszip'

export const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"'

export const COMMENTS_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:comments ${W}>
  <w:comment w:id="0" w:author="Анна" w:date="2026-05-01T10:00:00Z" w:initials="А">
    <w:p><w:r><w:t>Это решение, а не обсуждение</w:t></w:r></w:p>
  </w:comment>
  <w:comment w:id="1" w:author="Борис" w:date="2026-05-01T11:30:00Z">
    <w:p><w:r><w:t>Задача</w:t></w:r></w:p>
    <w:p><w:r><w:t>назначена не тому</w:t></w:r></w:p>
  </w:comment>
</w:comments>`

export const DOCUMENT_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document ${W}>
  <w:body>
    <w:p>
      <w:r><w:t xml:space="preserve">Итоги: </w:t></w:r>
      <w:commentRangeStart w:id="0"/>
      <w:r><w:t>запускаем в июне</w:t></w:r>
      <w:commentRangeEnd w:id="0"/>
      <w:r><w:commentReference w:id="0"/></w:r>
    </w:p>
    <w:p>
      <w:commentRangeStart w:id="1"/>
      <w:r><w:t xml:space="preserve">Иван подготовит </w:t></w:r>
      <w:ins w:id="10" w:author="Анна" w:date="2026-05-01T10:05:00Z"><w:r><w:t>бюджет</w:t></w:r></w:ins>
      <w:del w:id="11" w:author="Борис" w:date="2026-05-01T10:06:00Z"><w:r><w:delText>отчёт</w:delText></w:r></w:del>
      <w:commentRangeEnd w:id="1"/>
      <w:r><w:commentReference w:id="1"/></w:r>
    </w:p>
  </w:body>
</w:document>`

export async function buildDocx(parts: Record<string, string>): Promise<Buffer> {
  const zip = new JSZip()
  zip.file('[Content_Types].xml', '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>')
  for (const [path, xml] of Object.entries(parts)) zip.file(path, xml)
  return zip.generateAsync({ type: 'nodebuffer' })
}

export const reviewDocx = (): Promise<Buffer> =>
  buildDocx({ 'word/document.xml': DOCUMENT_XML, 'word/comments.xml': COMMENTS_XML })
