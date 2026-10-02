from pathlib import Path
from reportlab.pdfgen import canvas
from reportlab.lib.utils import ImageReader
from PIL import Image, ImageDraw, ImageFont

output = Path(__file__).resolve().parents[1] / 'test/fixtures/mixed.pdf'
c = canvas.Canvas(str(output), pagesize=(612, 792), invariant=True)
c.setTitle('Synthetic mixed text and scanned receipt')
c.setFont('Helvetica', 12)
for y, line in zip([742, 720, 698], [
    'Embedded reference: EMBEDDED-241. Preserve this original selectable text.',
    'The receipt below is an image. Its facts are absent from the PDF text layer.',
    'A page with plenty of selectable text can still require optical recognition.',
]):
    c.drawString(40, y, line)
scan = Image.new('RGB', (1530, 1000), 'white')
draw = ImageDraw.Draw(scan)
font = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', 52)
for y, line in zip([130, 260, 390], ['Receipt code: QUARTZ-916', 'Total: 108.4 dollars', 'Quantity: 62']):
    draw.text((100, y), line, font=font, fill='black')
c.drawImage(ImageReader(scan), 40, 170, width=520, height=340)
c.save()
print(output)
