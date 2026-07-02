from io import BytesIO
from pathlib import Path

import cairosvg
import cv2
import qrcode
from PIL import Image, ImageDraw
from qrcode.image.styledpil import StyledPilImage
from qrcode.image.styles.moduledrawers.pil import RoundedModuleDrawer


ROOT = Path(__file__).resolve().parent
URL = "https://www.tessellnation.co.uk/"
LOGO_PATH = ROOT / "tessellNation_logo_new.svg"
OUTPUT_PATH = ROOT / "tessellnation_website_qr.png"


def render_logo() -> Image.Image:
    rendered = cairosvg.svg2png(url=str(LOGO_PATH), output_width=900)
    logo = Image.open(BytesIO(rendered)).convert("RGBA")

    alpha = logo.getchannel("A")
    bounds = alpha.getbbox()
    if bounds:
        logo = logo.crop(bounds)
    return logo


def generate_qr() -> Image.Image:
    qr = qrcode.QRCode(
        version=None,
        error_correction=qrcode.constants.ERROR_CORRECT_H,
        box_size=24,
        border=4,
    )
    qr.add_data(URL)
    qr.make(fit=True)
    image = qr.make_image(
        image_factory=StyledPilImage,
        module_drawer=RoundedModuleDrawer(radius_ratio=1.0),
        fill_color="#111111",
        back_color="white",
    ).convert("RGBA")

    logo = render_logo()
    max_width = int(image.width * 0.19)
    max_height = int(image.height * 0.25)
    logo.thumbnail((max_width, max_height), Image.Resampling.LANCZOS)

    pad = max(12, image.width // 70)
    panel_size = (logo.width + 2 * pad, logo.height + 2 * pad)
    panel = Image.new("RGBA", panel_size, (255, 255, 255, 255))
    radius = max(10, pad)
    mask = Image.new("L", panel_size, 0)
    ImageDraw.Draw(mask).rounded_rectangle(
        (0, 0, panel_size[0] - 1, panel_size[1] - 1),
        radius=radius,
        fill=255,
    )
    panel.putalpha(mask)
    panel.alpha_composite(logo, (pad, pad))

    position = ((image.width - panel.width) // 2, (image.height - panel.height) // 2)
    image.alpha_composite(panel, position)
    return image.convert("RGB")


def verify_qr(path: Path) -> None:
    decoded, _, _ = cv2.QRCodeDetector().detectAndDecode(cv2.imread(str(path)))
    if decoded != URL:
        raise RuntimeError(f"QR verification failed: decoded {decoded!r}")


if __name__ == "__main__":
    generate_qr().save(OUTPUT_PATH, quality=95, optimize=True)
    verify_qr(OUTPUT_PATH)
    print(f"Created and verified {OUTPUT_PATH.name}: {URL}")

