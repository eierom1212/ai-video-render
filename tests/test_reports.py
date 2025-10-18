from pathlib import Path

import pytest

from reports.generator import export_report, generate_performance_report


def test_generate_performance_report():
    trades = [
        {"pnl": 10, "return": 0.02},
        {"pnl": -5, "return": -0.01},
        {"pnl": 20, "return": 0.04},
    ]
    report = generate_performance_report(trades)

    assert report["total_trades"] == 3
    assert report["total_pnl"] == 25
    assert report["win_rate"] == pytest.approx(2 / 3)
    assert report["average_return"] == pytest.approx((0.02 - 0.01 + 0.04) / 3)
    assert report["max_drawdown"] == 5


def test_export_report(tmp_path: Path):
    report = {"total_trades": 1, "total_pnl": 5, "win_rate": 1.0, "average_return": 0.05, "max_drawdown": 0}
    path = tmp_path / "reports" / "summary.json"
    written = export_report(report, path)

    assert written.exists()
    assert written.read_text(encoding="utf-8") != ""
