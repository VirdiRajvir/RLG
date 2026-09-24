# A2A/references.py
from supabase import create_client
from .config import supabase_creds
from .renderer import render_html

def _client():
    url, key = supabase_creds()
    return create_client(url, key)

def list_references(client=None) -> list[dict]:
    client = client or _client()
    rows = client.table("study_references").select("id,name,html").execute().data
    return rows or []

def target_image(html: str, render=render_html) -> bytes:
    return render(html)
