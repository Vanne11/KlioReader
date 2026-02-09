use super::{RemoteFile, UserStorageProvider};
use chrono::Utc;
use hmac::{Hmac, Mac};
use sha2::{Digest, Sha256};
use reqwest::Client;

pub struct S3Provider {
    endpoint: String,
    region: String,
    bucket: String,
    access_key: String,
    secret_key: String,
    path_prefix: String,
    client: Client,
}

impl S3Provider {
    pub fn new(
        endpoint: String,
        region: String,
        bucket: String,
        access_key: String,
        secret_key: String,
        path_prefix: String,
    ) -> Self {
        Self {
            endpoint,
            region,
            bucket,
            access_key,
            secret_key,
            path_prefix,
            client: Client::new(),
        }
    }

    fn full_key(&self, key: &str) -> String {
        format!("{}{}", self.path_prefix, key)
    }

    fn host(&self) -> String {
        if self.endpoint.is_empty() {
            format!("{}.s3.{}.amazonaws.com", self.bucket, self.region)
        } else {
            let ep = self.endpoint.trim_start_matches("https://").trim_start_matches("http://");
            let ep = ep.trim_end_matches('/');
            format!("{}/{}", ep, self.bucket)
        }
    }

    fn base_url(&self) -> String {
        if self.endpoint.is_empty() {
            format!("https://{}.s3.{}.amazonaws.com", self.bucket, self.region)
        } else {
            let ep = self.endpoint.trim_end_matches('/');
            format!("{}/{}", ep, self.bucket)
        }
    }

    fn sign_request(
        &self,
        method: &str,
        path: &str,
        query: &str,
        headers: &[(&str, &str)],
        payload_hash: &str,
        now: &chrono::DateTime<Utc>,
    ) -> String {
        let date_stamp = now.format("%Y%m%d").to_string();
        let amz_date = now.format("%Y%m%dT%H%M%SZ").to_string();
        let scope = format!("{}/{}/s3/aws4_request", date_stamp, self.region);

        // Canonical headers
        let host = self.host();
        let mut canonical_headers = vec![
            ("host".to_string(), host.clone()),
            ("x-amz-content-sha256".to_string(), payload_hash.to_string()),
            ("x-amz-date".to_string(), amz_date.clone()),
        ];
        for (k, v) in headers {
            canonical_headers.push((k.to_lowercase(), v.to_string()));
        }
        canonical_headers.sort_by(|a, b| a.0.cmp(&b.0));

        let canonical_headers_str: String = canonical_headers
            .iter()
            .map(|(k, v)| format!("{}:{}\n", k, v))
            .collect();
        let signed_headers: String = canonical_headers
            .iter()
            .map(|(k, _)| k.as_str())
            .collect::<Vec<_>>()
            .join(";");

        let canonical_request = format!(
            "{}\n{}\n{}\n{}\n{}\n{}",
            method,
            uri_encode_path(path),
            query,
            canonical_headers_str,
            signed_headers,
            payload_hash
        );

        let string_to_sign = format!(
            "AWS4-HMAC-SHA256\n{}\n{}\n{}",
            amz_date,
            scope,
            hex_sha256(canonical_request.as_bytes())
        );

        let signing_key = get_signature_key(&self.secret_key, &date_stamp, &self.region, "s3");
        let signature = hex_hmac_sha256(&signing_key, string_to_sign.as_bytes());

        format!(
            "AWS4-HMAC-SHA256 Credential={}/{}, SignedHeaders={}, Signature={}",
            self.access_key, scope, signed_headers, signature
        )
    }
}

fn uri_encode_path(path: &str) -> String {
    path.split('/')
        .map(|seg| {
            percent_encode(seg)
        })
        .collect::<Vec<_>>()
        .join("/")
}

fn percent_encode(s: &str) -> String {
    let mut result = String::new();
    for b in s.bytes() {
        match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                result.push(b as char);
            }
            _ => {
                result.push_str(&format!("%{:02X}", b));
            }
        }
    }
    result
}

fn hex_sha256(data: &[u8]) -> String {
    let mut hasher = Sha256::new();
    hasher.update(data);
    hex::encode(hasher.finalize())
}

