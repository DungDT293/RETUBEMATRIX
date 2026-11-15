# -*- coding: utf-8 -*-
"""
Status evaluation and structured result builders for Content ID check.
"""
from __future__ import annotations

import logging
from typing import Any, Dict, List

logger = logging.getLogger(__name__)

CLEAN_VALUES = {
    "—", "–", "-", "‒", "―", "−",
    "none", "clear", "clean",
    "không có", "no issues", "no issues found",
    "không phát hiện thấy vấn đề nào", "không có vấn đề gì",
    "なし", "問題はありません", "問題なし",
    "없음", "문제 없음", "제한사항 없음",
    "ninguna", "no se han encontrado problemas",
    "aucune", "aucun problème", "aucun problème détecté",
    "keine", "keine einschränkungen", "keine probleme",
    "無", "无", "未发现问题", "未發現問題", "没有问题",
    "ไม่มี", "tidak ada", "tidak ada masalah",
    "нет", "ограничений нет", "нарушений не выявлено",
}


def _target_ids_without_identity(rows: List[Dict[str, Any]], video_title: str) -> List[str]:
    """Helper xác định target_ids nếu không có target_ids cụ thể."""
    norm_title = str(video_title or "").strip().lower()
    if not rows or not norm_title:
        return ["__pending_new_row__"]
    matching = [
        r.get("vid")
        for r in rows
        if r.get("vid") and str(r.get("title", "")).strip().lower() == norm_title
    ]
    if len(matching) == 1:
        return matching
    return ["__pending_new_row__"]


def _timeout_result(video_id: str, results: Dict[str, Any]) -> Dict[str, Any]:
    """Tạo kết quả timeout có cấu trúc."""
    item = results.get(video_id, {})
    return {
        "success": False,
        "pending": True,
        "timed_out": True,
        "status": "timeout",
        "error": "Quá thời gian chờ kiểm tra bản quyền (Timeout).",
        "video_id": video_id,
        "results": results,
        "bkt_check_status": item.get("bkt_check_status", "pending"),
    }


def _pending_result(video_id: str, results: Dict[str, Any]) -> Dict[str, Any]:
    """Tạo kết quả pending có cấu trúc."""
    item = results.get(video_id, {})
    return {
        "success": False,
        "pending": True,
        "status": "pending",
        "video_id": video_id,
        "results": results,
        "bkt_check_status": item.get("bkt_check_status", "pending"),
    }
