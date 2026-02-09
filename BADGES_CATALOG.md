# Catálogo de Insignias — KlioReader

Cada insignia será un PNG de 128x128px. Estilo: minimalista, icónico, fondo transparente.
Las insignias bloqueadas se mostrarán en grayscale + blur automáticamente desde CSS.

Los PNGs van en: `public/badges/{id}.png`

---

## Rareza y Colores

| Rareza | Borde | Glow | Descripción |
|--------|-------|------|-------------|
| **Bronce** | amber-700 | sutil | Logros fáciles, primeros pasos |
| **Plata** | gray-300 | medio | Logros que requieren constancia |
| **Oro** | yellow-400 | fuerte | Logros difíciles, dedicación |
| **Diamante** | cyan-300 | intenso | Logros épicos, solo los más dedicados |

---

## 📖 Categoría: LECTURA

Insignias relacionadas con el progreso de lectura y completar libros.

| # | ID | Nombre | Rareza | Condición | Descripción visual sugerida |
|---|---|---|---|---|---|
| 1 | `first_page` | Primera Página | Bronce | XP >= 10 (avanzó al menos 1 capítulo) | Página con esquina doblada |
| 2 | `half_way` | A Medio Camino | Bronce | Algún libro con progreso >= 50% | Libro abierto por la mitad |
| 3 | `bookworm` | Ratón de Biblioteca | Bronce | 1 libro completado al 100% | Gusano/oruga saliendo de un libro |
| 4 | `avid_reader` | Lector Ávido | Plata | 3 libros completados | Pila de 3 libros |
| 5 | `scholar` | Erudito | Plata | 5 libros completados | Birrete de graduación |
| 6 | `bibliophile` | Bibliófilo | Oro | 10 libros completados | Corazón hecho de páginas |
| 7 | `sage` | Sabio | Oro | 15 libros completados | Búho sobre un libro |
| 8 | `grand_master` | Gran Maestro | Diamante | 25 libros completados | Corona sobre un libro abierto |
| 9 | `literary_god` | Deidad Literaria | Diamante | 50 libros completados | Libro con aura/halo divino |
| 10 | `perfectionist` | Perfeccionista | Oro | 5 libros completados sin saltar capítulos (100% lineal) | Check mark dorado dentro de un libro |

---

## 🔥 Categoría: CONSTANCIA

Insignias relacionadas con rachas de lectura diaria consecutiva.

| # | ID | Nombre | Rareza | Condición | Descripción visual sugerida |
|---|---|---|---|---|---|
| 11 | `first_spark` | Primera Chispa | Bronce | Racha >= 2 días | Cerillo encendido |
| 12 | `warm_up` | Calentando | Bronce | Racha >= 3 días | Llama pequeña |
| 13 | `on_fire` | En Llamas | Plata | Racha >= 7 días | Llama mediana con chispas |
| 14 | `burning` | Ardiente | Plata | Racha >= 14 días | Llama grande y viva |
| 15 | `inferno` | Infierno | Oro | Racha >= 21 días | Bola de fuego |
| 16 | `unbreakable` | Inquebrantable | Oro | Racha >= 30 días | Cadena de fuego sin romper |
| 17 | `eternal_flame` | Llama Eterna | Diamante | Racha >= 60 días | Llama azul/mística |
| 18 | `phoenix` | Fénix | Diamante | Racha >= 100 días | Ave fénix en llamas |

---

## 📦 Categoría: COLECCIÓN

Insignias relacionadas con la cantidad de libros en la biblioteca.

| # | ID | Nombre | Rareza | Condición | Descripción visual sugerida |
|---|---|---|---|---|---|
| 19 | `first_book` | Mi Primer Libro | Bronce | 1 libro en biblioteca | Libro solo, sencillo |
| 20 | `small_shelf` | Pequeño Estante | Bronce | 5 libros en biblioteca | Estante pequeño con libros |
| 21 | `bookshelf` | Estantería | Plata | 10 libros en biblioteca | Estantería media llena |
| 22 | `personal_library` | Biblioteca Personal | Plata | 20 libros en biblioteca | Estantería grande completa |
| 23 | `book_hoarder` | Acumulador | Oro | 35 libros en biblioteca | Montaña de libros |
| 24 | `grand_library` | Gran Biblioteca | Oro | 50 libros en biblioteca | Edificio tipo biblioteca clásica |
| 25 | `alexandria` | Alejandría | Diamante | 100 libros en biblioteca | Templo griego con columnas y libros |
| 26 | `multitasker` | Multitarea | Plata | 3 libros en progreso simultáneo (>0% y <100%) | 3 libros abiertos en paralelo |
| 27 | `juggler` | Malabarista | Oro | 5 libros en progreso simultáneo | Manos haciendo malabares con libros |

