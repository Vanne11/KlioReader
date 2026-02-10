fn main() {
    let target_os = std::env::var("CARGO_CFG_TARGET_OS").unwrap_or_default();
    if target_os == "android" {
        let out_dir = std::env::var("OUT_DIR").unwrap();

        // Android no tiene libpthread separada (está integrada en libc).
        // unrar_sys pide -lpthread incondicionalmente, así que creamos una libpthread.a vacía.
        let empty_lib = std::path::Path::new(&out_dir).join("libpthread.a");
        std::fs::write(&empty_lib, b"!<arch>\n").unwrap();
        println!("cargo:rustc-link-search=native={}", out_dir);

        // Enlazar libc++_shared.so para resolver símbolos C++ de unrar.
        // Agrega DT_NEEDED en libtauri_app_lib.so; Tauri detecta esta
        // dependencia y symlinker libc++_shared.so del NDK a jniLibs.
        println!("cargo:rustc-link-lib=c++_shared");
    }

    tauri_build::build()
}
