"""Broker API client abstraction."""
from __future__ import annotations

import json as jsonlib
from dataclasses import dataclass
from typing import Any, Dict, Optional, Protocol
from urllib import request as urllib_request
from urllib.error import HTTPError


class SessionProtocol(Protocol):
    def post(
        self,
        url: str,
        json: Dict[str, Any],
        headers: Dict[str, str],
        timeout: int,
    ) -> "ResponseProtocol":
        ...


class ResponseProtocol(Protocol):
    status_code: int

    def json(self) -> Dict[str, Any]:
        ...

    def raise_for_status(self) -> None:
        ...


class _URLLibResponse:
    def __init__(self, status_code: int, body: bytes):
        self.status_code = status_code
        self._body = body

    def json(self) -> Dict[str, Any]:
        if not self._body:
            return {}
        return jsonlib.loads(self._body.decode("utf-8"))

    def raise_for_status(self) -> None:
        if self.status_code >= 400:
            raise RuntimeError(f"HTTP error {self.status_code}")


class _URLLibSession:
    def post(
        self,
        url: str,
        json: Dict[str, Any],
        headers: Dict[str, str],
        timeout: int,
    ) -> _URLLibResponse:
        data = jsonlib.dumps(json).encode("utf-8")
        final_headers = {"Content-Type": "application/json", **headers}
        req = urllib_request.Request(url, data=data, headers=final_headers, method="POST")
        try:
            with urllib_request.urlopen(req, timeout=timeout) as response:
                return _URLLibResponse(response.status, response.read())
        except HTTPError as exc:
            body = exc.read() if exc.fp else b""
            return _URLLibResponse(exc.code, body)



@dataclass
class BrokerAPI:
    """Thin wrapper for a REST broker API."""

    base_url: str
    api_key: str
    session: Optional[SessionProtocol] = None
    timeout: int = 10

    def __post_init__(self) -> None:
        if not self.base_url:
            raise ValueError("base_url must be provided")
        if not self.api_key:
            raise ValueError("api_key must be provided")
        if self.session is None:
            self.session = _URLLibSession()

    def place_order(
        self,
        symbol: str,
        side: str,
        quantity: int,
        price: Optional[float] = None,
        order_type: str = "market",
    ) -> Dict[str, Any]:
        """Submit an order to the broker and return the parsed JSON payload."""

        if quantity <= 0:
            raise ValueError("quantity must be positive")
        if side not in {"buy", "sell"}:
            raise ValueError("side must be either 'buy' or 'sell'")

        payload = {
            "symbol": symbol,
            "side": side,
            "quantity": quantity,
            "type": order_type,
        }
        if price is not None:
            payload["price"] = price

        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }

        response = self.session.post(
            f"{self.base_url.rstrip('/')}/orders",
            json=payload,
            headers=headers,
            timeout=self.timeout,
        )
        response.raise_for_status()
        return response.json()


__all__ = ["BrokerAPI"]
