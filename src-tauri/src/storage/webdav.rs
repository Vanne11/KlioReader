use super::{RemoteFile, UserStorageProvider};
use reqwest::Client;
use base64::{Engine as _, engine::general_purpose};

pub struct WebDavProvider {
    base_url: String,
    username: String,
    password: String,
    path_prefix: String,
    client: Client,
}

impl WebDavProvider {
    pub fn new(url: String, username: String, password: String, path_prefix: String) -> Self {
        let base_url = url.trim_end_matches('/').to_string();
        let path_prefix = if path_prefix.starts_with('/') {
            path_prefix
        } else {
            format!("/{}", path_prefix)
        };
        let path_prefix = if path_prefix.ends_with('/') {
            path_prefix
        } else {
            format!("{}/", path_prefix)
        };

        Self {
            base_url,
            username,
            password,
            path_prefix,
            client: Client::new(),
        }
    }

    fn auth_header(&self) -> String {
        let creds = format!("{}:{}", self.username, self.password);
        format!("Basic {}", general_purpose::STANDARD.encode(creds.as_bytes()))
    }

    fn full_url(&self, key: &str) -> String {
        format!("{}{}{}", self.base_url, self.path_prefix, key)
    }

    async fn ensure_directory(&self, path: &str) -> Result<(), String> {
        let url = format!("{}{}", self.base_url, path);
        let _ = self.client
            .request(reqwest::Method::from_bytes(b"MKCOL").unwrap(), &url)
            .header("Authorization", self.auth_header())
            .send()
            .await;
        Ok(())
    }
}

