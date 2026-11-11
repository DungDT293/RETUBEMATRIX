//! Module quản lý Hardware ID (HWID) cho RETubeMatrix
//!
//! Đọc định danh phần cứng bất biến trên Windows:
//! - Windows MachineGuid từ Registry Cryptography
//! - CPU ProcessorId qua WMIC / PowerShell CIM / Win32 fallback
//! - Motherboard UUID / Baseboard Serial qua WMIC / PowerShell fallback
//! - SHA-256 hash kết hợp đảm bảo bất biến khi khởi động lại máy, chỉ thay đổi khi đổi phần cứng

use crate::utils::CommandExt;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::process::Command;
use std::sync::OnceLock;

/// Cấu trúc chứa thông tin Hardware ID trả về frontend
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct HwidInfo {
    /// Windows Machine GUID từ HKLM\SOFTWARE\Microsoft\Cryptography
    pub machine_guid: String,
    /// CPU Processor ID (e.g. BFEBFBFF00090672)
    pub processor_id: String,
    /// Motherboard / System UUID (e.g. 8A95830D-28F2-960E-4A64-60CF84602764)
    pub motherboard_uuid: String,
    /// Baseboard Serial Number (phụ trợ / tăng entropy)
    pub motherboard_serial: Option<String>,
    /// Mã băm SHA-256 bất biến duy nhất của hệ thống
    pub hwid_hash: String,
    /// Tên nền tảng hệ điều hành (windows, macos, linux,...)
    pub platform: String,
}

static HWID_CACHE: OnceLock<HwidInfo> = OnceLock::new();

/// Lấy thông tin HWID của hệ thống (có bộ nhớ đệm OnceLock)
pub fn get_system_hwid() -> Result<HwidInfo, String> {
    if let Some(cached) = HWID_CACHE.get() {
        return Ok(cached.clone());
    }

    #[cfg(windows)]
    let info = windows_impl::get_windows_hwid()?;

    #[cfg(target_os = "macos")]
    let info = unix_impl::get_macos_hwid()?;

    #[cfg(target_os = "linux")]
    let info = unix_impl::get_linux_hwid()?;

    #[cfg(not(any(windows, target_os = "macos", target_os = "linux")))]
    let info = fallback_impl::get_generic_hwid()?;

    let _ = HWID_CACHE.set(info.clone());
    Ok(info)
}

/// Tính mã băm SHA-256 từ các định danh phần cứng đã chuẩn hóa
pub fn compute_hwid_hash(
    machine_guid: &str,
    processor_id: &str,
    motherboard_uuid: &str,
    motherboard_serial: Option<&str>,
) -> String {
    let guid = machine_guid.trim().to_uppercase();
    let cpu = processor_id.trim().to_uppercase();
    let mb = motherboard_uuid.trim().to_uppercase();
    let sn = motherboard_serial.unwrap_or("").trim().to_uppercase();

    let raw_payload = format!(
        "RETUBEMATRIX:HWID:V1|GUID={}|CPU={}|MB={}|SN={}",
        guid, cpu, mb, sn
    );

    let mut hasher = Sha256::new();
    hasher.update(raw_payload.as_bytes());
    hex::encode(hasher.finalize())
}

/// Kiểm tra giá trị có phải là placeholder rác từ BIOS/OEM không
pub fn is_dummy_value(val: &str) -> bool {
    let lower = val.to_lowercase();
    let trimmed = lower.trim();
    if trimmed.is_empty() {
        return true;
    }
    matches!(
        trimmed,
        "none"
            | "n/a"
            | "null"
            | "unknown"
            | "0"
            | "00000000-0000-0000-0000-000000000000"
            | "ffffffff-ffff-ffff-ffff-ffffffffffff"
            | "to be filled by o.e.m."
            | "to be filled by oem"
            | "default string"
            | "system serial number"
            | "chassis serial number"
            | "base board serial number"
            | "not applicable"
    )
}

