import subprocess
import unittest
from pathlib import Path

ENTRYPOINT = Path(__file__).resolve().parents[1] / "entrypoint.sh"


class EntrypointTests(unittest.TestCase):
    def test_stale_x_lock_is_removed_before_xvfb_starts(self):
        """Lock/socket obsoletos precisam sumir antes do Xvfb, senão ele não sobe."""
        lines = ENTRYPOINT.read_text(encoding="utf-8").splitlines()
        rm_index = next(
            i for i, line in enumerate(lines) if "X${display_number}-lock" in line and line.startswith("rm ")
        )
        xvfb_index = next(i for i, line in enumerate(lines) if line.startswith("Xvfb "))
        self.assertLess(rm_index, xvfb_index)

    def test_entrypoint_is_valid_posix_shell(self):
        result = subprocess.run(
            ["sh", "-n", str(ENTRYPOINT)], capture_output=True, text=True
        )
        self.assertEqual(result.returncode, 0, result.stderr)


if __name__ == "__main__":
    unittest.main()
