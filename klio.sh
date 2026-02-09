#!/usr/bin/env bash
# ╔══════════════════════════════════════════════════════════════╗
# ║                    KlioReader DevTool                       ║
# ║          Herramienta de desarrollo para KlioReader          ║
# ╚══════════════════════════════════════════════════════════════╝

set -euo pipefail

# ── Colores y estilos ──────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
MAGENTA='\033[0;35m'
CYAN='\033[0;36m'
WHITE='\033[1;37m'
GRAY='\033[0;90m'
BOLD='\033[1m'
DIM='\033[2m'
NC='\033[0m'

# ── Variables del proyecto ─────────────────────────────────────
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TAURI_DIR="$PROJECT_DIR/src-tauri"
BACKEND_DIR="$PROJECT_DIR/backend-php"
APP_NAME="KlioReader"
APP_VERSION=$(grep -o '"version": *"[^"]*"' "$TAURI_DIR/tauri.conf.json" | head -1 | cut -d'"' -f4)
BUILDS_DIR="$PROJECT_DIR/builds"
KEYSTORE_DIR="$PROJECT_DIR/.keystore"
KEYSTORE_FILE="$KEYSTORE_DIR/klio-release.keystore"
KEYSTORE_CONF="$KEYSTORE_DIR/keystore.conf"
KEYSTORE_ALIAS="klio"

# ── Funciones de utilidad ──────────────────────────────────────
print_banner() {
    echo -e "${CYAN}"
    echo -e "  ╔═══════════════════════════════════════════════════╗"
    echo -e "  ║                                                   ║"
    echo -e "  ║   📖  ${WHITE}K L I O   R E A D E R${CYAN}   DevTool            ║"
    echo -e "  ║                                                   ║"
    echo -e "  ║   ${DIM}${CYAN}v${APP_VERSION}  •  Tauri + React + PHP${NC}${CYAN}              ║"
    echo -e "  ║                                                   ║"
    echo -e "  ╚═══════════════════════════════════════════════════╝"
    echo -e "${NC}"
}

info()    { echo -e "  ${BLUE}ℹ${NC}  $1"; }
success() { echo -e "  ${GREEN}✔${NC}  $1"; }
warn()    { echo -e "  ${YELLOW}⚠${NC}  $1"; }
error()   { echo -e "  ${RED}✖${NC}  $1"; }
step()    { echo -e "  ${MAGENTA}▸${NC}  $1"; }

separator() {
    echo -e "  ${GRAY}─────────────────────────────────────────────${NC}"
}

confirm() {
    local msg="${1:-¿Continuar?}"
    echo -ne "  ${YELLOW}?${NC}  ${msg} [s/N] "
    read -r resp
    [[ "$resp" =~ ^[sS]$ ]]
}

press_enter() {
    echo ""
    echo -ne "  ${DIM}Presiona Enter para volver al menú...${NC}"
    read -r
}

# ── Verificar que estamos en el directorio correcto ────────────
check_project() {
    if [[ ! -f "$PROJECT_DIR/package.json" ]] || [[ ! -d "$TAURI_DIR" ]]; then
        error "No se encontró el proyecto KlioReader en $PROJECT_DIR"
        exit 1
    fi
}

