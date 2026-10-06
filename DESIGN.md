# Identidad ENTRA

## Dirección aprobada
La referencia del usuario pide una estética de cartel y galería: letras grandes y redondeadas, contraste negro/blanco, rosa intenso, imágenes protagonistas y composición asimétrica. Se conserva el logo original de ENTRA. Esta dirección reemplaza la anterior cabecera sobria de estudio.

## Sistema
- Negro #181818, blanco #faf8f7, rosa #f686bb, fucsia #e63d88 y gris #bdb5b8.
- Lilita One para títulos redondeados; IBM Plex Sans 400/600 para lectura y controles. Fuentes WOFF2 locales y licencias OFL incluidas.
- Navegación horizontal en franja blanca; gran título; imagen editorial a la izquierda y contexto/acciones a la derecha. En móvil se apila conservando el orden.
- Portadas decorativas derivadas de la pieza editorial. No representan archivos de audio ni carátulas subidas por usuarios. Los registros conservan título, estado y datos reales.
- Imagen creada con imagegen para esta interfaz: estudio imaginario de altavoces de vidrio rosa. Se identifica como arte digital. Archivo autónomo en public/art/entra-studio.png.
- Las barras conservan el movimiento suave solicitado; tempo en columna separada y número de registro arriba. Movimiento reducido desactiva animación y scroll suave.

## Arquitectura
CRUD MVC sin Login. Los recursos gráficos se sirven desde Node; no dependen de servicios externos. Vistas con plantilla compartida y helper projectCard; BEM en clases; estilos consolidados en un único archivo.

## Referencias consultadas
Frontend Design de Anthropic, better-ui local y referencias de Impeccable. Imagegen aplicada para el recurso editorial, sin cambiar el logo.

## Paleta actualizada por solicitud del usuario
Se sustituye el rosa por grafito #17191d, cobalto #557bff, ámbar #ffc65c, blanco #f4f5ef y gris #b9c0cc. El logo conserva su coral original. Arte editorial ajustado con filtro CSS; portadas en tonos azulados con mezcla de luminosidad. Formularios, estados y botones comparten la nueva paleta.

## Tipografía y marca actuales
Anton sustituye Watchout y Lilita One en titulares y onboarding; IBM Plex Sans permanece en lectura y controles. Logo vertical e isotipo SVG: umbrales ámbar #ffc65c, barras azules #779cff y nombre blanco #f4f5ef. Se conserva la geometría original y se adapta la marca a los colores del producto.

## Portadas actuales
Vinilo vectorial sin fondo, con rotación lenta de 24 segundos y barras independientes. El hover de edición queda contenido en la portada. El botón duplicado bajo la tarjeta se elimina: solo móvil muestra un lápiz de 44 px al lado de la portada. Movimiento reducido deja el disco estático.
