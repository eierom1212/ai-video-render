from datetime import datetime
from typing import Any, Dict, Optional

import pytest

from trading.broker import BrokerAPI
from trading.strategy import MovingAverageStrategy
from trading.trader import Trader


class MockResponse:
    def __init__(self, payload: Dict[str, Any], status_code: int = 200):
        self._payload = payload
        self.status_code = status_code

    def json(self) -> Dict[str, Any]:
        return self._payload

    def raise_for_status(self) -> None:
        if self.status_code >= 400:
            raise RuntimeError("HTTP error")


class MockSession:
    def __init__(self, payload: Dict[str, Any]):
        self.payload = payload
        self.last_request: Optional[Dict[str, Any]] = None

    def post(self, url: str, json: Dict[str, Any], headers: Dict[str, Any], timeout: int) -> MockResponse:
        self.last_request = {
            "url": url,
            "json": json,
            "headers": headers,
            "timeout": timeout,
        }
        return MockResponse(self.payload)


@pytest.fixture
def strategy() -> MovingAverageStrategy:
    return MovingAverageStrategy(short_window=2, long_window=4, threshold=0.01)


def test_buy_order_sent_when_signal_is_positive(strategy):
    session = MockSession({"id": "order-1", "status": "filled", "pnl": 5.0})
    broker = BrokerAPI(base_url="https://broker.test", api_key="token", session=session)
    trader = Trader(strategy=strategy, broker=broker, symbol="TEST", max_position=2)

    prices = [100, 101, 102, 105]
    result = trader.process_tick(prices, latest_price=106, timestamp=datetime(2024, 1, 1))

    assert result["decision"] == "buy"
    assert result["order"] == session.payload
    assert trader.position == 1
    assert session.last_request["json"]["side"] == "buy"
    assert session.last_request["json"]["quantity"] == trader.trade_quantity


def test_skip_trade_when_risk_limit_reached(strategy):
    session = MockSession({"id": "order-2", "status": "filled", "pnl": 1.0})
    broker = BrokerAPI(base_url="https://broker.test", api_key="token", session=session)
    trader = Trader(strategy=strategy, broker=broker, symbol="TEST", max_position=1)

    prices = [100, 101, 102, 105]
    trader.process_tick(prices, latest_price=106)
    session.last_request = None

    result = trader.process_tick(prices, latest_price=107)

    assert result["order"] is None
    assert session.last_request is None
    assert trader.position == 1


def test_sell_signal_reduces_position(strategy):
    session = MockSession({"id": "order-3", "status": "filled", "pnl": -2.0})
    broker = BrokerAPI(base_url="https://broker.test", api_key="token", session=session)
    trader = Trader(strategy=strategy, broker=broker, symbol="TEST", max_position=2)
    trader.position = 1
    trader.notional_exposure = 100.0

    prices = [110, 109, 108, 105]
    result = trader.process_tick(prices, latest_price=104)

    assert result["decision"] == "sell"
    assert trader.position == 0
    assert result["order"]["id"] == "order-3"
    assert session.last_request["json"]["side"] == "sell"


def test_broker_validations(strategy):
    broker = BrokerAPI(base_url="https://broker.test", api_key="token", session=MockSession({}))
    with pytest.raises(ValueError):
        broker.place_order(symbol="TEST", side="buy", quantity=0)
    with pytest.raises(ValueError):
        broker.place_order(symbol="TEST", side="invalid", quantity=1)
