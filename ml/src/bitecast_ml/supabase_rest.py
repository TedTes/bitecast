from __future__ import annotations

from typing import Any

import httpx


class SupabaseRest:
    def __init__(self, url: str, service_role_key: str, schema: str = "bitecast") -> None:
        self.base_url = f"{url.rstrip('/')}/rest/v1"
        self.headers = {
            "apikey": service_role_key,
            "Authorization": f"Bearer {service_role_key}",
            "Accept-Profile": schema,
            "Content-Profile": schema,
            "Content-Type": "application/json",
        }

    def select(self, table: str, params: dict[str, str]) -> list[dict[str, Any]]:
        response = httpx.get(f"{self.base_url}/{table}", params=params, headers=self.headers, timeout=60)
        response.raise_for_status()
        return response.json()

    def upsert(self, table: str, rows: list[dict[str, Any]], on_conflict: str) -> None:
        if not rows:
            return
        headers = {**self.headers, "Prefer": "resolution=merge-duplicates,return=minimal"}
        response = httpx.post(
            f"{self.base_url}/{table}",
            params={"on_conflict": on_conflict},
            json=rows,
            headers=headers,
            timeout=60,
        )
        response.raise_for_status()

    def insert(self, table: str, rows: list[dict[str, Any]]) -> None:
        if not rows:
            return
        response = httpx.post(
            f"{self.base_url}/{table}",
            json=rows,
            headers={**self.headers, "Prefer": "return=minimal"},
            timeout=60,
        )
        response.raise_for_status()

    def update(self, table: str, values: dict[str, Any], filters: dict[str, str]) -> None:
        response = httpx.patch(
            f"{self.base_url}/{table}",
            params=filters,
            json=values,
            headers={**self.headers, "Prefer": "return=minimal"},
            timeout=60,
        )
        response.raise_for_status()

    def delete(self, table: str, filters: dict[str, str]) -> None:
        response = httpx.delete(
            f"{self.base_url}/{table}",
            params=filters,
            headers={**self.headers, "Prefer": "return=minimal"},
            timeout=60,
        )
        response.raise_for_status()