# ── Verificar y configurar entorno Android ───────────────────
# Auto-detecta SDK, NDK, Java y rustup targets.
# Instala lo que falte sin necesidad de intervención manual.
check_android_env() {
    local changed=false

    # ── 1. Detectar / configurar ANDROID_HOME ────────────────
    if [[ -z "${ANDROID_HOME:-}" ]] || [[ ! -d "${ANDROID_HOME}" ]]; then
        # Buscar SDK en ubicaciones comunes
        local sdk_candidates=(
            "$HOME/Android/Sdk"
            "$HOME/.android/sdk"
            "/opt/android-sdk"
            "$HOME/Library/Android/sdk"
        )
        local found_sdk=""
        for candidate in "${sdk_candidates[@]}"; do
            if [[ -d "$candidate" ]]; then
                found_sdk="$candidate"
                break
            fi
        done

        if [[ -z "$found_sdk" ]]; then
            error "No se encontró Android SDK en ninguna ubicación conocida"
            info "Instala Android Studio desde ${CYAN}https://developer.android.com/studio${NC}"
            info "O instala las cmdline-tools y configura ANDROID_HOME manualmente"
            return 1
        fi

        export ANDROID_HOME="$found_sdk"
        export ANDROID_SDK_ROOT="$found_sdk"
        success "SDK detectado: ${WHITE}$found_sdk${NC}"
        changed=true
    fi

    # ── 2. Detectar / configurar JAVA_HOME ───────────────────
    if [[ -z "${JAVA_HOME:-}" ]] || [[ ! -d "${JAVA_HOME}" ]]; then
        local java_candidates=(
            "/opt/android-studio/jbr"
            "/opt/android-studio/jre"
            "/usr/lib/jvm/default"
            "/usr/lib/jvm/java-17-openjdk"
            "/usr/lib/jvm/java-21-openjdk"
        )
        local found_java=""
        for candidate in "${java_candidates[@]}"; do
            if [[ -x "$candidate/bin/java" ]]; then
                found_java="$candidate"
                break
            fi
        done

        if [[ -z "$found_java" ]]; then
            error "No se encontró Java/JDK"
            info "  Arch: ${CYAN}sudo pacman -S jdk-openjdk${NC}"
            info "  O instala Android Studio (incluye JBR)"
            return 1
        fi

        export JAVA_HOME="$found_java"
        export PATH="$JAVA_HOME/bin:$PATH"
        success "Java detectado: ${WHITE}$found_java${NC}"
        changed=true
    fi

    # ── 3. Asegurar cmdline-tools / sdkmanager ───────────────
    local sdkmanager=""
    for sm_path in \
        "$ANDROID_HOME/cmdline-tools/latest/bin/sdkmanager" \
        "$ANDROID_HOME/cmdline-tools/bin/sdkmanager" \
        "$ANDROID_HOME/tools/bin/sdkmanager"; do
        if [[ -x "$sm_path" ]]; then
            sdkmanager="$sm_path"
            break
        fi
    done

    if [[ -z "$sdkmanager" ]]; then
        warn "sdkmanager no encontrado en el SDK"
        info "Abre Android Studio → SDK Manager → instala Command-line Tools"
        info "O descárgalas de ${CYAN}https://developer.android.com/studio#command-tools${NC}"
        return 1
    fi

    # ── 4. Instalar platform-tools si falta (para adb) ───────
    if [[ ! -x "$ANDROID_HOME/platform-tools/adb" ]]; then
        info "Instalando platform-tools (adb)..."
        yes | "$sdkmanager" --sdk_root="$ANDROID_HOME" --install "platform-tools" >/dev/null 2>&1
        if [[ -x "$ANDROID_HOME/platform-tools/adb" ]]; then
            success "platform-tools instalado"
        else
            warn "No se pudo instalar platform-tools"
        fi
    fi
    export PATH="$ANDROID_HOME/platform-tools:$PATH"

    # ── 5. Instalar NDK si falta ─────────────────────────────
    local ndk_dir=""
    if [[ -d "$ANDROID_HOME/ndk" ]]; then
        # Usar la versión más reciente disponible
        ndk_dir=$(find "$ANDROID_HOME/ndk" -maxdepth 1 -mindepth 1 -type d 2>/dev/null | sort -V | tail -1)
    fi

    if [[ -z "$ndk_dir" ]] || [[ ! -d "$ndk_dir" ]]; then
        info "NDK no encontrado. Instalando..."
        # Obtener la última versión de NDK disponible
        local ndk_version
        ndk_version=$("$sdkmanager" --sdk_root="$ANDROID_HOME" --list 2>/dev/null \
            | grep "ndk;" | grep -v "rc" | tail -1 | awk '{print $1}')
        if [[ -z "$ndk_version" ]]; then
            ndk_version="ndk;29.0.13846066"
        fi
        step "Instalando ${CYAN}${ndk_version}${NC}... (puede tardar)"
        yes | "$sdkmanager" --sdk_root="$ANDROID_HOME" --install "$ndk_version" >/dev/null 2>&1
        ndk_dir=$(find "$ANDROID_HOME/ndk" -maxdepth 1 -mindepth 1 -type d 2>/dev/null | sort -V | tail -1)
        if [[ -d "$ndk_dir" ]]; then
            success "NDK instalado: ${WHITE}$(basename "$ndk_dir")${NC}"
        else
            error "No se pudo instalar el NDK"
            return 1
        fi
    fi
    export NDK_HOME="$ndk_dir"

    # ── 6. Instalar platforms y build-tools si faltan ────────
    if [[ ! -d "$ANDROID_HOME/platforms" ]] || [[ -z "$(ls -A "$ANDROID_HOME/platforms" 2>/dev/null)" ]]; then
        info "Instalando platform Android..."
        local platform
        platform=$("$sdkmanager" --sdk_root="$ANDROID_HOME" --list 2>/dev/null \
            | grep "platforms;android-" | grep -v "ext" | tail -1 | awk '{print $1}')
        [[ -z "$platform" ]] && platform="platforms;android-35"
        yes | "$sdkmanager" --sdk_root="$ANDROID_HOME" --install "$platform" >/dev/null 2>&1
        success "Platform instalada"
    fi

    if [[ ! -d "$ANDROID_HOME/build-tools" ]] || [[ -z "$(ls -A "$ANDROID_HOME/build-tools" 2>/dev/null)" ]]; then
        info "Instalando build-tools..."
        local bt
        bt=$("$sdkmanager" --sdk_root="$ANDROID_HOME" --list 2>/dev/null \
            | grep "build-tools;" | tail -1 | awk '{print $1}')
        [[ -z "$bt" ]] && bt="build-tools;35.0.0"
        yes | "$sdkmanager" --sdk_root="$ANDROID_HOME" --install "$bt" >/dev/null 2>&1
        success "Build-tools instaladas"
    fi

    # ── 7. Verificar rustup y targets Android ────────────────
    if [[ -f "$HOME/.cargo/env" ]]; then
        source "$HOME/.cargo/env"
    fi

    if ! command -v rustup &>/dev/null; then
        error "rustup no encontrado"
        echo ""
        info "Rust debe instalarse via ${CYAN}rustup${NC} (no via pacman) para compilar a Android"
        info "Si tienes Rust de sistema, desinstálalo primero:"
        echo -e "    ${CYAN}sudo pacman -Rns rust${NC}   ${DIM}(Arch)${NC}"
        echo ""
        info "Luego instala rustup:"
        echo -e "    ${CYAN}curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh${NC}"
        return 1
    fi

    local android_targets=("aarch64-linux-android" "armv7-linux-androideabi" "i686-linux-android" "x86_64-linux-android")
    local missing_targets=()
    local installed_targets
    installed_targets=$(rustup target list --installed 2>/dev/null)

    for target in "${android_targets[@]}"; do
        if ! echo "$installed_targets" | grep -q "^${target}$"; then
            missing_targets+=("$target")
        fi
    done

    if [[ ${#missing_targets[@]} -gt 0 ]]; then
        info "Instalando targets Rust para Android..."
        for target in "${missing_targets[@]}"; do
            rustup target add "$target" >/dev/null 2>&1
            success "Target: ${WHITE}$target${NC}"
        done
    fi

    # ── 8. Persistir en .bashrc si hubo cambios ──────────────
    if $changed; then
        local bashrc="$HOME/.bashrc"
        if ! grep -q "# Android SDK (auto-klio)" "$bashrc" 2>/dev/null; then
            echo ""
            if confirm "¿Guardar configuración Android en .bashrc para futuras sesiones?"; then
                cat >> "$bashrc" << ENVBLOCK

# Android SDK (auto-klio)
export ANDROID_HOME="$ANDROID_HOME"
export ANDROID_SDK_ROOT="\$ANDROID_HOME"
export NDK_HOME="$NDK_HOME"
export JAVA_HOME="$JAVA_HOME"
export PATH="\$ANDROID_HOME/cmdline-tools/latest/bin:\$ANDROID_HOME/cmdline-tools/bin:\$ANDROID_HOME/platform-tools:\$JAVA_HOME/bin:\$PATH"
ENVBLOCK
                success "Configuración guardada en .bashrc"
            fi
        fi
    fi

    echo ""
    success "Entorno Android ${GREEN}listo${NC}"
    return 0
}

# ══════════════════════════════════════════════════════════════
# SETUP COMPLETO DEL SISTEMA
# Instala TODO lo necesario desde cero: paquetes del sistema,
# Rust, Node, Android SDK/NDK, dependencias del proyecto.
# ══════════════════════════════════════════════════════════════
cmd_setup() {
    echo ""
    echo -e "  ${BOLD}${CYAN}⚡ Configuración Completa del Sistema${NC}"
    separator
    echo ""
    info "Este asistente preparará tu sistema para desarrollar KlioReader."
    info "Incluye: paquetes del sistema, Rust, Node.js, Android SDK/NDK"
    info "Se pedirá contraseña para instalar paquetes del sistema."
    echo ""

    if ! confirm "¿Continuar con la configuración completa?"; then
        return
    fi

    echo ""

    # ── 1. Detectar gestor de paquetes ──────────────────────────
    local pkg_mgr=""
    local use_sudo=""
    if command -v yay &>/dev/null; then
        pkg_mgr="yay"
    elif command -v paru &>/dev/null; then
        pkg_mgr="paru"
    elif command -v pacman &>/dev/null; then
        pkg_mgr="pacman"
        use_sudo="sudo"
    else
        error "No se detectó pacman/yay/paru"
        error "Este script está diseñado para Arch Linux y derivados"
        return 1
    fi
    success "Gestor de paquetes: ${WHITE}${pkg_mgr}${NC}"
    echo ""

    # ── 2. Dependencias del sistema para Tauri ──────────────────
    step "Instalando dependencias del sistema para Tauri..."
    echo ""

    local tauri_deps=(
        base-devel
        webkit2gtk-4.1
        curl
        wget
        file
        openssl
        gtk3
        libappindicator-gtk3
        librsvg
        patchelf
        unzip
    )

    $use_sudo $pkg_mgr -S --needed "${tauri_deps[@]}" || {
        error "Falló la instalación de paquetes del sistema"
        return 1
    }
    echo ""
    success "Dependencias de Tauri listas"
    echo ""

    # ── 3. Node.js y npm ────────────────────────────────────────
    if ! command -v node &>/dev/null; then
        step "Instalando Node.js y npm..."
        $use_sudo $pkg_mgr -S --needed nodejs npm || {
            error "No se pudo instalar Node.js"
            return 1
        }
        success "Node.js instalado: $(node --version)"
    else
        success "Node.js $(node --version) ya instalado"
    fi
    echo ""

    # ── 4. Rust via rustup ──────────────────────────────────────
    if [[ -f "$HOME/.cargo/env" ]]; then
        source "$HOME/.cargo/env"
    fi

    if ! command -v rustup &>/dev/null; then
        # rust del sistema conflicta con rustup
        if pacman -Qi rust &>/dev/null 2>&1; then
            warn "Rust del sistema detectado — se necesita ${WHITE}rustup${NC} para cross-compile a Android"
            if confirm "¿Reemplazar rust del sistema con rustup?"; then
                sudo pacman -Rns --noconfirm rust 2>/dev/null || true
            else
                error "Se necesita rustup para compilar a Android. Abortando."
                return 1
            fi
        fi

        step "Instalando Rust via rustup..."
        curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --default-toolchain stable
        source "$HOME/.cargo/env"
        success "Rust $(rustc --version | awk '{print $2}') instalado via rustup"
    else
        success "Rust $(rustc --version | awk '{print $2}') via rustup"
    fi

    # Asegurar toolchain stable por defecto
    rustup default stable >/dev/null 2>&1
    echo ""

    # ── 5. JDK para Android ─────────────────────────────────────
    local java_found=false
    if [[ -x "/opt/android-studio/jbr/bin/java" ]]; then
        export JAVA_HOME="/opt/android-studio/jbr"
        java_found=true
        success "Java: Android Studio JBR"
    elif command -v java &>/dev/null; then
        # Intentar detectar JAVA_HOME
        local java_candidates=(
            "/opt/android-studio/jbr"
            "/opt/android-studio/jre"
            "/usr/lib/jvm/default"
            "/usr/lib/jvm/java-17-openjdk"
            "/usr/lib/jvm/java-21-openjdk"
        )
        for candidate in "${java_candidates[@]}"; do
            if [[ -x "$candidate/bin/java" ]]; then
                export JAVA_HOME="$candidate"
                java_found=true
                break
            fi
        done
        if $java_found; then
            success "Java: ${WHITE}$JAVA_HOME${NC}"
        fi
    fi

    if ! $java_found; then
        step "Instalando JDK..."
        $use_sudo $pkg_mgr -S --needed jdk-openjdk || {
            error "No se pudo instalar JDK"
            return 1
        }
        export JAVA_HOME="/usr/lib/jvm/default"
        success "JDK instalado"
    fi
    export PATH="$JAVA_HOME/bin:$PATH"
    echo ""

    # ── 6. Android SDK ──────────────────────────────────────────
    step "Configurando Android SDK..."
    echo ""

    # IMPORTANTE: Limpiar variables obsoletas que causan errores
    unset NDK_HOME 2>/dev/null || true
    unset ANDROID_NDK_HOME 2>/dev/null || true

    # Detectar o crear ANDROID_HOME
    local sdk_dir=""
    for candidate in "$HOME/Android/Sdk" "$HOME/.android/sdk" "/opt/android-sdk"; do
        if [[ -d "$candidate" ]]; then
            sdk_dir="$candidate"
            break
        fi
    done

    if [[ -z "$sdk_dir" ]]; then
        sdk_dir="$HOME/Android/Sdk"
        mkdir -p "$sdk_dir"
        info "Directorio SDK creado: ${WHITE}$sdk_dir${NC}"
    fi

    export ANDROID_HOME="$sdk_dir"
    export ANDROID_SDK_ROOT="$sdk_dir"
    success "ANDROID_HOME: ${WHITE}$sdk_dir${NC}"

    # Buscar o descargar cmdline-tools
    local sdkmanager=""
    for sm_path in \
        "$ANDROID_HOME/cmdline-tools/latest/bin/sdkmanager" \
        "$ANDROID_HOME/cmdline-tools/bin/sdkmanager" \
        "$ANDROID_HOME/tools/bin/sdkmanager"; do
        if [[ -x "$sm_path" ]]; then
            sdkmanager="$sm_path"
            break
        fi
    done

    if [[ -z "$sdkmanager" ]]; then
        step "Descargando Android command-line tools..."
        local cmdline_zip="/tmp/android-cmdline-tools.zip"
        # Versión estable de cmdline-tools (actualizar si es necesario)
        local cmdline_url="https://dl.google.com/android/repository/commandlinetools-linux-11076708_latest.zip"
        curl -#L -o "$cmdline_zip" "$cmdline_url" || {
            error "No se pudo descargar cmdline-tools"
            info "Descárgalas manualmente: ${CYAN}${cmdline_url}${NC}"
            return 1
        }

        mkdir -p "$ANDROID_HOME/cmdline-tools"
        unzip -q -o "$cmdline_zip" -d "$ANDROID_HOME/cmdline-tools/"
        # El zip extrae a 'cmdline-tools/', mover a 'latest/'
        if [[ -d "$ANDROID_HOME/cmdline-tools/cmdline-tools" ]]; then
            rm -rf "$ANDROID_HOME/cmdline-tools/latest" 2>/dev/null || true
            mv "$ANDROID_HOME/cmdline-tools/cmdline-tools" "$ANDROID_HOME/cmdline-tools/latest"
        fi
        rm -f "$cmdline_zip"

        sdkmanager="$ANDROID_HOME/cmdline-tools/latest/bin/sdkmanager"
        if [[ -x "$sdkmanager" ]]; then
            success "cmdline-tools instaladas"
        else
            error "No se pudo configurar sdkmanager"
            return 1
        fi
    else
        success "sdkmanager encontrado"
    fi

    # Aceptar licencias automáticamente
    yes 2>/dev/null | "$sdkmanager" --sdk_root="$ANDROID_HOME" --licenses >/dev/null 2>&1 || true

    # Instalar platform-tools (adb)
    if [[ ! -x "$ANDROID_HOME/platform-tools/adb" ]]; then
        step "Instalando platform-tools (adb)..."
        yes | "$sdkmanager" --sdk_root="$ANDROID_HOME" --install "platform-tools" >/dev/null 2>&1
        success "platform-tools instaladas"
    else
        success "platform-tools ya instaladas"
    fi
    export PATH="$ANDROID_HOME/platform-tools:$PATH"

    # Instalar NDK
    local ndk_dir=""
    if [[ -d "$ANDROID_HOME/ndk" ]]; then
        ndk_dir=$(find "$ANDROID_HOME/ndk" -maxdepth 1 -mindepth 1 -type d 2>/dev/null | sort -V | tail -1)
    fi

    if [[ -z "$ndk_dir" ]]; then
        step "Instalando Android NDK... (puede tardar un poco)"
        local ndk_version
        ndk_version=$("$sdkmanager" --sdk_root="$ANDROID_HOME" --list 2>/dev/null \
            | grep "ndk;" | grep -v "rc" | tail -1 | awk '{print $1}')
        [[ -z "$ndk_version" ]] && ndk_version="ndk;29.0.13846066"
        yes | "$sdkmanager" --sdk_root="$ANDROID_HOME" --install "$ndk_version" >/dev/null 2>&1
        ndk_dir=$(find "$ANDROID_HOME/ndk" -maxdepth 1 -mindepth 1 -type d 2>/dev/null | sort -V | tail -1)
        if [[ -d "$ndk_dir" ]]; then
            success "NDK instalado: ${WHITE}$(basename "$ndk_dir")${NC}"
        else
            error "No se pudo instalar el NDK"
            return 1
        fi
    else
        success "NDK: ${WHITE}$(basename "$ndk_dir")${NC}"
    fi
    export NDK_HOME="$ndk_dir"

    # Instalar platform (android-XX)
    if [[ ! -d "$ANDROID_HOME/platforms" ]] || [[ -z "$(ls -A "$ANDROID_HOME/platforms" 2>/dev/null)" ]]; then
        step "Instalando Android platform..."
        local platform
        platform=$("$sdkmanager" --sdk_root="$ANDROID_HOME" --list 2>/dev/null \
            | grep "platforms;android-" | grep -v "ext" | tail -1 | awk '{print $1}')
        [[ -z "$platform" ]] && platform="platforms;android-35"
        yes | "$sdkmanager" --sdk_root="$ANDROID_HOME" --install "$platform" >/dev/null 2>&1
        success "Platform instalada"
    else
        success "Android platform ya instalada"
    fi

    # Instalar build-tools
    if [[ ! -d "$ANDROID_HOME/build-tools" ]] || [[ -z "$(ls -A "$ANDROID_HOME/build-tools" 2>/dev/null)" ]]; then
        step "Instalando build-tools..."
        local bt
        bt=$("$sdkmanager" --sdk_root="$ANDROID_HOME" --list 2>/dev/null \
            | grep "build-tools;" | tail -1 | awk '{print $1}')
        [[ -z "$bt" ]] && bt="build-tools;35.0.0"
        yes | "$sdkmanager" --sdk_root="$ANDROID_HOME" --install "$bt" >/dev/null 2>&1
        success "Build-tools instaladas"
    else
        success "Build-tools ya instaladas"
    fi
    echo ""

    # ── 7. Rust targets para Android ────────────────────────────
    step "Verificando Rust targets para Android..."
    local android_targets=("aarch64-linux-android" "armv7-linux-androideabi" "i686-linux-android" "x86_64-linux-android")
    local missing_targets=()
    local installed_targets
    installed_targets=$(rustup target list --installed 2>/dev/null)

    for target in "${android_targets[@]}"; do
        if ! echo "$installed_targets" | grep -q "^${target}$"; then
            missing_targets+=("$target")
        fi
    done

    if [[ ${#missing_targets[@]} -gt 0 ]]; then
        for target in "${missing_targets[@]}"; do
            rustup target add "$target" >/dev/null 2>&1
            success "Target: ${WHITE}$target${NC}"
        done
    else
        success "Todos los targets Android ya instalados"
    fi
    echo ""

    # ── 8. Persistir variables de entorno ───────────────────────
    local shell_rc="$HOME/.bashrc"
    [[ -f "$HOME/.zshrc" ]] && [[ "${SHELL:-}" == *"zsh"* ]] && shell_rc="$HOME/.zshrc"

    # Eliminar bloque anterior si existe (puede tener rutas obsoletas)
    if grep -q "# Android SDK (auto-klio)" "$shell_rc" 2>/dev/null; then
        # Borrar desde la marca hasta la siguiente línea vacía o fin del bloque
        sed -i '/# Android SDK (auto-klio)/,/^$/d' "$shell_rc"
        info "Configuración anterior reemplazada en $(basename "$shell_rc")"
    fi

    step "Guardando variables de entorno en $(basename "$shell_rc")..."
    cat >> "$shell_rc" << ENVBLOCK

# Android SDK (auto-klio)
export ANDROID_HOME="$ANDROID_HOME"
export ANDROID_SDK_ROOT="\$ANDROID_HOME"
export NDK_HOME="$NDK_HOME"
export JAVA_HOME="$JAVA_HOME"
export PATH="\$ANDROID_HOME/cmdline-tools/latest/bin:\$ANDROID_HOME/platform-tools:\$JAVA_HOME/bin:\$PATH"
ENVBLOCK
    success "Variables guardadas en $(basename "$shell_rc")"
    echo ""

    # ── 9. Dependencias del proyecto ────────────────────────────
    step "Instalando dependencias Node.js..."
    cd "$PROJECT_DIR" && npm install
    echo ""
    success "Dependencias Node.js instaladas"
    echo ""

    step "Verificando dependencias Rust... (primera vez tarda bastante)"
    cd "$TAURI_DIR" && cargo check 2>&1
    echo ""
    success "Dependencias Rust verificadas"
    echo ""

    # ── 10. Inicializar proyecto Android ────────────────────────
    if [[ ! -d "$TAURI_DIR/gen/android" ]]; then
        step "Inicializando proyecto Android..."
        cd "$PROJECT_DIR"
        npm run tauri android init
        echo ""
        success "Proyecto Android inicializado"
    else
        success "Proyecto Android ya inicializado"
    fi

    echo ""
    separator
    echo ""
    success "${GREEN}${BOLD}¡Sistema completamente configurado!${NC}"
    echo ""
    info "Ahora puedes usar:"
    echo -e "    ${CYAN}./klio.sh dev${NC}     → Menú de desarrollo"
    echo -e "    ${CYAN}./klio.sh build${NC}   → Compilar la app"
    echo -e "    ${CYAN}./klio.sh doctor${NC}  → Verificar que todo esté bien"
    echo ""

    press_enter
}

# ── Helpers para firma Android ────────────────────────────────
find_build_tools() {
    local bt_dir=""
    if [[ -n "${ANDROID_HOME:-}" ]]; then
        bt_dir=$(find "$ANDROID_HOME/build-tools" -maxdepth 1 -mindepth 1 -type d 2>/dev/null | sort -V | tail -1)
    fi
    if [[ -z "$bt_dir" ]]; then
        # Buscar en ubicaciones comunes
        for candidate in "$HOME/Android/Sdk" "$HOME/.android/sdk" "/opt/android-sdk"; do
            if [[ -d "$candidate/build-tools" ]]; then
                bt_dir=$(find "$candidate/build-tools" -maxdepth 1 -mindepth 1 -type d 2>/dev/null | sort -V | tail -1)
                [[ -n "$bt_dir" ]] && break
            fi
        done
    fi
    echo "$bt_dir"
}

ensure_keystore() {
    if [[ -f "$KEYSTORE_FILE" ]] && [[ -f "$KEYSTORE_CONF" ]]; then
        return 0
    fi

    echo ""
    info "No se encontró firma (keystore). Se creará una automáticamente."
    info "La firma es necesaria para instalar el APK en tu celular."
    echo ""

    # Pedir password o generar una
    local ks_pass=""
    echo -e "  ${WHITE}Elige una contraseña para proteger tu firma:${NC}"
    echo -e "    ${WHITE}1${NC}) ${GREEN}Automática${NC}  ${DIM}— Se genera y guarda sola (recomendado)${NC}"
    echo -e "    ${WHITE}2${NC}) ${YELLOW}Manual${NC}      ${DIM}— Tú eliges la contraseña${NC}"
    echo -ne "  ${YELLOW}▸${NC} Opción [1]: "
    read -r pass_opt
    [[ -z "$pass_opt" ]] && pass_opt="1"

    if [[ "$pass_opt" == "2" ]]; then
        echo -ne "  ${YELLOW}?${NC}  Contraseña (mínimo 6 caracteres): "
        read -rs ks_pass
        echo ""
        if [[ ${#ks_pass} -lt 6 ]]; then
            error "La contraseña debe tener al menos 6 caracteres"
            return 1
        fi
    else
        ks_pass="klio$(date +%s | sha256sum | head -c 16)"
        info "Contraseña generada automáticamente"
    fi

    mkdir -p "$KEYSTORE_DIR"

    step "Generando keystore..."
    if keytool -genkey -v \
        -keystore "$KEYSTORE_FILE" \
        -alias "$KEYSTORE_ALIAS" \
        -keyalg RSA -keysize 2048 -validity 10000 \
        -storepass "$ks_pass" -keypass "$ks_pass" \
        -dname "CN=${APP_NAME}, OU=Dev, O=${APP_NAME}, L=Unknown, ST=Unknown, C=XX" \
        >/dev/null 2>&1; then

        # Guardar configuración
        cat > "$KEYSTORE_CONF" << KSEOF
# Configuración del keystore — NO compartas este archivo
# Generado: $(date '+%Y-%m-%d %H:%M:%S')
KEYSTORE_PASSWORD=${ks_pass}
KEY_ALIAS=${KEYSTORE_ALIAS}
KSEOF
        chmod 600 "$KEYSTORE_CONF"
        chmod 600 "$KEYSTORE_FILE"

        echo ""
        success "Firma creada exitosamente"
        info "Archivos guardados en: ${CYAN}.keystore/${NC}"
        warn "IMPORTANTE: Haz backup de la carpeta ${WHITE}.keystore/${NC}"
        warn "Si la pierdes, no podrás actualizar tu app en celulares donde ya esté instalada."
        echo ""
        return 0
    else
        error "No se pudo crear el keystore"
        info "Asegúrate de tener ${CYAN}keytool${NC} instalado (viene con Java/JDK)"
        return 1
    fi
}

load_keystore_conf() {
    if [[ -f "$KEYSTORE_CONF" ]]; then
        source "$KEYSTORE_CONF"
        return 0
    fi
    return 1
}

# Recolectar artefactos, firmar APKs y limpiar intermedios
collect_and_clean() {
    local build_type="$1"  # "desktop", "android", "both"
    local mode="${2:-}"     # "binary_only" o vacío
    local timestamp
    timestamp=$(date '+%Y-%m-%d_%H-%M-%S')
    local out_dir="$BUILDS_DIR/${APP_NAME}-v${APP_VERSION}_${timestamp}"

    mkdir -p "$out_dir"

    echo ""
    separator
    step "Recolectando artefactos en ${CYAN}builds/${NC}..."
    echo ""

    local count=0

    # ── Desktop artifacts ──
    if [[ "$build_type" == "desktop" || "$build_type" == "both" ]]; then
        # Copiar binario si existe
        local bin_name
        bin_name=$(grep -o '"productName": *"[^"]*"' "$TAURI_DIR/tauri.conf.json" 2>/dev/null | head -1 | cut -d'"' -f4)
        [[ -z "$bin_name" ]] && bin_name="tauri-app"
        local bin_path=""
        for profile in release debug; do
            if [[ -x "$TAURI_DIR/target/$profile/$bin_name" ]]; then
                bin_path="$TAURI_DIR/target/$profile/$bin_name"
                break
            fi
        done
        if [[ -n "$bin_path" ]]; then
            local size
            size=$(du -h "$bin_path" | cut -f1)
            cp "$bin_path" "$out_dir/$bin_name"
            success "${bin_name} ${DIM}(${size})${NC}"
            ((count++))
        fi

        local bundle_dir="$TAURI_DIR/target/release/bundle"
        if [[ -d "$bundle_dir" ]] && [[ "$mode" != "binary_only" ]]; then
            find "$bundle_dir" -maxdepth 2 -type f \( \
                -name "*.deb" -o -name "*.rpm" -o -name "*.AppImage" \
                -o -name "*.exe" -o -name "*.msi" -o -name "*.dmg" \
            \) 2>/dev/null | while read -r f; do
                local fname size
                fname=$(basename "$f")
                size=$(du -h "$f" | cut -f1)
                cp "$f" "$out_dir/$fname"
                success "${fname} ${DIM}(${size})${NC}"
            done
            # Contar lo copiado
            count=$((count + $(find "$out_dir" -maxdepth 1 -type f \( \
                -name "*.deb" -o -name "*.rpm" -o -name "*.AppImage" \
                -o -name "*.exe" -o -name "*.msi" -o -name "*.dmg" \
            \) 2>/dev/null | wc -l)))
        fi

        # Limpiar bundles intermedios (NO target/ completo, eso es cache de Rust)
        if [[ -d "$bundle_dir" ]]; then
            rm -rf "$bundle_dir"
        fi
    fi

    # ── Android artifacts ──
    if [[ "$build_type" == "android" || "$build_type" == "both" ]]; then
        local android_out="$TAURI_DIR/gen/android/app/build/outputs"
        if [[ -d "$android_out" ]]; then
            # Buscar APKs y AABs
            find "$android_out" -type f \( -name "*.apk" -o -name "*.aab" \) 2>/dev/null | while read -r f; do
                local fname size
                fname=$(basename "$f")
                size=$(du -h "$f" | cut -f1)
                cp "$f" "$out_dir/$fname"
                success "${fname} ${DIM}(${size})${NC}"
            done

            # Firmar APKs si hay keystore
            if [[ -f "$KEYSTORE_FILE" ]] && [[ -f "$KEYSTORE_CONF" ]]; then
                local bt_dir
                bt_dir=$(find_build_tools)
                if [[ -n "$bt_dir" ]] && [[ -x "$bt_dir/zipalign" ]] && [[ -x "$bt_dir/apksigner" ]]; then
                    load_keystore_conf
                    echo ""
                    step "Firmando APKs..."
                    find "$out_dir" -maxdepth 1 -name "*.apk" ! -name "*-signed.apk" 2>/dev/null | while read -r apk; do
                        local apk_name
                        apk_name=$(basename "$apk" .apk)
                        local clean_name="${apk_name/-unsigned/}"
                        local aligned="$out_dir/${clean_name}-aligned.apk"
                        local signed="$out_dir/${clean_name}-signed.apk"

                        if "$bt_dir/zipalign" -f 4 "$apk" "$aligned" 2>/dev/null; then
                            if "$bt_dir/apksigner" sign \
                                --ks "$KEYSTORE_FILE" \
                                --ks-key-alias "$KEY_ALIAS" \
                                --ks-pass "pass:${KEYSTORE_PASSWORD}" \
                                --key-pass "pass:${KEYSTORE_PASSWORD}" \
                                --out "$signed" \
                                "$aligned" 2>/dev/null; then
                                rm -f "$aligned"
                                local ssize
                                ssize=$(du -h "$signed" | cut -f1)
                                success "Firmado: ${WHITE}$(basename "$signed")${NC} ${DIM}(${ssize})${NC}"
                            else
                                rm -f "$aligned"
                                warn "No se pudo firmar $(basename "$apk")"
                            fi
                        fi
                    done
                fi
            else
                echo ""
                info "Sin keystore — APKs sin firmar. Usa ${CYAN}./klio.sh sign${NC} después."
            fi

            count=$((count + $(find "$out_dir" -maxdepth 1 -type f \( -name "*.apk" -o -name "*.aab" \) 2>/dev/null | wc -l)))
        fi

        # Limpiar intermedios de Android (lo pesado)
        rm -rf "$TAURI_DIR/gen/android/app/build" 2>/dev/null
        rm -rf "$TAURI_DIR/gen/android/.gradle" 2>/dev/null
    fi

    # Resultado
    echo ""
    separator
    if [[ "$count" -gt 0 ]]; then
        local out_size
        out_size=$(du -sh "$out_dir" 2>/dev/null | cut -f1)
        success "Artefactos guardados en:"
        echo -e "    ${CYAN}${out_dir}/${NC} ${DIM}(${out_size})${NC}"
        echo ""
        # Listar contenido final
        find "$out_dir" -maxdepth 1 -type f 2>/dev/null | sort | while read -r f; do
            local fname size
            fname=$(basename "$f")
            size=$(du -h "$f" | cut -f1)
            echo -e "    ${GREEN}→${NC} ${WHITE}${fname}${NC} ${DIM}(${size})${NC}"
        done
        echo ""
        success "Intermedios limpiados automáticamente"
    else
        # Nada que recolectar, borrar carpeta vacía
        rmdir "$out_dir" 2>/dev/null
        warn "No se encontraron artefactos para recolectar"
    fi
}

# ══════════════════════════════════════════════════════════════
# 1. DESARROLLO
# ══════════════════════════════════════════════════════════════
cmd_dev() {
    echo ""
    echo -e "  ${BOLD}${CYAN}🚀 Modo Desarrollo${NC}"
    separator
    echo ""
    echo -e "  ${BOLD}Desktop:${NC}"
    echo -e "  ${WHITE}1${NC}) ${GREEN}Tauri Dev${NC}        ${DIM}— App completa (Rust + React)${NC}"
    echo -e "  ${WHITE}2${NC}) ${GREEN}Frontend only${NC}   ${DIM}— Solo Vite (React en navegador)${NC}"
    echo -e "  ${WHITE}3${NC}) ${GREEN}Backend PHP${NC}     ${DIM}— Servidor PHP built-in${NC}"
    echo -e "  ${WHITE}4${NC}) ${GREEN}Full Stack${NC}      ${DIM}— Frontend + Backend en paralelo${NC}"
    echo ""
    echo -e "  ${BOLD}Mobile:${NC}"
    echo -e "  ${WHITE}5${NC}) ${GREEN}Android Dev${NC}     ${DIM}— App en emulador/dispositivo Android${NC}"
    echo ""
    echo -e "  ${WHITE}0${NC}) ${DIM}Volver${NC}"
    echo ""
    echo -ne "  ${YELLOW}▸${NC} Opción: "
    read -r opt

    case $opt in
        1)
            info "Lanzando Tauri en modo desarrollo..."
            info "Frontend: ${CYAN}http://localhost:1420${NC}"
            echo ""
            cd "$PROJECT_DIR"
            npm run tauri dev
            ;;
        2)
            info "Lanzando solo Vite..."
            info "URL: ${CYAN}http://localhost:1420${NC}"
            echo ""
            cd "$PROJECT_DIR"
            npm run dev
            ;;
        3)
            local php_port=8080
            echo -ne "  ${YELLOW}?${NC}  Puerto para PHP [${php_port}]: "
            read -r custom_port
            [[ -n "$custom_port" ]] && php_port="$custom_port"
            info "Lanzando servidor PHP en ${CYAN}http://localhost:${php_port}${NC}"
            echo ""
            cd "$BACKEND_DIR"
            php -S "localhost:${php_port}" -t .
            ;;
        4)
            local php_port=8080
            info "Lanzando Frontend (Vite :1420) + Backend (PHP :${php_port})..."
            echo ""
            cd "$BACKEND_DIR"
            php -S "localhost:${php_port}" -t . &
            local php_pid=$!
            success "Backend PHP iniciado (PID: $php_pid)"
            cd "$PROJECT_DIR"
            trap "kill $php_pid 2>/dev/null; exit" INT TERM
            npm run dev
            kill $php_pid 2>/dev/null
            ;;
        5)
            check_android_env
            if [[ ! -d "$TAURI_DIR/gen/android" ]]; then
                warn "Android no está inicializado"
                if confirm "¿Inicializar proyecto Android ahora?"; then
                    cd "$PROJECT_DIR"
                    npm run tauri android init
                    success "Proyecto Android inicializado"
                else
                    press_enter
                    return
                fi
            fi
            info "Lanzando en Android..."
            info "Asegúrate de tener un emulador corriendo o dispositivo conectado"
            echo ""
            cd "$PROJECT_DIR"
            npm run tauri android dev
            ;;
        0|"") return ;;
        *) warn "Opción no válida" ;;
    esac
}

# ══════════════════════════════════════════════════════════════
# 2. BUILD
# ══════════════════════════════════════════════════════════════
cmd_build() {
    echo ""
    echo -e "  ${BOLD}${CYAN}📦 Build de la Aplicación${NC}"
    separator
    echo ""
    echo -e "  ${WHITE}Plataforma:${NC}"
    echo ""
    echo -e "    ${WHITE}1${NC}) ${GREEN}Desktop${NC}        ${DIM}— Linux / Windows / macOS${NC}"
    echo -e "    ${WHITE}2${NC}) ${GREEN}Android${NC}        ${DIM}— APK / AAB${NC}"
    echo -e "    ${WHITE}0${NC}) ${DIM}Volver${NC}"
    echo ""
    echo -ne "  ${YELLOW}▸${NC} Opción: "
    read -r platform_opt

    case $platform_opt in
        1) cmd_build_desktop ;;
        2) cmd_build_android ;;
        0|"") return ;;
        *) warn "Opción no válida" ;;
    esac
}

