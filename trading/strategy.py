"""Trading strategy implementations."""
from __future__ import annotations

from dataclasses import dataclass
from typing import Literal, Sequence

Decision = Literal["buy", "sell", "hold"]


@dataclass
class MovingAverageStrategy:
    """Simple moving average crossover strategy.

    The strategy compares the short and long term moving averages. A buy signal is
    generated when the short average exceeds the long average by more than
    ``threshold``. A sell signal is triggered when it drops below the long average
    by the same magnitude. Otherwise the strategy stays flat (``hold``).
    """

    short_window: int
    long_window: int
    threshold: float = 0.0

    def __post_init__(self) -> None:
        if self.short_window <= 0 or self.long_window <= 0:
            raise ValueError("Moving average windows must be positive integers")
        if self.short_window >= self.long_window:
            raise ValueError("short_window must be smaller than long_window")
        if self.threshold < 0:
            raise ValueError("threshold must be non-negative")

    def decide(self, prices: Sequence[float]) -> Decision:
        """Return the trading decision for the latest price series.

        Parameters
        ----------
        prices:
            Historical prices ordered from oldest to newest. The sequence must
            contain at least ``long_window`` values in order to compute both
            moving averages.
        """

        if len(prices) < self.long_window:
            # Not enough data, stay flat until the moving averages are reliable.
            return "hold"

        long_slice = prices[-self.long_window :]
        short_slice = prices[-self.short_window :]
        long_avg = sum(long_slice) / self.long_window
        short_avg = sum(short_slice) / self.short_window

        if long_avg == 0:
            return "hold"

        relative_diff = (short_avg - long_avg) / long_avg

        if relative_diff > self.threshold:
            return "buy"
        if relative_diff < -self.threshold:
            return "sell"
        return "hold"


__all__ = ["MovingAverageStrategy", "Decision"]
