#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
OCR Worker — RapidOCR 子进程封装
用法：python ocr-worker.py <imagePath>
输出：stdout 仅输出 JSON，不输出其他内容
"""

import json
import os
import sys
import time


def main():
    if len(sys.argv) < 2:
        result = {"ok": False, "error": "缺少 imagePath 参数"}
        print(json.dumps(result, ensure_ascii=False))
        sys.exit(1)

    image_path = sys.argv[1]
    cache_root = os.environ.get("OCR_CACHE_ROOT", "").strip()
    if cache_root:
        os.makedirs(cache_root, exist_ok=True)
        os.environ.setdefault("XDG_CACHE_HOME", cache_root)
        os.environ.setdefault("RAPIDOCR_HOME", cache_root)
        os.environ.setdefault("ORT_HOME", cache_root)

    if not os.path.exists(image_path):
        result = {"ok": False, "error": f"文件不存在: {image_path}"}
        print(json.dumps(result, ensure_ascii=False))
        sys.exit(1)

    try:
        from rapidocr_onnxruntime import RapidOCR
    except ImportError as e:
        result = {"ok": False, "error": f"未安装 rapidocr-onnxruntime: {str(e)}"}
        print(json.dumps(result, ensure_ascii=False))
        sys.exit(1)

    try:
        engine = RapidOCR()
        start = time.time()
        ocr_result, _ = engine(image_path)
        elapsed_ms = int((time.time() - start) * 1000)

        if ocr_result is None or len(ocr_result) == 0:
            result = {
                "ok": True,
                "text": "",
                "lines": [],
                "charCount": 0,
                "elapsedMs": elapsed_ms,
            }
            print(json.dumps(result, ensure_ascii=False))
            sys.exit(0)

        lines = []
        total_chars = 0
        for item in ocr_result:
            text = item[1] if len(item) > 1 else ""
            confidence = item[2] if len(item) > 2 else 0.0
            lines.append({"text": text, "confidence": float(confidence)})
            total_chars += len(text)

        full_text = "\n".join([line["text"] for line in lines])

        result = {
            "ok": True,
            "text": full_text,
            "lines": lines,
            "charCount": total_chars,
            "elapsedMs": elapsed_ms,
        }
        print(json.dumps(result, ensure_ascii=False))
        sys.exit(0)

    except Exception as e:
        result = {"ok": False, "error": f"OCR 处理失败: {str(e)}"}
        print(json.dumps(result, ensure_ascii=False))
        sys.exit(1)


if __name__ == "__main__":
    # 确保 stdout/stderr 使用 UTF-8，避免中文乱码
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    if hasattr(sys.stderr, "reconfigure"):
        sys.stderr.reconfigure(encoding="utf-8", errors="replace")
    main()