trigger_github_build() {
    local sel="$1"
    local platform=""
    case $sel in
        6) platform="linux" ;;
        7) platform="windows" ;;
        8) platform="macos" ;;
        9) platform="all" ;;
    esac

    if ! command -v gh &>/dev/null; then
        error "Se necesita ${CYAN}gh${NC} (GitHub CLI) para lanzar builds remotos"
        info "Instalar: ${CYAN}sudo pacman -S github-cli${NC} (Arch)"
        info "Luego: ${CYAN}gh auth login${NC}"
        return 1
    fi

    if ! gh auth status &>/dev/null 2>&1; then
        error "No estás autenticado en GitHub CLI"
        info "Ejecuta: ${CYAN}gh auth login${NC}"
        return 1
    fi

    # Verificar que hay cambios pusheados
    local branch
    branch=$(git branch --show-current 2>/dev/null)
    local local_hash remote_hash
    local_hash=$(git rev-parse HEAD 2>/dev/null)
    remote_hash=$(git rev-parse "origin/$branch" 2>/dev/null || echo "none")

    if [[ "$local_hash" != "$remote_hash" ]]; then
        warn "La rama ${WHITE}${branch}${NC} tiene commits sin pushear"
        if confirm "¿Pushear antes de lanzar el build?"; then
            git push origin "$branch" || { error "No se pudo pushear"; return 1; }
            success "Push completado"
        else
            warn "El build usará el último código pusheado, no tus cambios locales"
        fi
    fi

    echo ""
    info "Plataforma: ${CYAN}${platform}${NC}"
    info "Rama: ${CYAN}${branch}${NC}"
    echo ""

    step "Lanzando workflow en GitHub Actions..."
    if gh workflow run build-release.yml \
        --ref "$branch" \
        -f "platforms=$platform" \
        -f "debug=false" 2>/dev/null; then
        echo ""
        success "Build lanzado en GitHub Actions"
        echo ""
        info "Para ver el progreso:"
        echo -e "    ${CYAN}gh run list --workflow=build-release.yml${NC}"
        echo -e "    ${CYAN}gh run watch${NC}"
        echo ""
        info "Para descargar los artefactos cuando termine:"
        echo -e "    ${CYAN}gh run download${NC}"
        echo ""

        if confirm "¿Abrir GitHub Actions en el navegador?"; then
            gh run list --workflow=build-release.yml --limit 1 --json url --jq '.[0].url' 2>/dev/null | xargs xdg-open 2>/dev/null \
                || gh browse --repo "$(gh repo view --json nameWithOwner -q .nameWithOwner)" /actions 2>/dev/null
        fi
    else
        error "No se pudo lanzar el workflow"
        info "Verifica que el workflow existe en el repo remoto"
        info "Puede que necesites pushear primero: ${CYAN}git push${NC}"
    fi
}

