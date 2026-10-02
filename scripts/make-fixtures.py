from pathlib import Path
from io import BytesIO
from reportlab.pdfgen import canvas
from reportlab.lib.utils import ImageReader
from PIL import Image, ImageDraw, ImageFont
from pypdf import PdfReader, PdfWriter

root = Path(__file__).resolve().parents[1] / 'test' / 'fixtures'
root.mkdir(parents=True, exist_ok=True)
output = root / 'research-sample.pdf'
c = canvas.Canvas(str(output), pagesize=(612, 792))
c.setTitle('PDF reader verification sample')
c.setFont('Helvetica-Bold', 21)
c.drawString(54, 736, 'PDF reader verification sample')
c.setFont('Helvetica', 12)
c.drawString(54, 706, 'Page 1: selectable prose, columns and a numeric table.')
c.drawString(54, 676, 'The experiment code is ORCHID-739.')
for i, text in enumerate(['LEFT COLUMN START', 'The control group used 24 samples.', 'The measured temperature was 18 C.', 'LEFT COLUMN END']):
    c.drawString(54, 632 - i * 20, text)
for i, text in enumerate(['RIGHT COLUMN START', 'The treatment group used 36 samples.', 'The measured temperature was 21 C.', 'RIGHT COLUMN END']):
    c.drawString(330, 632 - i * 20, text)
for y, row in zip([460, 432, 404], [('Group', 'Samples', 'Score'), ('Control', '24', '63.5'), ('Treatment', '36', '81.2')]):
    for x, value in zip([54, 230, 400], row): c.drawString(x, y, value)
c.drawString(54, 360, 'Expected score difference: 17.7 points.')
c.drawString(54, 50, 'Physical PDF page 1 / 3')
c.showPage()

scan = Image.new('RGB', (1530, 1980), 'white')
d = ImageDraw.Draw(scan)
font = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', 44)
for y, line in zip([180, 280, 380, 480, 580], ['Scanned laboratory note', 'Document code: COBALT-582', 'Sample count: 47', 'Final mass: 12.75 grams', 'The control specimen was blue.']):
    d.text((135, y), line, fill='black', font=font)
c.drawImage(ImageReader(scan), 0, 0, width=612, height=792)
c.showPage()

c.setFont('Helvetica-Bold', 20)
c.drawString(54, 736, 'Visual-only evidence')
c.setFont('Helvetica', 12)
c.drawString(54, 706, 'The blue series decreases across the observation period.')
c.setStrokeColorRGB(0.08, 0.35, 0.75)
c.setLineWidth(5)
p = c.beginPath()
p.moveTo(90, 620)
p.lineTo(240, 560)
p.lineTo(390, 450)
p.lineTo(520, 330)
c.drawPath(p)
c.setFillColorRGB(0.85, 0.08, 0.08)
c.rect(70, 80, 90, 70, fill=1, stroke=0)
c.setFillColorRGB(0.05, 0.20, 0.9)
c.rect(455, 80, 90, 70, fill=1, stroke=0)
c.setFillColorRGB(0, 0, 0)
c.drawString(54, 240, 'A red square is bottom-left; a blue square is bottom-right.')
c.drawString(54, 50, 'Physical PDF page 3 / 3')
c.save()

reader = PdfReader(str(output))
writer = PdfWriter()
writer.add_page(reader.pages[2])
writer.pages[0].rotate(90)
with (root / 'rotated.pdf').open('wb') as f: writer.write(f)
writer = PdfWriter()
writer.append(reader)
writer.encrypt('test-password')
with (root / 'encrypted.pdf').open('wb') as f: writer.write(f)
print('Created three synthetic PDF fixtures.')
