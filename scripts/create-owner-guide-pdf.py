"""Build the packaged Owner Guide PDF.

Install the documented dependency first:
    py -m pip install -r scripts/requirements-owner-guide.txt

Then run:
    py scripts/create-owner-guide-pdf.py
"""

from __future__ import annotations

import html
import re
import shutil
from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import inch
from reportlab.platypus import (
    BaseDocTemplate,
    Frame,
    Image,
    ListFlowable,
    ListItem,
    PageBreak,
    PageTemplate,
    Paragraph,
    Spacer,
    Table,
    TableStyle,
)


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "docs" / "OWNER_GUIDE.md"
OUTPUT = ROOT / "output" / "pdf" / "Founders Finance Owner Guide.pdf"
RELEASE_COPY = ROOT / "release" / "Founders Finance Owner Guide.pdf"
ICON = ROOT / "assets" / "brand" / "founders-finance" / "founders-finance-icon.png"

NAVY = colors.HexColor("#07111F")
BLUE = colors.HexColor("#0284C7")
LIGHT_BLUE = colors.HexColor("#E0F2FE")
SLATE = colors.HexColor("#475569")
LIGHT_SLATE = colors.HexColor("#E2E8F0")
INK = colors.HexColor("#0F172A")


def inline_markup(text: str) -> str:
    escaped = html.escape(text.strip())
    escaped = re.sub(r"`([^`]+)`", r'<font name="Courier">\1</font>', escaped)
    escaped = re.sub(r"\*\*([^*]+)\*\*", r"<b>\1</b>", escaped)
    escaped = re.sub(r"\[([^]]+)\]\(([^)]+)\)", r"\1 (\2)", escaped)
    return escaped


def build_styles() -> dict[str, ParagraphStyle]:
    base = getSampleStyleSheet()
    return {
        "title": ParagraphStyle(
            "GuideTitle",
            parent=base["Title"],
            fontName="Helvetica-Bold",
            fontSize=25,
            leading=29,
            alignment=TA_CENTER,
            textColor=INK,
            spaceAfter=10,
        ),
        "subtitle": ParagraphStyle(
            "GuideSubtitle",
            parent=base["BodyText"],
            fontName="Helvetica",
            fontSize=10,
            leading=15,
            alignment=TA_CENTER,
            textColor=SLATE,
            spaceAfter=16,
        ),
        "h2": ParagraphStyle(
            "GuideH2",
            parent=base["Heading2"],
            fontName="Helvetica-Bold",
            fontSize=15,
            leading=18,
            textColor=BLUE,
            spaceBefore=13,
            spaceAfter=7,
            keepWithNext=True,
        ),
        "h3": ParagraphStyle(
            "GuideH3",
            parent=base["Heading3"],
            fontName="Helvetica-Bold",
            fontSize=11,
            leading=14,
            textColor=INK,
            spaceBefore=9,
            spaceAfter=4,
            keepWithNext=True,
        ),
        "body": ParagraphStyle(
            "GuideBody",
            parent=base["BodyText"],
            fontName="Helvetica",
            fontSize=8.7,
            leading=12.4,
            textColor=INK,
            spaceAfter=6,
        ),
        "small": ParagraphStyle(
            "GuideSmall",
            parent=base["BodyText"],
            fontName="Helvetica",
            fontSize=7.6,
            leading=10.2,
            textColor=INK,
        ),
        "code": ParagraphStyle(
            "GuideCode",
            parent=base["Code"],
            fontName="Courier",
            fontSize=7.3,
            leading=10,
            leftIndent=8,
            rightIndent=8,
            borderColor=LIGHT_SLATE,
            borderWidth=0.5,
            borderPadding=7,
            backColor=colors.HexColor("#F8FAFC"),
            textColor=INK,
            spaceBefore=3,
            spaceAfter=7,
        ),
        "quote": ParagraphStyle(
            "GuideQuote",
            parent=base["BodyText"],
            fontName="Helvetica-Oblique",
            fontSize=8.5,
            leading=12,
            leftIndent=12,
            borderColor=BLUE,
            borderWidth=0,
            borderPadding=6,
            textColor=SLATE,
            spaceAfter=7,
        ),
        "contents": ParagraphStyle(
            "GuideContents",
            parent=base["BodyText"],
            fontName="Helvetica",
            fontSize=8.4,
            leading=12,
            textColor=INK,
            leftIndent=10,
            spaceAfter=2,
        ),
    }


