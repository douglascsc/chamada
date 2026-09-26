"""Gera as imagens usadas no teste das fotos de atraso (pasta img/)."""
import os, random
from PIL import Image, ImageDraw

os.makedirs("img", exist_ok=True)
random.seed(42)

def foto(w, h, cor=(60, 120, 90)):
    im = Image.new("RGB", (w, h), cor)
    d = ImageDraw.Draw(im)
    for i in range(0, h, 40):  # listras e "texto" para parecer um bilhete fotografado
        d.rectangle([w // 10, i, w - w // 10, i + 14], fill=(230, 230, 220) if i % 80 else (40, 40, 40))
    for _ in range(400):
        x, y = random.randrange(w), random.randrange(h)
        d.ellipse([x, y, x + 30, y + 30], fill=tuple(random.randrange(256) for _ in range(3)))
    return im

foto(4032, 3024).save("img/grande_4032x3024.jpg", quality=92)
exif = Image.Exif(); exif[274] = 6  # celular de pé: rotação indicada no EXIF
foto(4032, 3024, (90, 60, 120)).save("img/celular_orient6.jpg", quality=90, exif=exif)
foto(800, 600).save("img/pequena_800x600.jpg", quality=85)
foto(2000, 1500, (120, 90, 60)).save("img/foto.webp", quality=90)
doc = foto(1500, 1000, (250, 250, 250)).convert("RGBA"); doc.save("img/documento.png")
t = Image.new("RGBA", (900, 600), (0, 0, 0, 0)); ImageDraw.Draw(t).ellipse([100, 100, 800, 500], fill=(20, 120, 60, 200)); t.save("img/transparente.png")
ruido = Image.frombytes("RGB", (4000, 3000), os.urandom(4000 * 3000 * 3)); ruido.save("img/ruido_extremo.jpg", quality=100)
open("img/corrompida.jpg", "wb").write(b"\xff\xd8\xff\xe0" + os.urandom(106))
open("img/nao_imagem.txt", "w").write("isto não é uma imagem")
print("imagens geradas em img/")
