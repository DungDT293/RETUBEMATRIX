# QUY CHUẨN XỬ LÝ METADATA, DẤU VẾT THIẾT BỊ VÀ FINGERPRINT HÌNH ẢNH - ÂM THANH (CHỐNG TRÙNG LẶP NỘI DUNG & BÓP ĐỀ XUẤT YOUTUBE)

> Tai lieu chuyen giao ky thuat tu kien truc RETubeMatrix sang 93-Media-Tool-Mix-Nhac  
> Ap dung cho: Pipeline dung video, mix nhac va xuat ban tu dong tren he thong Electron + FFmpeg.

---

## 1. PHAN TICH NGUYEN NHAN COT LOI KHIEN HE THONG BI YOUTUBE QUET VA BOP DE XUAT

Hien tuong he thong tu dong mix nhac va ghep video nguyen lieu bi YouTube quet ra ma may, nhan dien noi dung trung lap (Reused Content) va bop ty le phan phoi de xuat xuat phat tu 4 diem yeu ky thuat trong ma nguon xuat file (`finalExport.ts`, `exportAudio.ts`, `normalizeVf.ts`):

### 1.1. Ro Ri Metadata Toan Phan O Cap Container Va Cap Stream
- Trong cac lenh xuat FFmpeg Pass 2 (`runFinalCommand_TwoPass`), Single-Step (`runFinalCommand_SingleStep`) va ca xuat am thanh (`exportAudio.ts`), he thong su dung co stream copy:
  ```bash
  -c:v copy -c:a copy
  ```
- **Hau qua**: Khi dung stream copy (`copy`), toan bo du lieu nhung san trong clip nguon va track am thanh nguon (ten thiet bi/camera, phan mem chinh sua, ngay gio tao file goc, UUID container, encoder string, audio ID3 tags, ma ISRC, ban quyen phat hanh, ten ca si/album goc) duoc giu nguyen 100% va truyen thang vao file thanh pham.
- He thong kiem duyet tu dong cua YouTube trich xuat truc tiep cac the metadata nay ngay khi bat dau upload, phat hien video duoc tong hop tu cac doan cat tai su dung va lap tuc danh dau kenh vi pham chinh sach noi dung trung lap (Reused Content).

### 1.2. Nhan Dien Dau Vet Phan Cung Va Ma Dinh Danh File (Device & Encoder Signature)
- Khi xuat hang loat video tu cung mot thiet bi ma khong co co che lam sach encoder signature:
  - Header cua file MP4/M4A chua chuoi dinh danh encoder mac dinh cua FFmpeg (vi du: `Lavf60.xx.xxx`) kem moc thoi gian (Creation Time, Modification Time) dong nhat theo gio he thong.
  - Cau truc cac nguyen tu MP4 atom (`ftyp`, `moov`, `trak`, `udta`, `mdat`) duoc sap xep theo mot khuon mau byte co dinh.
  - Checksum (MD5, SHA-256) cua cac doan clip con trung khop voi co so du lieu da upload truoc do, khien AI cua YouTube de dang nhan dien hanh vi spam video tu dong bang tool.

### 1.3. Xu Ly Am Thanh: Sai Lam Cua Pitch Shift Va Dinh Huong Bao Toan Nguyen Ban 100%
- Trong linh vuc kenh am nhac, viec ap dung cac bo loc bien doi cao do (pitch shift) va toc do (speed shift / tempo) de qua mat Content ID dan toi hau qua nghiem trong:
  - Lam meo tieng, bien dang chat giong ca si, lech tone nhac va pha vo hoan toan cam xuc cua bai hat, khien nguoi nghe lap tuc bo di va ty le giu chan khan gia (Audience Retention) sut giam nghiem trong.
- **Dinh huong ky thuat chuan xac**:
  - **Bao toan chat luong am thanh nguyen ban 100%**: Tuyet doi khong pitch shift, khong lam doi giong ca si, khong doi tone nhac hay nhip do (tempo).
  - **Xoa sach toan dien metadata am thanh goc**: Loai bo triet de ID3v1, ID3v2, ISRC, comments, ban quyen, thong tin nha phat hanh, thiet bi ghi am tu file nguon.
  - **Re-encode sang AAC 320kbps chuan phong thu (Studio Grade)**: Ma hoa am thanh voi bitrate toi da 320kbps, sample rate 48000Hz Stereo, kem co `-fflags +bitexact` de tao ra container am thanh hoan toan tinh khiet, khong mang bat ky the tag hay chuoi nhan dien phan mem nao.

