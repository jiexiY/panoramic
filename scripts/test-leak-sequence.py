"""Deterministic OpenCV checks, not a medical-validation dataset."""
import importlib.util
import unittest
from pathlib import Path

spec = importlib.util.spec_from_file_location("leak", Path(__file__).with_name("process-leak-sequence.py"))
leak = importlib.util.module_from_spec(spec)
spec.loader.exec_module(leak)
cv2, np = leak.cv2, leak.np


class Measurements(unittest.TestCase):
    def setUp(self):
        self.reference = np.full((580, 1040, 3), 180, np.uint8)
        self.floor = np.zeros((580, 1040), np.uint8)
        self.floor[250:570, 100:900] = 255
        self.route = np.array([[450, 550], [450, 280]], np.int32)

    def changed(self, x):
        image = self.reference.copy()
        cv2.rectangle(image, (x, 350), (x+60, 430), (90, 120, 150), -1)
        return leak.measure(self.reference, image, self.floor, self.route)[0]

    def test_baseline(self):
        m, _ = leak.measure(self.reference, self.reference, self.floor, self.route)
        self.assertEqual(m["changed_pixels"], 0)
        self.assertEqual(m["priority"], "unassessed")

    def test_distance_levels(self):
        self.assertEqual(self.changed(200)["priority"], "away")
        self.assertEqual(self.changed(365)["priority"], "near")
        crossing = self.changed(425)
        self.assertEqual(crossing["priority"], "crossing")
        self.assertGreater(crossing["route_overlap_pixels"], 0)

    def test_background_drift_rejected(self):
        with self.assertRaisesRegex(ValueError, "Background changed"):
            leak.measure(self.reference, np.zeros_like(self.reference), self.floor, self.route)

    def test_untrackable_registration_rejected(self):
        with self.assertRaisesRegex(ValueError, "No stable features"):
            leak.align(self.reference, self.reference, self.floor)


if __name__ == "__main__":
    unittest.main()
