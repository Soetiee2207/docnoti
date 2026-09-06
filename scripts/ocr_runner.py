#!/usr/bin/env python3
"""
docnoti - Local PaddleOCR Runner
Executes PaddleOCR on a specified image file and returns structured JSON output.
"""

import sys
import json
import os

def check_availability():
    try:
        import paddleocr  # noqa: F401
        return True
    except ImportError:
        return False

def main():
    if len(sys.argv) < 2:
        print(json.dumps({"error": "Missing arguments. Usage: ocr_runner.py <image_path> or --check"}))
        sys.exit(1)

    arg = sys.argv[1]

    if arg == "--check":
        available = check_availability()
        print(json.dumps({"available": available}))
        sys.exit(0 if available else 2)

    image_path = arg
    if not os.path.exists(image_path):
        print(json.dumps({"error": f"Image file not found: {image_path}"}))
        sys.exit(1)

    if not check_availability():
        sys.stderr.write(
            "PaddleOCR is not installed in the current Python environment.\n"
            "Please install it using: pip install paddlepaddle paddleocr\n"
        )
        sys.exit(2)

    try:
        from paddleocr import PaddleOCR
        # Initialize PaddleOCR with Vietnamese language and angle classification
        ocr = PaddleOCR(use_angle_cls=True, lang="vi", show_log=False)
        result = ocr.ocr(image_path, cls=True)

        lines = []
        if result and len(result) > 0 and result[0]:
            for item in result[0]:
                box = item[0]
                text = item[1][0]
                confidence = float(item[1][1])
                x_coords = [p[0] for p in box]
                y_coords = [p[1] for p in box]
                min_x, max_x = min(x_coords), max(x_coords)
                min_y, max_y = min(y_coords), max(y_coords)

                lines.append({
                    "text": text,
                    "confidence": confidence,
                    "box": {
                        "x": min_x,
                        "y": min_y,
                        "width": max_x - min_x,
                        "height": max_y - min_y,
                    },
                })

        full_text = "\n".join([line["text"] for line in lines])
        output = {
            "success": True,
            "text": full_text,
            "lines": lines,
        }
        print(json.dumps(output, ensure_ascii=False))
        sys.exit(0)

    except Exception as e:
        sys.stderr.write(f"PaddleOCR execution error: {e}\n")
        print(json.dumps({"success": False, "error": str(e)}))
        sys.exit(1)

if __name__ == "__main__":
    main()