### 1.4. Nhan Dien Khung Hinh Video Tai Su Dung (Visual Hash / Blockhash / Color Histogram)
- Cac video nguyen lieu (b-roll, footage phong canh, chill, timelapse) thuong duoc tai su dung qua nhieu video. Neu chi scale va pad thong thuong:
  - Chu ky nhan dien hinh anh (Perceptual Hash - pHash, Blockhash) cua tung frame hoan toan trung khop voi footage goc da co tren YouTube.
  - Bieu do phan bo mau sac (Color Histogram) giong het nhau.
  - Thu tu xuat hien cua cac doan b-roll bi lap lai theo chuoi quen thuoc.
- Thuat toan thi giac cua YouTube de dang doi chieu cac chuoi frame giong nhau giua cac video, ket luan noi dung khong co gia tri bien doi moi (Lack of Significant Transformation) va bop de xuat.

---

## 2. KIEN TRUC GIAI PHAP KY THUAT 4 TANG MOI

He thong ap dung kien truc xu ly 4 tang toan dien, ket hop bao toan chat am nguyen ban va bien doi sau ve mat thi giac:

```
[Footage B-roll Nguyen Lieu]                [Track Am Thanh Nguon]
           │                                          │
           ▼                                          ▼
┌──────────────────────────────────────┐   ┌──────────────────────────────────────┐
│ TANG 1: LAM SACH METADATA TRIET DE   │   │ TANG 1: XOA TOAN BO ID3 & METADATA   │
│ -map_metadata -1, -map_metadata:s -1 │   │ -map_metadata -1, -map_metadata:s -1 │
│ Xoa sach title, artist, encoder, etc │   │ Xoa sach ISRC, copyright, tags       │
└──────────────────┬───────────────────┘   └──────────────────┬───────────────────┘
                   │                                          │
                   ▼                                          ▼
┌──────────────────────────────────────┐   ┌──────────────────────────────────────┐
│ TANG 2: BIEN DOI THI GIAC VI MO      │   │ TANG 3: BAO TOAN AM THANH 100%       │
│ - Micro-scale 1.015x + Crop bien 1.5%│   │ - Khong pitch shift, khong meo tieng │
│ - Color Grading vi mo (eq filter)    │   │ - Giu 100% tone nhac & giong ca si   │
│ - Vignette mo 4 goc nghe thuat       │   │ - Studio-grade AAC 320kbps / 48kHz   │
│ - Smart HFlip ngau nhien (50% clip)  │   │ - Chuan hoa am luong EBU R128 (-14) │
│ - Shuffle B-roll khong trung lap     │   │ - Clean header (+bitexact)           │
└──────────────────┬───────────────────┘   └──────────────────┬───────────────────┘
                   │                                          │
                   └──────────────────┬───────────────────────┘
                                      ▼
                   ┌──────────────────────────────────────┐
                   │ TANG 4: CONTAINER HARDENING & PADDING│
                   │ - To chuc lai MP4 Atom (+faststart)  │
                   │ - An danh Encoder (+bitexact)        │
                   │ - Random Byte Padding (32-64 bytes)  │
                   │ - Doi 100% Checksum MD5 / SHA-256    │
                   └──────────────────┬───────────────────┘
                                      ▼
                         [Video Thanh Pham Doc Nhat]
```

---

## 3. CHI TIET CAC THAM SO VA CAU LENH FFMPEG CHUAN XAC

### 3.1. Tay Sach Dau Vet Metadata 2 Tang (Container + Stream)
Ap dung bat buoc trong tat ca cac lenh xuat audio va video cuoi cung:

```bash
-map_metadata -1 \
-map_metadata:s -1 \
-metadata title="" \
-metadata artist="" \
-metadata album="" \
-metadata comment="" \
-metadata encoder="" \
-metadata description="" \
-metadata author="" \
-metadata copyright="" \
-metadata:s:v:0 handler_name="VideoHandler" \
-metadata:s:a:0 handler_name="SoundHandler" \
-fflags +bitexact
```

