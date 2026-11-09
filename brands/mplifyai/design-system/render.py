"""Render mplifyAI templates to PNG/PDF.

  python3 render.py carousel templates/carousel.html out/my-carousel   -> PNG per slide + one PDF (LinkedIn document)
  python3 render.py cover    templates/linkedin-cover.html out/cover    -> cover.png (1584x396) + cover@2x.png
"""
import sys
from pathlib import Path
from playwright.sync_api import sync_playwright


def carousel(page, out: Path):
    slides = page.locator(".slide")
    pngs = []
    for i in range(slides.count()):
        p = out / f"slide-{i + 1:02d}.png"
        slides.nth(i).screenshot(path=str(p))
        pngs.append(p)
    # PDF: one 1080x1350 page per slide
    page.add_style_tag(content="body{background:none!important;padding:0!important;gap:0!important;display:block!important}"
                               ".slide{page-break-after:always}")
    page.pdf(path=str(out / "carousel.pdf"), width="1080px", height="1350px", print_background=True,
             margin={"top": "0", "bottom": "0", "left": "0", "right": "0"})
    return pngs


def cover(browser, html: Path, out: Path):
    for scale, name in ((1, "cover.png"), (2, "cover@2x.png")):
        page = browser.new_page(device_scale_factor=scale, viewport={"width": 1700, "height": 500})
        page.goto(html.resolve().as_uri())
        page.wait_for_load_state("networkidle")
        page.evaluate("document.fonts.ready")
        page.locator("#cover").screenshot(path=str(out / name))
        page.close()


if __name__ == "__main__":
    kind, html, out = sys.argv[1], Path(sys.argv[2]), Path(sys.argv[3])
    out.mkdir(parents=True, exist_ok=True)
    with sync_playwright() as p:
        browser = p.chromium.launch()
        if kind == "cover":
            cover(browser, html, out)
        else:
            page = browser.new_page(viewport={"width": 1200, "height": 1400})
            page.goto(html.resolve().as_uri())
            page.wait_for_load_state("networkidle")
            page.evaluate("document.fonts.ready")
            carousel(page, out)
        browser.close()
    print(f"done -> {out}")
