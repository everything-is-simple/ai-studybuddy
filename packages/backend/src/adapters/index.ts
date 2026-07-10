// Adapters 入口（Phase 0.8 T03–T05 实现）
//
// - StorageAdapter  → 本地文件目录读写，逻辑 storage_key 入库，路径逃逸拒绝
// - PdfConverter    → pdf-parse 提取纯文本
// - OcrConverter    → RapidOCR 图片识别（PaddleOCR 为备选实现）
// - TextConverter   → Markdown/纯文本直接入库
// - NoteAiProvider  → 中转 GPT/Claude 生成结构化笔记
export {};