cmd_build_desktop() {
    echo ""
    echo -e "  ${BOLD}${CYAN}🖥️  Build Desktop${NC}"
    separator
    echo ""
    echo -e "  ${WHITE}Selecciona los formatos de salida:${NC}"
    echo ""
    echo -e "  ${BOLD}Linux (local):${NC}"
    echo -e "    ${WHITE}1${NC}) ${GREEN}Binario${NC}        ${DIM}— Solo el ejecutable (sin empaquetar)${NC}"
    echo -e "    ${WHITE}2${NC}) ${GREEN}AppImage${NC}       ${DIM}— Ejecutable universal Linux${NC}"
    echo -e "    ${WHITE}3${NC}) ${GREEN}DEB${NC}            ${DIM}— Paquete Debian/Ubuntu${NC}"
    echo -e "    ${WHITE}4${NC}) ${GREEN}RPM${NC}            ${DIM}— Paquete Fedora/RHEL${NC}"
    echo -e "    ${WHITE}5${NC}) ${MAGENTA}Todo Linux${NC}     ${DIM}— Binario + AppImage + DEB + RPM${NC}"
    echo ""
    echo -e "  ${BOLD}Multiplataforma (GitHub Actions):${NC}"
    echo -e "    ${WHITE}6${NC}) ${CYAN}GitHub: Linux${NC}          ${DIM}— Compilar en la nube${NC}"
    echo -e "    ${WHITE}7${NC}) ${CYAN}GitHub: Windows${NC}        ${DIM}— .exe + .msi${NC}"
    echo -e "    ${WHITE}8${NC}) ${CYAN}GitHub: macOS${NC}           ${DIM}— .dmg (Intel + ARM)${NC}"
    echo -e "    ${WHITE}9${NC}) ${CYAN}GitHub: TODAS${NC}          ${DIM}— Linux + Windows + macOS${NC}"
    echo ""
    echo -e "    ${WHITE}0${NC}) ${DIM}Volver${NC}"
    echo ""
    echo -e "  ${DIM}Puedes elegir varios separados por coma (ej: 1,2,3)${NC}"
    echo -ne "  ${YELLOW}▸${NC} Opción: "
    read -r opt

    [[ "$opt" == "0" || -z "$opt" ]] && return

    local bundles=()

    IFS=',' read -ra selections <<< "$opt"
    for sel in "${selections[@]}"; do
        sel=$(echo "$sel" | tr -d ' ' | tr '[:lower:]' '[:upper:]')
        case $sel in
            1) bundles+=("none") ;;
            2) bundles+=("appimage") ;;
            3) bundles+=("deb") ;;
            4) bundles+=("rpm") ;;
            5) bundles+=("none" "appimage" "deb" "rpm") ;;
            6|7|8|9)
                trigger_github_build "$sel"
                press_enter
                return
                ;;
            *) warn "Opción '$sel' no reconocida, ignorada" ;;
        esac
    done

    # Eliminar duplicados
    local unique_bundles=($(echo "${bundles[@]}" | tr ' ' '\n' | sort -u))

    if [[ ${#unique_bundles[@]} -eq 0 ]]; then
        warn "No se seleccionó ningún formato válido"
        return
    fi

    # Separar: ¿solo binario, solo bundles, o ambos?
    local want_binary=false
    local real_bundles=()
    for b in "${unique_bundles[@]}"; do
        if [[ "$b" == "none" ]]; then
            want_binary=true
        else
            real_bundles+=("$b")
        fi
    done

    echo ""
    if $want_binary && [[ ${#real_bundles[@]} -eq 0 ]]; then
        info "Formato seleccionado: ${CYAN}Binario (solo ejecutable)${NC}"
    elif $want_binary; then
        info "Formatos seleccionados: ${CYAN}Binario + ${real_bundles[*]}${NC}"
    else
        info "Formatos seleccionados: ${CYAN}${real_bundles[*]}${NC}"
    fi
    separator

    # Preguntar modo de compilación
    echo ""
    echo -e "  ${WHITE}Modo de compilación:${NC}"
    echo -e "    ${WHITE}1${NC}) ${GREEN}Release${NC}  ${DIM}— Optimizado para producción (por defecto)${NC}"
    echo -e "    ${WHITE}2${NC}) ${YELLOW}Debug${NC}    ${DIM}— Con símbolos de debug${NC}"
    echo -ne "  ${YELLOW}▸${NC} Modo [1]: "
    read -r build_mode
    [[ -z "$build_mode" ]] && build_mode="1"

    local cargo_profile="release"
    local extra_args=""
    if [[ "$build_mode" == "2" ]]; then
        extra_args="--debug"
        cargo_profile="debug"
        info "Compilando en modo ${YELLOW}debug${NC}"
    else
        info "Compilando en modo ${GREEN}release${NC}"
    fi

    echo ""
    cd "$PROJECT_DIR"
    local start_time=$SECONDS
    local build_ok=true

    if [[ ${#real_bundles[@]} -gt 0 ]]; then
        # Tiene bundles reales → usar tauri build
        local bundle_arg
        bundle_arg=$(IFS=','; echo "${real_bundles[*]}")
        step "Ejecutando: ${DIM}npm run tauri build -- --bundles ${bundle_arg} ${extra_args}${NC}"
        echo ""
        if ! npm run tauri build -- --bundles "$bundle_arg" $extra_args; then
            build_ok=false
        fi
    else
        # Solo binario → tauri build con bundle mínimo (deb), solo nos interesa el binario
        step "Ejecutando: ${DIM}npm run tauri build -- --bundles deb ${extra_args}${NC}"
        info "${DIM}(se genera un .deb como subproducto, solo se recogerá el binario)${NC}"
        echo ""
        if ! npm run tauri build -- --bundles deb $extra_args; then
            build_ok=false
        fi
    fi

    if $build_ok; then
        local elapsed=$(( SECONDS - start_time ))
        echo ""
        success "Build Desktop completado en ${GREEN}${elapsed}s${NC}"

        if $want_binary && [[ ${#real_bundles[@]} -eq 0 ]]; then
            collect_and_clean "desktop" "binary_only"
        else
            collect_and_clean "desktop"
        fi
    else
        echo ""
        error "El build falló. Revisa los errores arriba."
    fi

    press_enter
}

cmd_build_android() {
    echo ""
    echo -e "  ${BOLD}${CYAN}🤖 Build Android${NC}"
    separator
    echo ""

    # Verificar entorno
    if ! check_android_env; then
        press_enter
        return
    fi

    # Verificar si Android está inicializado
    if [[ ! -d "$TAURI_DIR/gen/android" ]]; then
        warn "El proyecto Android no está inicializado"
        echo ""
        if confirm "¿Inicializar proyecto Android ahora? (tauri android init)"; then
            cd "$PROJECT_DIR"
            npm run tauri android init
            success "Proyecto Android inicializado"
            echo ""
        else
            press_enter
            return
        fi
    fi

    echo -e "  ${WHITE}Selecciona el formato de salida:${NC}"
    echo ""
    echo -e "    ${WHITE}1${NC}) ${GREEN}APK${NC}            ${DIM}— Android Package (instalación directa)${NC}"
    echo -e "    ${WHITE}2${NC}) ${GREEN}AAB${NC}            ${DIM}— Android App Bundle (para Google Play)${NC}"
    echo -e "    ${WHITE}3${NC}) ${MAGENTA}APK + AAB${NC}      ${DIM}— Ambos formatos${NC}"
    echo -e "    ${WHITE}0${NC}) ${DIM}Volver${NC}"
    echo ""
    echo -ne "  ${YELLOW}▸${NC} Opción: "
    read -r android_opt

    [[ "$android_opt" == "0" || -z "$android_opt" ]] && return

    # Preguntar modo
    echo ""
    echo -e "  ${WHITE}Modo de compilación:${NC}"
    echo -e "    ${WHITE}1${NC}) ${GREEN}Release${NC}  ${DIM}— Optimizado, listo para firmar (por defecto)${NC}"
    echo -e "    ${WHITE}2${NC}) ${YELLOW}Debug${NC}    ${DIM}— Con símbolos de debug${NC}"
    echo -ne "  ${YELLOW}▸${NC} Modo [1]: "
    read -r build_mode
    [[ -z "$build_mode" ]] && build_mode="1"

    local extra_args=""
    if [[ "$build_mode" == "2" ]]; then
        extra_args="--debug"
        info "Compilando en modo ${YELLOW}debug${NC}"
    else
        info "Compilando en modo ${GREEN}release${NC}"
    fi

    # Info sobre firma
    if [[ "$build_mode" != "2" ]] && [[ -f "$KEYSTORE_FILE" ]]; then
        info "Keystore detectado — el APK se firmará automáticamente"
    fi

    echo ""
    cd "$PROJECT_DIR"
    local start_time=$SECONDS
    local build_ok=true

    case $android_opt in
        1)
            step "Compilando APK..."
            echo ""
            if ! npm run tauri android build -- --apk $extra_args; then
                build_ok=false
            fi
            ;;
        2)
            step "Compilando AAB..."
            echo ""
            if ! npm run tauri android build -- --aab $extra_args; then
                build_ok=false
            fi
            ;;
        3)
            step "Compilando APK..."
            echo ""
            if npm run tauri android build -- --apk $extra_args; then
                echo ""
                step "Compilando AAB..."
                echo ""
                if ! npm run tauri android build -- --aab $extra_args; then
                    build_ok=false
                fi
            else
                build_ok=false
            fi
            ;;
        *)
            warn "Opción no válida"
            press_enter
            return
            ;;
    esac

    local elapsed=$(( SECONDS - start_time ))
    echo ""
    separator

    if $build_ok; then
        success "Build Android completado en ${GREEN}${elapsed}s${NC}"

        collect_and_clean "android"

        # Preguntar si instalar en dispositivo
        if [[ "$android_opt" == "1" || "$android_opt" == "3" ]]; then
            if command -v adb &>/dev/null && adb devices 2>/dev/null | grep -q "device$"; then
                echo ""
                if confirm "¿Instalar APK en el dispositivo conectado?"; then
                    # Buscar el APK firmado primero, si no el unsigned
                    local apk_file
                    apk_file=$(find "$BUILDS_DIR" -name "*-signed.apk" -type f -newer "$TAURI_DIR/tauri.conf.json" 2>/dev/null | sort | tail -1)
                    [[ -z "$apk_file" ]] && apk_file=$(find "$BUILDS_DIR" -name "*.apk" -type f -newer "$TAURI_DIR/tauri.conf.json" 2>/dev/null | sort | tail -1)
                    if [[ -n "$apk_file" ]]; then
                        step "Instalando $(basename "$apk_file")..."
                        if adb install -r "$apk_file" 2>/dev/null; then
                            success "APK instalado en el dispositivo"
                        else
                            warn "No se pudo instalar. ¿Tiene depuración USB activada?"
                        fi
                    else
                        warn "No se encontró el APK generado"
                    fi
                fi
            fi
        fi
    else
        error "El build Android falló. Revisa los errores arriba."
        echo ""
        info "Problemas comunes:"
        echo -e "    ${DIM}• ANDROID_HOME no definido${NC}"
        echo -e "    ${DIM}• SDK o NDK no instalados${NC}"
        echo -e "    ${DIM}• Java/JDK no encontrado${NC}"
        echo -e "    ${DIM}• Ejecuta ${CYAN}./klio.sh doctor${NC}${DIM} para diagnosticar${NC}"
    fi

    press_enter
}

# ══════════════════════════════════════════════════════════════
# 2b. FIRMAR APK
# ══════════════════════════════════════════════════════════════
cmd_sign() {
    echo ""
    echo -e "  ${BOLD}${CYAN}🔏 Firmar APK Android${NC}"
    separator
    echo ""

    # Buscar APKs sin firmar en builds/ y en el build de Android
    local apk_search_dirs=(
        "$TAURI_DIR/gen/android/app/build/outputs/apk"
    )
    # Agregar todas las carpetas de builds/ (más recientes primero)
    if [[ -d "$BUILDS_DIR" ]]; then
        while IFS= read -r d; do
            apk_search_dirs+=("$d")
        done < <(find "$BUILDS_DIR" -maxdepth 1 -mindepth 1 -type d 2>/dev/null | sort -r)
    fi

    local unsigned_apks=()
    for dir in "${apk_search_dirs[@]}"; do
        if [[ -d "$dir" ]]; then
            while IFS= read -r f; do
                [[ -n "$f" ]] && unsigned_apks+=("$f")
            done < <(find "$dir" -type f \( -name "*unsigned*.apk" -o -name "*release*.apk" \) 2>/dev/null | grep -v "\-signed" | grep -v "\-aligned" | sort)
        fi
    done

    if [[ ${#unsigned_apks[@]} -eq 0 ]]; then
        warn "No se encontraron APKs para firmar"
        info "Primero haz un build Android: ${CYAN}./klio.sh android${NC}"
        press_enter
        return
    fi

    # Si hay varios, dejar elegir
    local apk_to_sign=""
    if [[ ${#unsigned_apks[@]} -eq 1 ]]; then
        apk_to_sign="${unsigned_apks[0]}"
        local apk_size
        apk_size=$(du -h "$apk_to_sign" | cut -f1)
        info "APK encontrado: ${WHITE}$(basename "$apk_to_sign")${NC} (${apk_size})"
    else
        info "Se encontraron ${WHITE}${#unsigned_apks[@]}${NC} APKs:"
        echo ""
        local i=1
        for apk in "${unsigned_apks[@]}"; do
            local apk_size
            apk_size=$(du -h "$apk" | cut -f1)
            echo -e "    ${WHITE}${i}${NC}) ${GREEN}$(basename "$apk")${NC} ${DIM}(${apk_size})${NC}"
            ((i++))
        done
        echo ""
        echo -ne "  ${YELLOW}▸${NC} ¿Cuál firmar? [1]: "
        read -r apk_choice
        [[ -z "$apk_choice" ]] && apk_choice=1
        if [[ "$apk_choice" -ge 1 && "$apk_choice" -le ${#unsigned_apks[@]} ]] 2>/dev/null; then
            apk_to_sign="${unsigned_apks[$((apk_choice-1))]}"
        else
            warn "Opción no válida"
            press_enter
            return
        fi
    fi

    echo ""

    # Buscar build-tools
    local bt_dir
    bt_dir=$(find_build_tools)
    if [[ -z "$bt_dir" ]] || [[ ! -x "$bt_dir/zipalign" ]] || [[ ! -x "$bt_dir/apksigner" ]]; then
        error "No se encontraron las build-tools de Android SDK"
        info "Necesitas: ${CYAN}zipalign${NC} y ${CYAN}apksigner${NC}"
        info "Instálalas desde Android Studio → SDK Manager → SDK Tools → Build-Tools"
        press_enter
        return
    fi

    # Asegurar keystore
    if ! ensure_keystore; then
        press_enter
        return
    fi

    # Cargar config
    if ! load_keystore_conf; then
        error "No se pudo leer la configuración del keystore"
        press_enter
        return
    fi

    # Alinear
    local apk_dir
    apk_dir=$(dirname "$apk_to_sign")
    local apk_base
    apk_base=$(basename "$apk_to_sign" .apk)
    # Limpiar nombre: quitar -unsigned si existe para no tener unsigned-signed
    local clean_base="${apk_base/-unsigned/}"
    local aligned_apk="${apk_dir}/${clean_base}-aligned.apk"
    local signed_apk="${apk_dir}/${clean_base}-signed.apk"

    step "Alineando APK..."
    if ! "$bt_dir/zipalign" -f 4 "$apk_to_sign" "$aligned_apk" 2>/dev/null; then
        error "Error al alinear el APK"
        press_enter
        return
    fi
    success "APK alineado"

    # Firmar
    step "Firmando APK..."
    if "$bt_dir/apksigner" sign \
        --ks "$KEYSTORE_FILE" \
        --ks-key-alias "$KEY_ALIAS" \
        --ks-pass "pass:${KEYSTORE_PASSWORD}" \
        --key-pass "pass:${KEYSTORE_PASSWORD}" \
        --out "$signed_apk" \
        "$aligned_apk" 2>/dev/null; then

        # Limpiar el alineado intermedio
        rm -f "$aligned_apk"

        # Verificar firma
        if "$bt_dir/apksigner" verify "$signed_apk" 2>/dev/null; then
            local signed_size
            signed_size=$(du -h "$signed_apk" | cut -f1)
            echo ""
            success "APK firmado y verificado correctamente"
            echo ""
            info "Archivo: ${WHITE}${signed_apk}${NC} (${signed_size})"

            # Ofrecer instalar via ADB
            echo ""
            if command -v adb &>/dev/null; then
                local devices
                devices=$(adb devices 2>/dev/null | grep -c "device$" || echo "0")
                if [[ "$devices" -gt 0 ]]; then
                    if confirm "¿Instalar en el dispositivo conectado via USB?"; then
                        step "Instalando..."
                        if adb install -r "$signed_apk" 2>/dev/null; then
                            success "APK instalado en el dispositivo"
                        else
                            warn "No se pudo instalar. ¿Tiene depuración USB activada?"
                        fi
                    fi
                fi
            fi

            echo ""
            separator
            echo ""
            info "Para instalar manualmente en tu celular:"
            echo -e "    ${DIM}1. Pasa el archivo ${WHITE}${final_name}${DIM} a tu celular${NC}"
            echo -e "    ${DIM}   (por USB, Telegram, Google Drive, email, etc.)${NC}"
            echo -e "    ${DIM}2. Abre el archivo .apk en el celular${NC}"
            echo -e "    ${DIM}3. Acepta 'Instalar de fuentes desconocidas' si lo pide${NC}"
            echo -e "    ${DIM}4. Toca Instalar${NC}"
        else
            error "La verificación de firma falló"
        fi
    else
        rm -f "$aligned_apk"
        error "Error al firmar el APK"
        info "Revisa que el keystore sea válido"
    fi

    press_enter
}

# ══════════════════════════════════════════════════════════════
# 3. LIMPIEZA
# ══════════════════════════════════════════════════════════════
cmd_clean() {
    echo ""
    echo -e "  ${BOLD}${CYAN}🧹 Limpieza del Proyecto${NC}"
    separator
    echo ""

    local total_before
    total_before=$(du -sh "$PROJECT_DIR" 2>/dev/null | cut -f1)
    info "Tamaño actual del proyecto: ${WHITE}${total_before}${NC}"
    echo ""

    echo -e "  ${WHITE}¿Qué quieres limpiar?${NC}"
    echo ""
    echo -e "    ${WHITE}1${NC}) ${YELLOW}node_modules${NC}     ${DIM}— Dependencias Node.js${NC}"
    echo -e "    ${WHITE}2${NC}) ${YELLOW}dist/${NC}            ${DIM}— Build del frontend${NC}"
    echo -e "    ${WHITE}3${NC}) ${YELLOW}target/${NC}          ${DIM}— Build de Rust/Cargo${NC}"
    echo -e "    ${WHITE}4${NC}) ${YELLOW}Cache de Cargo${NC}   ${DIM}— ~/.cargo/registry cache${NC}"
    echo -e "    ${WHITE}5${NC}) ${YELLOW}Android build${NC}    ${DIM}— Build de Gradle/Android (conserva APKs)${NC}"
    echo -e "    ${WHITE}6${NC}) ${RED}TODO${NC}             ${DIM}— node_modules + dist + target + android${NC}"
    echo -e "    ${WHITE}7${NC}) ${RED}NUCLEAR${NC}          ${DIM}— Todo + lock files (reinstalar desde cero)${NC}"
    echo -e "    ${WHITE}0${NC}) ${DIM}Volver${NC}"
    echo ""
    echo -ne "  ${YELLOW}▸${NC} Opción: "
    read -r opt

    case $opt in
        1)
            if [[ -d "$PROJECT_DIR/node_modules" ]]; then
                local size
                size=$(du -sh "$PROJECT_DIR/node_modules" 2>/dev/null | cut -f1)
                if confirm "¿Eliminar node_modules/ (${size})?"; then
                    rm -rf "$PROJECT_DIR/node_modules"
                    success "node_modules eliminado"
                fi
            else
                info "node_modules/ no existe"
            fi
            ;;
        2)
            if [[ -d "$PROJECT_DIR/dist" ]]; then
                rm -rf "$PROJECT_DIR/dist"
                success "dist/ eliminado"
            else
                info "dist/ no existe"
            fi
            ;;
        3)
            if [[ -d "$TAURI_DIR/target" ]]; then
                local size
                size=$(du -sh "$TAURI_DIR/target" 2>/dev/null | cut -f1)
                if confirm "¿Eliminar target/ de Rust (${size})? Esto hará que el próximo build sea más lento"; then
                    rm -rf "$TAURI_DIR/target"
                    success "target/ eliminado"
                fi
            else
                info "target/ no existe"
            fi
            ;;
        4)
            if confirm "¿Limpiar cache de Cargo?"; then
                cd "$TAURI_DIR"
                cargo clean 2>/dev/null || true
                success "Cache de Cargo limpiado"
            fi
            ;;
        5)
            local android_build="$TAURI_DIR/gen/android/app/build"
            if [[ -d "$android_build" ]]; then
                local size
                size=$(du -sh "$android_build" 2>/dev/null | cut -f1)

                # Contar APKs/AABs existentes
                local apk_count=0
                apk_count=$(find "$android_build/outputs" -type f \( -name "*.apk" -o -name "*.aab" \) 2>/dev/null | wc -l)

                if [[ "$apk_count" -gt 0 ]]; then
                    info "Se encontraron ${WHITE}${apk_count}${NC} archivo(s) APK/AAB"
                    info "Se copiarán a ${CYAN}builds/android/${NC} antes de limpiar"
                fi

                if confirm "¿Limpiar build Android (${size})? Los APKs se conservan"; then
                    # Salvar APKs/AABs
                    if [[ "$apk_count" -gt 0 ]]; then
                        mkdir -p "$BUILDS_DIR/android"
                        find "$android_build/outputs" -type f \( -name "*.apk" -o -name "*.aab" \) 2>/dev/null | while read -r f; do
                            local fname
                            fname=$(basename "$f")
                            cp "$f" "$BUILDS_DIR/android/$fname"
                            success "Guardado: ${CYAN}builds/android/${fname}${NC}"
                        done
                    fi
                    rm -rf "$android_build"
                    [[ -d "$TAURI_DIR/gen/android/.gradle" ]] && rm -rf "$TAURI_DIR/gen/android/.gradle"
                    success "Build Android eliminado (APKs conservados en builds/android/)"
                fi
            else
                info "No hay build Android para limpiar"
            fi
            ;;
        6)
            if confirm "¿Eliminar node_modules + dist + target + android build?"; then
                [[ -d "$PROJECT_DIR/node_modules" ]] && rm -rf "$PROJECT_DIR/node_modules" && success "node_modules eliminado"
                [[ -d "$PROJECT_DIR/dist" ]] && rm -rf "$PROJECT_DIR/dist" && success "dist/ eliminado"
                [[ -d "$TAURI_DIR/target" ]] && rm -rf "$TAURI_DIR/target" && success "target/ eliminado"
                [[ -d "$TAURI_DIR/gen/android/app/build" ]] && rm -rf "$TAURI_DIR/gen/android/app/build" && success "Android build eliminado"
                [[ -d "$TAURI_DIR/gen/android/.gradle" ]] && rm -rf "$TAURI_DIR/gen/android/.gradle" && success "Gradle cache eliminado"
            fi
            ;;
        7)
            warn "Esto eliminará TODO y necesitarás reinstalar desde cero"
            if confirm "¿Estás seguro? Se borrarán node_modules, dist, target, android y lock files"; then
                [[ -d "$PROJECT_DIR/node_modules" ]] && rm -rf "$PROJECT_DIR/node_modules" && success "node_modules eliminado"
                [[ -d "$PROJECT_DIR/dist" ]] && rm -rf "$PROJECT_DIR/dist" && success "dist/ eliminado"
                [[ -d "$TAURI_DIR/target" ]] && rm -rf "$TAURI_DIR/target" && success "target/ eliminado"
                [[ -d "$TAURI_DIR/gen/android/app/build" ]] && rm -rf "$TAURI_DIR/gen/android/app/build" && success "Android build eliminado"
                [[ -d "$TAURI_DIR/gen/android/.gradle" ]] && rm -rf "$TAURI_DIR/gen/android/.gradle" && success "Gradle cache eliminado"
                [[ -f "$PROJECT_DIR/package-lock.json" ]] && rm -f "$PROJECT_DIR/package-lock.json" && success "package-lock.json eliminado"
                [[ -f "$TAURI_DIR/Cargo.lock" ]] && rm -f "$TAURI_DIR/Cargo.lock" && success "Cargo.lock eliminado"
                echo ""
                warn "Ejecuta '${WHITE}./klio.sh${NC}' → Instalar dependencias para reconstruir"
            fi
            ;;
        0|"") return ;;
    esac

    echo ""
    local total_after
    total_after=$(du -sh "$PROJECT_DIR" 2>/dev/null | cut -f1)
    info "Tamaño después: ${WHITE}${total_after}${NC} (antes: ${total_before})"

    press_enter
}

# ══════════════════════════════════════════════════════════════
# 4. DEPENDENCIAS
# ══════════════════════════════════════════════════════════════
cmd_deps() {
    echo ""
    echo -e "  ${BOLD}${CYAN}📋 Gestión de Dependencias${NC}"
    separator
    echo ""
    echo -e "    ${WHITE}1${NC}) ${GREEN}Instalar todo${NC}          ${DIM}— npm install + cargo check${NC}"
    echo -e "    ${WHITE}2${NC}) ${GREEN}npm install${NC}            ${DIM}— Solo Node.js${NC}"
    echo -e "    ${WHITE}3${NC}) ${GREEN}cargo check${NC}            ${DIM}— Solo Rust (verificar)${NC}"
    echo -e "    ${WHITE}4${NC}) ${YELLOW}Actualizar Node${NC}       ${DIM}— npm update${NC}"
    echo -e "    ${WHITE}5${NC}) ${YELLOW}Actualizar Rust${NC}       ${DIM}— cargo update${NC}"
    echo -e "    ${WHITE}6${NC}) ${CYAN}Auditar Node${NC}           ${DIM}— npm audit${NC}"
    echo -e "    ${WHITE}7${NC}) ${CYAN}Outdated Node${NC}          ${DIM}— Paquetes desactualizados${NC}"
    echo -e "    ${WHITE}8${NC}) ${CYAN}Outdated Rust${NC}          ${DIM}— Crates desactualizados${NC}"
    echo -e "    ${WHITE}9${NC}) ${MAGENTA}Android init${NC}          ${DIM}— Inicializar proyecto Android${NC}"
    echo -e "    ${WHITE}0${NC}) ${DIM}Volver${NC}"
    echo ""
    echo -ne "  ${YELLOW}▸${NC} Opción: "
    read -r opt

    case $opt in
        1)
            step "Instalando dependencias Node.js..."
            cd "$PROJECT_DIR" && npm install
            echo ""
            step "Verificando dependencias Rust..."
            cd "$TAURI_DIR" && cargo check
            success "Todas las dependencias instaladas"
            ;;
        2)
            cd "$PROJECT_DIR" && npm install
            ;;
        3)
            cd "$TAURI_DIR" && cargo check
            ;;
        4)
            cd "$PROJECT_DIR" && npm update
            success "Dependencias Node actualizadas"
            ;;
        5)
            cd "$TAURI_DIR" && cargo update
            success "Dependencias Rust actualizadas"
            ;;
        6)
            cd "$PROJECT_DIR" && npm audit 2>/dev/null || true
            ;;
        7)
            cd "$PROJECT_DIR" && npm outdated 2>/dev/null || true
            ;;
        8)
            if command -v cargo-outdated &>/dev/null; then
                cd "$TAURI_DIR" && cargo outdated
            else
                warn "cargo-outdated no está instalado"
                info "Instalar con: ${CYAN}cargo install cargo-outdated${NC}"
            fi
            ;;
        9)
            if [[ -d "$TAURI_DIR/gen/android" ]]; then
                info "El proyecto Android ya está inicializado"
                if confirm "¿Re-inicializar? (se sobreescribirá la configuración)"; then
                    cd "$PROJECT_DIR"
                    npm run tauri android init
                    success "Proyecto Android re-inicializado"
                fi
            else
                check_android_env
                step "Inicializando proyecto Android..."
                cd "$PROJECT_DIR"
                npm run tauri android init
                success "Proyecto Android inicializado en ${CYAN}src-tauri/gen/android/${NC}"
            fi
            ;;
        0|"") return ;;
    esac

    press_enter
}