/// Phân tích kết quả `reg query` tìm MachineGuid
pub fn parse_reg_machine_guid(stdout: &str) -> Option<String> {
    for line in stdout.lines() {
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }
        let lower = trimmed.to_lowercase();
        if lower.contains("machineguid") {
            let tokens: Vec<&str> = trimmed.split_whitespace().collect();
            if let Some(last) = tokens.last() {
                let clean = last.trim_matches(|c: char| c == '{' || c == '}' || c.is_whitespace());
                if !clean.is_empty()
                    && !clean.eq_ignore_ascii_case("machineguid")
                    && !clean.eq_ignore_ascii_case("reg_sz")
                {
                    return Some(clean.to_string());
                }
            }
        }
    }
    None
}

/// Phân tích giá trị dòng đơn từ output của WMIC (bỏ qua header)
pub fn parse_wmic_single_value(stdout: &str, header: &str) -> Option<String> {
    for line in stdout.lines() {
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }
        if trimmed.eq_ignore_ascii_case(header) {
            continue;
        }
        if !is_dummy_value(trimmed) {
            return Some(trimmed.to_string());
        }
    }
    None
}

#[cfg(windows)]
mod windows_impl {
    use super::*;

    #[derive(Debug, Deserialize, Default)]
    struct WinHardwareQuery {
        cpu: Option<String>,
        uuid: Option<String>,
        serial: Option<String>,
    }

    pub fn get_windows_hwid() -> Result<HwidInfo, String> {
        // 1. Registry query siêu tốc (~10ms)
        let machine_guid = query_machine_guid().unwrap_or_else(|| "UNKNOWN_MACHINE_GUID".to_string());

        // 2. Gom DUY NHẤT 1 lệnh PowerShell CIM lấy toàn bộ CPU, UUID, Serial dưới dạng JSON
        // Tương thích 100% Windows 11 24H2 (nơi WMIC đã bị gỡ bỏ hoàn toàn) và giảm độ trễ từ 4.5s xuống <0.6s
        let cim_data = query_hardware_cim();

        let (cim_cpu, cim_uuid, cim_serial) = if let Some(data) = cim_data {
            (data.cpu, data.uuid, data.serial)
        } else {
            // Fallback WMIC nếu PowerShell thất bại
            query_legacy_wmic_fallback()
        };

        let processor_id = cim_cpu
            .filter(|v| !is_dummy_value(v))
            .or_else(|| {
                std::env::var("PROCESSOR_IDENTIFIER")
                    .ok()
                    .filter(|v| !v.trim().is_empty())
            })
            .unwrap_or_else(|| "UNKNOWN_PROCESSOR_ID".to_string());

        let motherboard_uuid = cim_uuid
            .filter(|v| !is_dummy_value(v))
            .unwrap_or_else(|| "UNKNOWN_MOTHERBOARD_UUID".to_string());

        let motherboard_serial = cim_serial.filter(|v| !is_dummy_value(v));

        if machine_guid == "UNKNOWN_MACHINE_GUID"
            && processor_id == "UNKNOWN_PROCESSOR_ID"
            && motherboard_uuid == "UNKNOWN_MOTHERBOARD_UUID"
        {
            return Err("Không thể đọc định danh phần cứng Windows (Registry/PowerShell thất bại)".to_string());
        }

        let hwid_hash = compute_hwid_hash(
            &machine_guid,
            &processor_id,
            &motherboard_uuid,
            motherboard_serial.as_deref(),
        );

        Ok(HwidInfo {
            machine_guid,
            processor_id,
            motherboard_uuid,
            motherboard_serial,
            hwid_hash,
            platform: "windows".to_string(),
        })
    }

