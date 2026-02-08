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

# ── Funciones de utilidad ──────────────────────────────────────
print_banner() {
    echo -e "${CYAN}"
    echo "  ╔═══════════════════════════════════════════════════╗"
    echo "  ║                                                   ║"
    echo "  ║   📖  ${WHITE}K L I O   R E A D E R${CYAN}   DevTool            ║"
    echo "  ║                                                   ║"
    echo "  ║   ${DIM}${CYAN}v${APP_VERSION}  •  Tauri + React + PHP${NC}${CYAN}              ║"
    echo "  ║                                                   ║"
    echo "  ╚═══════════════════════════════════════════════════╝"
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

# ── Verificar entorno Android ──────────────────────────────────
check_android_env() {
    local missing=false

    if [[ -z "${ANDROID_HOME:-}" ]] && [[ -z "${ANDROID_SDK_ROOT:-}" ]]; then
        warn "ANDROID_HOME o ANDROID_SDK_ROOT no están definidos"
        info "Necesitas instalar Android SDK y configurar la variable de entorno"
        info "  Arch: ${CYAN}sudo pacman -S android-tools${NC} + Android Studio o cmdline-tools"
        info "  Ubuntu: ${CYAN}sudo apt install android-sdk${NC}"
        info "  O instala Android Studio desde ${CYAN}https://developer.android.com/studio${NC}"
        missing=true
    fi

    if [[ -z "${JAVA_HOME:-}" ]]; then
        if ! command -v java &>/dev/null; then
            warn "Java/JDK no encontrado (necesario para Android)"
            info "  Arch: ${CYAN}sudo pacman -S jdk-openjdk${NC}"
            info "  Ubuntu: ${CYAN}sudo apt install default-jdk${NC}"
            missing=true
        fi
    fi

    if ! command -v adb &>/dev/null; then
        warn "adb no encontrado (Android Debug Bridge)"
        missing=true
    fi

    if $missing; then
        echo ""
        warn "Faltan dependencias de Android. El build/dev puede fallar."
        if ! confirm "¿Continuar de todos modos?"; then
            return 1
        fi
    fi
    return 0
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

cmd_build_desktop() {
    echo ""
    echo -e "  ${BOLD}${CYAN}🖥️  Build Desktop${NC}"
    separator
    echo ""
    echo -e "  ${WHITE}Selecciona los formatos de salida:${NC}"
    echo ""
    echo -e "  ${BOLD}Linux:${NC}"
    echo -e "    ${WHITE}1${NC}) ${GREEN}AppImage${NC}       ${DIM}— Ejecutable universal Linux${NC}"
    echo -e "    ${WHITE}2${NC}) ${GREEN}DEB${NC}            ${DIM}— Paquete Debian/Ubuntu${NC}"
    echo -e "    ${WHITE}3${NC}) ${GREEN}RPM${NC}            ${DIM}— Paquete Fedora/RHEL${NC}"
    echo ""
    echo -e "  ${BOLD}Windows:${NC}"
    echo -e "    ${WHITE}4${NC}) ${GREEN}NSIS${NC}           ${DIM}— Instalador Windows (.exe)${NC}"
    echo -e "    ${WHITE}5${NC}) ${GREEN}MSI${NC}            ${DIM}— Instalador Windows (.msi)${NC}"
    echo ""
    echo -e "  ${BOLD}macOS:${NC}"
    echo -e "    ${WHITE}6${NC}) ${GREEN}DMG${NC}            ${DIM}— Imagen de disco macOS${NC}"
    echo -e "    ${WHITE}7${NC}) ${GREEN}App Bundle${NC}     ${DIM}— Aplicación macOS (.app)${NC}"
    echo ""
    echo -e "  ${BOLD}Combos:${NC}"
    echo -e "    ${WHITE}8${NC}) ${MAGENTA}Todo Linux${NC}     ${DIM}— AppImage + DEB + RPM${NC}"
    echo -e "    ${WHITE}9${NC}) ${MAGENTA}Todo Windows${NC}   ${DIM}— NSIS + MSI${NC}"
    echo -e "    ${WHITE}A${NC}) ${MAGENTA}TODOS Desktop${NC}  ${DIM}— Todos los formatos desktop${NC}"
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
            1) bundles+=("appimage") ;;
            2) bundles+=("deb") ;;
            3) bundles+=("rpm") ;;
            4) bundles+=("nsis") ;;
            5) bundles+=("msi") ;;
            6) bundles+=("dmg") ;;
            7) bundles+=("app") ;;
            8) bundles+=("appimage" "deb" "rpm") ;;
            9) bundles+=("nsis" "msi") ;;
            A) bundles+=("appimage" "deb" "rpm" "nsis" "msi" "dmg" "app") ;;
            *) warn "Opción '$sel' no reconocida, ignorada" ;;
        esac
    done

    # Eliminar duplicados
    local unique_bundles=($(echo "${bundles[@]}" | tr ' ' '\n' | sort -u))

    if [[ ${#unique_bundles[@]} -eq 0 ]]; then
        warn "No se seleccionó ningún formato válido"
        return
    fi

    echo ""
    info "Formatos seleccionados: ${CYAN}${unique_bundles[*]}${NC}"
    separator

    # Preguntar modo de compilación
    echo ""
    echo -e "  ${WHITE}Modo de compilación:${NC}"
    echo -e "    ${WHITE}1${NC}) ${GREEN}Release${NC}  ${DIM}— Optimizado para producción (por defecto)${NC}"
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

    echo ""
    local bundle_arg
    bundle_arg=$(IFS=','; echo "${unique_bundles[*]}")

    step "Ejecutando: ${DIM}npm run tauri build -- --bundles ${bundle_arg} ${extra_args}${NC}"
    echo ""

    cd "$PROJECT_DIR"

    local start_time=$SECONDS
    if npm run tauri build -- --bundles "$bundle_arg" $extra_args; then
        local elapsed=$(( SECONDS - start_time ))
        echo ""
        separator
        success "Build completado en ${GREEN}${elapsed}s${NC}"
        echo ""

        # Mostrar ubicación de los artefactos
        local target_dir="$TAURI_DIR/target"
        if [[ "$build_mode" == "2" ]]; then
            target_dir="$target_dir/debug"
        else
            target_dir="$target_dir/release"
        fi

        info "Artefactos en:"
        if [[ -d "$target_dir/bundle" ]]; then
            find "$target_dir/bundle" -maxdepth 2 -type f \( \
                -name "*.deb" -o -name "*.rpm" -o -name "*.AppImage" \
                -o -name "*.exe" -o -name "*.msi" -o -name "*.dmg" \
                -o -name "*.app" \
            \) 2>/dev/null | while read -r f; do
                local size
                size=$(du -h "$f" | cut -f1)
                echo -e "    ${GREEN}→${NC} $f ${DIM}(${size})${NC}"
            done
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

    # Preguntar por firma (solo en release)
    local sign_args=""
    if [[ "$build_mode" != "2" ]]; then
        echo ""
        echo -e "  ${WHITE}¿Firmar el APK/AAB?${NC}"
        echo -e "    ${WHITE}1${NC}) ${GREEN}No firmar${NC}     ${DIM}— Build sin firma (por defecto)${NC}"
        echo -e "    ${WHITE}2${NC}) ${YELLOW}Firmar${NC}        ${DIM}— Requiere keystore configurado${NC}"
        echo -ne "  ${YELLOW}▸${NC} Opción [1]: "
        read -r sign_opt
        if [[ "$sign_opt" == "2" ]]; then
            echo -ne "  ${YELLOW}?${NC}  Ruta al keystore (.jks): "
            read -r ks_path
            if [[ -n "$ks_path" && -f "$ks_path" ]]; then
                echo -ne "  ${YELLOW}?${NC}  Alias de la key: "
                read -r ks_alias
                echo -ne "  ${YELLOW}?${NC}  Password del keystore: "
                read -rs ks_pass
                echo ""
                export TAURI_ANDROID_KEYSTORE_PATH="$ks_path"
                export TAURI_ANDROID_KEYSTORE_ALIAS="${ks_alias:-key0}"
                export TAURI_ANDROID_KEYSTORE_PASSWORD="$ks_pass"
                export TAURI_ANDROID_KEY_PASSWORD="$ks_pass"
                info "Keystore configurado para firma"
            else
                warn "Keystore no encontrado, compilando sin firma"
            fi
        fi
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
        echo ""

        # Buscar artefactos Android
        local android_out="$TAURI_DIR/gen/android/app/build/outputs"
        info "Artefactos:"
        if [[ -d "$android_out" ]]; then
            find "$android_out" -type f \( -name "*.apk" -o -name "*.aab" \) 2>/dev/null | while read -r f; do
                local size
                size=$(du -h "$f" | cut -f1)
                echo -e "    ${GREEN}→${NC} $f ${DIM}(${size})${NC}"
            done
        else
            info "Busca los artefactos en: ${DIM}${android_out}${NC}"
        fi

        # Preguntar si instalar en dispositivo
        if [[ "$android_opt" == "1" || "$android_opt" == "3" ]]; then
            echo ""
            if command -v adb &>/dev/null && adb devices | grep -q "device$"; then
                if confirm "¿Instalar APK en el dispositivo conectado?"; then
                    local apk_file
                    apk_file=$(find "$android_out" -name "*.apk" -type f 2>/dev/null | head -1)
                    if [[ -n "$apk_file" ]]; then
                        step "Instalando..."
                        adb install -r "$apk_file"
                        success "APK instalado en el dispositivo"
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
    echo -e "    ${WHITE}5${NC}) ${YELLOW}Android build${NC}    ${DIM}— Build de Gradle/Android${NC}"
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
                if confirm "¿Eliminar build Android (${size})?"; then
                    rm -rf "$android_build"
                    success "Build Android eliminado"
                fi
            else
                info "No hay build Android para limpiar"
                if [[ -d "$TAURI_DIR/gen/android" ]]; then
                    info "Proyecto Android existe. ¿Quieres limpiar con Gradle?"
                    if confirm "¿Ejecutar gradle clean?"; then
                        cd "$TAURI_DIR/gen/android" && ./gradlew clean 2>/dev/null || true
                        success "Gradle clean ejecutado"
                    fi
                fi
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
        echo -e "    ${WHITE} 3${NC}) ${YELLOW}🧹 Limpiar${NC}           ${DIM}— Eliminar paquetes y caches${NC}"
        echo -e "    ${WHITE} 4${NC}) ${CYAN}📋 Dependencias${NC}      ${DIM}— Instalar, actualizar, auditar${NC}"
        echo -e "    ${WHITE} 5${NC}) ${MAGENTA}🎨 Iconos${NC}            ${DIM}— Generar iconos de la app${NC}"
        echo -e "    ${WHITE} 6${NC}) ${CYAN}📊 Info${NC}              ${DIM}— Información del proyecto${NC}"
        echo -e "    ${WHITE} 7${NC}) ${BLUE}🔀 Git${NC}               ${DIM}— Atajos de Git${NC}"
        echo -e "    ${WHITE} 8${NC}) ${GREEN}🩺 Doctor${NC}            ${DIM}— Diagnosticar el entorno${NC}"
        echo -e "    ${WHITE} 9${NC}) ${CYAN}📏 LOC${NC}               ${DIM}— Contar líneas de código${NC}"
        echo -e "    ${WHITE}10${NC}) ${YELLOW}🏷️  Versión${NC}           ${DIM}— Bump de versión${NC}"
        echo -e "    ${WHITE}11${NC}) ${MAGENTA}✨ Lint${NC}              ${DIM}— Verificar y formatear código${NC}"
        echo -e "    ${WHITE}12${NC}) ${BLUE}🔍 Logs${NC}              ${DIM}— Debug y logs detallados${NC}"
        echo -e "    ${WHITE}13${NC}) ${GREEN}💾 Backup${NC}            ${DIM}— Crear respaldo del proyecto${NC}"
        echo ""
        echo -e "    ${WHITE} 0${NC}) ${RED}Salir${NC}"
        echo ""
        echo -ne "  ${YELLOW}▸${NC} Opción: "
        read -r choice

        case $choice in
            1)  cmd_dev ;;
            2)  cmd_build ;;
            3)  cmd_clean ;;
            4)  cmd_deps ;;
            5)  cmd_icons ;;
            6)  cmd_info ;;
            7)  cmd_git ;;
            8)  cmd_doctor ;;
            9)  cmd_loc ;;
            10) cmd_version ;;
            11) cmd_lint ;;
            12) cmd_logs ;;
            13) cmd_backup ;;
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
        help|-h|--help)
            print_banner
            echo -e "  ${BOLD}Uso:${NC} ./klio.sh [comando]"
            echo ""
            echo -e "  ${BOLD}Comandos:${NC}"
            echo -e "    dev       Opciones de desarrollo (Desktop + Android)"
            echo -e "    build     Compilar la aplicación (Desktop + Android)"
            echo -e "    android   Build Android directo (APK/AAB)"
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
