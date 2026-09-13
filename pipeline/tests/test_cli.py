from tlw_pipeline.cli import main


def test_cli_build_then_validate(dataset, tmp_path, capsys):
    out = str(tmp_path / "dist")
    assert main(["--root", dataset, "--out", out, "--years", "2024", "--limit", "10"]) == 0
    assert main(["--validate", out]) == 0
    assert "contract OK" in capsys.readouterr().out


def test_cli_refuses_unknown_year(dataset, tmp_path):
    import pytest
    with pytest.raises(SystemExit):
        main(["--root", dataset, "--out", str(tmp_path / "d"), "--years", "1800"])