class GuideDocument(BaseDocTemplate):
    def __init__(self, filename: str):
        super().__init__(
            filename,
            pagesize=letter,
            leftMargin=0.62 * inch,
            rightMargin=0.62 * inch,
            topMargin=0.68 * inch,
            bottomMargin=0.62 * inch,
            title="Founders Finance Owner Guide",
            author="Founders Finance",
            subject="Complete owner operating instructions",
        )
        frame = Frame(self.leftMargin, self.bottomMargin, self.width, self.height, id="body")
        self.addPageTemplates([PageTemplate(id="guide", frames=[frame], onPage=self._page)])

    @staticmethod
    def _page(canvas, doc):
        canvas.saveState()
        width, height = letter
        canvas.setStrokeColor(LIGHT_SLATE)
        canvas.setLineWidth(0.5)
        canvas.line(doc.leftMargin, height - 0.43 * inch, width - doc.rightMargin, height - 0.43 * inch)
        canvas.setFont("Helvetica-Bold", 7.5)
        canvas.setFillColor(BLUE)
        canvas.drawString(doc.leftMargin, height - 0.33 * inch, "FOUNDERS FINANCE")
        canvas.setFont("Helvetica", 7.2)
        canvas.setFillColor(SLATE)
        canvas.drawRightString(width - doc.rightMargin, height - 0.33 * inch, "Owner Guide")
        canvas.line(doc.leftMargin, 0.42 * inch, width - doc.rightMargin, 0.42 * inch)
        canvas.drawString(doc.leftMargin, 0.25 * inch, "Private local-use financial operations")
        canvas.drawRightString(width - doc.rightMargin, 0.25 * inch, f"Page {doc.page}")
        canvas.restoreState()


def table_flow(lines: list[str], styles: dict[str, ParagraphStyle]):
    rows = []
    for line in lines:
        cells = [cell.strip() for cell in line.strip().strip("|").split("|")]
        rows.append(cells)
    if len(rows) > 1 and all(re.fullmatch(r":?-{3,}:?", cell.replace(" ", "")) for cell in rows[1]):
        rows.pop(1)
    width_count = max(len(row) for row in rows)
    for row in rows:
        row.extend([""] * (width_count - len(row)))
    data = [[Paragraph(inline_markup(cell), styles["small"]) for cell in row] for row in rows]
    column_widths = [7.26 * inch / width_count] * width_count
    table = Table(data, colWidths=column_widths, repeatRows=1, hAlign="LEFT")
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), NAVY),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("GRID", (0, 0), (-1, -1), 0.45, colors.HexColor("#CBD5E1")),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("BACKGROUND", (0, 1), (-1, -1), colors.white),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#F8FAFC")]),
        ("LEFTPADDING", (0, 0), (-1, -1), 5),
        ("RIGHTPADDING", (0, 0), (-1, -1), 5),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
    ]))
    return table


