"""Generate performance reports from trade history."""
from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable, List, Mapping


def _max_drawdown(equity_curve: List[float]) -> float:
    peak = equity_curve[0]
    max_dd = 0.0
    for value in equity_curve:
        if value > peak:
            peak = value
        drawdown = (peak - value)
        if drawdown > max_dd:
            max_dd = drawdown
    return max_dd


@dataclass
class Trade:
    pnl: float
    return_pct: float


def _normalise_trades(trades: Iterable[Mapping[str, float]]) -> List[Trade]:
    normalised: List[Trade] = []
    for trade in trades:
        pnl = float(trade.get("pnl", 0.0))
        return_pct = float(trade.get("return", trade.get("return_pct", 0.0)))
        normalised.append(Trade(pnl=pnl, return_pct=return_pct))
    return normalised


def generate_performance_report(trades: Iterable[Mapping[str, float]]) -> Mapping[str, float]:
    """Aggregate simple statistics from the provided trades."""

    normalised = _normalise_trades(trades)
    total_trades = len(normalised)
    total_pnl = sum(trade.pnl for trade in normalised)
    wins = sum(1 for trade in normalised if trade.pnl > 0)
    win_rate = wins / total_trades if total_trades else 0.0
    avg_return = (
        sum(trade.return_pct for trade in normalised) / total_trades if total_trades else 0.0
    )
    equity_curve: List[float] = []
    cumulative = 0.0
    for trade in normalised:
        cumulative += trade.pnl
        equity_curve.append(cumulative)
    max_drawdown = _max_drawdown(equity_curve) if equity_curve else 0.0

    return {
        "total_trades": total_trades,
        "total_pnl": total_pnl,
        "win_rate": win_rate,
        "average_return": avg_return,
        "max_drawdown": max_drawdown,
    }


def export_report(report: Mapping[str, float], path: Path) -> Path:
    """Persist the report to disk as formatted JSON."""

    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as f:
        json.dump(report, f, indent=2, sort_keys=True)
    return path


__all__ = ["generate_performance_report", "export_report"]
