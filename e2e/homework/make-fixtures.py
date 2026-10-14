"""Generate small readable homework fixtures; no personal data or external dependencies."""
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED

folder = Path(__file__).parent
answer = "Two congruent triangles form a rectangle, so one triangle has area base times perpendicular height divided by two. For base 8 and height 5, the area is 20 square units. For base 10 and height 3, the area is 15 square units. Doubling the height doubles the area."
with ZipFile(folder / "triangle-answer.docx", "w", ZIP_DEFLATED) as doc:
    doc.writestr("[Content_Types].xml", '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>')
    doc.writestr("_rels/.rels", '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>')
    doc.writestr("word/document.xml", '<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>' + answer + '</w:t></w:r></w:p></w:body></w:document>')
(folder / "triangle-notes.txt").write_text(answer, encoding="utf-8")
stream = b"BT /F1 12 Tf 50 760 Td (Triangle area: base times perpendicular height divided by two.) Tj 0 -20 Td (Two congruent triangles can form a rectangle.) Tj ET"
objects = [b"<< /Type /Catalog /Pages 2 0 R >>", b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>", b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>", b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>", b"<< /Length " + str(len(stream)).encode() + b" >>\nstream\n" + stream + b"\nendstream"]
pdf = bytearray(b"%PDF-1.4\n")
offsets = [0]
for index, content in enumerate(objects, 1):
    offsets.append(len(pdf))
    pdf.extend(f"{index} 0 obj\n".encode() + content + b"\nendobj\n")
xref = len(pdf)
pdf.extend(f"xref\n0 {len(offsets)}\n0000000000 65535 f \n".encode())
for offset in offsets[1:]:
    pdf.extend(f"{offset:010d} 00000 n \n".encode())
pdf.extend(f"trailer\n<< /Size {len(offsets)} /Root 1 0 R >>\nstartxref\n{xref}\n%%EOF\n".encode())
(folder / "triangle-reference.pdf").write_bytes(pdf)
assert pdf[xref:xref + 4] == b"xref"
with ZipFile(folder / "triangle-answer.docx") as doc:
    assert answer.encode() in doc.read("word/document.xml")