def parse_markdown(markdown: str, styles: dict[str, ParagraphStyle]):
    lines = markdown.splitlines()
    sections = [line[3:].strip() for line in lines if line.startswith("## ")]
    story = []
    if ICON.exists():
        guide_icon = Image(str(ICON), width=1.18 * inch, height=1.18 * inch)
        guide_icon.hAlign = "CENTER"
        story.extend([Spacer(1, 0.25 * inch), guide_icon, Spacer(1, 0.12 * inch)])
    story.append(Paragraph("Founders Finance", styles["title"]))
    story.append(Paragraph("Owner Guide", styles["title"]))
    story.append(Paragraph("Where Cash Flows. Where Every Dollar Goes.", styles["subtitle"]))
    story.append(Spacer(1, 0.08 * inch))
    story.append(Paragraph("Complete operating instructions for the private local-use installation", styles["subtitle"]))
    story.append(Spacer(1, 0.3 * inch))
    story.append(Paragraph("Contents", styles["h2"]))
    for section in sections:
        story.append(Paragraph(inline_markup(section), styles["contents"]))
    story.append(PageBreak())

    paragraph_lines: list[str] = []
    list_items: list[tuple[str, str]] = []
    code_lines: list[str] = []
    in_code = False
    index = 0

    def flush_paragraph():
        if paragraph_lines:
            story.append(Paragraph(inline_markup(" ".join(paragraph_lines)), styles["body"]))
            paragraph_lines.clear()

    def flush_list():
        if not list_items:
            return
        ordered = list_items[0][0] == "ordered"
        items = [ListItem(Paragraph(inline_markup(text), styles["body"]), leftIndent=12) for _, text in list_items]
        story.append(ListFlowable(
            items,
            bulletType="1" if ordered else "bullet",
            start=1 if ordered else "-",
            leftIndent=20,
            bulletFontName="Helvetica",
            bulletFontSize=7.5,
            bulletColor=BLUE,
            spaceAfter=5,
        ))
        list_items.clear()

    while index < len(lines):
        line = lines[index].rstrip()
        if line.startswith("```"):
            flush_paragraph()
            flush_list()
            if in_code:
                story.append(Paragraph("<br/>".join(html.escape(item) for item in code_lines), styles["code"]))
                code_lines.clear()
                in_code = False
            else:
                in_code = True
            index += 1
            continue
        if in_code:
            code_lines.append(line)
            index += 1
            continue
        if line.startswith("# "):
            index += 1
            continue
        if line.startswith("## "):
            flush_paragraph()
            flush_list()
            story.append(Paragraph(inline_markup(line[3:]), styles["h2"]))
            index += 1
            continue
        if line.startswith("### "):
            flush_paragraph()
            flush_list()
            story.append(Paragraph(inline_markup(line[4:]), styles["h3"]))
            index += 1
            continue
        if line.startswith("|") and index + 1 < len(lines) and lines[index + 1].startswith("|"):
            flush_paragraph()
            flush_list()
            table_lines = []
            while index < len(lines) and lines[index].startswith("|"):
                table_lines.append(lines[index])
                index += 1
            story.extend([table_flow(table_lines, styles), Spacer(1, 7)])
            continue
        bullet = re.match(r"^-\s+(.+)$", line)
        numbered = re.match(r"^\d+\.\s+(.+)$", line)
        if bullet or numbered:
            flush_paragraph()
            kind = "ordered" if numbered else "bullet"
            if list_items and list_items[0][0] != kind:
                flush_list()
            list_items.append((kind, (numbered or bullet).group(1)))
            index += 1
            continue
        if line.startswith(">"):
            flush_paragraph()
            flush_list()
            story.append(Paragraph(inline_markup(line.lstrip("> ")), styles["quote"]))
            index += 1
            continue
        if not line.strip():
            flush_paragraph()
            flush_list()
            index += 1
            continue
        paragraph_lines.append(line.strip())
        index += 1

    flush_paragraph()
    flush_list()
    return story


def main():
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    RELEASE_COPY.parent.mkdir(parents=True, exist_ok=True)
    styles = build_styles()
    document = GuideDocument(str(OUTPUT))
    document.build(parse_markdown(SOURCE.read_text(encoding="utf-8"), styles))
    shutil.copy2(OUTPUT, RELEASE_COPY)
    print(OUTPUT)
    print(RELEASE_COPY)


if __name__ == "__main__":
    main()