---

## ⭐ Categoría: NIVEL Y XP

Insignias relacionadas con la experiencia acumulada y niveles alcanzados.

| # | ID | Nombre | Rareza | Condición | Descripción visual sugerida |
|---|---|---|---|---|---|
| 28 | `rookie` | Novato | Bronce | Nivel >= 3 | Escudo simple, sin adornos |
| 29 | `apprentice` | Aprendiz | Bronce | Nivel >= 5 | Estrella de 4 puntas |
| 30 | `adept` | Adepto | Plata | Nivel >= 10 | Estrella de 6 puntas |
| 31 | `expert` | Experto | Plata | Nivel >= 15 | Medalla con laureles |
| 32 | `master` | Maestro | Oro | Nivel >= 20 | Corona de laurel dorada |
| 33 | `legend` | Leyenda | Oro | Nivel >= 30 | Trofeo dorado |
| 34 | `mythic` | Mítico | Diamante | Nivel >= 50 | Trofeo con gemas y alas |
| 35 | `xp_500` | Quinientos | Bronce | XP >= 500 | Número 500 estilizado |
| 36 | `xp_1000` | Mil Experiencias | Plata | XP >= 1000 | Cofre de tesoro entreabierto |
| 37 | `xp_2500` | Tesoro Acumulado | Oro | XP >= 2500 | Cofre de tesoro lleno y brillante |
| 38 | `xp_5000` | Trascendencia | Oro | XP >= 5000 | Gema radiante |
| 39 | `xp_10000` | Ascensión | Diamante | XP >= 10000 | Gema flotando con rayos de luz |

---

## 🧭 Categoría: EXPLORADOR

Insignias relacionadas con variedad y patrones de lectura.

| # | ID | Nombre | Rareza | Condición | Descripción visual sugerida |
|---|---|---|---|---|---|
| 40 | `curious` | Curioso | Bronce | 3 libros empezados (progreso > 0%) | Lupa sobre un libro |
| 41 | `explorer` | Explorador | Plata | 7 libros empezados | Brújula sobre páginas |
| 42 | `adventurer` | Aventurero | Oro | 15 libros empezados | Mapa del tesoro con marca X |
| 43 | `pioneer` | Pionero | Diamante | 30 libros empezados | Bandera clavada en montaña de libros |
| 44 | `comeback` | Regreso Triunfal | Plata | Tener racha >= 3 después de haber tenido racha = 0 (leyó de nuevo tras abandono) | Fénix pequeño resurgiendo |
| 45 | `night_owl` | Búho Nocturno | Plata | Leer después de las 11pm (hora local) | Búho con ojos brillantes en luna |
| 46 | `early_bird` | Madrugador | Plata | Leer antes de las 7am (hora local) | Pájaro al amanecer con libro |

---

## 🏆 Categoría: ÉLITE

Insignias extremadamente raras para los más dedicados.

| # | ID | Nombre | Rareza | Condición | Descripción visual sugerida |
|---|---|---|---|---|---|
| 47 | `completionist` | Completista | Oro | Todos los libros de la biblioteca completados al 100% (mínimo 5 libros) | Escudo con check dorado |
| 48 | `century` | Centenario | Diamante | XP >= 100000 | Número 100 romano (C) en oro |
| 49 | `diamond_reader` | Lector Diamante | Diamante | Nivel >= 50 + 25 libros completados + racha >= 30 | Diamante tallado con libro dentro |
| 50 | `klio_master` | Maestro de Klio | Diamante | Tener al menos 40 de las otras insignias desbloqueadas | Logo de Klio con corona y destellos |

---

## Resumen por Rareza

| Rareza | Cantidad | % del total |
|--------|----------|-------------|
| Bronce | 12 | 24% |
| Plata | 14 | 28% |
| Oro | 14 | 28% |
| Diamante | 10 | 20% |
| **Total** | **50** | **100%** |

## Resumen por Categoría

| Categoría | Cantidad |
|-----------|----------|
| 📖 Lectura | 10 |
| 🔥 Constancia | 8 |
| 📦 Colección | 9 |
| ⭐ Nivel y XP | 12 |
| 🧭 Explorador | 7 |
| 🏆 Élite | 4 |
| **Total** | **50** |

---

## Notas para el diseño de PNGs

- **Tamaño**: 128x128px (se renderiza a ~64px en UI)
- **Fondo**: Transparente
- **Estilo**: Minimalista, líneas limpias, colores sólidos
- **Paleta**: Cada insignia puede usar colores libres, el borde de rareza lo pone el CSS
- **Formato**: PNG-24 con alpha
- **Naming**: `{id}.png` (ej: `first_page.png`, `phoenix.png`)
- **Ubicación**: `public/badges/`
