fn main() {
    // Android no tiene libpthread separada (está integrada en libc).
    // unrar_sys pide -lpthread incondicionalmente, así que creamos una libpthread.a vacía.
    let target_os = std::env::var("CARGO_CFG_TARGET_OS").unwrap_or_default();
    if target_os == "android" {
        let out_dir = std::env::var("OUT_DIR").unwrap();
        let empty_lib = std::path::Path::new(&out_dir).join("libpthread.a");
        // Crear archivo AR vacío (header mínimo)
        std::fs::write(&empty_lib, b"!<arch>\n").unwrap();
        println!("cargo:rustc-link-search=native={}", out_dir);
    }

    tauri_build::build()
}
