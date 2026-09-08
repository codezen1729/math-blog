import importlib.util
from pathlib import Path
import tempfile
import unittest
import zipfile

MODULE_PATH = Path(__file__).with_name("package-site.py")
SPEC = importlib.util.spec_from_file_location("package_site", MODULE_PATH)
assert SPEC and SPEC.loader
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)
archive_bytes = MODULE.archive_bytes
packaged_files = MODULE.packaged_files


class SitePackageTests(unittest.TestCase):
    def config(self):
        return {"excludeDirectories": ["dist-pages", "node_modules"], "excludeNames": [".DS_Store"]}

    def test_two_packages_from_identical_inputs_are_byte_identical(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "app").mkdir()
            (root / "app/page.tsx").write_text("export default 1\n")
            (root / "z.txt").write_text("last\n")
            self.assertEqual(archive_bytes(root, self.config()), archive_bytes(root, self.config()))

    def test_paths_are_sorted_and_build_outputs_are_excluded(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "b.txt").write_text("b")
            (root / "a.txt").write_text("a")
            (root / "dist-pages").mkdir()
            (root / "dist-pages/index.html").write_text("derived")
            data = archive_bytes(root, self.config())
            archive = Path(directory) / "result.zip"
            archive.write_bytes(data)
            with zipfile.ZipFile(archive) as package:
                self.assertEqual(package.namelist(), ["a.txt", "b.txt"])
                self.assertTrue(all(info.date_time == (2020, 1, 1, 0, 0, 0) for info in package.infolist()))

    def test_symlinks_are_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            target = root / "target"
            target.write_text("value")
            try:
                (root / "link").symlink_to(target)
            except OSError:
                self.skipTest("symbolic links unavailable")
            with self.assertRaisesRegex(ValueError, "Symbolic links"):
                packaged_files(root, self.config())


if __name__ == "__main__":
    unittest.main()