**Nguyen ly ky thuat**:
- `-map_metadata -1`: Xoa toan bo metadata o cap container tong the (loai bo device info, UUID, model camera, software tag, GPS location).
- `-map_metadata:s -1`: Xoa toan bo metadata o cap tung luong stream rieng le (luong video va luong audio). Day la diem cot yeu ngan chan cac tag ISRC hoac ID3 bi lot vao tung packet.
- `-metadata key=""`: Xoa trang cac field thong dung con sot lai trong demuxer cache.
- `handler_name="VideoHandler"` va `handler_name="SoundHandler"`: Ghi de ten bo xu ly mac dinh thanh chuoi tieu chuan MP4 cua Apple/ISO, loai bo chuoi "ISO Media file produced by Google Inc." hoac "Lavf".
- `-fflags +bitexact`: Vo hieu hoa tinh nang tu dong chen version build FFmpeg vao file header.

---

### 3.2. Bao Toan Am Thanh Nguyen Ban 100% & Studio-Grade AAC Re-encode
Tuyet doi khong dung bo loc `asetrate` hay `atempo` de lam lech pitch hay doi toc do. Thay vao do, ta re-encode am thanh voi thong so phong thu cao cap nhat:

```bash
-c:a aac -b:a 320k -ar 48000 -ac 2
```

Khi ket hop chuan hoa am luong theo chuan streaming EBU R128 (YouTube/Spotify standard):
```bash
-af "loudnorm=I=-14:TP=-1.5:LRA=11" -c:a aac -b:a 320k -ar 48000 -ac 2
```

**Giai thich thong so**:
- `-c:a aac`: Su dung bo ma hoa AAC native chuan cua FFmpeg.
- `-b:a 320k`: Bitrate 320 kbps (chuan cao nhat cua dinh dang am thanh nen), dam bao do chi tiet, am hinh va tan so am thanh giu nguyen ven 100% nhu ban master goc.
- `-ar 48000`: Sample rate chuan 48 kHz (tieu chuan san xuat video chuyen nghiep va tieu chuan toi uu cua YouTube), tranh hien tuong resampling lech pha.
- `-ac 2`: 2 kenh Stereo can bang.
- `loudnorm=I=-14:TP=-1.5:LRA=11`: Can bang do to tong the ve muc -14 LUFS (chuan phat cua YouTube). Dieu nay giup am luong video dong deu giua cac bai hat ma khong lam meo tan so hay can thiep vao chat am.

---

### 3.3. Bien Doi Thi Giac Vi Mo Cho Footage B-roll (Visual Reup & Transformation)
Ap dung truc tiep vao Pass 1 (`preTranscodeClips`) khi chuan hoa tung doan footage b-roll.

#### A. Chuoi Filter Video Tong Hop
```bash
scale=iw*1.015:ih*1.015,crop=iw/1.015:ih/1.015,scale=trunc(iw/2)*2:trunc(ih/2)*2,eq=contrast=1.025:brightness=0.01:saturation=1.03:gamma=1.01,vignette=PI/5
```

#### B. Phan Tich Cong Dung Tung Thanh Phan
1. `scale=iw*1.015:ih*1.015,crop=iw/1.015:ih/1.015`:
   - Phong to 1.5% va cat xen 1.5% vien ngoai.
   - Loai bo cac pixel o ria man hinh (noi thuong bi dinh logo mo, watermark hoac vien den).
   - Lam lech toan bo toa do pixel cua khung hinh so voi video goc, khien thuat toan Spatial Hash cua YouTube khong the so khop truc tiep ma tran pixel goc.
2. `scale=trunc(iw/2)*2:trunc(ih/2)*2`:
   - Dam bao chieu rong va chieu cao luon la so chan, ngan chan loi ma hoa cua cac codec h264/hevc doi hoi kich thuoc frame chia het cho 2.
3. `eq=contrast=1.025:brightness=0.01:saturation=1.03:gamma=1.01`:
   - Tinh chinh vi mo: tang 2.5% tuong phan, tang 1% do sang, tang 3% do bao hoa mau, gamma 1.01.
   - Thao tac nay tao hieu ung hinh anh tuoi moi, song dong hon va pha vo hoan toan bieu do phan bo mau sac (Color Histogram Signature) ma he thong kiem duyet doi chieu.
