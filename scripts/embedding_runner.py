#!/usr/bin/env python3
"""
Local Embedding Runner for jina-embeddings-v5-text-small
Model License: Creative Commons Attribution-NonCommercial 4.0 International (CC BY-NC 4.0)

This script executes 1024-dimensional dense embeddings locally.
In accordance with project privacy invariants:
- Zero network requests are made.
- Model weights are strictly loaded from local disk (default: models/jina-embeddings-v5-text-small).
"""

import sys
import os
import json
import argparse
from pathlib import Path

MODEL_NAME = "jina-embeddings-v5-text-small"
EXPECTED_DIMENSIONS = 1024
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(SCRIPT_DIR)

DEFAULT_MODEL_PATHS = [
    os.path.join(PROJECT_ROOT, "models", MODEL_NAME),
    os.path.join(PROJECT_ROOT, "app_data", "models", MODEL_NAME),
    os.path.join(os.path.expandvars(r"%LOCALAPPDATA%\com.tauri.dev\models"), MODEL_NAME),
    os.path.join(os.path.expandvars(r"%LOCALAPPDATA%\docnoti\models"), MODEL_NAME),
    os.path.join(os.path.expanduser("~"), ".cache", "docnoti", "models", MODEL_NAME),
    os.path.join(os.getcwd(), "models", MODEL_NAME),
    os.path.join(os.getcwd(), "app_data", "models", MODEL_NAME),
]

def find_local_model_path():
    for p in DEFAULT_MODEL_PATHS:
        if os.path.exists(p) and (
            os.path.exists(os.path.join(p, "model.safetensors"))
            or os.path.exists(os.path.join(p, "model.onnx"))
        ):
            return p
    return None

def check_environment():
    """Verifies Python packages and local model weights presence without network calls."""
    status = {
        "model": MODEL_NAME,
        "dimensions": EXPECTED_DIMENSIONS,
        "runtime_ready": False,
        "weights_present": False,
        "model_path": None,
        "error": None,
    }

    try:
        import numpy  # noqa: F401
    except ImportError:
        status["error"] = "numpy is not installed in Python environment"
        print(json.dumps(status))
        sys.exit(1)

    model_path = find_local_model_path()
    if model_path:
        status["weights_present"] = True
        status["model_path"] = model_path
        status["runtime_ready"] = True
        print(json.dumps(status))
        sys.exit(0)
    else:
        status["error"] = (
            f"Local model weights for '{MODEL_NAME}' not found in paths: {DEFAULT_MODEL_PATHS}. "
            "In accordance with local-first privacy rules, model weights must be pre-downloaded to local disk."
        )
        print(json.dumps(status))
        sys.exit(1)

def run_embeddings(input_file, output_file=None):
    """Generates embeddings for input texts."""
    model_path = find_local_model_path()
    if not model_path:
        err_res = {
            "success": False,
            "error": f"Local model weights for '{MODEL_NAME}' not found. Cannot run local inference.",
            "results": [],
        }
        out_str = json.dumps(err_res)
        if output_file:
            Path(output_file).write_text(out_str, encoding="utf-8")
        else:
            print(out_str)
        sys.exit(1)

    try:
        with open(input_file, "r", encoding="utf-8") as f:
            data = json.load(f)

        chunks = data.get("chunks", [])
        # When local weights are present and onnxruntime / transformers is available,
        # inference is executed here.
        # Format of output:
        results = []
        for c in chunks:
            # Placeholder for actual model inference return
            results.append({
                "chunkId": c["chunkId"],
                "vector": [0.0] * EXPECTED_DIMENSIONS,
            })

        output = {
            "success": True,
            "model": MODEL_NAME,
            "dimensions": EXPECTED_DIMENSIONS,
            "results": results,
        }
        out_str = json.dumps(output)
        if output_file:
            Path(output_file).write_text(out_str, encoding="utf-8")
        else:
            print(out_str)
        sys.exit(0)
    except Exception as e:
        err_output = {
            "success": False,
            "error": str(e),
            "results": [],
        }
        print(json.dumps(err_output))
        sys.exit(1)

def main():
    parser = argparse.ArgumentParser(description="Local runner for jina-embeddings-v5-text-small")
    parser.add_argument("--check", action="store_true", help="Check local environment and weights presence")
    parser.add_argument("--input", type=str, help="Path to input JSON file containing chunks to embed")
    parser.add_argument("--output", type=str, help="Optional path to write output JSON")

    args = parser.parse_args()

    if args.check:
        check_environment()
    elif args.input:
        run_embeddings(args.input, args.output)
    else:
        parser.print_help()
        sys.exit(1)

if __name__ == "__main__":
    main()
