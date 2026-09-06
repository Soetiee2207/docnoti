#!/usr/bin/env python3
"""
docnoti - Local PaddleOCR Runner
Executes PaddleOCR on a specified image file and returns structured JSON output.
"""

import sys
import json
import os

# Prevent oneDNN instruction PIR attribute issue on CPU in PaddlePaddle 3.3.x
os.environ["PADDLE_PDX_ENABLE_MKLDNN_BYDEFAULT"] = "0"
os.environ["FLAGS_use_mkldnn"] = "0"

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
        # Initialize PaddleOCR with Vietnamese language support
        ocr = PaddleOCR(lang="vi", enable_mkldnn=False)
        result = ocr.ocr(image_path)

        lines = []
        if result and len(result) > 0 and result[0]:
            first = result[0]
            # Handle PaddleOCR 3.7+ (PaddleX pipeline) dictionary output
            if isinstance(first, dict):
                rec_texts = first.get("rec_texts", [])
                rec_scores = first.get("rec_scores", [])
                rec_boxes = first.get("rec_boxes", [])

                for idx, text in enumerate(rec_texts):
                    conf = float(rec_scores[idx]) if idx < len(rec_scores) else 1.0
                    box_dict = None
                    if idx < len(rec_boxes):
                        b = rec_boxes[idx]
                        if len(b) == 4:
                            box_dict = {
                                "x": float(b[0]),
                                "y": float(b[1]),
                                "width": float(b[2] - b[0]),
                                "height": float(b[3] - b[1]),
                            }
                    lines.append({
                        "text": str(text),
                        "confidence": conf,
                        "box": box_dict,
                    })

            # Handle legacy PaddleOCR (2.x) nested list output
            elif isinstance(first, list):
                for item in first:
                    if len(item) >= 2:
                        box = item[0]
                        text = item[1][0]
                        confidence = float(item[1][1])
                        x_coords = [p[0] for p in box]
                        y_coords = [p[1] for p in box]
                        min_x, max_x = min(x_coords), max(x_coords)
                        min_y, max_y = min(y_coords), max(y_coords)

                        lines.append({
                            "text": str(text),
                            "confidence": confidence,
                            "box": {
                                "x": float(min_x),
                                "y": float(min_y),
                                "width": float(max_x - min_x),
                                "height": float(max_y - min_y),
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