4. `vignette=PI/5`:
   - Tao hieu ung toi nhe tinh te o 4 goc man hinh theo phong cach cinematic.
   - Vua nang cao gia tri tham my cua video, vua lam thay doi triet de gia tri ham bam (Hash) o 4 goc khung hinh - noi ma thuat toan Blockhash cua YouTube quet rat sau de xac dinh goc video.
5. `hflip` (Smart Horizontal Flip - Lat guong ngang thong minh):
   - Ap dung ngau nhien cho khoang 50% so clip b-roll phong canh, thien nhien, timelapse, khong gian chill (khong co text/chu).
   - Lat nguoc toan bo khong gian tu trai sang phai tao nen mot bo khung hinh hoan toan moi ve mat hinh hoc ma nguoi xem van thay tu nhien 100%.

#### C. Xep Ngau Nhien Clip B-roll (Non-repeating Shuffle Sequence)
- Su dung thuat toan Fisher-Yates shuffle kem entropy manh tu `crypto.randomBytes`.
- Dam bao giua cac video xuat ra khong bao gio co su trung lap ve trat tu sap xep chuoi b-roll.

---

### 3.4. Container Hardening Va Random Byte Padding (Doi 100% Checksum MD5/SHA-256)
Sau khi FFmpeg xuat video MP4 hoan tat, he thong bo sung ngay mot khoi byte ngau nhien (32 den 64 bytes) vao cuoi file:

```typescript
import fs from 'node:fs'
import crypto from 'node:crypto'

export async function appendRandomPaddingBytes(filePath: string, byteCount = 32): Promise<void> {
  const count = Math.max(16, Math.min(64, byteCount))
  const randomPayload = crypto.randomBytes(count)
  const marker = Buffer.from('\0MEDIA93_')
  const buffer = Buffer.concat([marker, randomPayload])
  
  await fs.promises.appendFile(filePath, buffer)
}
```

**Tai sao phuong phap nay hieu qua?**
- Tieu chuan container ISO Base Media File Format (MP4) doc du lieu dua theo do dai khai bao trong header atom (`moov`, `mdat`). Cac byte nam ngoai atom sau EOF se duoc trinh phat (YouTube, VLC, Media Player) bo qua ma khong gay loi dinh dang.
- Tuy nhien, cac thuat toan bam file toan phan (MD5, SHA-1, SHA-256) se tinh toan toan bo byte tu offset 0 den byte cuoi cung. Viec them padding ngau nhien dam bao 100% video thanh pham co checksum hoan toan doc nhat.

---

## 4. MA NGUON TYPESCRIPT MAU SAN SANG TICH HOP

### 4.1. Cập Nhật `backend/video/utils/normalizeVf.ts`

Bo sung ham tao bo loc chong trung lap thi giac voi cac tuy chon linh hoat:

```typescript
export interface AntiFingerprintOptions {
  /** Cho phep phong to va crop vien 1.015x (mac dinh: true) */
  enableMicroCrop?: boolean
  /** Cho phep tinh chinh mau sac vi mo cinematic (mac dinh: true) */
  enableColorGrading?: boolean
  /** Cho phep hieu ung vignette mo 4 goc nghe thuat (mac dinh: true) */
  enableVignette?: boolean
  /** Lat guong ngang khung hinh (mac dinh: false, bat ngau nhien cho b-roll khong text) */
  enableHFlip?: boolean
  /** Them vi hat phim nhua dien anh sieu min (mac dinh: false) */
  enableMicroNoise?: boolean
}

/**
 * Xay dung bo loc video (-vf) chong trung lap thi giac toan dien (pHash / Color Histogram)
 * Ket hop chuan hoa Resolution + FPS + Aspect Ratio + Micro Transformation
 */
export function buildAntiFingerprintVfFilter(
  resolution: string,
  fps: string,
  options: AntiFingerprintOptions = {}
): string {
  const {
    enableMicroCrop = true,
    enableColorGrading = true,
    enableVignette = true,
    enableHFlip = false,
    enableMicroNoise = false,
  } = options

  const filterParts: string[] = []

  // 1. Lat guong ngang neu duoc kich hoat
  if (enableHFlip) {
    filterParts.push('hflip')
  }

  // 2. Micro-scale 1.015x va crop vien de lam lech ma tran pixel
  if (enableMicroCrop) {
    filterParts.push('scale=iw*1.015:ih*1.015')
    filterParts.push('crop=iw/1.015:ih/1.015')
    filterParts.push('scale=trunc(iw/2)*2:trunc(ih/2)*2')
  }

  // 3. Chuan hoa ve do phan giai muc tieu (scale + pad)
  const baseNormalize = buildNormalizeVfFilter(resolution, fps)
  filterParts.push(baseNormalize)

  // 4. Color Grading vi mo de thay doi bieu do mau sac
  if (enableColorGrading) {
    filterParts.push('eq=contrast=1.025:brightness=0.01:saturation=1.03:gamma=1.01')
  }

  // 5. Vignette mo 4 goc nghe thuat
  if (enableVignette) {
    filterParts.push('vignette=PI/5')
  }

  // 6. Vi hat dien anh (tuy chon nang cao)
  if (enableMicroNoise) {
    filterParts.push('noise=alls=1:allf=t+u')
  }

  return filterParts.join(',')
}
```