# ══════════════════════════════════════════════════════════════
# 5. ICONOS
# ══════════════════════════════════════════════════════════════
cmd_icons() {
    echo ""
    echo -e "  ${BOLD}${CYAN}🎨 Generar Iconos${NC}"
    separator
    echo ""
    info "Tauri puede generar todos los iconos desde una imagen PNG de 1024x1024 o SVG"
    echo ""

    echo -ne "  ${YELLOW}?${NC}  Ruta a la imagen fuente (PNG 1024x1024 o SVG): "
    read -r icon_source

    if [[ -z "$icon_source" ]]; then
        warn "No se proporcionó ruta"
        press_enter
        return
    fi

    if [[ ! -f "$icon_source" ]]; then
        error "El archivo '$icon_source' no existe"
        press_enter
        return
    fi

    step "Generando iconos con Tauri..."
    cd "$PROJECT_DIR"
    npm run tauri icon -- "$icon_source"
    success "Iconos generados en ${CYAN}src-tauri/icons/${NC}"

    press_enter
}

# ══════════════════════════════════════════════════════════════
# 6. INFO DEL PROYECTO
# ══════════════════════════════════════════════════════════════
cmd_info() {
    echo ""
    echo -e "  ${BOLD}${CYAN}📊 Información del Proyecto${NC}"
    separator
    echo ""

    # Versiones del proyecto
    echo -e "  ${BOLD}Proyecto:${NC}"
    echo -e "    Nombre:     ${WHITE}${APP_NAME}${NC}"
    echo -e "    Versión:    ${WHITE}${APP_VERSION}${NC}"
    echo -e "    Directorio: ${DIM}${PROJECT_DIR}${NC}"
    echo ""

    # Tamaños
    echo -e "  ${BOLD}Tamaños:${NC}"
    local total_size
    total_size=$(du -sh "$PROJECT_DIR" 2>/dev/null | cut -f1)
    echo -e "    Proyecto total:  ${WHITE}${total_size}${NC}"
    if [[ -d "$PROJECT_DIR/node_modules" ]]; then
        local nm_size
        nm_size=$(du -sh "$PROJECT_DIR/node_modules" 2>/dev/null | cut -f1)
        echo -e "    node_modules:    ${YELLOW}${nm_size}${NC}"
    fi
    if [[ -d "$TAURI_DIR/target" ]]; then
        local target_size
        target_size=$(du -sh "$TAURI_DIR/target" 2>/dev/null | cut -f1)
        echo -e "    target/ (Rust):  ${YELLOW}${target_size}${NC}"
    fi
    echo ""

    # Herramientas
    echo -e "  ${BOLD}Herramientas:${NC}"
    local node_ver rust_ver cargo_ver npm_ver php_ver
    node_ver=$(node --version 2>/dev/null || echo "${RED}no instalado${NC}")
    npm_ver=$(npm --version 2>/dev/null || echo "${RED}no instalado${NC}")
    rust_ver=$(rustc --version 2>/dev/null | awk '{print $2}' || echo "${RED}no instalado${NC}")
    cargo_ver=$(cargo --version 2>/dev/null | awk '{print $2}' || echo "${RED}no instalado${NC}")
    php_ver=$(php --version 2>/dev/null | head -1 | awk '{print $2}' || echo "${RED}no instalado${NC}")

    local java_ver adb_ver
    java_ver=$(java --version 2>&1 | head -1 | awk '{print $2}' 2>/dev/null || echo "no instalado")
    adb_ver=$(adb --version 2>/dev/null | head -1 | awk '{print $NF}' || echo "no instalado")

    echo -e "    Node.js:   ${GREEN}${node_ver}${NC}"
    echo -e "    npm:       ${GREEN}${npm_ver}${NC}"
    echo -e "    Rust:      ${GREEN}${rust_ver}${NC}"
    echo -e "    Cargo:     ${GREEN}${cargo_ver}${NC}"
    echo -e "    PHP:       ${GREEN}${php_ver}${NC}"
    echo -e "    Java/JDK:  ${GREEN}${java_ver}${NC}"
    echo -e "    ADB:       ${GREEN}${adb_ver}${NC}"
    echo ""

    # Android
    echo -e "  ${BOLD}Android:${NC}"
    if [[ -n "${ANDROID_HOME:-}" ]]; then
        echo -e "    ANDROID_HOME:  ${GREEN}${ANDROID_HOME}${NC}"
    elif [[ -n "${ANDROID_SDK_ROOT:-}" ]]; then
        echo -e "    ANDROID_SDK:   ${GREEN}${ANDROID_SDK_ROOT}${NC}"
    else
        echo -e "    SDK:           ${YELLOW}no configurado${NC}"
    fi
    if [[ -d "$TAURI_DIR/gen/android" ]]; then
        echo -e "    Proyecto:      ${GREEN}inicializado${NC}"
    else
        echo -e "    Proyecto:      ${DIM}no inicializado${NC}"
    fi
    echo ""

    # Git
    echo -e "  ${BOLD}Git:${NC}"
    local branch
    branch=$(git -C "$PROJECT_DIR" branch --show-current 2>/dev/null || echo "N/A")
    local commits
    commits=$(git -C "$PROJECT_DIR" rev-list --count HEAD 2>/dev/null || echo "N/A")
    local last_commit
    last_commit=$(git -C "$PROJECT_DIR" log -1 --format="%h %s" 2>/dev/null || echo "N/A")
    echo -e "    Rama:          ${CYAN}${branch}${NC}"
    echo -e "    Total commits: ${WHITE}${commits}${NC}"
    echo -e "    Último commit: ${DIM}${last_commit}${NC}"
    echo ""

    # Contar archivos de código
    echo -e "  ${BOLD}Código fuente:${NC}"
    local ts_files tsx_files rs_files php_files css_files
    ts_files=$(find "$PROJECT_DIR/src" -name "*.ts" -not -path "*/node_modules/*" 2>/dev/null | wc -l)
    tsx_files=$(find "$PROJECT_DIR/src" -name "*.tsx" -not -path "*/node_modules/*" 2>/dev/null | wc -l)
    rs_files=$(find "$TAURI_DIR/src" -name "*.rs" 2>/dev/null | wc -l)
    php_files=$(find "$BACKEND_DIR" -name "*.php" -not -path "*/vendor/*" 2>/dev/null | wc -l)
    css_files=$(find "$PROJECT_DIR/src" -name "*.css" -not -path "*/node_modules/*" 2>/dev/null | wc -l)

    echo -e "    TypeScript:  ${WHITE}${ts_files}${NC} archivos .ts"
    echo -e "    React TSX:   ${WHITE}${tsx_files}${NC} archivos .tsx"
    echo -e "    Rust:        ${WHITE}${rs_files}${NC} archivos .rs"
    echo -e "    PHP:         ${WHITE}${php_files}${NC} archivos .php"
    echo -e "    CSS:         ${WHITE}${css_files}${NC} archivos .css"

    press_enter
}

