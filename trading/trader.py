"""Trading orchestration logic."""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from typing import Any, Dict, Iterable, List, Optional

from .broker import BrokerAPI
from .strategy import Decision, MovingAverageStrategy


@dataclass
class Trader:
    """Connects a strategy with a broker while enforcing basic risk rules."""

    strategy: MovingAverageStrategy
    broker: BrokerAPI
    symbol: str
    trade_quantity: int = 1
    max_position: int = 1
    max_daily_notional: float = 10_000.0
    trades: List[Dict[str, Any]] = field(default_factory=list)
    position: int = 0
    notional_exposure: float = 0.0

    def _can_execute(self, decision: Decision, price: float) -> bool:
        if decision == "buy":
            projected_position = self.position + self.trade_quantity
            projected_notional = self.notional_exposure + price * self.trade_quantity
            if projected_position > self.max_position:
                return False
            if projected_notional > self.max_daily_notional:
                return False
        elif decision == "sell":
            if self.position - self.trade_quantity < 0:
                return False
        return True

    def process_tick(
        self,
        prices: Iterable[float],
        latest_price: float,
        timestamp: Optional[datetime] = None,
    ) -> Dict[str, Any]:
        """Evaluate the strategy and place an order when conditions are met."""

        decision = self.strategy.decide(list(prices))
        result: Dict[str, Any] = {"decision": decision, "order": None}
        if decision == "hold":
            return result
        if not self._can_execute(decision, latest_price):
            return result

        side = "buy" if decision == "buy" else "sell"
        order_response = self.broker.place_order(
            symbol=self.symbol,
            side=side,
            quantity=self.trade_quantity,
            price=None,
            order_type="market",
        )

        if decision == "buy":
            self.position += self.trade_quantity
            self.notional_exposure += latest_price * self.trade_quantity
        else:
            self.position -= self.trade_quantity
            self.notional_exposure = max(
                0.0, self.notional_exposure - latest_price * self.trade_quantity
            )

        trade_record = {
            "timestamp": (timestamp or datetime.utcnow()).isoformat(),
            "symbol": self.symbol,
            "side": side,
            "price": latest_price,
            "quantity": self.trade_quantity,
            "pnl": order_response.get("pnl", 0.0),
            "order_id": order_response.get("id"),
        }
        self.trades.append(trade_record)
        result["order"] = order_response
        return result


__all__ = ["Trader"]
