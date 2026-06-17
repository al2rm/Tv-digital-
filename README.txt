# TV Digital Pro — Instrucciones de instalacion

## Opcion A: Subir a Netlify (recomendado, GRATIS)

### Paso 1 — Instalar Node.js
Descarga e instala Node.js desde: https://nodejs.org
(Elige la version LTS)

### Paso 2 — Construir el proyecto
Abre una terminal en la carpeta del proyecto y ejecuta:

```
npm install
npm run build
```

Esto crea una carpeta llamada `dist/`

### Paso 3 — Subir a Netlify
1. Ve a https://app.netlify.com/drop
2. Arrastra la carpeta `dist/` a la pagina
3. Listo — te da un link como https://abc123.netlify.app

### Paso 4 — Instalar como app en tu Samsung
1. Abre el link en Chrome
2. Toca el menu de los 3 puntos
3. Selecciona "Agregar a pantalla de inicio" o "Instalar app"
4. Ya tienes la app instalada con icono propio

---

## Opcion B: Ejecutar en tu PC (modo desarrollo)

```
npm install
npm run dev
```

Abre http://localhost:5173 en tu navegador

---

## Credenciales de acceso
- Usuario: admin
- Contrasena: tv2024

---

## Estructura del proyecto
```
tvdigital/
  src/
    App.jsx       <- Codigo principal de la app
    main.jsx      <- Punto de entrada
  public/
    icon-192.png  <- Icono app
    icon-512.png  <- Icono app grande
    favicon.ico   <- Icono navegador
  index.html      <- HTML base
  vite.config.js  <- Configuracion con PWA
  netlify.toml    <- Configuracion Netlify
  package.json    <- Dependencias
```