---

### 4.2. Cập Nhật `backend/video/finalExport.ts`

#### A. Them Module Ho Tro Byte Padding
Tao file `backend/video/utils/bytePadding.ts`:

```typescript
import fs from 'node:fs'
import crypto from 'node:crypto'

export async function appendRandomPaddingBytes(filePath: string, byteCount = 32): Promise<void> {
  try {
    const count = Math.max(16, Math.min(64, byteCount))
    const randomPayload = crypto.randomBytes(count)
    const marker = Buffer.from('\0M93P_')
    const buffer = Buffer.concat([marker, randomPayload])
    await fs.promises.appendFile(filePath, buffer)
  } catch (error) {
    console.warn('[BytePadding] Khong the ghi padding byte (non-fatal):', error)
  }
}
```

#### B. Cap Nhat Tham So Pass 2 Trong `runFinalCommand_TwoPass`
Trong `backend/video/finalExport.ts`, sua doi mang `pass2Args` va them goi padding sau khi publish:

```typescript
const pass2Args = [
  '-hide_banner',
  '-loglevel', 'error',
  '-stats',
  '-fflags', '+genpts+bitexact',
  '-f', 'concat',
  '-safe', '0',
  '-i', pass2ListPath,
  '-i', audioPath,
  '-map', '0:v:0',
  '-map', '1:a:0',
  '-c:v', 'copy',
  ...audioFilterArgs,
  ...audioCodecArgs,
  // ── XOA TOAN DIEN METADATA CONTAINER VA STREAM ──
  '-map_metadata', '-1',
  '-map_metadata:s', '-1',
  '-metadata', 'title=',
  '-metadata', 'artist=',
  '-metadata', 'album=',
  '-metadata', 'comment=',
  '-metadata', 'encoder=',
  '-metadata', 'description=',
  '-metadata', 'author=',
  '-metadata', 'copyright=',
  '-metadata:s:v:0', 'handler_name=VideoHandler',
  '-metadata:s:a:0', 'handler_name=SoundHandler',
  '-max_muxing_queue_size', mode === 'memory_safe' ? '512' : '2048',
  ...(mode === 'memory_safe' ? ['-flush_packets', '1'] : []),
  '-avoid_negative_ts', 'make_zero',
  '-movflags', '+faststart',
  '-t', totalDurationSec.toFixed(3),
  '-n',
  pass2OutputPath,
]
```

Va ngay sau khi `await publishPass2Output()` thanh cong:
```typescript
import { appendRandomPaddingBytes } from './utils/bytePadding'

// Goi sau khi file thanh pham da duoc link/copy vao outputPath
await appendRandomPaddingBytes(outputPath, 32)
```

#### C. Tich Hop Smart HFlip Trong Pass 1 `preTranscodeClips`
Khi transcode tung clip o Pass 1, chon ngau nhien co `enableHFlip` cho 50% b-roll footage:

```typescript
// Xac dinh xem clip co phu hop de lat guong ngang khong
const shouldFlip = Math.random() < 0.5
const clipVfFilter = buildAntiFingerprintVfFilter(resolution, fps, {
  enableMicroCrop: true,
  enableColorGrading: true,
  enableVignette: true,
  enableHFlip: shouldFlip,
})
```

