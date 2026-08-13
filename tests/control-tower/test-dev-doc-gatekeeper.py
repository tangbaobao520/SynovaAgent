#!/usr/bin/env python3
"""tests/control-tower/test-dev-doc-gatekeeper.py — D212 门禁测试"""
import os
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '../../scripts/control-tower'))
from dev_doc_gatekeeper import DevDocGatekeeper

GOOD_DOC = """# Test Doc
## Test Requirements
L1 unit tests with fixtures.

## Wiring Verification
src/agent/main-agent.ts calls src/agent/task-decomposer.ts

## Authority Doc Verification
Auth Doc #4 from docs/synova/research/权威文档07-Agent工程能力对标-20260710/
"""

BAD_DOC = """# Bad Test Doc
No test section here.
No wiring section here.
No auth doc section here.
But has E-99 and src/nonexistent/file.ts
"""


class TestDevDocGatekeeper(unittest.TestCase):

    def test_good_doc_all_pass(self):
        with tempfile.NamedTemporaryFile(mode='w', suffix='.md', delete=False, encoding='utf-8') as f:
            f.write(GOOD_DOC)
            tmp = f.name
        try:
            gk = DevDocGatekeeper(tmp)
            results = gk.validate()
            passed = all(r.passed for r in results)
            self.assertTrue(passed)
        finally:
            os.unlink(tmp)

    def test_bad_doc_has_fail(self):
        with tempfile.NamedTemporaryFile(mode='w', suffix='.md', delete=False, encoding='utf-8') as f:
            f.write(BAD_DOC)
            tmp = f.name
        try:
            gk = DevDocGatekeeper(tmp)
            results = gk.validate()
            failed = [r for r in results if not r.passed]
            self.assertGreater(len(failed), 0)
        finally:
            os.unlink(tmp)

    def test_nonexistent_file(self):
        gk = DevDocGatekeeper("/nonexistent/path.md")
        self.assertEqual(gk.content, "")

    def test_empty_doc_skips_c1_c2(self):
        with tempfile.NamedTemporaryFile(mode='w', suffix='.md', delete=False, encoding='utf-8') as f:
            f.write("# Empty doc")
            tmp = f.name
        try:
            gk = DevDocGatekeeper(tmp)
            results = gk.validate()
            # C3-C5 should FAIL (no sections)
            c3 = results[2]
            c4 = results[3]
            c5 = results[4]
            self.assertFalse(c3.passed)
            self.assertFalse(c4.passed)
            self.assertFalse(c5.passed)
        finally:
            os.unlink(tmp)

    def test_help_exit_code(self):
        ret = os.system('python scripts/control-tower/dev-doc-gatekeeper.py --help')
        self.assertEqual(ret, 0)


if __name__ == '__main__':
    unittest.main()