fn hmac_sha256(key: &[u8], data: &[u8]) -> Vec<u8> {
    let mut mac = Hmac::<Sha256>::new_from_slice(key).expect("HMAC key");
    mac.update(data);
    mac.finalize().into_bytes().to_vec()
}

fn hex_hmac_sha256(key: &[u8], data: &[u8]) -> String {
    hex::encode(hmac_sha256(key, data))
}

fn get_signature_key(secret: &str, date_stamp: &str, region: &str, service: &str) -> Vec<u8> {
    let k_date = hmac_sha256(format!("AWS4{}", secret).as_bytes(), date_stamp.as_bytes());
    let k_region = hmac_sha256(&k_date, region.as_bytes());
    let k_service = hmac_sha256(&k_region, service.as_bytes());
    hmac_sha256(&k_service, b"aws4_request")
}

#[async_trait::async_trait]
impl UserStorageProvider for S3Provider {
    async fn test_connection(&self) -> Result<bool, String> {
        // Try listing with max-keys=1
        self.list_files("").await.map(|_| true)
    }

    async fn list_files(&self, prefix: &str) -> Result<Vec<RemoteFile>, String> {
        let full_prefix = self.full_key(prefix);
        let query = format!("list-type=2&prefix={}", percent_encode(&full_prefix));
        let path = "/";
        let now = Utc::now();
        let payload_hash = hex_sha256(b"");

        let auth = self.sign_request("GET", path, &query, &[], &payload_hash, &now);
        let url = format!("{}/?{}", self.base_url(), query);

        let resp = self.client
            .get(&url)
            .header("Authorization", &auth)
            .header("x-amz-date", now.format("%Y%m%dT%H%M%SZ").to_string())
            .header("x-amz-content-sha256", &payload_hash)
            .send()
            .await
            .map_err(|e| format!("S3 list request failed: {}", e))?;

        let status = resp.status();
        let body = resp.text().await.map_err(|e| e.to_string())?;
        if !status.is_success() {
            return Err(format!("S3 list failed ({}): {}", status, body));
        }

        // Parse XML response
        let mut files = Vec::new();
        for content_block in body.split("<Contents>").skip(1) {
            let key = extract_xml_value(content_block, "Key").unwrap_or_default();
            let size: u64 = extract_xml_value(content_block, "Size")
                .unwrap_or_default()
                .parse()
                .unwrap_or(0);
            let last_modified = extract_xml_value(content_block, "LastModified").unwrap_or_default();
            let etag = extract_xml_value(content_block, "ETag");

            // Strip prefix to get relative key
            let relative_key = if key.starts_with(&self.path_prefix) {
                key[self.path_prefix.len()..].to_string()
            } else {
                key
            };

            if !relative_key.is_empty() {
                files.push(RemoteFile {
                    key: relative_key,
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
        let full_key = self.full_key(remote_key);
        let path = format!("/{}", full_key);
        let now = Utc::now();
        let payload_hash = hex_sha256(&data);

        let auth = self.sign_request("PUT", &path, "", &[("content-type", "application/octet-stream")], &payload_hash, &now);
        let url = format!("{}/{}", self.base_url(), full_key);

        let resp = self.client
            .put(&url)
            .header("Authorization", &auth)
            .header("x-amz-date", now.format("%Y%m%dT%H%M%SZ").to_string())
            .header("x-amz-content-sha256", &payload_hash)
            .header("Content-Type", "application/octet-stream")
            .body(data)
            .send()
            .await
            .map_err(|e| format!("S3 upload failed: {}", e))?;

        let status = resp.status();
        if !status.is_success() {
            let body = resp.text().await.unwrap_or_default();
            return Err(format!("S3 upload failed ({}): {}", status, body));
        }
        Ok(())
    }

    async fn download(&self, remote_key: &str, local_path: &str) -> Result<(), String> {
        let full_key = self.full_key(remote_key);
        let path = format!("/{}", full_key);
        let now = Utc::now();
        let payload_hash = hex_sha256(b"");

        let auth = self.sign_request("GET", &path, "", &[], &payload_hash, &now);
        let url = format!("{}/{}", self.base_url(), full_key);

        let resp = self.client
            .get(&url)
            .header("Authorization", &auth)
            .header("x-amz-date", now.format("%Y%m%dT%H%M%SZ").to_string())
            .header("x-amz-content-sha256", &payload_hash)
            .send()
            .await
            .map_err(|e| format!("S3 download failed: {}", e))?;

        let status = resp.status();
        if !status.is_success() {
            let body = resp.text().await.unwrap_or_default();
            return Err(format!("S3 download failed ({}): {}", status, body));
        }

        let bytes = resp.bytes().await.map_err(|e| e.to_string())?;
        if let Some(parent) = std::path::Path::new(local_path).parent() {
            std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
        std::fs::write(local_path, &bytes).map_err(|e| format!("Write file: {}", e))
    }

    async fn delete(&self, remote_key: &str) -> Result<(), String> {
        let full_key = self.full_key(remote_key);
        let path = format!("/{}", full_key);
        let now = Utc::now();
        let payload_hash = hex_sha256(b"");

        let auth = self.sign_request("DELETE", &path, "", &[], &payload_hash, &now);
        let url = format!("{}/{}", self.base_url(), full_key);

        let resp = self.client
            .delete(&url)
            .header("Authorization", &auth)
            .header("x-amz-date", now.format("%Y%m%dT%H%M%SZ").to_string())
            .header("x-amz-content-sha256", &payload_hash)
            .send()
            .await
            .map_err(|e| format!("S3 delete failed: {}", e))?;

        let status = resp.status();
        if !status.is_success() {
            let body = resp.text().await.unwrap_or_default();
            return Err(format!("S3 delete failed ({}): {}", status, body));
        }
        Ok(())
    }

    async fn read_bytes(&self, remote_key: &str) -> Result<Vec<u8>, String> {
        let full_key = self.full_key(remote_key);
        let path = format!("/{}", full_key);
        let now = Utc::now();
        let payload_hash = hex_sha256(b"");

        let auth = self.sign_request("GET", &path, "", &[], &payload_hash, &now);
        let url = format!("{}/{}", self.base_url(), full_key);

        let resp = self.client
            .get(&url)
            .header("Authorization", &auth)
            .header("x-amz-date", now.format("%Y%m%dT%H%M%SZ").to_string())
            .header("x-amz-content-sha256", &payload_hash)
            .send()
            .await
            .map_err(|e| format!("S3 read failed: {}", e))?;

        let status = resp.status();
        if !status.is_success() {
            // 404 means file doesn't exist, return empty
            if status.as_u16() == 404 {
                return Err("NotFound".to_string());
            }
            let body = resp.text().await.unwrap_or_default();
            return Err(format!("S3 read failed ({}): {}", status, body));
        }

        resp.bytes().await.map(|b| b.to_vec()).map_err(|e| e.to_string())
    }

    async fn write_bytes(&self, remote_key: &str, data: &[u8]) -> Result<(), String> {
        let full_key = self.full_key(remote_key);
        let path = format!("/{}", full_key);
        let now = Utc::now();
        let payload_hash = hex_sha256(data);

        let auth = self.sign_request("PUT", &path, "", &[("content-type", "application/octet-stream")], &payload_hash, &now);
        let url = format!("{}/{}", self.base_url(), full_key);

        let resp = self.client
            .put(&url)
            .header("Authorization", &auth)
            .header("x-amz-date", now.format("%Y%m%dT%H%M%SZ").to_string())
            .header("x-amz-content-sha256", &payload_hash)
            .header("Content-Type", "application/octet-stream")
            .body(data.to_vec())
            .send()
            .await
            .map_err(|e| format!("S3 write failed: {}", e))?;

        let status = resp.status();
        if !status.is_success() {
            let body = resp.text().await.unwrap_or_default();
            return Err(format!("S3 write failed ({}): {}", status, body));
        }
        Ok(())
    }
}

fn extract_xml_value(xml: &str, tag: &str) -> Option<String> {
    let open = format!("<{}>", tag);
    let close = format!("</{}>", tag);
    let start = xml.find(&open)? + open.len();
    let end = xml[start..].find(&close)? + start;
    Some(xml[start..end].to_string())
}