# ══════════════════════════════════════════════════════════════
# 7. GIT RÁPIDO
# ══════════════════════════════════════════════════════════════
cmd_git() {
    echo ""
    echo -e "  ${BOLD}${CYAN}🔀 Git Rápido${NC}"
    separator
    echo ""
    echo -e "    ${WHITE}1${NC}) ${GREEN}Status${NC}              ${DIM}— Ver estado actual${NC}"
    echo -e "    ${WHITE}2${NC}) ${GREEN}Log bonito${NC}          ${DIM}— Historial con grafo${NC}"
    echo -e "    ${WHITE}3${NC}) ${YELLOW}Commit rápido${NC}      ${DIM}— Add + commit interactivo${NC}"
    echo -e "    ${WHITE}4${NC}) ${CYAN}Diff${NC}                ${DIM}— Ver cambios actuales${NC}"
    echo -e "    ${WHITE}5${NC}) ${CYAN}Branches${NC}            ${DIM}— Listar ramas${NC}"
    echo -e "    ${WHITE}6${NC}) ${MAGENTA}Stash${NC}              ${DIM}— Guardar cambios temporalmente${NC}"
    echo -e "    ${WHITE}7${NC}) ${MAGENTA}Stash pop${NC}          ${DIM}— Recuperar cambios guardados${NC}"
    echo -e "    ${WHITE}0${NC}) ${DIM}Volver${NC}"
    echo ""
    echo -ne "  ${YELLOW}▸${NC} Opción: "
    read -r opt

    cd "$PROJECT_DIR"

    case $opt in
        1) git status ;;
        2) git log --oneline --graph --decorate --all -20 ;;
        3)
            git status --short
            echo ""
            echo -ne "  ${YELLOW}?${NC}  Mensaje del commit: "
            read -r msg
            if [[ -n "$msg" ]]; then
                git add -A
                git commit -m "$msg"
                success "Commit creado"
            else
                warn "Commit cancelado (mensaje vacío)"
            fi
            ;;
        4) git diff ;;
        5) git branch -a ;;
        6)
            git stash push -m "klio-stash-$(date +%Y%m%d-%H%M%S)"
            success "Cambios guardados en stash"
            ;;
        7)
            git stash pop
            success "Cambios recuperados del stash"
            ;;
        0|"") return ;;
    esac

    press_enter
}