    fn query_machine_guid() -> Option<String> {
        // Cách 1: reg query (siêu nhanh ~10ms, không phụ thuộc PowerShell)
        let mut cmd = Command::new("reg");
        cmd.args(["query", r"HKLM\SOFTWARE\Microsoft\Cryptography", "/v", "MachineGuid"]);
        cmd.hide_window();

        if let Ok(output) = cmd.output() {
            if output.status.success() {
                let stdout = String::from_utf8_lossy(&output.stdout);
                if let Some(guid) = parse_reg_machine_guid(&stdout) {
                    return Some(guid);
                }
            }
        }

        // Cách 2: PowerShell fallback
        let mut ps = Command::new("powershell");
        ps.args([
            "-NoProfile",
            "-NonInteractive",
            "-Command",
            "(Get-ItemProperty -Path 'HKLM:\\SOFTWARE\\Microsoft\\Cryptography').MachineGuid",
        ]);
        ps.hide_window();

        if let Ok(output) = ps.output() {
            if output.status.success() {
                let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
                if !stdout.is_empty() && !is_dummy_value(&stdout) {
                    return Some(stdout);
                }
            }
        }

        None
    }

    fn query_hardware_cim() -> Option<WinHardwareQuery> {
        let mut ps = Command::new("powershell");
        ps.args([
            "-NoProfile",
            "-NonInteractive",
            "-Command",
            "$c = (Get-CimInstance Win32_Processor | Select-Object -ExpandProperty ProcessorId) -join ','; \
             $m = (Get-CimInstance Win32_ComputerSystemProduct | Select-Object -ExpandProperty UUID); \
             $b = (Get-CimInstance Win32_BaseBoard | Select-Object -ExpandProperty SerialNumber); \
             [PSCustomObject]@{cpu=$c; uuid=$m; serial=$b} | ConvertTo-Json -Compress",
        ]);
        ps.hide_window();

        if let Ok(output) = ps.output() {
            if output.status.success() {
                let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
                if let Ok(data) = serde_json::from_str::<WinHardwareQuery>(&stdout) {
                    return Some(data);
                }
            }
        }

        None
    }

    fn query_legacy_wmic_fallback() -> (Option<String>, Option<String>, Option<String>) {
        let cpu = {
            let mut cmd = Command::new("wmic");
            cmd.args(["cpu", "get", "processorid"]);
            cmd.hide_window();
            cmd.output().ok().and_then(|out| {
                if out.status.success() {
                    parse_wmic_single_value(&String::from_utf8_lossy(&out.stdout), "ProcessorId")
                } else {
                    None
                }
            })
        };

        let uuid = {
            let mut cmd = Command::new("wmic");
            cmd.args(["csproduct", "get", "uuid"]);
            cmd.hide_window();
            cmd.output().ok().and_then(|out| {
                if out.status.success() {
                    parse_wmic_single_value(&String::from_utf8_lossy(&out.stdout), "UUID")
                } else {
                    None
                }
            })
        };

        let serial = {
            let mut cmd = Command::new("wmic");
            cmd.args(["baseboard", "get", "serialnumber"]);
            cmd.hide_window();
            cmd.output().ok().and_then(|out| {
                if out.status.success() {
                    parse_wmic_single_value(&String::from_utf8_lossy(&out.stdout), "SerialNumber")
                } else {
                    None
                }
            })
        };

        (cpu, uuid, serial)
    }
}

#[cfg(any(target_os = "macos", target_os = "linux"))]
mod unix_impl {
    use super::*;

    #[cfg(target_os = "macos")]
    pub fn get_macos_hwid() -> Result<HwidInfo, String> {
        let output = Command::new("ioreg")
            .args(["-rd1", "-c", "IOPlatformExpertDevice"])
            .output()
            .map_err(|e| format!("Failed to run ioreg: {e}"))?;

        let stdout = String::from_utf8_lossy(&output.stdout);
        let mut uuid = "UNKNOWN_MAC_UUID".to_string();
        for line in stdout.lines() {
            if line.contains("IOPlatformUUID") {
                if let Some(pos) = line.find('=') {
                    uuid = line[pos + 1..].trim().trim_matches('"').to_string();
                    break;
                }
            }
        }

        let cpu_output = Command::new("sysctl")
            .args(["-n", "machdep.cpu.brand_string"])
            .output();
        let cpu_id = match cpu_output {
            Ok(out) => String::from_utf8_lossy(&out.stdout).trim().to_string(),
            Err(_) => "UNKNOWN_MAC_CPU".to_string(),
        };

        let hwid_hash = compute_hwid_hash(&uuid, &cpu_id, &uuid, None);

        Ok(HwidInfo {
            machine_guid: uuid.clone(),
            processor_id: cpu_id,
            motherboard_uuid: uuid,
            motherboard_serial: None,
            hwid_hash,
            platform: "macos".to_string(),
        })
    }