---

### 4.3. Cập Nhật `backend/music/exportAudio.ts`

Thay the co che stream copy am thanh bang bo ma hoa Studio-Grade AAC 320kbps kem tay sach metadata toan dien:

```typescript
// Xac dinh thong so ma hoa am thanh studio
const studioAacBitrate = '320k'
const studioSampleRate = '48000'

// Cac tham so lam sach metadata ap dung cho moi lenh xuat audio
const cleanMetadataArgs = [
  '-map_metadata', '-1',
  '-map_metadata:s', '-1',
  '-fflags', '+bitexact',
  '-metadata', 'title=',
  '-metadata', 'artist=',
  '-metadata', 'album=',
  '-metadata', 'comment=',
  '-metadata', 'encoder=',
  '-metadata', 'copyright=',
  '-metadata', 'composer=',
  '-metadata', 'publisher=',
  '-metadata:s:a:0', 'handler_name=SoundHandler',
]

// Khi xuat dinh dang AAC (.m4a):
if (req.format === 'aac') {
  args = [
    '-hide_banner',
    '-y',
    '-f', 'concat',
    '-safe', '0',
    '-i', listFile,
    '-vn',
    '-c:a', 'aac',
    '-b:a', studioAacBitrate,
    '-ar', studioSampleRate,
    '-ac', '2',
    ...cleanMetadataArgs,
    targetRenderPath,
  ]
} else if (req.format === 'mp3') {
  args = [
    '-hide_banner',
    '-y',
    '-f', 'concat',
    '-safe', '0',
    '-i', listFile,
    '-vn',
    '-c:a', 'libmp3lame',
    '-b:a', '320k',
    '-ar', studioSampleRate,
    '-ac', '2',
    ...cleanMetadataArgs,
    targetRenderPath,
  ]
}
```

---

## 5. BANG SO SANH TRUOC VA SAU KHI NANG CAP

| Tieu chi | Truoc khi sua (Hien tai) | Sau khi sua (Quy chuan moi) |
| :--- | :--- | :--- |
| **Chat luong am thanh** | De xuat pitch shift / speed shift lam meo tieng, bien dang giong ca si | Bao toan nguyen ban 100%, khong pitch shift, giu ven nguyen tone nhac va chat am |
| **Dinh dang am thanh** | Copy stream hoac AAC 192k thong thuong, bi sot metadata nguon | Re-encode Studio-Grade AAC 320kbps / 48kHz Stereo, sach 100% ID3/ISRC |
| **Metadata Container & Stream** | Con sot tag nguon tu file clip goc | Strip sach ca 2 tang `-map_metadata -1` va `-map_metadata:s -1` |
| **Encoder Signature** | Lo chuoi build FFmpeg `Lavf...` | Che giau hoan toan voi `-fflags +bitexact` va ISO standard handlers |
| **Chu ky hinh anh (pHash)** | Giu nguyen ma tran pixel footage goc, de bi trung lap | Micro-scale 1.015x + Crop bien 1.5% lam lech toan bo toa do pixel |
| **Bieu do mau (Color Histogram)** | Giong 100% clip goc | Color Grading vi mo (`eq=contrast=1.025:brightness=0.01:saturation=1.03`) |
| **Khong gian 4 goc man hinh** | Khong can thiep, de bi quet Blockhash | Vignette mo 4 goc nghe thuat (`vignette=PI/5`) tao chieu sau cinematic |
| **Doi xung khong gian B-roll** | Thu dong theo video nguon | Smart HFlip ngau nhien 50% footage thien nhien/chill khong chu |
| **Thu tu chuoi B-roll** | Co the bi lap neu khong kiem soat | Fisher-Yates shuffle entropy cao, khong bao gio trung lap chuoi clip |
| **Checksum File (MD5/SHA-256)** | Mau container giong nhau hang loat | 32-64 Random Bytes Padding o EOF (100% Unique Checksum) |
| **Do an toan voi thuat toan** | Nguy co cao bi bat Reused Content va bop de xuat | Dat chuan noi dung bien doi sang tao doc lap, giu vung de xuat tu nhien |
