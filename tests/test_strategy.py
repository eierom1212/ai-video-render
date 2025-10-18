import pytest

from trading.strategy import MovingAverageStrategy


def test_hold_when_not_enough_prices():
    strategy = MovingAverageStrategy(short_window=3, long_window=5, threshold=0.01)
    assert strategy.decide([1, 2, 3]) == "hold"


def test_buy_signal_when_short_above_long():
    strategy = MovingAverageStrategy(short_window=2, long_window=5, threshold=0.01)
    prices = [100, 101, 102, 103, 110]
    assert strategy.decide(prices) == "buy"


def test_sell_signal_when_short_below_long():
    strategy = MovingAverageStrategy(short_window=2, long_window=5, threshold=0.01)
    prices = [110, 109, 108, 107, 100]
    assert strategy.decide(prices) == "sell"


def test_hold_within_threshold():
    strategy = MovingAverageStrategy(short_window=2, long_window=5, threshold=0.05)
    prices = [100, 100, 100, 100, 101]
    assert strategy.decide(prices) == "hold"


def test_invalid_configuration():
    with pytest.raises(ValueError):
        MovingAverageStrategy(short_window=5, long_window=5)
    with pytest.raises(ValueError):
        MovingAverageStrategy(short_window=0, long_window=5)
    with pytest.raises(ValueError):
        MovingAverageStrategy(short_window=3, long_window=5, threshold=-0.1)
