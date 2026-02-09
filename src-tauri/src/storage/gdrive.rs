use super::{RemoteFile, UserStorageProvider};
use reqwest::Client;
use serde::{Deserialize, Serialize};
use std::sync::Mutex;

const GOOGLE_AUTH_URL: &str = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL: &str = "https://oauth2.googleapis.com/token";
const DRIVE_API: &str = "https://www.googleapis.com/drive/v3";
const DRIVE_UPLOAD_API: &str = "https://www.googleapis.com/upload/drive/v3";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TokenResponse {
    pub access_token: String,
    #[serde(default)]
    pub refresh_token: Option<String>,
    pub expires_in: Option<u64>,
    pub token_type: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct DriveFile {
    id: String,
    name: String,
    #[serde(default, rename = "mimeType")]
    mime_type: String,
    #[serde(default)]
    size: Option<String>,
    #[serde(default, rename = "modifiedTime")]
    modified_time: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct DriveFileList {
    files: Vec<DriveFile>,
    #[serde(default, rename = "nextPageToken")]
    next_page_token: Option<String>,
}

pub struct GDriveProvider {
    client_id: String,
    client_secret: String,
    access_token: Mutex<Option<String>>,
    refresh_token: Mutex<Option<String>>,
    folder_id: Mutex<Option<String>>,
    client: Client,
}

impl GDriveProvider {
    pub fn new(
        client_id: String,
        client_secret: String,
        access_token: Option<String>,
        refresh_token: Option<String>,
        folder_id: Option<String>,
    ) -> Self {
        Self {
            client_id,
            client_secret,
            access_token: Mutex::new(access_token),
            refresh_token: Mutex::new(refresh_token),
            folder_id: Mutex::new(folder_id),
            client: Client::new(),
        }
    }

    fn get_access_token(&self) -> Result<String, String> {
        self.access_token
            .lock()
            .map_err(|e| e.to_string())?
            .clone()
            .ok_or_else(|| "No access token. Please authenticate first.".to_string())
    }

    pub async fn refresh_access_token(&self) -> Result<String, String> {
        let refresh = self.refresh_token
            .lock()
            .map_err(|e| e.to_string())?
            .clone()
            .ok_or_else(|| "No refresh token available".to_string())?;

        let resp = self.client
            .post(GOOGLE_TOKEN_URL)
            .form(&[
                ("client_id", self.client_id.as_str()),
                ("client_secret", self.client_secret.as_str()),
                ("refresh_token", refresh.as_str()),
                ("grant_type", "refresh_token"),
            ])
            .send()
            .await
            .map_err(|e| format!("Token refresh failed: {}", e))?;

        let status = resp.status();
        let body = resp.text().await.map_err(|e| e.to_string())?;

        if !status.is_success() {
            return Err(format!("Token refresh failed ({}): {}", status, body));
        }

        let token_resp: TokenResponse = serde_json::from_str(&body)
            .map_err(|e| format!("Parse token response: {}", e))?;

        let new_token = token_resp.access_token.clone();
        *self.access_token.lock().map_err(|e| e.to_string())? = Some(new_token.clone());

        if let Some(new_refresh) = token_resp.refresh_token {
            *self.refresh_token.lock().map_err(|e| e.to_string())? = Some(new_refresh);
        }

        Ok(new_token)
    }

    async fn get_valid_token(&self) -> Result<String, String> {
        match self.get_access_token() {
            Ok(token) => Ok(token),
            Err(_) => self.refresh_access_token().await,
        }
    }

    async fn ensure_folder(&self) -> Result<String, String> {
        // Check if we already have a folder_id
        if let Some(fid) = self.folder_id.lock().map_err(|e| e.to_string())?.clone() {
            if !fid.is_empty() {
                return Ok(fid);
            }
        }

        let token = self.get_valid_token().await?;

        // Search for existing KlioReader folder
        let query = "name='KlioReader' and mimeType='application/vnd.google-apps.folder' and trashed=false";
        let url = format!("{}?q={}&fields=files(id,name)", DRIVE_API, urlencoding(query));

        let resp = self.client
            .get(&format!("{}/files?q={}&fields=files(id,name)", DRIVE_API, urlencoding(query)))
            .bearer_auth(&token)
            .send()
            .await
            .map_err(|e| format!("Drive search folder: {}", e))?;

        let status = resp.status();
        if status.as_u16() == 401 {
            // Token expired, refresh and retry
            let new_token = self.refresh_access_token().await?;
            let resp = self.client
                .get(&url)
                .bearer_auth(&new_token)
                .send()
                .await
                .map_err(|e| format!("Drive search folder: {}", e))?;
            let body = resp.text().await.map_err(|e| e.to_string())?;
            let list: DriveFileList = serde_json::from_str(&body)
                .map_err(|e| format!("Parse folder list: {}", e))?;
            if let Some(f) = list.files.first() {
                *self.folder_id.lock().map_err(|e| e.to_string())? = Some(f.id.clone());
                return Ok(f.id.clone());
            }
            return self.create_folder(&new_token).await;
        }

        let body = resp.text().await.map_err(|e| e.to_string())?;
        if !status.is_success() {
            return Err(format!("Drive list folders ({}): {}", status, body));
        }

        let list: DriveFileList = serde_json::from_str(&body)
            .map_err(|e| format!("Parse folder list: {}", e))?;

        if let Some(f) = list.files.first() {
            *self.folder_id.lock().map_err(|e| e.to_string())? = Some(f.id.clone());
            Ok(f.id.clone())
        } else {
            self.create_folder(&token).await
        }
    }

    async fn create_folder(&self, token: &str) -> Result<String, String> {
        let metadata = serde_json::json!({
            "name": "KlioReader",
            "mimeType": "application/vnd.google-apps.folder"
        });

        let resp = self.client
            .post(&format!("{}/files", DRIVE_API))
            .bearer_auth(token)
            .json(&metadata)
            .send()
            .await
            .map_err(|e| format!("Drive create folder: {}", e))?;

        let body = resp.text().await.map_err(|e| e.to_string())?;
        let file: DriveFile = serde_json::from_str(&body)
            .map_err(|e| format!("Parse created folder: {}", e))?;

        *self.folder_id.lock().map_err(|e| e.to_string())? = Some(file.id.clone());
        Ok(file.id)
    }

    async fn find_file(&self, name: &str) -> Result<Option<DriveFile>, String> {
        let folder_id = self.ensure_folder().await?;
        let token = self.get_valid_token().await?;

        let query = format!(
            "name='{}' and '{}' in parents and trashed=false",
            name.replace('\'', "\\'"),
            folder_id
        );

        let resp = self.client
            .get(&format!("{}/files", DRIVE_API))
            .query(&[
                ("q", query.as_str()),
                ("fields", "files(id,name,size,modifiedTime,mimeType)"),
            ])
            .bearer_auth(&token)
            .send()
            .await
            .map_err(|e| format!("Drive find file: {}", e))?;

        let body = resp.text().await.map_err(|e| e.to_string())?;
        let list: DriveFileList = serde_json::from_str(&body)
            .map_err(|e| format!("Parse file list: {}", e))?;

        Ok(list.files.into_iter().next())
    }

    pub fn get_auth_url(&self, redirect_port: u16) -> String {
        let redirect_uri = format!("http://localhost:{}", redirect_port);
        let scope = "https://www.googleapis.com/auth/drive.file";

        format!(
            "{}?client_id={}&redirect_uri={}&response_type=code&scope={}&access_type=offline&prompt=consent",
            GOOGLE_AUTH_URL,
            urlencoding(&self.client_id),
            urlencoding(&redirect_uri),
            urlencoding(scope)
        )
    }

    pub async fn exchange_code(&self, code: &str, redirect_port: u16) -> Result<TokenResponse, String> {
        let redirect_uri = format!("http://localhost:{}", redirect_port);

        let resp = self.client
            .post(GOOGLE_TOKEN_URL)
            .form(&[
                ("code", code),
                ("client_id", self.client_id.as_str()),
                ("client_secret", self.client_secret.as_str()),
                ("redirect_uri", redirect_uri.as_str()),
                ("grant_type", "authorization_code"),
            ])
            .send()
            .await
            .map_err(|e| format!("Token exchange failed: {}", e))?;

        let status = resp.status();
        let body = resp.text().await.map_err(|e| e.to_string())?;

        if !status.is_success() {
            return Err(format!("Token exchange failed ({}): {}", status, body));
        }

        let token_resp: TokenResponse = serde_json::from_str(&body)
            .map_err(|e| format!("Parse token: {}", e))?;

        *self.access_token.lock().map_err(|e| e.to_string())? = Some(token_resp.access_token.clone());
        if let Some(ref rt) = token_resp.refresh_token {
            *self.refresh_token.lock().map_err(|e| e.to_string())? = Some(rt.clone());
        }

        Ok(token_resp)
    }

    #[allow(dead_code)]
    pub fn set_tokens(&self, access_token: String, refresh_token: Option<String>) {
        if let Ok(mut at) = self.access_token.lock() {
            *at = Some(access_token);
        }
        if let Some(rt) = refresh_token {
            if let Ok(mut rtt) = self.refresh_token.lock() {
                *rtt = Some(rt);
            }
        }
    }
}

#[async_trait::async_trait]
impl UserStorageProvider for GDriveProvider {
    async fn test_connection(&self) -> Result<bool, String> {
        self.ensure_folder().await?;
        Ok(true)
    }

    async fn list_files(&self, _prefix: &str) -> Result<Vec<RemoteFile>, String> {
        let folder_id = self.ensure_folder().await?;
        let token = self.get_valid_token().await?;

        let query = format!("'{}' in parents and trashed=false", folder_id);
        let mut all_files = Vec::new();
        let mut page_token: Option<String> = None;

        loop {
            let mut req = self.client
                .get(&format!("{}/files", DRIVE_API))
                .query(&[
                    ("q", query.as_str()),
                    ("fields", "nextPageToken,files(id,name,size,modifiedTime,mimeType)"),
                    ("pageSize", "1000"),
                ])
                .bearer_auth(&token);

            if let Some(ref pt) = page_token {
                req = req.query(&[("pageToken", pt.as_str())]);
            }

            let resp = req.send().await.map_err(|e| format!("Drive list: {}", e))?;
            let body = resp.text().await.map_err(|e| e.to_string())?;
            let list: DriveFileList = serde_json::from_str(&body)
                .map_err(|e| format!("Parse drive list: {}", e))?;

            for f in &list.files {
                if f.mime_type == "application/vnd.google-apps.folder" {
                    continue;
                }
                all_files.push(RemoteFile {
                    key: f.name.clone(),
                    size: f.size.as_ref().and_then(|s| s.parse().ok()).unwrap_or(0),
                    last_modified: f.modified_time.clone().unwrap_or_default(),
                    etag: Some(f.id.clone()),
                });
            }

            if list.next_page_token.is_some() {
                page_token = list.next_page_token;
            } else {
                break;
            }
        }

        Ok(all_files)
    }

    async fn upload(&self, local_path: &str, remote_key: &str) -> Result<(), String> {
        let data = std::fs::read(local_path).map_err(|e| format!("Read file: {}", e))?;
        self.write_bytes(remote_key, &data).await
    }

    async fn download(&self, remote_key: &str, local_path: &str) -> Result<(), String> {
        let bytes = self.read_bytes(remote_key).await?;
        if let Some(parent) = std::path::Path::new(local_path).parent() {
            std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
        std::fs::write(local_path, &bytes).map_err(|e| format!("Write file: {}", e))
    }

    async fn delete(&self, remote_key: &str) -> Result<(), String> {
        let file = self.find_file(remote_key).await?
            .ok_or_else(|| format!("File not found: {}", remote_key))?;

        let token = self.get_valid_token().await?;
        let resp = self.client
            .delete(&format!("{}/files/{}", DRIVE_API, file.id))
            .bearer_auth(&token)
            .send()
            .await
            .map_err(|e| format!("Drive delete: {}", e))?;

        let status = resp.status();
        if !status.is_success() && status.as_u16() != 204 {
            let body = resp.text().await.unwrap_or_default();
            return Err(format!("Drive delete failed ({}): {}", status, body));
        }
        Ok(())
    }

    async fn read_bytes(&self, remote_key: &str) -> Result<Vec<u8>, String> {
        let file = match self.find_file(remote_key).await? {
            Some(f) => f,
            None => return Err("NotFound".to_string()),
        };

        let token = self.get_valid_token().await?;
        let resp = self.client
            .get(&format!("{}/files/{}?alt=media", DRIVE_API, file.id))
            .bearer_auth(&token)
            .send()
            .await
            .map_err(|e| format!("Drive download: {}", e))?;

        let status = resp.status();
        if !status.is_success() {
            let body = resp.text().await.unwrap_or_default();
            return Err(format!("Drive read failed ({}): {}", status, body));
        }

        resp.bytes().await.map(|b| b.to_vec()).map_err(|e| e.to_string())
    }

    async fn write_bytes(&self, remote_key: &str, data: &[u8]) -> Result<(), String> {
        let token = self.get_valid_token().await?;
        let folder_id = self.ensure_folder().await?;

        // Check if file exists (update vs create)
        let existing = self.find_file(remote_key).await?;

        if let Some(existing_file) = existing {
            // Update existing file
            let resp = self.client
                .patch(&format!("{}/files/{}?uploadType=media", DRIVE_UPLOAD_API, existing_file.id))
                .bearer_auth(&token)
                .header("Content-Type", "application/octet-stream")
                .body(data.to_vec())
                .send()
                .await
                .map_err(|e| format!("Drive update: {}", e))?;

            let status = resp.status();
            if !status.is_success() {
                let body = resp.text().await.unwrap_or_default();
                return Err(format!("Drive update failed ({}): {}", status, body));
            }
        } else {
            // Create new file with multipart upload
            let metadata = serde_json::json!({
                "name": remote_key,
                "parents": [folder_id]
            });

            let boundary = "klio_boundary_12345";
            let mut body = Vec::new();

            // Metadata part
            body.extend_from_slice(format!("--{}\r\n", boundary).as_bytes());
            body.extend_from_slice(b"Content-Type: application/json; charset=UTF-8\r\n\r\n");
            body.extend_from_slice(metadata.to_string().as_bytes());
            body.extend_from_slice(b"\r\n");

            // File part
            body.extend_from_slice(format!("--{}\r\n", boundary).as_bytes());
            body.extend_from_slice(b"Content-Type: application/octet-stream\r\n\r\n");
            body.extend_from_slice(data);
            body.extend_from_slice(b"\r\n");
            body.extend_from_slice(format!("--{}--", boundary).as_bytes());

            let resp = self.client
                .post(&format!("{}/files?uploadType=multipart", DRIVE_UPLOAD_API))
                .bearer_auth(&token)
                .header("Content-Type", format!("multipart/related; boundary={}", boundary))
                .body(body)
                .send()
                .await
                .map_err(|e| format!("Drive create: {}", e))?;

            let status = resp.status();
            if !status.is_success() {
                let body = resp.text().await.unwrap_or_default();
                return Err(format!("Drive create failed ({}): {}", status, body));
            }
        }

        Ok(())
    }
}

fn urlencoding(s: &str) -> String {
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
