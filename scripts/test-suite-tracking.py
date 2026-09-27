"""Actual OpenCV regression checks for the still-based tracking pipeline."""
import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location("suite_tracking", Path(__file__).with_name("render-suite-tracking.py"))
tracking = importlib.util.module_from_spec(spec)
spec.loader.exec_module(tracking)
cv2, np = tracking.cv2, tracking.np


class TrackingTests(unittest.TestCase):
    def test_measures_translation_from_pixels(self):
        rng = np.random.default_rng(812)
        frame = rng.integers(0, 255, (300, 400), dtype=np.uint8)
        frame = cv2.GaussianBlur(frame, (5, 5), 0)
        features = cv2.goodFeaturesToTrack(frame, 180, .01, 8)
        target = cv2.warpAffine(frame, np.float32([[1, 0, 3], [0, 1, 2]]), (400, 300), borderMode=cv2.BORDER_REFLECT_101)
        matrix, _, ids, count, error = tracking.fit(frame, target, features)
        self.assertGreater(count, 100)
        self.assertEqual(len(set(ids)), count)
        self.assertLess(error, .1)
        self.assertAlmostEqual(matrix[0, 2], 3, delta=.1)
        self.assertAlmostEqual(matrix[1, 2], 2, delta=.1)

    def test_no_features_cannot_produce_assessment(self):
        blank = np.zeros((200, 300), np.uint8)
        features = cv2.goodFeaturesToTrack(blank, 180, .01, 8)
        with self.assertRaises(ValueError):
            tracking.fit(blank, blank, features)

    def test_route_intersection_is_geometric(self):
        route = np.array([[50, 100], [400, 100]], dtype=int)
        self.assertEqual(tracking.level(tracking.flow.corners([180, 80, 240, 120]), route), "crossing")
        self.assertEqual(tracking.level(tracking.flow.corners([180, 125, 240, 160]), route), "near")
        self.assertEqual(tracking.level(tracking.flow.corners([180, 200, 240, 240]), route), "away")

    def test_progressive_overlay_visibility(self):
        kinds = ['object','possible_trip']
        self.assertEqual(tracking.visible_overlay(0,kinds), dict(features=False,route=False,regions=[]))
        self.assertEqual(tracking.visible_overlay(10,kinds), dict(features=True,route=False,regions=[]))
        self.assertEqual(tracking.visible_overlay(30,kinds), dict(features=True,route=False,regions=[0]))
        self.assertEqual(tracking.visible_overlay(60,kinds), dict(features=True,route=True,regions=[0,1]))
        self.assertEqual(tracking.visible_overlay(90,kinds), dict(features=True,route=True,regions=[0,1]))
        self.assertEqual(tracking.stage_at(119), 'settled')

    def test_l2_samples_settle_amber_and_l3_samples_settle_red(self):
        for stem, bgr in [
            ('a102-bedroom-tracking', tracking.AMBER),
            ('a103-bathroom-tracking', tracking.AMBER),
            ('a101-bedroom-tracking', tracking.flow.RED),
            ('a103-bedroom-tracking', tracking.flow.RED),
        ]:
            with self.subTest(stem=stem), tracking.Image.open(tracking.ROOT/'public/demo'/f'{stem}.gif') as gif:
                gif.seek(90)
                pixels = np.asarray(gif.convert('RGB'))[36:-54]
                colored = int(np.all(pixels == tuple(reversed(bgr)),axis=2).sum())
                self.assertGreater(colored, 200)

    def test_encoded_loops_start_clean_and_finish_settled(self):
        for source in tracking.SOURCES:
            stem = f"{source['suite'].lower()}-{source['zone'].lower()}-tracking"
            with self.subTest(stem=stem), tracking.Image.open(tracking.ROOT/'public/demo'/f'{stem}.gif') as gif:
                self.assertEqual(gif.n_frames,120)
                self.assertEqual(gif.info['loop'],0)
                duration = 0
                for index in range(gif.n_frames):
                    gif.seek(index)
                    duration += gif.info['duration']
                self.assertEqual(duration,12000)
                for index, has_boxes in [(0,False),(9,False),(30,True),(90,True),(119,True)]:
                    gif.seek(index)
                    pixels = np.asarray(gif.convert('RGB'))[36:-54]
                    green = int(np.all(pixels == (0,255,0),axis=2).sum())
                    self.assertEqual(green > 200,has_boxes,(stem,index,green))


if __name__ == "__main__":
    unittest.main()