#[async_trait::async_trait]
impl UserStorageProvider for WebDavProvider {
    async fn test_connection(&self) -> Result<bool, String> {
        // PROPFIND on base path with Depth: 0
        let url = format!("{}{}", self.base_url, self.path_prefix);

        // Try to create the directory first (ignore errors if exists)
        self.ensure_directory(&self.path_prefix).await?;

        let resp = self.client
            .request(reqwest::Method::from_bytes(b"PROPFIND").unwrap(), &url)
            .header("Authorization", self.auth_header())
            .header("Depth", "0")
            .header("Content-Type", "application/xml")
            .body(r#"<?xml version="1.0" encoding="utf-8"?><d:propfind xmlns:d="DAV:"><d:prop><d:resourcetype/></d:prop></d:propfind>"#)
            .send()
            .await
            .map_err(|e| format!("WebDAV connection failed: {}", e))?;

        let status = resp.status().as_u16();
        // 207 Multi-Status is success for PROPFIND
        if status == 207 || status == 200 {
            Ok(true)
        } else if status == 401 || status == 403 {
            Err("Autenticación fallida. Verifica usuario y contraseña.".to_string())
        } else {
            Err(format!("WebDAV error: HTTP {}", status))
        }
    }

    async fn list_files(&self, prefix: &str) -> Result<Vec<RemoteFile>, String> {
        let url = if prefix.is_empty() {
            format!("{}{}", self.base_url, self.path_prefix)
        } else {
            format!("{}{}{}", self.base_url, self.path_prefix, prefix)
        };

        let resp = self.client
            .request(reqwest::Method::from_bytes(b"PROPFIND").unwrap(), &url)
            .header("Authorization", self.auth_header())
            .header("Depth", "1")
            .header("Content-Type", "application/xml")
            .body(r#"<?xml version="1.0" encoding="utf-8"?><d:propfind xmlns:d="DAV:"><d:prop><d:getcontentlength/><d:getlastmodified/><d:getetag/><d:resourcetype/></d:prop></d:propfind>"#)
            .send()
            .await
            .map_err(|e| format!("WebDAV PROPFIND failed: {}", e))?;

        let status = resp.status().as_u16();
        let body = resp.text().await.map_err(|e| e.to_string())?;

        if status != 207 && status != 200 {
            return Err(format!("WebDAV list failed ({}): {}", status, body));
        }

        let mut files = Vec::new();
        // Parse multistatus XML responses
        for response_block in body.split("<d:response>").skip(1) {
            // Skip collections (directories)
            if response_block.contains("<d:collection") {
                continue;
            }

            let href = extract_dav_value(response_block, "d:href").unwrap_or_default();
            let size: u64 = extract_dav_value(response_block, "d:getcontentlength")
                .unwrap_or_default()
                .parse()
                .unwrap_or(0);
            let last_modified = extract_dav_value(response_block, "d:getlastmodified").unwrap_or_default();
            let etag = extract_dav_value(response_block, "d:getetag");

            // Also try without d: namespace prefix (some servers use D: or no prefix)
            let href = if href.is_empty() {
                extract_dav_value(response_block, "D:href")
                    .or_else(|| extract_dav_value(response_block, "href"))
                    .unwrap_or_default()
            } else {
                href
            };

            // Extract relative key from href
            let decoded_href = url_decode(&href);
            let key = if let Some(pos) = decoded_href.find(&self.path_prefix) {
                decoded_href[pos + self.path_prefix.len()..].to_string()
            } else {
                // Try to get just the filename
                decoded_href.rsplit('/').next().unwrap_or("").to_string()
            };

            if !key.is_empty() && !key.ends_with('/') {
                files.push(RemoteFile {
                    key,
                    size,
                    last_modified,
                    etag,
                });
            }
        }

        Ok(files)
    }

    async fn upload(&self, local_path: &str, remote_key: &str) -> Result<(), String> {
        let data = std::fs::read(local_path).map_err(|e| format!("Read file: {}", e))?;

        // Ensure parent directories exist
        if let Some(parent) = remote_key.rfind('/') {
            let dir_path = format!("{}{}", self.path_prefix, &remote_key[..parent]);
            self.ensure_directory(&dir_path).await?;
        }

        let url = self.full_url(remote_key);
        let resp = self.client
            .put(&url)
            .header("Authorization", self.auth_header())
            .header("Content-Type", "application/octet-stream")
            .body(data)
            .send()
            .await
            .map_err(|e| format!("WebDAV upload failed: {}", e))?;

        let status = resp.status();
        if !status.is_success() && status.as_u16() != 201 && status.as_u16() != 204 {
            let body = resp.text().await.unwrap_or_default();
            return Err(format!("WebDAV upload failed ({}): {}", status, body));
        }
        Ok(())
    }

    async fn download(&self, remote_key: &str, local_path: &str) -> Result<(), String> {
        let url = self.full_url(remote_key);
        let resp = self.client
            .get(&url)
            .header("Authorization", self.auth_header())
            .send()
            .await
            .map_err(|e| format!("WebDAV download failed: {}", e))?;

        let status = resp.status();
        if !status.is_success() {
            let body = resp.text().await.unwrap_or_default();
            return Err(format!("WebDAV download failed ({}): {}", status, body));
        }

        let bytes = resp.bytes().await.map_err(|e| e.to_string())?;
        if let Some(parent) = std::path::Path::new(local_path).parent() {
            std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
        std::fs::write(local_path, &bytes).map_err(|e| format!("Write file: {}", e))
    }

    async fn delete(&self, remote_key: &str) -> Result<(), String> {
        let url = self.full_url(remote_key);
        let resp = self.client
            .delete(&url)
            .header("Authorization", self.auth_header())
            .send()
            .await
            .map_err(|e| format!("WebDAV delete failed: {}", e))?;

        let status = resp.status();
        if !status.is_success() && status.as_u16() != 204 {
            let body = resp.text().await.unwrap_or_default();
            return Err(format!("WebDAV delete failed ({}): {}", status, body));
        }
        Ok(())
    }

    async fn read_bytes(&self, remote_key: &str) -> Result<Vec<u8>, String> {
        let url = self.full_url(remote_key);
        let resp = self.client
            .get(&url)
            .header("Authorization", self.auth_header())
            .send()
            .await
            .map_err(|e| format!("WebDAV read failed: {}", e))?;

        let status = resp.status();
        if status.as_u16() == 404 {
            return Err("NotFound".to_string());
        }
        if !status.is_success() {
            let body = resp.text().await.unwrap_or_default();
            return Err(format!("WebDAV read failed ({}): {}", status, body));
        }

        resp.bytes().await.map(|b| b.to_vec()).map_err(|e| e.to_string())
    }

    async fn write_bytes(&self, remote_key: &str, data: &[u8]) -> Result<(), String> {
        let url = self.full_url(remote_key);
        let resp = self.client
            .put(&url)
            .header("Authorization", self.auth_header())
            .header("Content-Type", "application/octet-stream")
            .body(data.to_vec())
            .send()
            .await
            .map_err(|e| format!("WebDAV write failed: {}", e))?;

        let status = resp.status();
        if !status.is_success() && status.as_u16() != 201 && status.as_u16() != 204 {
            let body = resp.text().await.unwrap_or_default();
            return Err(format!("WebDAV write failed ({}): {}", status, body));
        }
        Ok(())
    }
}

fn extract_dav_value(xml: &str, tag: &str) -> Option<String> {
    let open = format!("<{}>", tag);
    let close = format!("</{}>", tag);
    // Also try self-closing tag with content
    let open2 = format!("<{}/>", tag);

    if xml.contains(&open2) {
        return Some(String::new());
    }

    let start = xml.find(&open)? + open.len();
    let end = xml[start..].find(&close)? + start;
    Some(xml[start..end].trim().to_string())
}

fn url_decode(s: &str) -> String {
    let mut result = Vec::new();
    let bytes = s.as_bytes();
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' && i + 2 < bytes.len() {
            if let Ok(val) = u8::from_str_radix(
                std::str::from_utf8(&bytes[i + 1..i + 3]).unwrap_or(""),
                16,
            ) {
                result.push(val);
                i += 3;
                continue;
            }
        }
        result.push(bytes[i]);
        i += 1;
    }
    String::from_utf8(result).unwrap_or_else(|_| s.to_string())
}
