# A2A/renderer.py
from playwright.sync_api import sync_playwright
from .config import VIEWPORT

def render_html(html: str) -> bytes:
    """Render HTML to a full-page PNG at the fixed scoring viewport."""
    with sync_playwright() as p:
        browser = p.chromium.launch(args=["--no-sandbox", "--disable-setuid-sandbox"])
        try:
            page = browser.new_page(viewport=VIEWPORT)
            page.set_content(html or "", wait_until="networkidle")
            return page.screenshot(full_page=True, type="png")
        finally:
            browser.close()