    #[cfg(target_os = "linux")]
    pub fn get_linux_hwid() -> Result<HwidInfo, String> {
        let machine_id = std::fs::read_to_string("/etc/machine-id")
            .or_else(|_| std::fs::read_to_string("/var/lib/dbus/machine-id"))
            .unwrap_or_else(|_| "UNKNOWN_LINUX_MACHINE_ID".to_string())
            .trim()
            .to_string();

        let product_uuid = std::fs::read_to_string("/sys/class/dmi/id/product_uuid")
            .unwrap_or_else(|_| "UNKNOWN_LINUX_PRODUCT_UUID".to_string())
            .trim()
            .to_string();

        let cpu_info = std::fs::read_to_string("/proc/cpuinfo").unwrap_or_default();
        let mut cpu_id = "UNKNOWN_LINUX_CPU".to_string();
        for line in cpu_info.lines() {
            if line.starts_with("model name") {
                if let Some(pos) = line.find(':') {
                    cpu_id = line[pos + 1..].trim().to_string();
                    break;
                }
            }
        }

        let hwid_hash = compute_hwid_hash(&machine_id, &cpu_id, &product_uuid, None);

        Ok(HwidInfo {
            machine_guid: machine_id,
            processor_id: cpu_id,
            motherboard_uuid: product_uuid,
            motherboard_serial: None,
            hwid_hash,
            platform: "linux".to_string(),
        })
    }
}

#[cfg(not(any(windows, target_os = "macos", target_os = "linux")))]
mod fallback_impl {
    use super::*;

    pub fn get_generic_hwid() -> Result<HwidInfo, String> {
        let dummy_id = "GENERIC_FALLBACK_HWID".to_string();
        let hwid_hash = compute_hwid_hash(&dummy_id, &dummy_id, &dummy_id, None);
        Ok(HwidInfo {
            machine_guid: dummy_id.clone(),
            processor_id: dummy_id.clone(),
            motherboard_uuid: dummy_id,
            motherboard_serial: None,
            hwid_hash,
            platform: "unknown".to_string(),
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_compute_hwid_hash_consistency() {
        let hash1 = compute_hwid_hash("GUID-1", "CPU-1", "MB-1", Some("SN-1"));
        let hash2 = compute_hwid_hash("guid-1", "cpu-1", "mb-1", Some("sn-1"));
        assert_eq!(hash1, hash2, "HWID hash must be case-insensitive");
        assert_eq!(hash1.len(), 64, "SHA-256 hex string length must be 64");
    }

    #[test]
    fn test_parse_reg_machine_guid() {
        let sample = "HKEY_LOCAL_MACHINE\\SOFTWARE\\Microsoft\\Cryptography\r\n    MachineGuid    REG_SZ    e3f1d208-cd6c-4f86-b4fe-c1d856ee14c4\r\n";
        let parsed = parse_reg_machine_guid(sample);
        assert_eq!(parsed.as_deref(), Some("e3f1d208-cd6c-4f86-b4fe-c1d856ee14c4"));
    }

    #[test]
    fn test_parse_wmic_single_value() {
        let sample = "ProcessorId       \r\nBFEBFBFF00090672  \r\n\r\n";
        let parsed = parse_wmic_single_value(sample, "ProcessorId");
        assert_eq!(parsed.as_deref(), Some("BFEBFBFF00090672"));
    }

    #[test]
    fn test_is_dummy_value() {
        assert!(is_dummy_value("none"));
        assert!(is_dummy_value("00000000-0000-0000-0000-000000000000"));
        assert!(is_dummy_value("To be filled by O.E.M."));
        assert!(!is_dummy_value("BFEBFBFF00090672"));
    }
}
