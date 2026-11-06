# Updater Signing — RETubeMatrix

Tài liệu này mô tả cách ký và phát hành bản cập nhật cho RETubeMatrix.

## 1. Hiện trạng

- Endpoint: `https://github.com/DungDT293/RETUBEMATRIX/releases/latest/download/latest.json`
- Public key: trong `src-tauri/tauri.conf.json` → `plugins.updater.pubkey`
- Private key: **không nằm trong repo**, được tạo tại:
  `%USERPROFILE%\.tauri\retubematrix-updater.key`

> Nếu bạn đã có key riêng từ trước, hãy thay `pubkey` trong config bằng public key của bạn và cập nhật secret GitHub tương ứng. Không dùng lẫn key cũ/mới.

## 2. GitHub Secrets cần thiết

Vào **Settings → Secrets and variables → Actions** của repo `DungDT293/RETUBEMATRIX`:

| Secret                               | Giá trị                                             |
| :----------------------------------- | :-------------------------------------------------- |
| `TAURI_SIGNING_PRIVATE_KEY`          | Toàn bộ nội dung file private key (một dòng base64) |
| `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | Để trống nếu key không có mật khẩu                  |

Lấy nội dung private key:

```powershell
Get-Content "$env:USERPROFILE\.tauri\retubematrix-updater.key" -Raw
```

## 3. Sao lưu & an toàn

- Sao lưu private key ra nơi an toàn (USB offline / password manager). **Mất key = không thể phát hành update** cho các bản đã cài.
- Không commit, không dán private key vào issue/chat/log.
- Nếu key bị lộ: tạo key mới, cập nhật `pubkey`, cập nhật secret, phát hành bản mới; người dùng phải cài thủ công một lần.

## 4. Quy trình phát hành

1. Bump version ở 3 file: `package.json`, `src-tauri/Cargo.toml`, `src-tauri/tauri.conf.json`.
2. Cập nhật 3 changelog: `CHANGELOG.md`, `docs/CHANGELOG.vi.md`, `docs/CHANGELOG.zh-CN.md`.
3. Tạo tag `vX.Y.Z` và push.
4. GitHub Actions build + ký, tạo `latest.json` và upload release.
5. Kiểm tra `latest.json` có đúng version và URL artifact.

## 5. Lưu ý với bản cài cũ

Bản đang cài trên máy người dùng (nếu được build trước khi đổi key) dùng public key cũ, nên **không tự update** sang bản mới. Cần cài thủ công một lần; các bản sau sẽ tự update bình thường.