# ══════════════════════════════════════════════════════════════
# 8. DIAGNÓSTICO
# ══════════════════════════════════════════════════════════════
cmd_doctor() {
    echo ""
    echo -e "  ${BOLD}${CYAN}🩺 Diagnóstico del Proyecto${NC}"
    separator
    echo ""

    local all_ok=true

    # Node.js
    if command -v node &>/dev/null; then
        success "Node.js $(node --version)"
    else
        error "Node.js no encontrado"
        all_ok=false
    fi

    # npm
    if command -v npm &>/dev/null; then
        success "npm $(npm --version)"
    else
        error "npm no encontrado"
        all_ok=false
    fi

    # Rust
    if command -v rustc &>/dev/null; then
        success "Rust $(rustc --version | awk '{print $2}')"
    else
        error "Rust no encontrado — instalar desde https://rustup.rs"
        all_ok=false
    fi

    # Cargo
    if command -v cargo &>/dev/null; then
        success "Cargo $(cargo --version | awk '{print $2}')"
    else
        error "Cargo no encontrado"
        all_ok=false
    fi

    # PHP
    if command -v php &>/dev/null; then
        success "PHP $(php -r 'echo PHP_VERSION;')"
    else
        warn "PHP no encontrado (solo necesario para el backend)"
    fi

    # Tauri CLI
    if npx tauri --version &>/dev/null 2>&1; then
        success "Tauri CLI $(npx tauri --version 2>/dev/null)"
    else
        error "Tauri CLI no encontrado en devDependencies"
        all_ok=false
    fi

    echo ""

    # Dependencias del sistema para Tauri en Linux
    separator
    echo -e "  ${BOLD}Dependencias del sistema (Linux):${NC}"
    echo ""

    local sys_deps=("webkit2gtk-4.1" "libayatana-appindicator3-1" "librsvg2-dev" "libssl-dev" "libgtk-3-dev" "patchelf")
    for dep in "${sys_deps[@]}"; do
        if dpkg -s "$dep" &>/dev/null 2>&1 || pacman -Qi "${dep}" &>/dev/null 2>&1; then
            success "$dep"
        elif pkg-config --exists "${dep}" &>/dev/null 2>&1; then
            success "$dep (pkg-config)"
        else
            # En Arch los paquetes tienen nombres diferentes
            warn "$dep — verificar manualmente si tu distro usa otro nombre"
        fi
    done

    echo ""

    # Android
    separator
    echo -e "  ${BOLD}Entorno Android:${NC}"
    echo ""

    if [[ -n "${ANDROID_HOME:-}" ]]; then
        success "ANDROID_HOME: $ANDROID_HOME"
    elif [[ -n "${ANDROID_SDK_ROOT:-}" ]]; then
        success "ANDROID_SDK_ROOT: $ANDROID_SDK_ROOT"
    else
        warn "ANDROID_HOME / ANDROID_SDK_ROOT no definido"
    fi

    if [[ -n "${JAVA_HOME:-}" ]]; then
        success "JAVA_HOME: $JAVA_HOME"
    elif command -v java &>/dev/null; then
        success "Java: $(java --version 2>&1 | head -1)"
    else
        warn "Java/JDK no encontrado"
    fi

    if command -v adb &>/dev/null; then
        success "ADB: $(adb --version 2>/dev/null | head -1)"
        local devices
        devices=$(adb devices 2>/dev/null | grep -c "device$" || echo "0")
        if [[ "$devices" -gt 0 ]]; then
            success "Dispositivos conectados: $devices"
        else
            info "No hay dispositivos/emuladores conectados"
        fi
    else
        warn "ADB no encontrado (necesario para instalar APKs)"
    fi

    local ndk_home="${ANDROID_NDK_HOME:-${ANDROID_HOME:-}/ndk}"
    if [[ -d "$ndk_home" ]] && [[ -n "$(ls -A "$ndk_home" 2>/dev/null)" ]]; then
        success "NDK encontrado en: $ndk_home"
    else
        warn "Android NDK no encontrado (necesario para compilar Rust → Android)"
    fi

    if [[ -d "$TAURI_DIR/gen/android" ]]; then
        success "Proyecto Android inicializado"
    else
        info "Proyecto Android no inicializado (ejecuta: Dependencias → Android init)"
    fi

    echo ""

    # Archivos del proyecto
    separator
    echo -e "  ${BOLD}Archivos del proyecto:${NC}"
    echo ""

    [[ -f "$PROJECT_DIR/package.json" ]]       && success "package.json"       || error "package.json no encontrado"
    [[ -f "$PROJECT_DIR/package-lock.json" ]]   && success "package-lock.json"  || warn  "package-lock.json no encontrado"
    [[ -d "$PROJECT_DIR/node_modules" ]]        && success "node_modules/"      || warn  "node_modules/ — ejecuta npm install"
    [[ -f "$TAURI_DIR/Cargo.toml" ]]            && success "Cargo.toml"         || error "Cargo.toml no encontrado"
    [[ -f "$TAURI_DIR/tauri.conf.json" ]]       && success "tauri.conf.json"    || error "tauri.conf.json no encontrado"
    [[ -d "$TAURI_DIR/icons" ]]                 && success "icons/"             || warn  "icons/ — ejecuta generar iconos"
    [[ -f "$PROJECT_DIR/vite.config.ts" ]]      && success "vite.config.ts"     || error "vite.config.ts no encontrado"
    [[ -f "$PROJECT_DIR/index.html" ]]          && success "index.html"         || error "index.html no encontrado"

    echo ""

    if $all_ok; then
        success "${GREEN}${BOLD}Todo parece estar en orden ✨${NC}"
    else
        warn "Hay problemas que deben resolverse"
    fi

    press_enter
}

# ══════════════════════════════════════════════════════════════
# 9. LÍNEAS DE CÓDIGO (LOC)
# ══════════════════════════════════════════════════════════════
cmd_loc() {
    echo ""
    echo -e "  ${BOLD}${CYAN}📏 Líneas de Código${NC}"
    separator
    echo ""

    if command -v tokei &>/dev/null; then
        cd "$PROJECT_DIR"
        tokei --exclude node_modules --exclude target --exclude dist --exclude "*.lock"
    elif command -v cloc &>/dev/null; then
        cd "$PROJECT_DIR"
        cloc --exclude-dir=node_modules,target,dist,.git .
    else
        # Fallback manual
        info "Para un conteo más preciso instala ${CYAN}tokei${NC} o ${CYAN}cloc${NC}"
        echo ""

        count_lines() {
            local ext="$1"
            local label="$2"
            local count
            count=$(find "$PROJECT_DIR" -name "*.$ext" \
                -not -path "*/node_modules/*" \
                -not -path "*/target/*" \
                -not -path "*/dist/*" \
                -not -path "*/.git/*" \
                -exec cat {} + 2>/dev/null | wc -l)
            printf "    %-15s %s líneas\n" "$label" "$count"
        }

        count_lines "tsx" "React TSX"
        count_lines "ts"  "TypeScript"
        count_lines "rs"  "Rust"
        count_lines "php" "PHP"
        count_lines "css" "CSS"
        count_lines "sql" "SQL"
        count_lines "json" "JSON"
    fi

    press_enter
}

