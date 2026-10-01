# Temporizador Pomio

Temporizador Pomio es una aplicación web sin dependencias para temporizadores normales, cronómetros y rutinas Pomodoro por horas. Está diseñada para funcionar en pantalla dividida desde un área visible de 150 × 300 píxeles CSS y puede subirse directamente a un alojamiento estático.

## Uso

1. Abre **Temporizador** para crear uno nuevo.
2. Escribe un nombre, agrega un emoji opcional y elige el color de la tarjeta y del dial.
3. Selecciona **Horas y minutos** para un temporizador normal, **Cronómetro** para medir una sesión sin límite o **Horas completas con descanso** para un Pomodoro.
4. Usa **Iniciar**, **Pausar**, **Reanudar**, **Reiniciar** o **Configurar** en cada tarjeta.
5. Alterna **Modo oscuro** desde el encabezado. La preferencia queda guardada en este navegador.

Los Pomodoros aceptan horas completas. Cada hora contiene una fase de enfoque y un descanso de 5, 10, 15 o 20 minutos. Por ejemplo, tres horas con 15 minutos de descanso producen tres ciclos de 45/15. Puedes activar la continuación automática o esperar en cada cambio de fase.

El cronómetro comienza en cero, cuenta de forma ascendente y conserva el tiempo al pausar, reanudar o recargar la página. **Reiniciar** vuelve a cero. Su dial representa el progreso dentro del minuto actual.

## Sonidos

Abre **Sonidos** para elegir lluvia intensa, ruido blanco, olas del mar, tik-tak lento, tik-tak rápido o silencio. También puedes ajustar por separado el volumen de fondo y el de las alertas. Todo el audio se genera con Web Audio; no se descargan archivos de sonido.

El sonido de fondo se reproduce únicamente mientras haya al menos un temporizador en ejecución. Mientras un cronómetro esté en ejecución, usa temporalmente ruido blanco aunque hayas elegido otro sonido; la preferencia no cambia y vuelve a aplicarse al pausar el último cronómetro. Los navegadores exigen una interacción del usuario antes de iniciar audio. Si **Repetir hasta continuar** está activado, el cambio de fase espera mientras se repite la alerta. Pulsa **Continuar** para detenerla e iniciar la fase preparada. Los temporizadores y controles visuales siguen funcionando si el audio no está disponible o está suspendido.

## Límites de persistencia

Los temporizadores, cronómetros, ajustes, fases y marcas de tiempo se guardan como JSON versionado en `localStorage`. Los temporizadores y cronómetros en ejecución se recuperan desde sus plazos o marcas de inicio después de una suspensión, recarga o reinicio del equipo.

Los datos persisten solo en el mismo perfil del navegador y dispositivo. Borrar los datos del sitio, usar navegación privada, cambiar de navegador o cambiar el origen del sitio puede eliminarlos o aislarlos. No hay cuenta, sincronización en la nube, base de datos ni respaldo entre dispositivos.

## Accesibilidad

- Botones, encabezados, formularios, diálogos, etiquetas y anuncios semánticos.
- Foco visible por teclado y enlace inicial para saltar al contenido.
- Etiquetas accesibles en los controles que muestran solo iconos.
- Compatibilidad con movimiento reducido.
- Diseño adaptable sin desplazamiento horizontal en el tamaño mínimo.

## Comprobaciones locales

```sh
npm test
python3 -m http.server 4173
```

Abre `http://localhost:4173` y usa el modo adaptable a 150 × 300.

### Matriz de prueba rápida en navegadores

| Navegador | Comprobaciones mínimas |
|---|---|
| Chromium | Diseño a 150×300, altas/cambios/bajas de temporizadores, recuperación tras recarga y desbloqueo de sonido |
| Firefox | Flujo de teclado en diálogos, temporizadores simultáneos y recuperación de `localStorage` |
| Safari | Vista dividida, recuperación de visibilidad, sonidos generados y alerta |

En cada navegador, confirma que no haya desplazamiento horizontal; que el encabezado y los controles sigan accesibles; que solo el descanso cambie la tarjeta a verde; que minutos y segundos aparezcan uno junto al otro; y que **Repetir hasta continuar** detenga el avance.

En pantallas horizontales de al menos 700 píxeles, las tarjetas se distribuyen en una única fila de cinco. En anchos menores se reorganizan automáticamente; el encabezado conserva solo los iconos para evitar desbordamientos.

## Despliegue en Hostinger

No se necesita un paso de compilación.

1. Abre el administrador de archivos de Hostinger para el dominio.
2. Abre `public_html` y elimina o archiva el sitio anterior solo si deseas reemplazarlo.
3. Sube `index.html`, `assets/`, `styles/`, `src/`, `package.json` y este README conservando sus rutas.
4. Visita el dominio HTTPS y ejecuta las comprobaciones anteriores.

Antes de cada publicación, cambia el token `?v=` de `index.html` y de todas las importaciones locales en `src/`. Un único token por versión evita que el navegador mezcle HTML nuevo con JavaScript anterior almacenado en caché.

El servidor web de producción debe entregar los archivos `.js` con un tipo MIME de JavaScript. Para revertir el despliegue, restaura el directorio estático anterior; Temporizador Pomio no tiene migraciones de servidor.
