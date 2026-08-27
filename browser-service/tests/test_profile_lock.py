from multiprocessing import Event, Process, Queue
from pathlib import Path
import tempfile
import unittest

from browser_service.profile_lock import ProfileInUse, ProfileLock, ProfileIdRejected


def hold_lock(root: str, profile_id: str, ready: Event, release: Event, result: Queue):
    lock = ProfileLock.acquire(Path(root), profile_id)
    result.put("acquired")
    ready.set()
    release.wait(timeout=5)
    lock.release()


class ProfileLockTests(unittest.TestCase):
    def test_profile_id_cannot_escape_profile_root(self):
        with tempfile.TemporaryDirectory() as root:
            for profile_id in ("../../outside", "profile/with-slash", ""):
                with self.subTest(profile_id=profile_id), self.assertRaises(ProfileIdRejected):
                    ProfileLock.acquire(Path(root), profile_id)

    def test_second_process_cannot_lock_same_profile(self):
        with tempfile.TemporaryDirectory() as root:
            ready = Event()
            release = Event()
            result = Queue()
            process = Process(
                target=hold_lock,
                args=(root, "profile-fernando-01", ready, release, result),
            )
            process.start()
            self.assertTrue(ready.wait(timeout=5))
            self.assertEqual(result.get(timeout=5), "acquired")
            try:
                with self.assertRaises(ProfileInUse):
                    ProfileLock.acquire(Path(root), "profile-fernando-01")
            finally:
                release.set()
                process.join(timeout=5)
                self.assertFalse(process.is_alive())

    def test_release_preserves_profile_directory(self):
        with tempfile.TemporaryDirectory() as root:
            lock = ProfileLock.acquire(Path(root), "profile-fernando-01")
            profile_path = lock.profile_path
            lock.release()
            self.assertTrue(profile_path.is_dir())


if __name__ == "__main__":
    unittest.main()