# ══════════════════════════════════════════════════════════════
# 10. VERSIÓN
# ══════════════════════════════════════════════════════════════
cmd_version() {
    echo ""
    echo -e "  ${BOLD}${CYAN}🏷️  Gestión de Versión${NC}"
    separator
    echo ""
    info "Versión actual: ${WHITE}${APP_VERSION}${NC}"
    echo ""
    echo -e "    ${WHITE}1${NC}) ${GREEN}Patch${NC}   ${DIM}— Bug fix (0.1.0 → 0.1.1)${NC}"
    echo -e "    ${WHITE}2${NC}) ${YELLOW}Minor${NC}   ${DIM}— Nueva función (0.1.0 → 0.2.0)${NC}"
    echo -e "    ${WHITE}3${NC}) ${RED}Major${NC}   ${DIM}— Breaking change (0.1.0 → 1.0.0)${NC}"
    echo -e "    ${WHITE}4${NC}) ${CYAN}Custom${NC}  ${DIM}— Versión personalizada${NC}"
    echo -e "    ${WHITE}0${NC}) ${DIM}Volver${NC}"
    echo ""
    echo -ne "  ${YELLOW}▸${NC} Opción: "
    read -r opt

    local new_version=""
    IFS='.' read -ra parts <<< "$APP_VERSION"
    local major="${parts[0]}"
    local minor="${parts[1]}"
    local patch="${parts[2]}"

    case $opt in
        1) new_version="${major}.${minor}.$((patch + 1))" ;;
        2) new_version="${major}.$((minor + 1)).0" ;;
        3) new_version="$((major + 1)).0.0" ;;
        4)
            echo -ne "  ${YELLOW}?${NC}  Nueva versión (x.y.z): "
            read -r new_version
            if [[ ! "$new_version" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
                error "Formato de versión inválido"
                press_enter
                return
            fi
            ;;
        0|"") return ;;
    esac

    if [[ -z "$new_version" ]]; then
        return
    fi

    info "Actualizar versión: ${WHITE}${APP_VERSION}${NC} → ${GREEN}${new_version}${NC}"
    if confirm "¿Aplicar cambio?"; then
        # Actualizar package.json
        sed -i "s/\"version\": \"$APP_VERSION\"/\"version\": \"$new_version\"/" "$PROJECT_DIR/package.json"
        success "package.json actualizado"

        # Actualizar tauri.conf.json
        sed -i "s/\"version\": \"$APP_VERSION\"/\"version\": \"$new_version\"/" "$TAURI_DIR/tauri.conf.json"
        success "tauri.conf.json actualizado"

        # Actualizar Cargo.toml
        sed -i "s/^version = \"$APP_VERSION\"/version = \"$new_version\"/" "$TAURI_DIR/Cargo.toml"
        success "Cargo.toml actualizado"

        APP_VERSION="$new_version"
        echo ""
        success "Versión actualizada a ${GREEN}${new_version}${NC}"
    fi

    press_enter
}

# ══════════════════════════════════════════════════════════════
# 11. LINT Y FORMATO
# ══════════════════════════════════════════════════════════════
cmd_lint() {
    echo ""
    echo -e "  ${BOLD}${CYAN}✨ Lint y Formato${NC}"
    separator
    echo ""
    echo -e "    ${WHITE}1${NC}) ${GREEN}TypeScript check${NC}     ${DIM}— tsc --noEmit${NC}"
    echo -e "    ${WHITE}2${NC}) ${GREEN}Cargo check${NC}          ${DIM}— Verificar Rust${NC}"
    echo -e "    ${WHITE}3${NC}) ${GREEN}Cargo clippy${NC}         ${DIM}— Linter de Rust${NC}"
    echo -e "    ${WHITE}4${NC}) ${YELLOW}Cargo fmt${NC}            ${DIM}— Formatear código Rust${NC}"
    echo -e "    ${WHITE}5${NC}) ${CYAN}Todo${NC}                 ${DIM}— Ejecutar todas las verificaciones${NC}"
    echo -e "    ${WHITE}0${NC}) ${DIM}Volver${NC}"
    echo ""
    echo -ne "  ${YELLOW}▸${NC} Opción: "
    read -r opt

    case $opt in
        1)
            step "TypeScript type-check..."
            cd "$PROJECT_DIR" && npx tsc --noEmit
            success "TypeScript OK"
            ;;
        2)
            step "Cargo check..."
            cd "$TAURI_DIR" && cargo check
            success "Rust OK"
            ;;
        3)
            step "Cargo clippy..."
            cd "$TAURI_DIR" && cargo clippy -- -W clippy::all
            success "Clippy OK"
            ;;
        4)
            step "Cargo fmt..."
            cd "$TAURI_DIR" && cargo fmt
            success "Rust formateado"
            ;;
        5)
            echo ""
            step "TypeScript type-check..."
            cd "$PROJECT_DIR" && npx tsc --noEmit && success "TypeScript OK" || warn "TypeScript tiene errores"
            echo ""
            step "Cargo check..."
            cd "$TAURI_DIR" && cargo check && success "Cargo check OK" || warn "Cargo check tiene errores"
            echo ""
            step "Cargo clippy..."
            cd "$TAURI_DIR" && cargo clippy -- -W clippy::all && success "Clippy OK" || warn "Clippy tiene advertencias"
            echo ""
            step "Cargo fmt check..."
            cd "$TAURI_DIR" && cargo fmt --check && success "Formato Rust OK" || warn "Rust necesita formato (cargo fmt)"
            ;;
        0|"") return ;;
    esac

    press_enter
}

# ══════════════════════════════════════════════════════════════
# 12. LOGS Y DEBUG
# ══════════════════════════════════════════════════════════════
cmd_logs() {
    echo ""
    echo -e "  ${BOLD}${CYAN}🔍 Logs y Debug${NC}"
    separator
    echo ""
    echo -e "    ${WHITE}1${NC}) ${GREEN}Tauri dev verbose${NC}   ${DIM}— Dev con logs detallados${NC}"
    echo -e "    ${WHITE}2${NC}) ${CYAN}Tauri info${NC}          ${DIM}— Info del entorno Tauri${NC}"
    echo -e "    ${WHITE}3${NC}) ${YELLOW}Abrir DevTools${NC}     ${DIM}— Dev con herramientas de debug${NC}"
    echo -e "    ${WHITE}0${NC}) ${DIM}Volver${NC}"
    echo ""
    echo -ne "  ${YELLOW}▸${NC} Opción: "
    read -r opt

    case $opt in
        1)
            info "Lanzando Tauri dev con RUST_LOG=debug..."
            cd "$PROJECT_DIR"
            RUST_LOG=debug npm run tauri dev
            ;;
        2)
            cd "$PROJECT_DIR"
            npm run tauri info
            ;;
        3)
            info "Lanzando con DevTools activado..."
            cd "$PROJECT_DIR"
            WEBKIT_DISABLE_DMABUF_RENDERER=1 npm run tauri dev -- --features devtools 2>/dev/null || npm run tauri dev
            ;;
        0|"") return ;;
    esac

    press_enter
}

# ══════════════════════════════════════════════════════════════
# 13. BACKUP
# ══════════════════════════════════════════════════════════════
cmd_backup() {
    echo ""
    echo -e "  ${BOLD}${CYAN}💾 Backup del Proyecto${NC}"
    separator
    echo ""

    local backup_name="${APP_NAME}_${APP_VERSION}_$(date +%Y%m%d_%H%M%S).tar.gz"
    local backup_dir="${PROJECT_DIR}/.."
    local backup_path="${backup_dir}/${backup_name}"

    info "Se creará: ${WHITE}${backup_name}${NC}"
    info "Excluye: node_modules, target, dist, .git"
    echo ""

    if confirm "¿Crear backup?"; then
        step "Creando backup..."
        tar -czf "$backup_path" \
            --exclude='node_modules' \
            --exclude='target' \
            --exclude='dist' \
            --exclude='.git' \
            -C "$backup_dir" \
            "$(basename "$PROJECT_DIR")"

        local size
        size=$(du -h "$backup_path" | cut -f1)
        success "Backup creado: ${WHITE}${backup_path}${NC} (${size})"
    fi

    press_enter
}

# ══════════════════════════════════════════════════════════════
# MENÚ PRINCIPAL
# ══════════════════════════════════════════════════════════════
main_menu() {
    while true; do
        clear
        print_banner

        echo -e "  ${BOLD}${WHITE}Menú Principal${NC}"
        separator
        echo ""
        echo -e "    ${WHITE} 1${NC}) ${GREEN}🚀 Desarrollo${NC}        ${DIM}— Tauri dev, Vite, PHP server${NC}"
        echo -e "    ${WHITE} 2${NC}) ${GREEN}📦 Build${NC}             ${DIM}— Compilar app (Desktop + Android)${NC}"
        echo -e "    ${WHITE} 3${NC}) ${GREEN}🔏 Firmar APK${NC}        ${DIM}— Firmar APK para instalar en celular${NC}"
        echo -e "    ${WHITE} 4${NC}) ${YELLOW}🧹 Limpiar${NC}           ${DIM}— Eliminar paquetes y caches${NC}"
        echo -e "    ${WHITE} 5${NC}) ${CYAN}📋 Dependencias${NC}      ${DIM}— Instalar, actualizar, auditar${NC}"
        echo -e "    ${WHITE} 6${NC}) ${MAGENTA}🎨 Iconos${NC}            ${DIM}— Generar iconos de la app${NC}"
        echo -e "    ${WHITE} 7${NC}) ${CYAN}📊 Info${NC}              ${DIM}— Información del proyecto${NC}"
        echo -e "    ${WHITE} 8${NC}) ${BLUE}🔀 Git${NC}               ${DIM}— Atajos de Git${NC}"
        echo -e "    ${WHITE} 9${NC}) ${GREEN}🩺 Doctor${NC}            ${DIM}— Diagnosticar el entorno${NC}"
        echo -e "    ${WHITE}10${NC}) ${CYAN}📏 LOC${NC}               ${DIM}— Contar líneas de código${NC}"
        echo -e "    ${WHITE}11${NC}) ${YELLOW}🏷️  Versión${NC}           ${DIM}— Bump de versión${NC}"
        echo -e "    ${WHITE}12${NC}) ${MAGENTA}✨ Lint${NC}              ${DIM}— Verificar y formatear código${NC}"
        echo -e "    ${WHITE}13${NC}) ${BLUE}🔍 Logs${NC}              ${DIM}— Debug y logs detallados${NC}"
        echo -e "    ${WHITE}14${NC}) ${GREEN}💾 Backup${NC}            ${DIM}— Crear respaldo del proyecto${NC}"
        echo ""
        echo -e "    ${WHITE}15${NC}) ${BOLD}${YELLOW}⚡ Setup completo${NC}    ${DIM}— Preparar sistema desde cero${NC}"
        echo ""
        echo -e "    ${WHITE} 0${NC}) ${RED}Salir${NC}"
        echo ""
        echo -ne "  ${YELLOW}▸${NC} Opción: "
        read -r choice

        case $choice in
            1)  cmd_dev ;;
            2)  cmd_build ;;
            3)  cmd_sign ;;
            4)  cmd_clean ;;
            5)  cmd_deps ;;
            6)  cmd_icons ;;
            7)  cmd_info ;;
            8)  cmd_git ;;
            9)  cmd_doctor ;;
            10) cmd_loc ;;
            11) cmd_version ;;
            12) cmd_lint ;;
            13) cmd_logs ;;
            14) cmd_backup ;;
            15) cmd_setup ;;
            0|q|Q)
                echo ""
                echo -e "  ${DIM}¡Hasta luego! 📖${NC}"
                echo ""
                exit 0
                ;;
            *)
                warn "Opción no válida"
                sleep 1
                ;;
        esac
    done
}

# ══════════════════════════════════════════════════════════════
# CLI directa (soporte para argumentos)
# ══════════════════════════════════════════════════════════════
if [[ $# -gt 0 ]]; then
    check_project
    case "$1" in
        dev)      cmd_dev ;;
        build)    cmd_build ;;
        android)  cmd_build_android ;;
        sign)     cmd_sign ;;
        clean)    cmd_clean ;;
        deps)     cmd_deps ;;
        icons)    cmd_icons ;;
        info)     cmd_info ;;
        git)      cmd_git ;;
        doctor)   cmd_doctor ;;
        loc)      cmd_loc ;;
        version)  cmd_version ;;
        lint)     cmd_lint ;;
        logs)     cmd_logs ;;
        backup)   cmd_backup ;;
        setup|install) cmd_setup ;;
        help|-h|--help)
            print_banner
            echo -e "  ${BOLD}Uso:${NC} ./klio.sh [comando]"
            echo ""
            echo -e "  ${BOLD}Comandos:${NC}"
            echo -e "    dev       Opciones de desarrollo (Desktop + Android)"
            echo -e "    build     Compilar la aplicación (Desktop + Android)"
            echo -e "    android   Build Android directo (APK/AAB)"
            echo -e "    sign      Firmar APK para instalar en celular"
            echo -e "    clean     Limpiar paquetes y caches"
            echo -e "    deps      Gestionar dependencias (+ Android init)"
            echo -e "    icons     Generar iconos"
            echo -e "    info      Info del proyecto"
            echo -e "    git       Atajos de Git"
            echo -e "    doctor    Diagnosticar entorno (+ Android)"
            echo -e "    loc       Contar líneas de código"
            echo -e "    version   Bump de versión"
            echo -e "    lint      Verificar código"
            echo -e "    logs      Debug y logs"
            echo -e "    backup    Crear respaldo"
            echo -e "    ${BOLD}setup${NC}     Configurar sistema desde cero (instala todo)"
            echo ""
            echo -e "  Sin argumentos abre el menú interactivo."
            echo ""
            ;;
        *)
            error "Comando desconocido: $1"
            info "Usa ${CYAN}./klio.sh help${NC} para ver los comandos disponibles"
            exit 1
            ;;
    esac
else
    check_project
    main_menu
fi
